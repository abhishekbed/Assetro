import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VestingSchedule, VestingStatus } from '../entities/vesting-schedule.entity';
import { Token } from '../entities/token.entity';
import { User } from '../../auth/entities/user.entity';

export interface CreateVestingDto {
  beneficiary_id: string;
  beneficiary_address: string;
  total_amount: string;         // raw token amount (e.g. "1000")
  start_date: string;           // ISO date
  end_date: string;             // ISO date
  cliff_date?: string;          // optional ISO date
  vesting_interval_days: number;
  revocable?: boolean;
}

export interface IssuerVestingSchedule extends VestingScheduleWithToken {
  beneficiaryName: string;
  beneficiaryEmail: string;
}

export interface VestingScheduleWithToken extends VestingSchedule {
  tokenName: string;
  tokenSymbol: string;
  tokenDecimals: number;
  // Computed
  vestedAmount: string;       // amount vested so far (including cliff)
  claimableAmount: string;    // vested - already released
  progressPercent: number;    // releasedAmount / totalAmount %
  nextReleaseDate: Date | null;
  upcomingReleases: { date: Date; amount: string }[];
}

@Injectable()
export class VestingService {
  constructor(
    @InjectRepository(VestingSchedule)
    private readonly vestingRepo: Repository<VestingSchedule>,
    @InjectRepository(Token)
    private readonly tokenRepo: Repository<Token>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  // ── Issuer CRUD ───────────────────────────────────────────────────────────

  async getSchedulesForToken(tokenId: string): Promise<IssuerVestingSchedule[]> {
    const schedules = await this.vestingRepo.find({
      where: { tokenId },
      order: { createdAt: 'DESC' },
    });
    return Promise.all(schedules.map(s => this.enrichIssuer(s)));
  }

  async createSchedule(tokenId: string, dto: CreateVestingDto): Promise<VestingSchedule> {
    const token = await this.tokenRepo.findOne({ where: { id: tokenId } });
    if (!token) throw new NotFoundException(`Token ${tokenId} not found`);

    const decimals = token.decimals ?? 18;
    const totalAmountWei = (BigInt(Math.round(parseFloat(dto.total_amount))) * BigInt(10 ** decimals)).toString();

    const schedule = this.vestingRepo.create({
      tokenId,
      beneficiaryId: dto.beneficiary_id,
      beneficiaryAddress: dto.beneficiary_address.toLowerCase(),
      totalAmount: totalAmountWei,
      releasedAmount: '0',
      startDate: new Date(dto.start_date),
      endDate: new Date(dto.end_date),
      cliffDate: dto.cliff_date ? new Date(dto.cliff_date) : null,
      vestingIntervalDays: dto.vesting_interval_days,
      status: VestingStatus.ACTIVE,
      revocable: dto.revocable ?? false,
    });

    return this.vestingRepo.save(schedule);
  }

  async deleteSchedule(id: string, tokenId: string): Promise<void> {
    const s = await this.vestingRepo.findOne({ where: { id, tokenId } });
    if (!s) throw new NotFoundException(`Vesting schedule ${id} not found`);
    if (s.status === VestingStatus.COMPLETED) {
      throw new BadRequestException('Cannot delete a completed vesting schedule');
    }
    s.status = VestingStatus.CANCELLED;
    s.revokedAt = new Date();
    await this.vestingRepo.save(s);
  }

  async markReleased(id: string, tokenId: string, releasedAmount: string): Promise<VestingSchedule> {
    const s = await this.vestingRepo.findOne({ where: { id, tokenId } });
    if (!s) throw new NotFoundException(`Vesting schedule ${id} not found`);

    const token = await this.tokenRepo.findOne({ where: { id: tokenId } });
    const decimals = token?.decimals ?? 18;
    const amountWei = (BigInt(Math.round(parseFloat(releasedAmount))) * BigInt(10 ** decimals)).toString();

    const newReleased = (BigInt(s.releasedAmount) + BigInt(amountWei)).toString();
    s.releasedAmount = newReleased;
    if (BigInt(newReleased) >= BigInt(s.totalAmount)) {
      s.status = VestingStatus.COMPLETED;
    }
    return this.vestingRepo.save(s);
  }

  private async enrichIssuer(s: VestingSchedule): Promise<IssuerVestingSchedule> {
    const base = await this.enrich(s);
    const user = await this.userRepo.findOne({ where: { id: s.beneficiaryId } }).catch(() => null);
    return {
      ...base,
      beneficiaryName: user?.name ?? s.beneficiaryAddress.slice(0, 10) + '…',
      beneficiaryEmail: user?.email ?? '',
    };
  }

  // ── Investor read ─────────────────────────────────────────────────────────

  async getSchedulesForBeneficiary(beneficiaryId: string): Promise<VestingScheduleWithToken[]> {
    const schedules = await this.vestingRepo.find({
      where: { beneficiaryId, status: VestingStatus.ACTIVE },
      order: { startDate: 'ASC' },
    });

    return Promise.all(schedules.map(s => this.enrich(s)));
  }

  async getScheduleById(id: string, beneficiaryId: string): Promise<VestingScheduleWithToken> {
    const s = await this.vestingRepo.findOne({ where: { id, beneficiaryId } });
    if (!s) throw new NotFoundException(`Vesting schedule ${id} not found`);
    return this.enrich(s);
  }

  private async enrich(s: VestingSchedule): Promise<VestingScheduleWithToken> {
    const token = await this.tokenRepo.findOne({ where: { id: s.tokenId } });
    const decimals = token?.decimals ?? 18;
    const now = new Date();

    const total = BigInt(s.totalAmount);
    const released = BigInt(s.releasedAmount);

    // ── Compute vested amount using linear vesting ────────────────────────────
    const vested = this.computeVested(s, now, total);
    const claimable = vested > released ? vested - released : 0n;
    const progressPercent = total > 0n ? Number((released * 10000n) / total) / 100 : 0;

    // ── Upcoming releases ─────────────────────────────────────────────────────
    const upcoming = this.computeUpcoming(s, now, total, released);

    return {
      ...s,
      tokenName: token?.name ?? 'Unknown',
      tokenSymbol: token?.symbol ?? '—',
      tokenDecimals: decimals,
      vestedAmount: vested.toString(),
      claimableAmount: claimable.toString(),
      progressPercent,
      nextReleaseDate: upcoming[0]?.date ?? null,
      upcomingReleases: upcoming.slice(0, 5),
    };
  }

  private computeVested(s: VestingSchedule, now: Date, total: bigint): bigint {
    const start = s.startDate.getTime();
    const end = s.endDate.getTime();
    const cliff = s.cliffDate?.getTime() ?? start;
    const t = now.getTime();

    if (t < cliff) return 0n;
    if (t >= end) return total;

    // Linear vesting from start to end
    const elapsed = BigInt(t - start);
    const duration = BigInt(end - start);
    return (total * elapsed) / duration;
  }

  private computeUpcoming(
    s: VestingSchedule,
    now: Date,
    total: bigint,
    released: bigint,
  ): { date: Date; amount: string }[] {
    const intervalMs = s.vestingIntervalDays * 24 * 60 * 60 * 1000;
    const end = s.endDate.getTime();
    const start = s.startDate.getTime();
    const releases: { date: Date; amount: string }[] = [];
    let cursor = start;

    // Advance to next interval after now
    while (cursor <= now.getTime()) cursor += intervalMs;

    while (cursor <= end && releases.length < 5) {
      const date = new Date(cursor);
      const vestedAt = this.computeVested(s, date, total);
      const pct = total > 0n ? Number((vestedAt * 10000n) / total) / 100 : 0;
      const amountAtDate = total > 0n ? (total * BigInt(cursor - start)) / BigInt(end - start) : 0n;
      const newlyVested = amountAtDate > released ? amountAtDate - released : 0n;
      if (newlyVested > 0n) {
        releases.push({ date, amount: newlyVested.toString() });
      }
      cursor += intervalMs;
    }

    return releases;
  }
}
