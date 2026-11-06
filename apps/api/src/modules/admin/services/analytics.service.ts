import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Tenant } from '../entities/tenant.entity';

export interface PlatformStats {
  totalTenants: number;
  activeTenants: number;
  totalUsers: number;
  totalTokens: number;
  totalTransactions: number;
  tenantsByPlan: Record<string, number>;
  tenantsByStatus: Record<string, number>;
}

export interface TenantAnalytics {
  tenantId: string;
  tenantName: string;
  slug: string;
  plan: string;
  status: string;
  userCount: number;
  tokenCount: number;
  transactionCount: number;
}

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
    private readonly dataSource: DataSource,
  ) {}

  async getPlatformStats(): Promise<PlatformStats> {
    const tenants = await this.tenantRepository.find();

    const totalTenants = tenants.length;
    const activeTenants = tenants.filter((t) => t.status === 'active').length;

    // Aggregate stats from plan/status
    const tenantsByPlan: Record<string, number> = {};
    const tenantsByStatus: Record<string, number> = {};

    for (const tenant of tenants) {
      tenantsByPlan[tenant.plan] = (tenantsByPlan[tenant.plan] ?? 0) + 1;
      tenantsByStatus[tenant.status] = (tenantsByStatus[tenant.status] ?? 0) + 1;
    }

    // Aggregate cross-tenant stats
    let totalUsers = 0;
    let totalTokens = 0;
    let totalTransactions = 0;

    for (const tenant of tenants) {
      const schemaName = `tenant_${tenant.slug.replace(/-/g, '_')}`;
      try {
        const [userResult] = await this.dataSource.query(
          `SELECT COUNT(*) as count FROM "${schemaName}".users`,
        );
        const [tokenResult] = await this.dataSource.query(
          `SELECT COUNT(*) as count FROM "${schemaName}".tokens`,
        );
        const [txResult] = await this.dataSource.query(
          `SELECT COUNT(*) as count FROM "${schemaName}".transactions`,
        );

        totalUsers += parseInt(userResult?.count ?? '0', 10);
        totalTokens += parseInt(tokenResult?.count ?? '0', 10);
        totalTransactions += parseInt(txResult?.count ?? '0', 10);
      } catch {
        // Schema might not exist yet for this tenant
        this.logger.debug(`Could not query stats for tenant ${tenant.slug}`);
      }
    }

    return {
      totalTenants,
      activeTenants,
      totalUsers,
      totalTokens,
      totalTransactions,
      tenantsByPlan,
      tenantsByStatus,
    };
  }

  async getTenantStats(tenantId: string): Promise<TenantAnalytics> {
    const tenant = await this.tenantRepository.findOne({ where: { id: tenantId } });
    if (!tenant) {
      return {
        tenantId,
        tenantName: 'Unknown',
        slug: '',
        plan: '',
        status: '',
        userCount: 0,
        tokenCount: 0,
        transactionCount: 0,
      };
    }

    const schemaName = `tenant_${tenant.slug.replace(/-/g, '_')}`;
    let userCount = 0;
    let tokenCount = 0;
    let transactionCount = 0;

    try {
      const [userResult] = await this.dataSource.query(
        `SELECT COUNT(*) as count FROM "${schemaName}".users`,
      );
      const [tokenResult] = await this.dataSource.query(
        `SELECT COUNT(*) as count FROM "${schemaName}".tokens`,
      );
      const [txResult] = await this.dataSource.query(
        `SELECT COUNT(*) as count FROM "${schemaName}".transactions`,
      );

      userCount = parseInt(userResult?.count ?? '0', 10);
      tokenCount = parseInt(tokenResult?.count ?? '0', 10);
      transactionCount = parseInt(txResult?.count ?? '0', 10);
    } catch {
      this.logger.debug(`Could not query stats for tenant ${tenant.slug}`);
    }

    return {
      tenantId: tenant.id,
      tenantName: tenant.name,
      slug: tenant.slug,
      plan: tenant.plan,
      status: tenant.status,
      userCount,
      tokenCount,
      transactionCount,
    };
  }
}
