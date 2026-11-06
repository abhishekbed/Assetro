import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum RuleType {
  COUNTRY_RESTRICTION = 'country_restriction',
  INVESTOR_LIMIT = 'investor_limit',
  TRANSFER_RESTRICTION = 'transfer_restriction',
  INVESTOR_CLASS = 'investor_class',
  TIME_BASED = 'time_based',
  // Phase 6.1 — new modular compliance types
  SUPPLY_LIMIT = 'supply_limit',
  MAX_BALANCE = 'max_balance',
  DAILY_MONTHLY_LIMIT = 'daily_monthly_limit',
  EXCHANGE_MONTHLY_LIMIT = 'exchange_monthly_limit',
  // Phase 6.3
  TRANSFER_FEE = 'transfer_fee',
  // Phase 6.4
  SENDER_WHITELIST = 'sender_whitelist',
}

@Entity('compliance_rules')
export class ComplianceRule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid', name: 'token_id' })
  tokenId: string;

  @Column({ type: 'varchar', enum: RuleType, name: 'rule_type' })
  ruleType: RuleType;

  @Column({ type: 'jsonb' })
  parameters: Record<string, unknown>;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive: boolean;

  @Column({ type: 'int', default: 0 })
  priority: number;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description: string | null;

  @Index()
  @Column({ type: 'uuid', name: 'tenant_id', nullable: true })
  tenantId: string | null;

  @Column({ type: 'uuid', name: 'created_by', nullable: true })
  createdBy: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}
