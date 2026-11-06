import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { KycSubmission } from './kyc-submission.entity';
import { InvestorProfile } from './investor-profile.entity';

export enum DocumentType {
  PASSPORT = 'passport',
  NATIONAL_ID = 'national_id',
  DRIVERS_LICENSE = 'drivers_license',
  PROOF_OF_ADDRESS = 'proof_of_address',
  ACCREDITATION_PROOF = 'accreditation_proof',
  SELFIE = 'selfie',
  OTHER = 'other',
}

export enum DocumentStatus {
  PENDING = 'pending',
  VERIFIED = 'verified',
  REJECTED = 'rejected',
}

@Entity('kyc_documents')
export class KycDocument {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Legacy: linked to old KYC submission flow
  @Index()
  @Column({ type: 'uuid', name: 'kyc_submission_id', nullable: true })
  kycSubmissionId: string | null;

  // New: linked to global investor profile
  @Index()
  @Column({ type: 'uuid', name: 'profile_id', nullable: true })
  profileId: string | null;

  @Column({ type: 'varchar', length: 50, name: 'document_type' })
  documentType: DocumentType;

  @Column({ type: 'varchar', length: 255, name: 'file_name' })
  fileName: string;

  @Column({ type: 'varchar', length: 1000, name: 'file_url' })
  fileUrl: string;

  @Column({ type: 'bigint', name: 'file_size' })
  fileSize: number;

  @Column({ type: 'varchar', length: 100, name: 'mime_type' })
  mimeType: string;

  @Column({ type: 'varchar', length: 50, default: DocumentStatus.PENDING })
  status: DocumentStatus;

  @Column({ type: 'timestamptz', name: 'uploaded_at', default: () => 'CURRENT_TIMESTAMP' })
  uploadedAt: Date;

  @ManyToOne(() => KycSubmission, (submission) => submission.documents, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'kyc_submission_id' })
  submission: KycSubmission | null;

  @ManyToOne(() => InvestorProfile, (profile) => profile.documents, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'profile_id' })
  profile: InvestorProfile | null;
}
