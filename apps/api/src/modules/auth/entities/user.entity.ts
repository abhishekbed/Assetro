import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum UserRole {
  INVESTOR = 'investor',
  ISSUER = 'issuer',
  ADMIN = 'admin',
  COMPLIANCE_OFFICER = 'compliance_officer',
  TRANSFER_AGENT = 'transfer_agent',
}

export enum UserStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
  PENDING_VERIFICATION = 'pending_verification',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 255, unique: true })
  email: string;

  @Column({ type: 'varchar', length: 255, name: 'password_hash', nullable: true })
  passwordHash: string | null;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 50, default: UserRole.INVESTOR })
  role: UserRole;

  @Column({ type: 'varchar', length: 20, nullable: true })
  phone: string | null;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 42, name: 'wallet_address', nullable: true, unique: true })
  walletAddress: string | null;

  /** Issuer-only: the MetaMask wallet authorised to deploy / mint / freeze / pause. Stored lowercase. */
  @Index()
  @Column({ type: 'varchar', length: 42, name: 'issuer_wallet_address', nullable: true })
  issuerWalletAddress: string | null;

  @Column({ type: 'timestamptz', name: 'issuer_wallet_updated_at', nullable: true })
  issuerWalletUpdatedAt: Date | null;

  @Column({ type: 'boolean', name: 'is_email_verified', default: false })
  isEmailVerified: boolean;

  @Column({ type: 'boolean', name: 'is_2fa_enabled', default: false })
  is2faEnabled: boolean;

  @Column({ type: 'varchar', length: 255, name: 'totp_secret', nullable: true })
  totpSecret: string | null;

  @Column({ type: 'varchar', length: 20, default: UserStatus.PENDING_VERIFICATION })
  status: UserStatus;

  @Column({ type: 'uuid', name: 'tenant_id', nullable: true })
  tenantId: string | null;

  @Column({ type: 'varchar', length: 255, name: 'email_verification_token', nullable: true })
  emailVerificationToken: string | null;

  @Column({ type: 'varchar', length: 255, name: 'password_reset_token', nullable: true })
  passwordResetToken: string | null;

  @Column({ type: 'timestamptz', name: 'password_reset_expires', nullable: true })
  passwordResetExpires: Date | null;

  @Column({ type: 'varchar', length: 42, name: 'identity_contract_address', nullable: true })
  identityContractAddress: string | null;

  @Column({ type: 'varchar', name: 'wallet_nonce', nullable: true })
  walletNonce: string | null;

  @Column({ type: 'timestamptz', name: 'last_login_at', nullable: true })
  lastLoginAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}
