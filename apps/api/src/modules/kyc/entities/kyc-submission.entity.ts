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

export enum KycStatus {
  PENDING = 'pending',
  UNDER_REVIEW = 'under_review',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  EXPIRED = 'expired',
}

export enum InvestorType {
  INDIVIDUAL = 'individual',
  INSTITUTIONAL = 'institutional',
  ACCREDITED = 'accredited',
}

export enum AccreditationStatus {
  NONE = 'none',
  SELF_CERTIFIED = 'self_certified',
  VERIFIED = 'verified',
}

@Entity('kyc_submissions')
export class KycSubmission {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  @Index()
  @Column({ type: 'uuid', name: 'issuer_id', nullable: true })
  issuerId: string | null;

  @Column({ type: 'uuid', name: 'token_id', nullable: true })
  tokenId: string | null;

  @Column({
    type: 'varchar',
    length: 50,
    default: KycStatus.PENDING,
  })
  status: KycStatus;

  @Column({ type: 'varchar', length: 255, name: 'full_name' })
  fullName: string;

  @Column({ type: 'date', name: 'date_of_birth' })
  dateOfBirth: string;

  @Column({ type: 'varchar', length: 100 })
  nationality: string;

  @Column({ type: 'varchar', length: 100 })
  country: string;

  @Column({ type: 'varchar', length: 500, name: 'address_line1' })
  addressLine1: string;

  @Column({ type: 'varchar', length: 500, name: 'address_line2', nullable: true })
  addressLine2: string | null;

  @Column({ type: 'varchar', length: 100 })
  city: string;

  @Column({ type: 'varchar', length: 20, name: 'postal_code' })
  postalCode: string;

  @Column({
    type: 'varchar',
    length: 50,
    name: 'investor_type',
    default: InvestorType.INDIVIDUAL,
  })
  investorType: InvestorType;

  @Column({
    type: 'varchar',
    length: 50,
    default: AccreditationStatus.NONE,
  })
  accreditation: AccreditationStatus;

  @Column({ type: 'uuid', name: 'reviewed_by', nullable: true })
  reviewedBy: string | null;

  @Column({ type: 'text', name: 'review_notes', nullable: true })
  reviewNotes: string | null;

  @Column({ type: 'timestamptz', name: 'reviewed_at', nullable: true })
  reviewedAt: Date | null;

  @Column({ type: 'timestamptz', name: 'submitted_at', default: () => 'CURRENT_TIMESTAMP' })
  submittedAt: Date;

  @Column({ type: 'timestamptz', name: 'expires_at', nullable: true })
  expiresAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;

  @OneToMany(() => KycDocument, (doc) => doc.submission)
  documents: KycDocument[];
}
