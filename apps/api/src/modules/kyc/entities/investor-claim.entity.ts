import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  Unique,
} from 'typeorm';

// DB mirror of on-chain claims — blockchain is source of truth
// This table is updated after every on-chain claim issuance or revocation

export enum ClaimStatus {
  ACTIVE = 'active',
  REVOKED = 'revoked',
  EXPIRED = 'expired',
}

@Entity('investor_claims')
@Unique('uq_investor_claim', ['investorId', 'claimTopic'])
export class InvestorClaim {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid', name: 'investor_id' })
  investorId: string;

  @Index()
  @Column({ type: 'varchar', length: 42, name: 'identity_contract' })
  identityContract: string; // ONCHAINID contract address

  @Column({ type: 'integer', name: 'claim_topic' })
  claimTopic: number; // 1=KYC_APPROVED, 2=COUNTRY, 3=INVESTOR_CLASS, 4=ACCREDITED

  @Column({ type: 'varchar', length: 100, name: 'claim_topic_name' })
  claimTopicName: string;

  @Column({ type: 'varchar', length: 255, name: 'issuer_address' })
  issuerAddress: string; // address of the claim issuer contract

  @Column({ type: 'text', name: 'claim_data', nullable: true })
  claimData: string | null; // hex-encoded claim data

  @Column({ type: 'varchar', length: 66, name: 'tx_hash', nullable: true })
  txHash: string | null; // on-chain transaction hash

  /** bytes32 hex returned by getClaimIdsByTopic() — the real on-chain claim identifier */
  @Column({ type: 'varchar', length: 66, name: 'claim_id', nullable: true })
  claimId: string | null;

  /** Whether the stored EIP-191 signature recovers to CLAIM_ISSUER_ADDRESS */
  @Column({ type: 'boolean', name: 'signature_valid', nullable: true })
  signatureValid: boolean | null;

  /** Whether CLAIM_ISSUER_ADDRESS is registered in TrustedIssuersRegistry */
  @Column({ type: 'boolean', name: 'issuer_trusted', nullable: true })
  issuerTrusted: boolean | null;

  /** Last time this row was verified by reading back from the chain */
  @Column({ type: 'timestamptz', name: 'chain_synced_at', nullable: true })
  chainSyncedAt: Date | null;

  @Column({ type: 'integer', name: 'chain_id' })
  chainId: number;

  @Column({ type: 'varchar', length: 30, default: ClaimStatus.ACTIVE })
  status: ClaimStatus;

  @Column({ type: 'timestamptz', name: 'issued_at' })
  issuedAt: Date;

  @Column({ type: 'timestamptz', name: 'expires_at', nullable: true })
  expiresAt: Date | null;

  @Column({ type: 'timestamptz', name: 'revoked_at', nullable: true })
  revokedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}
