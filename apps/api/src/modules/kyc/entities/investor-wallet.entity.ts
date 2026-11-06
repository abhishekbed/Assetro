import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  Unique,
} from 'typeorm';

export enum WalletType {
  EOA = 'eoa',          // Externally Owned Account
  SMART = 'smart',      // Smart contract wallet (e.g. Safe)
  HARDWARE = 'hardware', // Ledger / Trezor
}

@Entity('investor_wallets')
@Unique('uq_investor_wallet', ['investorId', 'address'])
export class InvestorWallet {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid', name: 'investor_id' })
  investorId: string; // user.id of the investor

  @Index()
  @Column({ type: 'varchar', length: 42 })
  address: string; // checksummed wallet address

  @Column({ type: 'varchar', length: 30, default: WalletType.EOA })
  type: WalletType;

  @Column({ type: 'boolean', name: 'is_primary', default: false })
  isPrimary: boolean; // only one primary wallet per investor

  @Column({ type: 'boolean', name: 'is_verified', default: false })
  isVerified: boolean; // wallet ownership verified via signature

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'verified_at_nonce' })
  verifiedAtNonce: string | null;

  @Column({ type: 'timestamptz', name: 'verified_at', nullable: true })
  verifiedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}
