import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Token } from '../../tokens/entities/token.entity';
import { CapTable } from '../../tokens/entities/cap-table.entity';
import { Payment, PaymentStatus } from '../../payments/entities/payment.entity';
import { InvestorProfile } from '../../kyc/entities/investor-profile.entity';
import { User } from '../../auth/entities/user.entity';

export interface OverviewStats {
  totalTokens: number;
  activeTokens: number;
  totalHolders: number;
  totalRevenue: number;
  totalTokensIssued: number;
  recentPayments: number;
}

export interface DailyPoint {
  date: string;  // YYYY-MM-DD
  value: number;
}

export interface TokenRevenue {
  tokenId: string;
  name: string;
  symbol: string;
  revenue: number;
  payments: number;
}

export interface InvestorBreakdown {
  individual: number;
  institutional: number;
  accredited: number;
}

export interface CountryBreakdown {
  country: string;
  count: number;
}

@Injectable()
export class IssuerAnalyticsService {
  constructor(
    @InjectRepository(Token)
    private readonly tokenRepo: Repository<Token>,
    @InjectRepository(CapTable)
    private readonly capTableRepo: Repository<CapTable>,
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
    @InjectRepository(InvestorProfile)
    private readonly profileRepo: Repository<InvestorProfile>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly dataSource: DataSource,
  ) {}

  async getOverview(tenantId?: string): Promise<OverviewStats> {
    const tokenWhere = tenantId ? { tenantId } : {};
    const tokens = await this.tokenRepo.find({ where: tokenWhere });
    const tokenIds = tokens.map(t => t.id);

    const totalHolders = tokenIds.length
      ? await this.capTableRepo
          .createQueryBuilder('ct')
          .where('ct.token_id IN (:...ids)', { ids: tokenIds })
          .select('COUNT(DISTINCT ct.wallet_address)', 'cnt')
          .getRawOne()
          .then(r => parseInt(r?.cnt ?? '0', 10))
      : 0;

    const paymentWhere = tokenIds.length
      ? await this.paymentRepo
          .createQueryBuilder('p')
          .where('p.token_id IN (:...ids)', { ids: tokenIds })
          .andWhere("p.status IN ('completed','paid')")
          .select('SUM(CAST(p.fiat_amount AS DECIMAL))', 'total')
          .addSelect('COUNT(*)', 'cnt')
          .getRawOne()
      : null;

    const totalRevenue = parseFloat(paymentWhere?.total ?? '0');
    const recentPayments = parseInt(paymentWhere?.cnt ?? '0', 10);

    const totalTokensIssued = tokens.reduce((s, t) => {
      try { return s + Number(BigInt(t.totalSupply ?? '0')); } catch { return s; }
    }, 0);

    return {
      totalTokens: tokens.length,
      activeTokens: tokens.filter(t => t.status === 'active').length,
      totalHolders,
      totalRevenue,
      totalTokensIssued,
      recentPayments,
    };
  }

  async getRevenueByDay(tenantId?: string, days = 30): Promise<DailyPoint[]> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const tokenIds = await this.getTokenIds(tenantId);
    if (!tokenIds.length) return [];

    const rows = await this.paymentRepo
      .createQueryBuilder('p')
      .where('p.token_id IN (:...ids)', { ids: tokenIds })
      .andWhere("p.status IN ('completed','paid')")
      .andWhere('p.created_at >= :since', { since })
      .select("TO_CHAR(p.created_at, 'YYYY-MM-DD')", 'date')
      .addSelect('SUM(CAST(p.fiat_amount AS DECIMAL))', 'value')
      .groupBy('date')
      .orderBy('date', 'ASC')
      .getRawMany();

    return this.fillDailyGaps(rows.map(r => ({ date: r.date, value: parseFloat(r.value ?? '0') })), days);
  }

  async getHolderCountByDay(tenantId?: string, days = 30): Promise<DailyPoint[]> {
    const tokenIds = await this.getTokenIds(tenantId);
    if (!tokenIds.length) return [];

    const rows = await this.capTableRepo
      .createQueryBuilder('ct')
      .where('ct.token_id IN (:...ids)', { ids: tokenIds })
      .select("TO_CHAR(ct.created_at, 'YYYY-MM-DD')", 'date')
      .addSelect('COUNT(*)', 'value')
      .groupBy('date')
      .orderBy('date', 'ASC')
      .getRawMany();

    // Cumulative count
    let running = 0;
    const all = this.fillDailyGaps(rows.map(r => ({ date: r.date, value: parseInt(r.value ?? '0', 10) })), days);
    return all.map(d => { running += d.value; return { date: d.date, value: running }; });
  }

  async getPaymentVolumeByDay(tenantId?: string, days = 30): Promise<DailyPoint[]> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const tokenIds = await this.getTokenIds(tenantId);
    if (!tokenIds.length) return [];

    const rows = await this.paymentRepo
      .createQueryBuilder('p')
      .where('p.token_id IN (:...ids)', { ids: tokenIds })
      .andWhere('p.created_at >= :since', { since })
      .select("TO_CHAR(p.created_at, 'YYYY-MM-DD')", 'date')
      .addSelect('COUNT(*)', 'value')
      .groupBy('date')
      .orderBy('date', 'ASC')
      .getRawMany();

    return this.fillDailyGaps(rows.map(r => ({ date: r.date, value: parseInt(r.value ?? '0', 10) })), days);
  }

  async getRevenueByToken(tenantId?: string): Promise<TokenRevenue[]> {
    const tokenIds = await this.getTokenIds(tenantId);
    if (!tokenIds.length) return [];

    const rows = await this.paymentRepo
      .createQueryBuilder('p')
      .where('p.token_id IN (:...ids)', { ids: tokenIds })
      .andWhere("p.status IN ('completed','paid')")
      .select('p.token_id', 'tokenId')
      .addSelect('SUM(CAST(p.fiat_amount AS DECIMAL))', 'revenue')
      .addSelect('COUNT(*)', 'payments')
      .groupBy('p.token_id')
      .orderBy('revenue', 'DESC')
      .getRawMany();

    const tokens = await this.tokenRepo.findByIds(rows.map(r => r.tokenId));
    const tokenMap = new Map(tokens.map(t => [t.id, t]));

    return rows.map(r => {
      const t = tokenMap.get(r.tokenId);
      return {
        tokenId: r.tokenId,
        name: t?.name ?? 'Unknown',
        symbol: t?.symbol ?? '—',
        revenue: parseFloat(r.revenue ?? '0'),
        payments: parseInt(r.payments ?? '0', 10),
      };
    });
  }

  async getInvestorBreakdown(tenantId?: string): Promise<InvestorBreakdown> {
    const rows = await this.profileRepo
      .createQueryBuilder('ip')
      .select('ip.investor_type', 'type')
      .addSelect('COUNT(*)', 'cnt')
      .groupBy('ip.investor_type')
      .getRawMany();

    const map: Record<string, number> = {};
    for (const r of rows) map[r.type] = parseInt(r.cnt, 10);

    return {
      individual: map['individual'] ?? 0,
      institutional: map['institutional'] ?? 0,
      accredited: map['accredited'] ?? 0,
    };
  }

  async getCountryBreakdown(tenantId?: string): Promise<CountryBreakdown[]> {
    const rows = await this.profileRepo
      .createQueryBuilder('ip')
      .select('ip.country', 'country')
      .addSelect('COUNT(*)', 'cnt')
      .where('ip.country IS NOT NULL')
      .groupBy('ip.country')
      .orderBy('cnt', 'DESC')
      .limit(15)
      .getRawMany();

    return rows.map(r => ({ country: r.country, count: parseInt(r.cnt, 10) }));
  }

  private async getTokenIds(tenantId?: string): Promise<string[]> {
    const where = tenantId ? { tenantId } : {};
    const tokens = await this.tokenRepo.find({ where, select: ['id'] });
    return tokens.map(t => t.id);
  }

  private fillDailyGaps(data: DailyPoint[], days: number): DailyPoint[] {
    const map = new Map(data.map(d => [d.date, d.value]));
    const result: DailyPoint[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().slice(0, 10);
      result.push({ date: key, value: map.get(key) ?? 0 });
    }
    return result;
  }
}
