import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { CapTable } from '../entities/cap-table.entity';
import { Payment } from '../../payments/entities/payment.entity';
import { Token } from '../entities/token.entity';
import { formatUnits } from 'ethers';

export interface InvestorPosition {
  tokenId: string;
  name: string;
  symbol: string;
  assetType: string;
  status: string;
  chainId: number;
  tokenAddress: string | null;
  identityRegistryAddress: string | null;
  complianceAddress: string | null;
  totalSupply: string;
  quantity: string;
  investedAmount: string;
  orders: number;
  ownershipPercent: number;
  source: 'cap_table' | 'payments';
  walletAddress: string | null;
  lastUpdatedAt: string | null;
  /**
   * Paid for, but not yet minted by the issuer. Settled figures above stay
   * clean — these are reported alongside so the investor can see an order is
   * in flight instead of their purchase simply not appearing.
   */
  /** Tokens covered by completed payments — the quantity `investedAmount` paid for. */
  purchasedQuantity: string;
  pendingQuantity: string;
  pendingAmount: string;
  pendingOrders: number;
}

@Injectable()
export class InvestorPortfolioService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(CapTable)
    private readonly capTableRepository: Repository<CapTable>,
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,
    @InjectRepository(Token)
    private readonly tokenRepository: Repository<Token>,
  ) {}

  async getPortfolio(
    userId: string,
    tenantId?: string,
    walletAddress?: string,
  ): Promise<InvestorPosition[]> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const normalizedWallet = walletAddress?.toLowerCase() || user.walletAddress?.toLowerCase() || null;

    const payments = await this.paymentRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });

    const completedPayments = payments.filter((payment) => payment.status === 'completed');
    // Paid at Stripe (or wire-confirmed) and waiting on the issuer to mint.
    const pendingPayments = payments.filter(
      (payment) => payment.status === 'paid' || payment.status === 'processing',
    );
    const tokenIds = Array.from(
      new Set([...completedPayments, ...pendingPayments].map((payment) => payment.tokenId)),
    );

    const capEntries =
      normalizedWallet
        ? await this.capTableRepository
            .createQueryBuilder('cap')
            .where('cap.user_id = :userId', { userId })
            .orWhere('cap.wallet_address = :walletAddress', { walletAddress: normalizedWallet })
            .getMany()
        : await this.capTableRepository.find({ where: { userId } });

    for (const entry of capEntries) {
      if (!tokenIds.includes(entry.tokenId)) {
        tokenIds.push(entry.tokenId);
      }
    }

    if (tokenIds.length === 0) {
      return [];
    }

    const tokenQuery = this.tokenRepository.createQueryBuilder('token').whereInIds(tokenIds);
    if (tenantId) {
      tokenQuery.andWhere('token.tenant_id = :tenantId', { tenantId });
    }
    const tokens = await tokenQuery.getMany();
    const tokenMap = new Map(tokens.map((token) => [token.id, token]));

    const paymentMap = new Map<string, { investedAmount: number; orders: number; quantity: number; lastUpdatedAt: string | null }>();
    for (const payment of completedPayments) {
      const current = paymentMap.get(payment.tokenId) || {
        investedAmount: 0,
        orders: 0,
        quantity: 0,
        lastUpdatedAt: null,
      };
      current.investedAmount += Number(payment.fiatAmount || 0);
      current.orders += 1;
      current.quantity += Number(payment.tokenAmount || 0);
      current.lastUpdatedAt =
        !current.lastUpdatedAt || current.lastUpdatedAt < payment.createdAt.toISOString()
          ? payment.createdAt.toISOString()
          : current.lastUpdatedAt;
      paymentMap.set(payment.tokenId, current);
    }

    const pendingMap = new Map<string, { amount: number; orders: number; quantity: number }>();
    for (const payment of pendingPayments) {
      const current = pendingMap.get(payment.tokenId) || { amount: 0, orders: 0, quantity: 0 };
      current.amount += Number(payment.fiatAmount || 0);
      current.orders += 1;
      current.quantity += Number(payment.tokenAmount || 0);
      pendingMap.set(payment.tokenId, current);
    }

    const capMap = new Map<string, { balanceRaw: bigint; ownershipPercent: number; lastUpdatedAt: string | null }>();
    for (const entry of capEntries) {
      const current = capMap.get(entry.tokenId) || {
        balanceRaw: 0n,
        ownershipPercent: 0,
        lastUpdatedAt: null,
      };
      current.balanceRaw += BigInt(entry.balance || '0');
      current.ownershipPercent += Number(entry.percentage || 0);
      current.lastUpdatedAt =
        !current.lastUpdatedAt || current.lastUpdatedAt < (entry.lastSyncedAt?.toISOString() || '')
          ? entry.lastSyncedAt?.toISOString() || null
          : current.lastUpdatedAt;
      capMap.set(entry.tokenId, current);
    }

    const positions: InvestorPosition[] = [];

    for (const tokenId of tokenIds) {
      const token = tokenMap.get(tokenId);
      if (!token) {
        continue;
      }

      const paymentStats = paymentMap.get(tokenId) || {
        investedAmount: 0,
        orders: 0,
        quantity: 0,
        lastUpdatedAt: null,
      };
      const capStats = capMap.get(tokenId);
      const quantityFromCap =
        capStats ? formatUnits(capStats.balanceRaw, token.decimals ?? 18) : null;
      const effectiveQuantity = quantityFromCap ?? paymentStats.quantity.toString();
      const ownershipPercent =
        capStats?.ownershipPercent ??
        (Number(token.totalSupply || 0) > 0
          ? (Number(effectiveQuantity || 0) / Number(token.totalSupply || 0)) * 100
          : 0);

      positions.push({
        tokenId: token.id,
        name: token.name,
        symbol: token.symbol,
        assetType: token.assetType,
        status: token.status,
        chainId: token.chainId,
        tokenAddress: token.tokenAddress,
        identityRegistryAddress: token.identityRegistryAddress,
        complianceAddress: token.complianceAddress,
        totalSupply: token.totalSupply,
        quantity: effectiveQuantity,
        investedAmount: paymentStats.investedAmount.toFixed(2),
        orders: paymentStats.orders,
        ownershipPercent,
        source: capStats ? 'cap_table' : 'payments',
        walletAddress: normalizedWallet,
        lastUpdatedAt: capStats?.lastUpdatedAt || paymentStats.lastUpdatedAt,
        purchasedQuantity: paymentStats.quantity.toString(),
        pendingQuantity: (pendingMap.get(tokenId)?.quantity ?? 0).toString(),
        pendingAmount: (pendingMap.get(tokenId)?.amount ?? 0).toFixed(2),
        pendingOrders: pendingMap.get(tokenId)?.orders ?? 0,
      });
    }

    const weight = (p: InvestorPosition) => Number(p.investedAmount) + Number(p.pendingAmount);
    return positions.sort((a, b) => weight(b) - weight(a));
  }

  async getTokenPosition(
    tokenId: string,
    userId: string,
    tenantId?: string,
    walletAddress?: string,
  ): Promise<InvestorPosition | null> {
    const positions = await this.getPortfolio(userId, tenantId, walletAddress);
    return positions.find((position) => position.tokenId === tokenId) || null;
  }
}
