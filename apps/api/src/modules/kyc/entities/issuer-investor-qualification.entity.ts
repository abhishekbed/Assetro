import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { InvestorProfile } from './investor-profile.entity';

export enum QualificationStatus {
  PENDING = 'pending',
  UNDER_REVIEW = 'under_review',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  EXPIRED = 'expired',
  REVOKED = 'revoked',
}

@Entity('issuer_investor_qualifications')
@Unique('uq_issuer_investor', ['issuerId', 'investorId'])
export class IssuerInvestorQualification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid', name: 'issuer_id' })
  issuerId: string;

  @Index()
  @Column({ type: 'uuid', name: 'investor_id' })
  investorId: string;

  @Column({ type: 'uuid', name: 'profile_id' })
  profileId: string;

  @Column({ type: 'varchar', length: 50, default: QualificationStatus.PENDING })
  status: QualificationStatus;

  @Column({ type: 'uuid', name: 'reviewed_by', nullable: true })
  reviewedBy: string | null;

  @Column({ type: 'timestamptz', name: 'reviewed_at', nullable: true })
  reviewedAt: Date | null;

  @Column({ type: 'timestamptz', name: 'approved_at', nullable: true })
  approvedAt: Date | null;

  @Column({ type: 'timestamptz', name: 'expires_at', nullable: true })
  expiresAt: Date | null;

  // Map of claim topic → tx hash for claims already verified on-chain
  @Column({ type: 'jsonb', name: 'claims_verified', default: () => "'{}'" })
  claimsVerified: Record<string, string>;

  // Claim topics this issuer requires beyond the base KYC set
  @Column({ type: 'jsonb', name: 'additional_claims_required', default: () => "'[]'" })
  additionalClaimsRequired: number[];

  @Column({ type: 'timestamptz', name: 'revoked_at', nullable: true })
  revokedAt: Date | null;

  @Column({ type: 'uuid', name: 'revoked_by', nullable: true })
  revokedBy: string | null;

  @Column({ type: 'text', name: 'revoked_reason', nullable: true })
  revokedReason: string | null;

  @Column({ type: 'text', name: 'rejected_reason', nullable: true })
  rejectedReason: string | null;

  @Column({ type: 'text', name: 'review_notes', nullable: true })
  reviewNotes: string | null;

  // ── Blockchain pipeline tracking ─────────────────────────────────────────────

  /** BullMQ job ID dispatched after approval */
  @Column({ type: 'varchar', length: 255, name: 'blockchain_job_id', nullable: true })
  blockchainJobId: string | null;

  /** Current pipeline stage: queued | step:deploy_onchainid | step:issue_claims |
   *  step:register_identity | step:verify_whitelist | step:sync_db | completed | failed */
  @Column({ type: 'varchar', length: 100, name: 'blockchain_status', nullable: true })
  blockchainStatus: string | null;

  /** Last error message from the blockchain pipeline */
  @Column({ type: 'text', name: 'blockchain_error', nullable: true })
  blockchainError: string | null;

  /** Timestamp when all blockchain steps completed successfully */
  @Column({ type: 'timestamptz', name: 'blockchain_completed_at', nullable: true })
  blockchainCompletedAt: Date | null;

  @ManyToOne(() => InvestorProfile, (profile) => profile.documents, { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'profile_id' })
  profile: InvestorProfile;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}
