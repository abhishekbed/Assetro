import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere } from 'typeorm';
import {
  Token,
  TokenStatus,
  AssetType,
  EDITABLE_TOKEN_STATUSES,
  DEPLOYABLE_TOKEN_STATUSES,
} from '../entities/token.entity';
import { CreateTokenDto } from '../dto/create-token.dto';
import { AuditLogService } from '../../admin/services/audit-log.service';
import { ComplianceRule } from '../../compliance/entities/compliance-rule.entity';

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface TokenFilter {
  status?: TokenStatus;
  assetType?: AssetType;
  chainId?: number;
  search?: string;
}

@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);

  constructor(
    @InjectRepository(Token)
    private readonly tokenRepository: Repository<Token>,
    private readonly auditLog: AuditLogService,
  ) {}

  async create(dto: CreateTokenDto, createdBy: string, tenantId?: string): Promise<Token> {
    const metadata = this.buildTokenMetadata(dto);

    try {
      const saved = await this.tokenRepository.manager.transaction(async (manager) => {
        const token = manager.create(Token, {
          name: dto.name,
          symbol: dto.symbol,
          decimals: dto.decimals,
          totalSupply: dto.total_supply,
          assetType: dto.asset_type,
          chainId: dto.chain_id,
          description: dto.description || null,
          documentUri: dto.document_uri || null,
          // Every new token goes to the platform admin before it can be
          // deployed on-chain.
          status: TokenStatus.PENDING_APPROVAL,
          createdBy,
          tenantId: tenantId || null,
          metadata,
        });

        const createdToken = await manager.save(Token, token);

        if (dto.compliance_rules?.length) {
          const rules = dto.compliance_rules.map((rule, index) =>
            manager.create(ComplianceRule, {
              tokenId: createdToken.id,
              ruleType: rule.rule_type as ComplianceRule['ruleType'],
              parameters: rule.parameters,
              isActive: true,
              priority: index,
              createdBy,
              tenantId: tenantId || null,
            }),
          );

          await manager.save(ComplianceRule, rules);
        }

        return createdToken;
      });

      this.logger.log(`Token created: ${saved.id} (${saved.name}/${saved.symbol})`);
      this.auditLog.create({ tenant_id: tenantId ?? 'system', actor_id: createdBy, actor_role: 'issuer', action: 'token.create', resource_type: 'token', resource_id: saved.id, details: { name: saved.name, symbol: saved.symbol } }).catch(() => {});
      return saved;
    } catch (error) {
      this.logger.error(`Token creation failed: ${error}`);
      throw error;
    }
  }

  async findAll(
    tenantId: string | undefined,
    page = 1,
    limit = 20,
    filter?: TokenFilter,
  ): Promise<PaginatedResult<Token>> {
    const qb = this.tokenRepository.createQueryBuilder('token');

    if (tenantId) {
      qb.andWhere('token.tenant_id = :tenantId', { tenantId });
    }

    if (filter?.status) {
      qb.andWhere('token.status = :status', { status: filter.status });
    }

    if (filter?.assetType) {
      qb.andWhere('token.asset_type = :assetType', { assetType: filter.assetType });
    }

    if (filter?.chainId) {
      qb.andWhere('token.chain_id = :chainId', { chainId: filter.chainId });
    }

    if (filter?.search) {
      qb.andWhere(
        '(token.name ILIKE :search OR token.symbol ILIKE :search)',
        { search: `%${filter.search}%` },
      );
    }

    qb.orderBy('token.created_at', 'DESC');
    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();

    return {
      data: data.map((t) => this.sanitizeToken(t)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findById(id: string, tenantId?: string): Promise<Token> {
    const where: FindOptionsWhere<Token> = { id };
    if (tenantId) {
      where.tenantId = tenantId;
    }

    const token = await this.tokenRepository.findOne({ where });
    if (!token) {
      throw new NotFoundException(`Token with id ${id} not found`);
    }
    return this.sanitizeToken(token);
  }

  private sanitizeToken(token: Token): Token {
    if (token?.metadata && typeof token.metadata === 'object') {
      const meta = token.metadata as Record<string, unknown>;
      if (typeof meta.logo === 'string') {
        meta.logo = meta.logo.replace(/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i, '');
      }
      if (meta.deployment_tx_hash || meta.tx_hash) {
        (token as any).deploymentTxHash = meta.deployment_tx_hash || meta.tx_hash;
      }
      const offering = (meta.offering && typeof meta.offering === 'object')
        ? (meta.offering as Record<string, unknown>)
        : null;
      if (offering) {
        if (offering.min_investment !== undefined && offering.min_investment !== null && offering.min_investment !== '') {
          (token as any).minInvestment = Number(offering.min_investment);
        }
        if (offering.max_investment !== undefined && offering.max_investment !== null && offering.max_investment !== '') {
          (token as any).maxInvestment = Number(offering.max_investment);
        }
      }
    }
    return token;
  }

  async update(
    id: string,
    updates: Partial<Pick<Token, 'name' | 'description' | 'documentUri' | 'metadata'>>,
    tenantId?: string,
  ): Promise<Token> {
    const token = await this.findById(id, tenantId);

    if (!EDITABLE_TOKEN_STATUSES.includes(token.status)) {
      throw new BadRequestException(
        `A token that is ${token.status} can no longer be edited`,
      );
    }

    Object.assign(token, updates);

    // Any edit invalidates a prior review — an approved token must not be
    // altered after the fact, and a rejected one re-enters the queue.
    if (token.status === TokenStatus.APPROVED || token.status === TokenStatus.REJECTED) {
      token.status = TokenStatus.PENDING_APPROVAL;
      token.rejectionReason = null;
      token.reviewedBy = null;
      token.reviewedAt = null;
      this.logger.log(`Token ${id} edited after review — returned to pending approval`);
    }

    return this.tokenRepository.save(token);
  }

  async delete(id: string, tenantId?: string): Promise<void> {
    const token = await this.findById(id, tenantId);

    if (!EDITABLE_TOKEN_STATUSES.includes(token.status)) {
      throw new BadRequestException(
        `A token that is ${token.status} can no longer be deleted`,
      );
    }

    await this.tokenRepository.remove(token);
    this.logger.log(`Token deleted: ${id}`);
  }

  // ─── Admin approval of token creation ──────────────────────────

  /**
   * Approve a pending token so the issuer can deploy it.
   *
   * Approval does not touch the chain — the issuer still signs
   * `deployTREXSuite` from their own wallet afterwards.
   */
  async approveCreation(id: string, adminId: string | null): Promise<Token> {
    const token = await this.findById(id);

    if (token.status !== TokenStatus.PENDING_APPROVAL) {
      throw new BadRequestException(
        `Token is ${token.status}. Only tokens pending approval can be approved.`,
      );
    }

    token.status = TokenStatus.APPROVED;
    token.rejectionReason = null;
    token.reviewedBy = adminId;
    token.reviewedAt = new Date();

    const saved = await this.tokenRepository.save(token);
    this.logger.log(`Token approved for deployment: ${id} (${token.symbol})`);

    this.auditLog.create({ tenant_id: token.tenantId ?? 'system', actor_id: adminId ?? 'system', actor_role: 'admin', action: 'token.approve', resource_type: 'token', resource_id: id, details: { name: token.name, symbol: token.symbol } }).catch(() => {});

    return saved;
  }

  /** Decline a pending token. The reason is shown to the issuer. */
  async rejectCreation(
    id: string,
    adminId: string | null,
    rejectionReason: string,
  ): Promise<Token> {
    const token = await this.findById(id);

    if (token.status !== TokenStatus.PENDING_APPROVAL) {
      throw new BadRequestException(
        `Token is ${token.status}. Only tokens pending approval can be rejected.`,
      );
    }

    token.status = TokenStatus.REJECTED;
    token.rejectionReason = rejectionReason;
    token.reviewedBy = adminId;
    token.reviewedAt = new Date();

    const saved = await this.tokenRepository.save(token);
    this.logger.log(`Token rejected: ${id} (${token.symbol}) — ${rejectionReason}`);

    this.auditLog.create({ tenant_id: token.tenantId ?? 'system', actor_id: adminId ?? 'system', actor_role: 'admin', action: 'token.reject', resource_type: 'token', resource_id: id, details: { name: token.name, symbol: token.symbol, reason: rejectionReason } }).catch(() => {});

    return saved;
  }

  /** Counts for the admin review dashboard. */
  async getApprovalStats(): Promise<{
    total: number;
    pending: number;
    approved: number;
    rejected: number;
  }> {
    const rows = await this.tokenRepository
      .createQueryBuilder('token')
      .select('token.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('token.status')
      .getRawMany<{ status: string; count: string }>();

    const stats = { total: 0, pending: 0, approved: 0, rejected: 0 };
    for (const row of rows) {
      const n = parseInt(row.count, 10);
      stats.total += n;
      if (row.status === TokenStatus.PENDING_APPROVAL) stats.pending = n;
      else if (row.status === TokenStatus.APPROVED) stats.approved = n;
      else if (row.status === TokenStatus.REJECTED) stats.rejected = n;
    }
    return stats;
  }

  async updateStatus(id: string, status: TokenStatus, actorId?: string): Promise<Token> {
    const token = await this.findById(id);
    token.status = status;
    const saved = await this.tokenRepository.save(token);
    const action = status === TokenStatus.ACTIVE ? 'token.deploy' : status === TokenStatus.PAUSED ? 'token.pause' : 'token.update';
    this.auditLog.create({ tenant_id: token.tenantId ?? 'system', actor_id: actorId ?? token.createdBy ?? 'system', actor_role: 'issuer', action, resource_type: 'token', resource_id: id, details: { status } }).catch(() => {});
    return saved;
  }

  async updateContractAddresses(
    id: string,
    addresses: {
      tokenAddress: string;
      identityRegistryAddress: string;
      complianceAddress: string;
      claimTopicsAddress: string;
      trustedIssuersAddress: string;
      txHash?: string;
    },
  ): Promise<Token> {
    const token = await this.findById(id);
    const { txHash, ...contractAddresses } = addresses;
    Object.assign(token, contractAddresses);
    if (txHash) {
      token.metadata = {
        ...(token.metadata || {}),
        deployment_tx_hash: txHash,
        tx_hash: txHash,
      };
    }
    token.deployedAt = new Date();
    return this.tokenRepository.save(token);
  }

  async syncDeployment(
    id: string,
    addresses: {
      tokenAddress: string;
      identityRegistryAddress: string;
      complianceAddress: string;
      claimTopicsAddress: string;
      trustedIssuersAddress: string;
      txHash?: string;
    },
    tenantId?: string,
  ): Promise<Token> {
    const token = await this.findById(id, tenantId);

    // The issuer deploys from their own wallet and reports back here, so this
    // is the only server-side checkpoint on that path. Without it, hiding the
    // deploy button would be the sole barrier — and that is not a barrier.
    if (!DEPLOYABLE_TOKEN_STATUSES.includes(token.status) && token.status !== TokenStatus.DEPLOYING) {
      throw new BadRequestException(
        token.status === TokenStatus.PENDING_APPROVAL
          ? 'This token is still awaiting platform approval and cannot be deployed yet.'
          : token.status === TokenStatus.REJECTED
            ? `This token was rejected and cannot be deployed. Reason: ${token.rejectionReason ?? 'not given'}`
            : `Token must be approved before deployment. Current status: ${token.status}`,
      );
    }

    const { txHash, ...contractAddresses } = addresses;
    Object.assign(token, contractAddresses);
    if (txHash) {
      token.metadata = {
        ...(token.metadata || {}),
        deployment_tx_hash: txHash,
        tx_hash: txHash,
      };
    }
    token.status = TokenStatus.ACTIVE;
    token.deployedAt = new Date();
    return this.tokenRepository.save(token);
  }

  async syncStatus(
    id: string,
    status: TokenStatus,
    tenantId?: string,
  ): Promise<Token> {
    const token = await this.findById(id, tenantId);
    token.status = status;
    return this.tokenRepository.save(token);
  }

  private buildTokenMetadata(dto: CreateTokenDto): Record<string, unknown> | null {
    const metadata: Record<string, unknown> = dto.metadata ? { ...dto.metadata } : {};

    if (typeof metadata.logo === 'string') {
      metadata.logo = metadata.logo.replace(/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i, '');
    }

    if (dto.compliance_rules?.length) {
      metadata.complianceRules = dto.compliance_rules;
    }

    return Object.keys(metadata).length > 0 ? metadata : null;
  }
}
