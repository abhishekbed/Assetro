import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { Tenant, TenantStatus } from '../entities/tenant.entity';
import { User, UserRole, UserStatus } from '../../auth/entities/user.entity';
import { CreateTenantDto, CreateTenantIssuerDto, UpdateTenantDto } from '../dto/create-tenant.dto';
import { AuditLogService } from './audit-log.service';

export interface TenantStats {
  userCount: number;
  tokenCount: number;
  transactionCount: number;
}

@Injectable()
export class TenantService {
  private readonly logger = new Logger(TenantService.name);

  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly dataSource: DataSource,
    private readonly auditLog: AuditLogService,
  ) {}

  async create(dto: CreateTenantDto): Promise<Tenant> {
    // Check for slug uniqueness
    const existing = await this.tenantRepository.findOne({
      where: { slug: dto.slug },
    });
    if (existing) {
      throw new ConflictException(`Tenant with slug "${dto.slug}" already exists`);
    }

    const tenant = this.tenantRepository.create({
      name: dto.name,
      slug: dto.slug,
      domain: dto.domain ?? null,
      plan: dto.plan,
      status: TenantStatus.PENDING,
      settings: dto.settings ?? {},
    });

    const saved = await this.tenantRepository.save(tenant);

    // Create a dedicated database schema for tenant isolation
    await this.createTenantSchema(saved.slug);

    this.logger.log(`Tenant created: ${saved.name} (${saved.slug})`);
    this.auditLog.create({ tenant_id: saved.id, actor_id: 'system', actor_role: 'admin', action: 'tenant.create', resource_type: 'tenant', resource_id: saved.id, details: { name: saved.name, slug: saved.slug } }).catch(() => {});
    return saved;
  }

  private async createTenantSchema(slug: string): Promise<void> {
    const schemaName = `tenant_${slug.replace(/-/g, '_')}`;

    try {
      await this.dataSource.query(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);

      // Create core tables within the tenant schema
      await this.dataSource.query(`
        CREATE TABLE IF NOT EXISTS "${schemaName}".users (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          email VARCHAR(255) NOT NULL,
          name VARCHAR(255) NOT NULL,
          role VARCHAR(50) NOT NULL DEFAULT 'investor',
          status VARCHAR(50) NOT NULL DEFAULT 'pending_verification',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      await this.dataSource.query(`
        CREATE TABLE IF NOT EXISTS "${schemaName}".tokens (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name VARCHAR(255) NOT NULL,
          symbol VARCHAR(20) NOT NULL,
          status VARCHAR(50) NOT NULL DEFAULT 'draft',
          total_supply DECIMAL(36, 18) NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      await this.dataSource.query(`
        CREATE TABLE IF NOT EXISTS "${schemaName}".transactions (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          token_id UUID NOT NULL,
          from_address VARCHAR(42),
          to_address VARCHAR(42) NOT NULL,
          amount DECIMAL(36, 18) NOT NULL,
          type VARCHAR(50) NOT NULL,
          status VARCHAR(50) NOT NULL DEFAULT 'pending',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      this.logger.log(`Schema created for tenant: ${schemaName}`);
    } catch (error) {
      this.logger.error(
        `Failed to create schema for tenant ${slug}: ${(error as Error).message}`,
      );
      throw error;
    }
  }

  async findAll(page = 1, limit = 20): Promise<{
    data: Tenant[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const take = Math.min(limit, 100);
    const skip = (page - 1) * take;

    const [data, total] = await this.tenantRepository.findAndCount({
      order: { createdAt: 'DESC' },
      take,
      skip,
    });

    return {
      data,
      total,
      page,
      limit: take,
      totalPages: Math.ceil(total / take),
    };
  }

  async findById(id: string): Promise<Tenant> {
    const tenant = await this.tenantRepository.findOne({ where: { id } });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }
    return tenant;
  }

  async findBySlug(slug: string): Promise<Tenant> {
    const tenant = await this.tenantRepository.findOne({ where: { slug } });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }
    return tenant;
  }

  async update(id: string, dto: UpdateTenantDto): Promise<Tenant> {
    const tenant = await this.findById(id);

    Object.assign(tenant, {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.domain !== undefined && { domain: dto.domain }),
      ...(dto.plan !== undefined && { plan: dto.plan }),
      ...(dto.logoUrl !== undefined && { logoUrl: dto.logoUrl }),
      ...(dto.primaryColor !== undefined && { primaryColor: dto.primaryColor }),
      ...(dto.settings !== undefined && { settings: dto.settings }),
    });

    return this.tenantRepository.save(tenant);
  }

  async updateStatus(
    id: string,
    status: 'active' | 'suspended' | 'deactivated',
  ): Promise<Tenant> {
    const tenant = await this.findById(id);
    tenant.status = status as TenantStatus;
    const updated = await this.tenantRepository.save(tenant);

    this.logger.log(`Tenant ${tenant.slug} status updated to ${status}`);
    const action = status === 'suspended' ? 'tenant.suspend' : status === 'active' ? 'tenant.activate' : 'tenant.update';
    this.auditLog.create({ tenant_id: id, actor_id: 'system', actor_role: 'admin', action, resource_type: 'tenant', resource_id: id, details: { status } }).catch(() => {});
    return updated;
  }

  async createIssuer(tenantId: string, dto: CreateTenantIssuerDto): Promise<{ user: Omit<User, 'passwordHash' | 'totpSecret' | 'emailVerificationToken' | 'passwordResetToken' | 'passwordResetExpires' | 'walletNonce'>; tempPassword: string }> {
    const tenant = await this.findById(tenantId);

    const existing = await this.userRepository.findOne({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException(`A user with email "${dto.email}" already exists.`);
    }

    const tempPassword = crypto.randomBytes(10).toString('base64url').slice(0, 12) + 'Aa1!';
    const passwordHash = await bcrypt.hash(tempPassword, 12);
    const resetToken = crypto.randomBytes(32).toString('hex');

    const user = this.userRepository.create({
      email: dto.email,
      name: dto.name,
      passwordHash,
      role: UserRole.ISSUER,
      tenantId: tenant.id,
      status: UserStatus.ACTIVE,
      isEmailVerified: true,
      passwordResetToken: resetToken,
      passwordResetExpires: new Date(Date.now() + 7 * 24 * 3600_000),
    });

    const saved = await this.userRepository.save(user);

    this.logger.log(`[EMAIL] Issuer created for tenant ${tenant.slug}: ${dto.email} | Temp password: ${tempPassword}`);

    this.auditLog.create({
      tenant_id: tenant.id,
      actor_id: 'system',
      actor_role: 'admin',
      action: 'tenant.issuer_created',
      resource_type: 'user',
      resource_id: saved.id,
      details: { email: dto.email, tenantId: tenant.id },
    }).catch(() => {});

    const { passwordHash: _ph, totpSecret: _ts, emailVerificationToken: _ev, passwordResetToken: _prt, passwordResetExpires: _pre, walletNonce: _wn, ...safeUser } = saved;
    return { user: safeUser, tempPassword };
  }

  async getStats(id: string): Promise<TenantStats> {
    const tenant = await this.findById(id);
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

      return {
        userCount: parseInt(userResult?.count ?? '0', 10),
        tokenCount: parseInt(tokenResult?.count ?? '0', 10),
        transactionCount: parseInt(txResult?.count ?? '0', 10),
      };
    } catch {
      // Schema may not exist yet or tables may not be created
      return { userCount: 0, tokenCount: 0, transactionCount: 0 };
    }
  }
}
