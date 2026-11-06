import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Token } from './token.entity';

export enum VestingStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

@Entity('vesting_schedules')
export class VestingSchedule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid', name: 'token_id' })
  tokenId: string;

  @Column({ type: 'uuid', name: 'beneficiary_id' })
  beneficiaryId: string;

  @Column({ type: 'varchar', length: 42, name: 'beneficiary_address' })
  beneficiaryAddress: string;

  @Column({ type: 'decimal', precision: 78, scale: 0, name: 'total_amount' })
  totalAmount: string;

  @Column({ type: 'decimal', precision: 78, scale: 0, name: 'released_amount', default: '0' })
  releasedAmount: string;

  @Column({ type: 'timestamptz', name: 'start_date' })
  startDate: Date;

  @Column({ type: 'timestamptz', name: 'end_date' })
  endDate: Date;

  @Column({ type: 'timestamptz', name: 'cliff_date', nullable: true })
  cliffDate: Date | null;

  @Column({ type: 'int', name: 'vesting_interval_days', default: 30 })
  vestingIntervalDays: number;

  @Column({ type: 'varchar', length: 50, default: VestingStatus.PENDING })
  status: VestingStatus;

  @Column({ type: 'boolean', default: false })
  revocable: boolean;

  @Column({ type: 'timestamptz', name: 'revoked_at', nullable: true })
  revokedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => Token, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'token_id' })
  token: Token;
}
