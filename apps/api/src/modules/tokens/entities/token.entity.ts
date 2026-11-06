import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
// Relations disabled for now to avoid eager loading issues
// import { CapTable } from './cap-table.entity';
// import { VestingSchedule } from './vesting-schedule.entity';

export enum AssetType {
  EQUITY = 'equity',
  REAL_ESTATE = 'real_estate',
  FUND = 'fund',
  FUNDS = 'funds',
  DEBT = 'debt',
  COMMODITY = 'commodity',
  UTILITY = 'utility',
  BOND = 'bond',
  ART = 'art',
  INFRASTRUCTURE = 'infrastructure',
}

export enum TokenStatus {
  /** Legacy/manual state. Kept so pre-approval tokens keep working. */
  DRAFT = 'draft',
  /** Issuer has submitted the token; waiting on platform admin review. */
  PENDING_APPROVAL = 'pending_approval',
  /** Admin approved it — the issuer may now deploy it on-chain. */
  APPROVED = 'approved',
  /** Admin declined it; `rejectionReason` says why. */
  REJECTED = 'rejected',
  DEPLOYING = 'deploying',
  ACTIVE = 'active',
  PAUSED = 'paused',
  RETIRED = 'retired',
}

/** Statuses an issuer may still edit or delete. */
export const EDITABLE_TOKEN_STATUSES: TokenStatus[] = [
  TokenStatus.DRAFT,
  TokenStatus.PENDING_APPROVAL,
  TokenStatus.APPROVED,
  TokenStatus.REJECTED,
];

/** Statuses from which a deploy may be started. */
export const DEPLOYABLE_TOKEN_STATUSES: TokenStatus[] = [
  TokenStatus.APPROVED,
  TokenStatus.DRAFT,
];

@Entity('tokens')
export class Token {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 20 })
  symbol: string;

  @Column({ type: 'int', default: 18 })
  decimals: number;

  @Column({ type: 'decimal', precision: 78, scale: 0, name: 'total_supply' })
  totalSupply: string;

  @Column({ type: 'varchar', length: 50, name: 'asset_type' })
  assetType: AssetType;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 50, default: TokenStatus.DRAFT })
  status: TokenStatus;

  @Index()
  @Column({ type: 'int', name: 'chain_id' })
  chainId: number;

  @Column({ type: 'varchar', length: 42, name: 'token_address', nullable: true })
  tokenAddress: string | null;

  @Column({ type: 'varchar', length: 42, name: 'identity_registry_address', nullable: true })
  identityRegistryAddress: string | null;

  @Column({ type: 'varchar', length: 42, name: 'compliance_address', nullable: true })
  complianceAddress: string | null;

  @Column({ type: 'varchar', length: 42, name: 'claim_topics_address', nullable: true })
  claimTopicsAddress: string | null;

  @Column({ type: 'varchar', length: 42, name: 'trusted_issuers_address', nullable: true })
  trustedIssuersAddress: string | null;

  @Column({ type: 'varchar', length: 1024, name: 'document_uri', nullable: true })
  documentUri: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @Index()
  @Column({ type: 'uuid', name: 'created_by' })
  createdBy: string;

  @Index()
  @Column({ type: 'uuid', name: 'tenant_id', nullable: true })
  tenantId: string | null;

  @Column({ type: 'timestamptz', name: 'deployed_at', nullable: true })
  deployedAt: Date | null;

  /** Admin review trail for the create-token approval step. */
  @Column({ type: 'text', name: 'rejection_reason', nullable: true })
  rejectionReason: string | null;

  @Column({ type: 'uuid', name: 'reviewed_by', nullable: true })
  reviewedBy: string | null;

  @Column({ type: 'timestamptz', name: 'reviewed_at', nullable: true })
  reviewedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;

}
