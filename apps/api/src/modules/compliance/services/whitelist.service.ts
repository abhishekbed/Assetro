import {
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Whitelist, InvestorType } from '../entities/whitelist.entity';
import { AddToWhitelistDto, BatchWhitelistDto } from '../dto/whitelist.dto';
import { User } from '../../auth/entities/user.entity';
import { InvestorProfile } from '../../kyc/entities/investor-profile.entity';
import { KycSubmission, KycStatus } from '../../kyc/entities/kyc-submission.entity';
import {
  IssuerInvestorQualification,
  QualificationStatus,
} from '../../kyc/entities/issuer-investor-qualification.entity';

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

@Injectable()
export class WhitelistService {
  private readonly logger = new Logger(WhitelistService.name);

  constructor(
    @InjectRepository(Whitelist)
    private readonly whitelistRepository: Repository<Whitelist>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(InvestorProfile)
    private readonly profileRepository: Repository<InvestorProfile>,
    @InjectRepository(KycSubmission)
    private readonly kycRepository: Repository<KycSubmission>,
    @InjectRepository(IssuerInvestorQualification)
    private readonly qualRepository: Repository<IssuerInvestorQualification>,
  ) {}

  async addToWhitelist(dto: AddToWhitelistDto, tenantId?: string): Promise<Whitelist> {
    const existing = await this.whitelistRepository.findOne({
      where: {
        tokenId: dto.token_id,
        walletAddress: dto.wallet_address.toLowerCase(),
      },
    });

    if (existing) {
      // Idempotent — re-activate if previously deactivated, otherwise return as-is
      if (!existing.isActive) {
        existing.isActive = true;
        existing.verifiedAt = new Date();
        if (dto.country) existing.country = dto.country;
        if (dto.investor_type) existing.investorType = dto.investor_type as InvestorType;
        const reactivated = await this.whitelistRepository.save(existing);
        this.logger.log(`Re-activated ${dto.wallet_address} on whitelist for token ${dto.token_id}`);
        return reactivated;
      }
      this.logger.log(`${dto.wallet_address} already whitelisted for token ${dto.token_id} — returning existing entry`);
      return existing;
    }

    const entry = this.whitelistRepository.create({
      tokenId: dto.token_id,
      userId: dto.user_id || null,
      walletAddress: dto.wallet_address.toLowerCase(),
      country: dto.country || null,
      investorType: dto.investor_type || InvestorType.RETAIL,
      isActive: true,
      verifiedAt: new Date(),
      tenantId: tenantId || null,
    });

    const saved = await this.whitelistRepository.save(entry);
    this.logger.log(`Added ${dto.wallet_address} to whitelist for token ${dto.token_id}`);
    return saved;
  }

  /**
   * Upsert a whitelist entry with on-chain verification data.
   *
   * Unlike addToWhitelist(), this never throws on conflict — it updates the
   * existing row. Called by BlockchainSyncService after every IR registration
   * or re-sync to keep the DB mirror accurate.
   *
   * verifiedOnChain reflects IR.isVerified() — the authoritative chain state.
   */
  async upsertFromChain(
    tokenId: string,
    walletAddress: string,
    chainData: {
      userId?: string | null;
      country?: string | null;
      investorType?: InvestorType;
      verifiedOnChain: boolean;
      verificationTxHash?: string | null;
      irAddress: string;
      countryCode?: number | null;
    },
    tenantId?: string,
  ): Promise<Whitelist> {
    const normalised = walletAddress.toLowerCase();
    const now = new Date();

    const existing = await this.whitelistRepository.findOne({
      where: { tokenId, walletAddress: normalised },
    });

    if (existing) {
      Object.assign(existing, {
        verifiedOnChain: chainData.verifiedOnChain,
        verificationTxHash: chainData.verificationTxHash ?? existing.verificationTxHash,
        irAddress: chainData.irAddress,
        countryCode: chainData.countryCode ?? existing.countryCode,
        chainSyncedAt: now,
        isActive: chainData.verifiedOnChain,
        ...(chainData.verifiedOnChain && !existing.verifiedAt ? { verifiedAt: now } : {}),
      });
      const updated = await this.whitelistRepository.save(existing);
      this.logger.log(
        `[upsertFromChain] Updated  token=${tokenId}  wallet=${normalised}  verifiedOnChain=${chainData.verifiedOnChain}`,
      );
      return updated;
    }

    const entry = this.whitelistRepository.create({
      tokenId,
      userId: chainData.userId ?? null,
      walletAddress: normalised,
      country: chainData.country ?? null,
      investorType: chainData.investorType ?? InvestorType.RETAIL,
      verifiedOnChain: chainData.verifiedOnChain,
      verificationTxHash: chainData.verificationTxHash ?? null,
      irAddress: chainData.irAddress,
      countryCode: chainData.countryCode ?? null,
      chainSyncedAt: now,
      isActive: chainData.verifiedOnChain,
      verifiedAt: chainData.verifiedOnChain ? now : null,
      tenantId: tenantId ?? null,
    });

    const saved = await this.whitelistRepository.save(entry);
    this.logger.log(
      `[upsertFromChain] Created  token=${tokenId}  wallet=${normalised}  verifiedOnChain=${chainData.verifiedOnChain}`,
    );
    return saved;
  }

  async removeFromWhitelist(
    tokenId: string,
    walletAddress: string,
    tenantId?: string,
  ): Promise<void> {
    const entry = await this.findByTokenAndWallet(tokenId, walletAddress);

    if (!entry) {
      throw new NotFoundException(
        `Wallet ${walletAddress} is not whitelisted for token ${tokenId}`,
      );
    }

    if (tenantId && entry.tenantId !== tenantId) {
      throw new NotFoundException(
        `Wallet ${walletAddress} is not whitelisted for token ${tokenId}`,
      );
    }

    // Soft delete by deactivating
    entry.isActive = false;
    await this.whitelistRepository.save(entry);
    this.logger.log(`Removed ${walletAddress} from whitelist for token ${tokenId}`);
  }

  async batchWhitelist(
    dto: BatchWhitelistDto,
    tenantId?: string,
  ): Promise<{ added: number; skipped: number }> {
    let added = 0;
    let skipped = 0;

    for (const entry of dto.entries) {
      try {
        await this.addToWhitelist(
          {
            token_id: dto.token_id,
            user_id: entry.user_id,
            wallet_address: entry.wallet_address,
            country: entry.country,
            investor_type: entry.investor_type,
          },
          tenantId,
        );
        added++;
      } catch (error) {
        this.logger.warn(`Batch whitelist: skipping entry due to error: ${(error as Error).message}`);
        skipped++;
      }
    }

    this.logger.log(
      `Batch whitelist for token ${dto.token_id}: added=${added}, skipped=${skipped}`,
    );
    return { added, skipped };
  }

  async getWhitelist(
    tokenId: string,
    page = 1,
    limit = 50,
    tenantId?: string,
  ): Promise<PaginatedResult<Whitelist>> {
    const qb = this.whitelistRepository.createQueryBuilder('w');
    qb.where('w.token_id = :tokenId', { tokenId });
    qb.andWhere('w.is_active = :isActive', { isActive: true });

    if (tenantId) {
      qb.andWhere('w.tenant_id = :tenantId', { tenantId });
    }

    qb.orderBy('w.created_at', 'DESC');
    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async isWhitelisted(tokenId: string, walletAddress: string): Promise<boolean> {
    const entry = await this.whitelistRepository.findOne({
      where: {
        tokenId,
        walletAddress: walletAddress.toLowerCase(),
        isActive: true,
      },
    });
    return !!entry;
  }

  async findByTokenAndWallet(
    tokenId: string,
    walletAddress: string,
  ): Promise<Whitelist | null> {
    if (!walletAddress) return null;
    const normalised = walletAddress.toLowerCase();
    const entry = await this.whitelistRepository
      .createQueryBuilder('w')
      .where('w.token_id = :tokenId', { tokenId })
      .andWhere('LOWER(w.wallet_address) = :wallet', { wallet: normalised })
      .andWhere('w.is_active = true')
      .getOne();

    if (entry) return entry;

    // Fallback 1: check if wallet has an active entry under ANY other token
    const anyEntry = await this.whitelistRepository
      .createQueryBuilder('w')
      .where('LOWER(w.wallet_address) = :wallet', { wallet: normalised })
      .andWhere('w.is_active = true')
      .orderBy('w.verified_at', 'DESC')
      .getOne();

    if (anyEntry) {
      try {
        const newEntry = this.whitelistRepository.create({
          tokenId,
          userId: anyEntry.userId,
          walletAddress: normalised,
          country: anyEntry.country,
          investorType: anyEntry.investorType,
          isActive: true,
          verifiedAt: new Date(),
          tenantId: anyEntry.tenantId,
        });
        return await this.whitelistRepository.save(newEntry);
      } catch {
        return anyEntry;
      }
    }

    // Fallback 2: check if user is an approved platform investor
    const user = await this.userRepository
      .createQueryBuilder('u')
      .where('LOWER(u.wallet_address) = :wallet', { wallet: normalised })
      .getOne();

    if (user) {
      const approvedQual = await this.qualRepository.findOne({
        where: { investorId: user.id, status: QualificationStatus.APPROVED },
      });
      const approvedSubmission = await this.kycRepository.findOne({
        where: { userId: user.id, status: KycStatus.APPROVED },
      });

      if (approvedQual || approvedSubmission || user.status === 'active') {
        const profile = await this.profileRepository.findOne({
          where: { userId: user.id },
        });

        const resolvedType = profile?.investorType
          ? (profile.investorType as unknown as InvestorType)
          : approvedSubmission?.investorType
          ? (approvedSubmission.investorType as unknown as InvestorType)
          : InvestorType.ACCREDITED;

        try {
          const newEntry = this.whitelistRepository.create({
            tokenId,
            userId: user.id,
            walletAddress: normalised,
            country: profile?.country ?? null,
            investorType: resolvedType,
            isActive: true,
            verifiedAt: new Date(),
            tenantId: user.tenantId ?? null,
          });
          return await this.whitelistRepository.save(newEntry);
        } catch {
          return await this.whitelistRepository
            .createQueryBuilder('w')
            .where('w.token_id = :tokenId', { tokenId })
            .andWhere('LOWER(w.wallet_address) = :wallet', { wallet: normalised })
            .andWhere('w.is_active = true')
            .getOne();
        }
      }
    }

    return null;
  }

  async countActiveByToken(tokenId: string): Promise<number> {
    return this.whitelistRepository.count({
      where: {
        tokenId,
        isActive: true,
      },
    });
  }
}
