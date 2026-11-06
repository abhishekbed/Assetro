import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
  Index,
} from 'typeorm';
import { Token } from './token.entity';

@Entity('cap_table')
@Unique('UQ_cap_table_token_wallet', ['tokenId', 'walletAddress'])
export class CapTable {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid', name: 'token_id' })
  tokenId: string;

  @Column({ type: 'uuid', name: 'user_id', nullable: true })
  userId: string | null;

  @Column({ type: 'varchar', length: 42, name: 'wallet_address' })
  walletAddress: string;

  @Column({ type: 'decimal', precision: 78, scale: 0, default: '0' })
  balance: string;

  @Column({ type: 'decimal', precision: 10, scale: 6, default: 0 })
  percentage: number;

  @Column({ type: 'timestamptz', name: 'last_synced_at', nullable: true })
  lastSyncedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => Token, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'token_id' })
  token: Token;
}
