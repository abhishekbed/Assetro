import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  Unique,
} from 'typeorm';

// Canonical claim topic IDs — must match CLAIM_TOPICS in claim-issuance.service.ts
export const CLAIM_TOPIC_NAMES: Record<number, string> = {
  1: 'KYC',
  2: 'AML',
  3: 'ACCREDITED_INVESTOR',
  4: 'COUNTRY_OF_RESIDENCE',
};

@Entity('token_required_claims')
@Unique('uq_token_claim_topic', ['tokenId', 'claimTopic'])
export class TokenRequiredClaim {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid', name: 'token_id' })
  tokenId: string;

  @Column({ type: 'integer', name: 'claim_topic' })
  claimTopic: number;

  @Column({ type: 'varchar', length: 100, name: 'claim_name' })
  claimName: string;

  @Column({ type: 'boolean', name: 'is_required', default: true })
  isRequired: boolean;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}
