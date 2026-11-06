import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum TransactionStatus {
  PENDING = 'pending',
  SUBMITTED = 'submitted',
  CONFIRMED = 'confirmed',
  FAILED = 'failed',
  REVERTED = 'reverted',
}

export enum TransactionType {
  DEPLOY = 'deploy',
  MINT = 'mint',
  BURN = 'burn',
  TRANSFER = 'transfer',
  PAUSE = 'pause',
  UNPAUSE = 'unpause',
  FREEZE = 'freeze',
  UNFREEZE = 'unfreeze',
  ADD_IDENTITY = 'add_identity',
  REMOVE_IDENTITY = 'remove_identity',
  OTHER = 'other',
}

@Entity('transactions')
export class Transaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 66, name: 'tx_hash', nullable: true, unique: true })
  txHash: string | null;

  @Column({ type: 'int', name: 'chain_id' })
  chainId: number;

  @Column({ type: 'varchar', length: 42, name: 'from_address' })
  fromAddress: string;

  @Column({ type: 'varchar', length: 42, name: 'to_address', nullable: true })
  toAddress: string | null;

  @Column({
    type: 'enum',
    enum: TransactionType,
    name: 'tx_type',
    default: TransactionType.OTHER,
  })
  txType: TransactionType;

  @Column({
    type: 'enum',
    enum: TransactionStatus,
    default: TransactionStatus.PENDING,
  })
  status: TransactionStatus;

  @Column({ type: 'varchar', length: 78, nullable: true })
  value: string | null;

  @Column({ type: 'bigint', name: 'gas_used', nullable: true })
  gasUsed: string | null;

  @Column({ type: 'varchar', length: 78, name: 'gas_price', nullable: true })
  gasPrice: string | null;

  @Column({ type: 'int', name: 'block_number', nullable: true })
  blockNumber: number | null;

  @Column({ type: 'int', nullable: true })
  nonce: number | null;

  @Column({ type: 'text', name: 'input_data', nullable: true })
  inputData: string | null;

  @Column({ type: 'text', name: 'error_message', nullable: true })
  errorMessage: string | null;

  @Column({ type: 'uuid', name: 'token_id', nullable: true })
  tokenId: string | null;

  @Column({ type: 'uuid', name: 'initiated_by', nullable: true })
  initiatedBy: string | null;

  @Column({ type: 'int', name: 'confirmations', default: 0 })
  confirmations: number;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}
