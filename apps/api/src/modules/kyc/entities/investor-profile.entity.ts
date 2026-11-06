import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { KycDocument } from './kyc-document.entity';
import { InvestorType, AccreditationStatus } from './kyc-submission.entity';

export enum AdminKycStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  REVOKED = 'revoked',
  EXPIRED = 'expired',
}

@Entity('investor_profiles')
export class InvestorProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid', name: 'user_id', unique: true })
  userId: string;

  @Column({ type: 'varchar', length: 255, name: 'full_name' })
  fullName: string;

  @Column({ type: 'date', name: 'date_of_birth' })
  dateOfBirth: string;

  @Column({ type: 'varchar', length: 100 })
  nationality: string;

  @Column({ type: 'varchar', length: 10 })
  country: string;

  @Column({ type: 'varchar', length: 500, name: 'address_line1' })
  addressLine1: string;

  @Column({ type: 'varchar', length: 500, name: 'address_line2', nullable: true })
  addressLine2: string | null;

  @Column({ type: 'varchar', length: 100 })
  city: string;

  @Column({ type: 'varchar', length: 20, name: 'postal_code' })
  postalCode: string;

  @Column({ type: 'varchar', length: 50, name: 'investor_type', default: InvestorType.INDIVIDUAL })
  investorType: InvestorType;

  @Column({ type: 'varchar', length: 50, default: AccreditationStatus.NONE })
  accreditation: AccreditationStatus;

  // Phase 3.2 supplementary fields — stored in extra_data JSONB to avoid a migration
  @Column({ type: 'jsonb', name: 'extra_data', nullable: true, default: null })
  extraData: {
    phone?: string;
    tax_id?: string;
    company_name?: string;
    company_registration?: string;
    company_country?: string;
  } | null;

  /**
   * Platform-admin KYC decision, separate from the per-issuer qualification.
   * NULL = decided before this field existed; see resolveAdminKycStatus().
   */
  @Column({ type: 'varchar', length: 20, name: 'admin_kyc_status', nullable: true })
  adminKycStatus: AdminKycStatus | null;

  @Column({ type: 'uuid', name: 'admin_reviewed_by', nullable: true })
  adminReviewedBy: string | null;

  @Column({ type: 'timestamptz', name: 'admin_reviewed_at', nullable: true })
  adminReviewedAt: Date | null;

  @Column({ type: 'text', name: 'admin_reason', nullable: true })
  adminReason: string | null;

  @Column({ type: 'timestamptz', name: 'submitted_at', default: () => 'CURRENT_TIMESTAMP' })
  submittedAt: Date;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;

  @OneToMany(() => KycDocument, (doc) => doc.profile)
  documents: KycDocument[];
}
