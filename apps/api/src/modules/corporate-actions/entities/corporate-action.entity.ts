import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  OneToMany,
} from 'typeorm';
import { CorporateActionVote } from './corporate-action-vote.entity';

export enum CorporateActionType {
  DIVIDEND = 'dividend',
  STOCK_SPLIT = 'stock_split',
  VOTING = 'voting',
  BUYBACK = 'buyback',
  ANNOUNCEMENT = 'announcement',
}

export enum CorporateActionStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  EXECUTING = 'executing',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

@Entity('corporate_actions')
export class CorporateAction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid', name: 'token_id' })
  tokenId: string;

  @Column({ type: 'uuid', name: 'tenant_id', nullable: true })
  tenantId: string | null;

  @Column({ type: 'varchar', length: 50 })
  type: CorporateActionType;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 50, default: CorporateActionStatus.DRAFT })
  status: CorporateActionStatus;

  @Column({ type: 'date', name: 'record_date' })
  recordDate: string;

  @Column({ type: 'date', name: 'payment_date', nullable: true })
  paymentDate: string | null;

  @Column({ type: 'jsonb', nullable: true })
  parameters: Record<string, unknown> | null;

  @Column({ type: 'timestamptz', name: 'executed_at', nullable: true })
  executedAt: Date | null;

  @Column({ type: 'uuid', name: 'executed_by', nullable: true })
  executedBy: string | null;

  @Column({ type: 'uuid', name: 'created_by', nullable: true })
  createdBy: string | null;

  @Column({ type: 'jsonb', name: 'execution_result', nullable: true })
  executionResult: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;

  @OneToMany(() => CorporateActionVote, v => v.action)
  votes: CorporateActionVote[];
}
