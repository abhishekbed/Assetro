import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { CorporateAction } from './corporate-action.entity';

export enum VoteType {
  VOTE = 'vote',       // for VOTING actions
  SELL = 'sell',       // for BUYBACK sell requests
}

export enum SellRequestStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
}

@Entity('corporate_action_votes')
@Unique('UQ_vote_action_investor', ['actionId', 'investorId'])
export class CorporateActionVote {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid', name: 'action_id' })
  actionId: string;

  @Column({ type: 'uuid', name: 'investor_id', nullable: true })
  investorId: string | null;

  @Column({ type: 'varchar', length: 42, name: 'investor_address', nullable: true })
  investorAddress: string | null;

  @Column({ type: 'varchar', length: 50 })
  type: VoteType;

  @Column({ type: 'varchar', length: 255, nullable: true })
  option: string | null;

  @Column({ type: 'decimal', precision: 78, scale: 0, nullable: true })
  weight: string | null;

  @Column({ type: 'decimal', precision: 78, scale: 18, nullable: true, name: 'token_amount' })
  tokenAmount: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true, default: SellRequestStatus.PENDING })
  sellStatus: SellRequestStatus | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => CorporateAction, a => a.votes, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'action_id' })
  action: CorporateAction;
}
