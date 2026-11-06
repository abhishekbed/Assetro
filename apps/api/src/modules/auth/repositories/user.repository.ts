import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';

@Injectable()
export class UserRepository {
  constructor(
    @InjectRepository(User)
    private readonly repository: Repository<User>,
  ) {}

  async findById(id: string): Promise<User | null> {
    return this.repository.findOne({ where: { id } });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.repository.findOne({ where: { email: email.toLowerCase() } });
  }

  async findByWalletAddress(walletAddress: string): Promise<User | null> {
    // The column holds both checksummed addresses (written when a wallet is
    // linked through KYC) and lowercase ones (written by wallet login), and
    // Postgres varchar equality is case-sensitive — so match on LOWER().
    // Matching case-sensitively let wallet login miss an existing account and
    // auto-create a duplicate for the same wallet, slipping past the unique
    // index because the two spellings differ. Oldest row wins, so a login
    // resolves to the original account rather than any such duplicate.
    return this.repository
      .createQueryBuilder('u')
      .where('LOWER(u.wallet_address) = LOWER(:wallet)', { wallet: walletAddress })
      .orderBy('u.created_at', 'ASC')
      .getOne();
  }

  async findByIdWithTenant(id: string, tenantId: string): Promise<User | null> {
    return this.repository.findOne({ where: { id, tenantId } });
  }

  async findByEmailVerificationToken(token: string): Promise<User | null> {
    return this.repository.findOne({ where: { emailVerificationToken: token } });
  }

  async findByPasswordResetToken(token: string): Promise<User | null> {
    return this.repository.findOne({ where: { passwordResetToken: token } });
  }

  async create(userData: Partial<User>): Promise<User> {
    const user = this.repository.create(userData);
    return this.repository.save(user);
  }

  async update(id: string, data: Partial<User>): Promise<User> {
    await this.repository.update(id, data);
    const updated = await this.findById(id);
    if (!updated) {
      throw new Error(`User with id ${id} not found after update`);
    }
    return updated;
  }

  async save(user: User): Promise<User> {
    return this.repository.save(user);
  }
}
