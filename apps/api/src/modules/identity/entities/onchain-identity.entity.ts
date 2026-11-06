import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  Unique,
} from 'typeorm';

@Entity('onchain_identities')
@Unique(['userId', 'chainId'])
export class OnchainIdentity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  @Column({ type: 'varchar', length: 42, name: 'identity_contract_address' })
  identityContractAddress: string;

  @Index()
  @Column({ type: 'int', name: 'chain_id' })
  chainId: number;

  @Column({ type: 'jsonb', name: 'claim_topics_issued', default: {} })
  claimTopicsIssued: Record<string, string>; // topic => txHash

  /** topic => bytes32 claimId (returned by getClaimIdsByTopic after issuance) */
  @Column({ type: 'jsonb', name: 'claim_ids', default: {} })
  claimIds: Record<string, string>;

  @Column({ type: 'jsonb', name: 'registered_token_ids', default: [] })
  registeredTokenIds: string[];

  @Column({ type: 'varchar', length: 66, name: 'deployment_tx_hash', nullable: true })
  deploymentTxHash: string | null;

  @Column({ type: 'timestamptz', name: 'deployed_at', nullable: true })
  deployedAt: Date | null;

  /** 'synced' | 'pending' | 'stale' | 'error' — reflects last chain read result */
  @Column({ type: 'varchar', length: 20, name: 'sync_status', nullable: true })
  syncStatus: string | null;

  /** Last time this record was verified by reading back from the chain */
  @Column({ type: 'timestamptz', name: 'chain_synced_at', nullable: true })
  chainSyncedAt: Date | null;

  /** Last sync error message, if any */
  @Column({ type: 'text', name: 'sync_error', nullable: true })
  syncError: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}
