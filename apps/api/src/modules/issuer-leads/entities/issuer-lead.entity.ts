import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum IssuerLeadStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

@Entity({ name: 'issuer_leads', schema: 'public' })
export class IssuerLead {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100, name: 'first_name' })
  firstName: string;

  @Column({ type: 'varchar', length: 100, name: 'last_name' })
  lastName: string;

  @Index()
  @Column({ type: 'varchar', length: 255 })
  email: string;

  @Column({ type: 'varchar', length: 255, name: 'company_name' })
  companyName: string;

  @Column({ type: 'varchar', length: 255, name: 'job_title', nullable: true })
  jobTitle: string | null;

  @Column({ type: 'varchar', length: 100, name: 'company_type', nullable: true })
  companyType: string | null;

  @Column({ type: 'varchar', length: 50, name: 'phone_number', nullable: true })
  phoneNumber: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  website: string | null;

  @Column({ type: 'varchar', length: 100 })
  country: string;

  @Column({ type: 'text', nullable: true })
  comments: string | null;

  @Column({ type: 'varchar', length: 500, name: 'registered_address', nullable: true })
  registeredAddress: string | null;

  @Column({ type: 'varchar', length: 500, name: 'address_line_2', nullable: true })
  addressLine2: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  city: string | null;

  @Column({ type: 'varchar', length: 100, name: 'state_province', nullable: true })
  stateProvince: string | null;

  @Column({ type: 'varchar', length: 50, name: 'postal_code', nullable: true })
  postalCode: string | null;

  @Column({ type: 'boolean', name: 'is_operating_address_same', default: true })
  isOperatingAddressSame: boolean;

  @Column({ type: 'text', name: 'operating_address', nullable: true })
  operatingAddress: string | null;

  @Column({ type: 'varchar', length: 200, name: 'authorized_representative_name', nullable: true })
  authorizedRepresentativeName: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  nationality: string | null;

  @Column({ type: 'varchar', length: 100, name: 'identity_document_type', nullable: true })
  identityDocumentType: string | null;

  @Column({ type: 'varchar', length: 100, name: 'identity_document_number', nullable: true })
  identityDocumentNumber: string | null;

  @Column({ type: 'varchar', length: 1000, name: 'proof_of_identity_url', nullable: true })
  proofOfIdentityUrl: string | null;

  @Column({ type: 'varchar', length: 255, name: 'proof_of_identity_name', nullable: true })
  proofOfIdentityName: string | null;

  @Column({ type: 'varchar', length: 1000, name: 'authorization_letter_url', nullable: true })
  authorizationLetterUrl: string | null;

  @Column({ type: 'varchar', length: 255, name: 'authorization_letter_name', nullable: true })
  authorizationLetterName: string | null;

  @Column({ type: 'varchar', length: 50, default: IssuerLeadStatus.PENDING })
  status: IssuerLeadStatus;

  @Column({ type: 'text', name: 'rejection_reason', nullable: true })
  rejectionReason: string | null;

  @Column({ type: 'uuid', name: 'reviewed_by', nullable: true })
  reviewedBy: string | null;

  @Column({ type: 'timestamptz', name: 'reviewed_at', nullable: true })
  reviewedAt: Date | null;

  @Column({ type: 'uuid', name: 'tenant_id', nullable: true })
  tenantId: string | null;

  @Column({ type: 'uuid', name: 'issuer_user_id', nullable: true })
  issuerUserId: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}
