import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum PaymentStatus {
  PENDING = 'pending',        // created, not yet paid
  PAID = 'paid',              // payment received (Stripe confirmed) — awaiting issuer mint
  PROCESSING = 'processing',  // mint in progress
  MINT_REVIEW = 'mint_review', // payment received, mint failed and needs investigation
  COMPLETED = 'completed',    // minted and delivered
  FAILED = 'failed',
  REFUNDED = 'refunded',
  CANCELLED = 'cancelled',
}

export enum PaymentMethod {
  CARD = 'card',
  BANK_TRANSFER = 'bank_transfer',
  CRYPTO = 'crypto',
}

@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 255, name: 'user_id' })
  userId: string;

  @Index()
  @Column({ type: 'varchar', length: 255, name: 'token_id' })
  tokenId: string;

  @Column({ type: 'decimal', precision: 20, scale: 8, name: 'token_amount' })
  tokenAmount: string;

  @Column({ type: 'decimal', precision: 20, scale: 2, name: 'fiat_amount' })
  fiatAmount: string;

  @Column({ type: 'varchar', length: 10, default: 'USD' })
  currency: string;

  @Column({
    type: 'varchar',
    length: 20,
    default: PaymentStatus.PENDING,
  })
  status: PaymentStatus;

  @Column({
    type: 'varchar',
    length: 20,
    nullable: true,
    name: 'payment_method',
  })
  paymentMethod: PaymentMethod | null;

  @Column({ type: 'varchar', length: 255, name: 'stripe_session_id', nullable: true })
  stripeSessionId: string | null;

  @Column({ type: 'varchar', length: 255, name: 'stripe_payment_intent_id', nullable: true })
  stripePaymentIntentId: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 500, name: 'failure_reason', nullable: true })
  failureReason: string | null;

  @Column({ type: 'varchar', length: 255, name: 'tenant_id', nullable: true })
  tenantId: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;

  @Column({ type: 'timestamptz', name: 'completed_at', nullable: true })
  completedAt: Date | null;
}
