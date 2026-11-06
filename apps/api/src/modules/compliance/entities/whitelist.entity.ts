import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  Unique,
} from 'typeorm';

export enum InvestorType {
  ACCREDITED = 'accredited',
  RETAIL = 'retail',
  INSTITUTIONAL = 'institutional',
  QUALIFIED = 'qualified',
}

@Entity('whitelists')
@Unique('UQ_whitelist_token_wallet', ['tokenId', 'walletAddress'])
export class Whitelist {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid', name: 'token_id' })
  tokenId: string;

  @Column({ type: 'uuid', name: 'user_id', nullable: true })
  userId: string | null;

  @Column({ type: 'varchar', length: 42, name: 'wallet_address' })
  walletAddress: string;

  @Column({ type: 'varchar', length: 3, nullable: true })
  country: string | null;

  @Column({
    type: 'varchar',
    enum: InvestorType,
    name: 'investor_type',
    default: InvestorType.RETAIL,
  })
  investorType: InvestorType;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive: boolean;

  @Column({ type: 'timestamptz', name: 'verified_at', nullable: true })
  verifiedAt: Date | null;

  /** IR.isVerified(wallet) result — the authoritative on-chain whitelist status */
  @Column({ type: 'boolean', name: 'verified_on_chain', nullable: true })
  verifiedOnChain: boolean | null;

  /** tx hash from IdentityRegistry.registerIdentity() */
  @Column({ type: 'varchar', length: 66, name: 'verification_tx_hash', nullable: true })
  verificationTxHash: string | null;

  /** IdentityRegistry contract address this wallet was registered in */
  @Column({ type: 'varchar', length: 42, name: 'ir_address', nullable: true })
  irAddress: string | null;

  /** Numeric country code passed to registerIdentity() — mirrors IR.investorCountry() */
  @Column({ type: 'smallint', name: 'country_code', nullable: true })
  countryCode: number | null;

  /** Last time IR.isVerified() was called and this row was refreshed from chain */
  @Column({ type: 'timestamptz', name: 'chain_synced_at', nullable: true })
  chainSyncedAt: Date | null;

  @Index()
  @Column({ type: 'uuid', name: 'tenant_id', nullable: true })
  tenantId: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}
