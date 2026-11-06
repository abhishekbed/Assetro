import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export enum OtpPurpose {
  /** Investor / issuer account registration via POST /auth/register */
  SIGNUP = 'signup',
  /** Issuer application via POST /issuer-leads */
  ISSUER_LEAD = 'issuer_lead',
}

/**
 * A one-time code emailed to an address that is not yet proven to belong to
 * the person using it. Rows are keyed by (email, purpose) rather than by user
 * id, because the issuer-lead flow issues a code before any user exists.
 *
 * The code itself is never stored — only a SHA-256 hash, so a database leak
 * cannot be replayed against a pending signup.
 */
@Entity('email_otps')
@Index(['email', 'purpose'])
export class EmailOtp {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  email: string;

  @Column({ type: 'varchar', length: 30 })
  purpose: OtpPurpose;

  @Column({ type: 'varchar', length: 64, name: 'code_hash' })
  codeHash: string;

  /**
   * Optional bcrypt hash carried alongside the code.
   *
   * The issuer flow generates a login password at the same moment it generates
   * the code, so both can travel in one email — but the account is only created
   * once the code is confirmed. Parking the hash here keeps the plaintext out
   * of the database while still letting `submit` set the password it promised.
   */
  @Column({ type: 'varchar', length: 255, name: 'payload_hash', nullable: true })
  payloadHash: string | null;

  @Column({ type: 'timestamptz', name: 'expires_at' })
  expiresAt: Date;

  /** Failed verification attempts against this code; locked out past the limit. */
  @Column({ type: 'int', default: 0 })
  attempts: number;

  @Column({ type: 'timestamptz', name: 'consumed_at', nullable: true })
  consumedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}
