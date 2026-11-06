import {
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';
import { CapTable } from '../entities/cap-table.entity';
import { Token } from '../entities/token.entity';
import { TokenService, PaginatedResult } from './token.service';

@Injectable()
export class CapTableService {
  private readonly logger = new Logger(CapTableService.name);

  constructor(
    @InjectRepository(CapTable)
    private readonly capTableRepository: Repository<CapTable>,
    @InjectRepository(Token)
    private readonly tokenRepository: Repository<Token>,
    private readonly tokenService: TokenService,
    private readonly configService: ConfigService,
  ) {}

  async getCapTable(
    tokenId: string,
    page = 1,
    limit = 50,
    tenantId?: string,
  ): Promise<PaginatedResult<CapTable>> {
    await this.tokenService.findById(tokenId, tenantId);

    const [data, total] = await this.capTableRepository.findAndCount({
      where: { tokenId },
      order: { balance: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  /**
   * Upsert a cap table entry for a wallet and recalculate percentages for ALL holders.
   *
   * Called from:
   *   - payment webhook after mint confirmed (payment.service.ts)
   *   - blockchain event listener on Transfer events
   *
   * @param tokenId  - Token UUID (DB)
   * @param walletAddress - Investor wallet (checksummed or lowercase — normalized internally)
   * @param userId   - Platform user ID (nullable for external wallets)
   * @param newBalance - New raw token balance in WEI string (BigInt-compatible)
   */
  async updateOrInsertEntry(
    tokenId: string,
    walletAddress: string,
    userId: string | null,
    newBalance: string,
  ): Promise<CapTable> {
    const wallet = walletAddress.toLowerCase();
    const token = await this.tokenRepository.findOne({ where: { id: tokenId } });
    if (!token) throw new NotFoundException(`Token ${tokenId} not found`);

    const decimals = token.decimals ?? 18;

    // ── Upsert this wallet's entry ─────────────────────────────────────────────
    let entry = await this.capTableRepository.findOne({
      where: { tokenId, walletAddress: wallet },
    });

    if (entry) {
      entry.balance = newBalance;
      if (userId) entry.userId = userId;
      entry.lastSyncedAt = new Date();
    } else {
      entry = this.capTableRepository.create({
        tokenId,
        userId,
        walletAddress: wallet,
        balance: newBalance,
        percentage: 0,
        lastSyncedAt: new Date(),
      });
    }
    await this.capTableRepository.save(entry);

    // ── Recalculate percentage for ALL holders ─────────────────────────────────
    // Sum all balances from the DB to get current total held
    const allEntries = await this.capTableRepository.find({ where: { tokenId } });
    const totalHeld = allEntries.reduce(
      (sum, e) => sum + BigInt(e.balance || '0'),
      0n,
    );

    if (totalHeld > 0n) {
      await Promise.all(
        allEntries.map(async (e) => {
          const bal = BigInt(e.balance || '0');
          const pct = Number((bal * 10000n) / totalHeld) / 100; // 2 decimal places
          if (Math.abs(e.percentage - pct) > 0.001) {
            e.percentage = pct;
            await this.capTableRepository.save(e);
          }
        }),
      );
    }

    this.logger.log(
      `[CapTable] updated  token=${tokenId}  wallet=${wallet}  balance=${ethers.formatUnits(newBalance, decimals)}  totalHolders=${allEntries.length}`,
    );

    // Return the saved entry with fresh percentage
    return this.capTableRepository.findOne({ where: { tokenId, walletAddress: wallet } }) as Promise<CapTable>;
  }

  /**
   * Sync cap table from on-chain balances for all known wallet entries.
   * Reads balanceOf(wallet) for each entry and upserts.
   */
  async syncFromBlockchain(tokenId: string, tenantId?: string): Promise<{ synced: number }> {
    const token = await this.tokenService.findById(tokenId, tenantId);

    if (!token.tokenAddress) {
      throw new NotFoundException('Token has not been deployed to the blockchain');
    }

    const mode = this.configService.get<string>('BLOCKCHAIN_MODE', 'local');
    if (mode === 'local') {
      this.logger.warn('[CapTable] LOCAL mode — skipping on-chain sync');
      return { synced: 0 };
    }

    const rpcUrl = this.configService.get<string>('SEPOLIA_RPC_URL');
    if (!rpcUrl) throw new NotFoundException('SEPOLIA_RPC_URL not configured');

    const provider = new ethers.JsonRpcProvider(rpcUrl, undefined, { staticNetwork: true });
    const tokenContract = new ethers.Contract(
      token.tokenAddress,
      ['function balanceOf(address) view returns (uint256)'],
      provider,
    );

    const entries = await this.capTableRepository.find({ where: { tokenId } });
    let synced = 0;

    for (const entry of entries) {
      try {
        const onchainBalance: bigint = await tokenContract.balanceOf(entry.walletAddress);
        await this.updateOrInsertEntry(tokenId, entry.walletAddress, entry.userId, onchainBalance.toString());
        synced++;
      } catch (err: unknown) {
        this.logger.warn(`[CapTable] balanceOf failed for ${entry.walletAddress}: ${(err as Error).message}`);
      }
    }

    this.logger.log(`[CapTable] syncFromBlockchain complete  token=${tokenId}  synced=${synced}`);
    return { synced };
  }

  async exportCsv(tokenId: string, tenantId?: string): Promise<string> {
    await this.tokenService.findById(tokenId, tenantId);

    const entries = await this.capTableRepository.find({
      where: { tokenId },
      order: { balance: 'DESC' },
    });

    const header = 'wallet_address,user_id,balance,percentage,last_synced_at';
    const rows = entries.map(
      (e) =>
        `${e.walletAddress},${e.userId || ''},${e.balance},${e.percentage},${e.lastSyncedAt?.toISOString() || ''}`,
    );

    return [header, ...rows].join('\n');
  }

  async updateEntry(
    tokenId: string,
    walletAddress: string,
    updates: Partial<Pick<CapTable, 'userId' | 'balance' | 'percentage'>>,
    tenantId?: string,
  ): Promise<CapTable> {
    await this.tokenService.findById(tokenId, tenantId);

    const entry = await this.capTableRepository.findOne({
      where: { tokenId, walletAddress: walletAddress.toLowerCase() },
    });

    if (!entry) {
      throw new NotFoundException(
        `Cap table entry not found for wallet ${walletAddress} on token ${tokenId}`,
      );
    }

    Object.assign(entry, updates);
    return this.capTableRepository.save(entry);
  }
}
