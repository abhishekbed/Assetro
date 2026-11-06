import {
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ComplianceRule } from '../entities/compliance-rule.entity';
import { Token } from '../../tokens/entities/token.entity';
import { CreateRuleDto, UpdateRuleDto } from '../dto/create-rule.dto';

@Injectable()
export class ComplianceService {
  private readonly logger = new Logger(ComplianceService.name);

  constructor(
    @InjectRepository(ComplianceRule)
    private readonly ruleRepository: Repository<ComplianceRule>,
    @InjectRepository(Token)
    private readonly tokenRepository: Repository<Token>,
  ) {}

  /** Returns compliance and IR addresses for a token (used by check-transfer auto-resolve) */
  async getTokenAddresses(tokenId: string): Promise<{ complianceAddress: string | null; identityRegistryAddress: string | null } | null> {
    const token = await this.tokenRepository.findOne({ where: { id: tokenId }, select: ['id', 'complianceAddress', 'identityRegistryAddress'] });
    if (!token) return null;
    return { complianceAddress: token.complianceAddress, identityRegistryAddress: token.identityRegistryAddress };
  }

  async createRule(
    dto: CreateRuleDto,
    createdBy?: string,
    tenantId?: string,
  ): Promise<ComplianceRule> {
    // A tenant-bound caller may only add rules to a token in their own tenant.
    if (tenantId) {
      const token = await this.tokenRepository.findOne({
        where: { id: dto.token_id },
        select: ['id', 'tenantId'],
      });
      if (!token || token.tenantId !== tenantId) {
        throw new NotFoundException(`Token ${dto.token_id} not found`);
      }
    }

    const rule = this.ruleRepository.create({
      tokenId: dto.token_id,
      ruleType: dto.rule_type,
      parameters: dto.parameters,
      isActive: dto.is_active ?? true,
      priority: dto.priority ?? 0,
      description: dto.description || null,
      createdBy: createdBy || null,
      tenantId: tenantId || null,
    });

    const saved = await this.ruleRepository.save(rule);
    this.logger.log(`Compliance rule created: ${saved.id} (${saved.ruleType}) for token ${saved.tokenId}`);
    return saved;
  }

  async getRules(
    tokenId: string,
    tenantId?: string,
    activeOnly = false,
  ): Promise<ComplianceRule[]> {
    const qb = this.ruleRepository.createQueryBuilder('rule');
    qb.where('rule.token_id = :tokenId', { tokenId });

    if (tenantId) {
      qb.andWhere('rule.tenant_id = :tenantId', { tenantId });
    }

    if (activeOnly) {
      qb.andWhere('rule.is_active = :isActive', { isActive: true });
    }

    qb.orderBy('rule.priority', 'ASC').addOrderBy('rule.created_at', 'ASC');

    return qb.getMany();
  }

  async updateRule(
    id: string,
    dto: UpdateRuleDto,
    tenantId?: string,
  ): Promise<ComplianceRule> {
    const rule = await this.findRuleById(id, tenantId);

    if (dto.parameters !== undefined) rule.parameters = dto.parameters;
    if (dto.is_active !== undefined) rule.isActive = dto.is_active;
    if (dto.priority !== undefined) rule.priority = dto.priority;
    if (dto.description !== undefined) rule.description = dto.description;

    const updated = await this.ruleRepository.save(rule);
    this.logger.log(`Compliance rule updated: ${updated.id}`);
    return updated;
  }

  async deleteRule(id: string, tenantId?: string): Promise<void> {
    const rule = await this.findRuleById(id, tenantId);
    await this.ruleRepository.remove(rule);
    this.logger.log(`Compliance rule deleted: ${id}`);
  }

  async findRuleById(id: string, tenantId?: string): Promise<ComplianceRule> {
    const where: Record<string, unknown> = { id };
    if (tenantId) {
      where.tenantId = tenantId;
    }

    const rule = await this.ruleRepository.findOne({ where });
    if (!rule) {
      throw new NotFoundException(`Compliance rule with id ${id} not found`);
    }
    return rule;
  }
}
