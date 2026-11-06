import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum TransferApprovalStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  CANCELLED = 'cancelled',
}

@Entity('transfer_approvals')
@Index(['tokenId'])
@Index(['requesterId'])
export class TransferApproval {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  tokenId: string;

  @Column({ type: 'varchar', length: 42, nullable: true })
  tokenAddress: string | null;

  @Column({ type: 'varchar', length: 42 })
  fromAddress: string;

  @Column({ type: 'varchar', length: 42 })
  toAddress: string;

  @Column({ type: 'varchar', length: 255 })
  amount: string;

  @Column({ type: 'varchar', length: 20, default: TransferApprovalStatus.PENDING })
  status: string;

  @Column({ type: 'uuid', nullable: true })
  requesterId: string | null;

  @Column({ type: 'uuid', nullable: true })
  approverId: string | null;

  @Column({ type: 'text', nullable: true })
  approverNotes: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  txHash: string | null;

  @Column({ type: 'int', nullable: true })
  chainId: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  requestedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
