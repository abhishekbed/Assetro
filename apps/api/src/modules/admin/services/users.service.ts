import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../auth/entities/user.entity';

@Injectable()
export class AdminUsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async findAll(page = 1, limit = 20, search?: string, role?: string, status?: string) {
    const where: any = {};
    if (role) where.role = role;
    if (status) where.status = status;

    const qb = this.userRepository.createQueryBuilder('user');
    if (search) {
      qb.where('user.email ILIKE :s OR user.name ILIKE :s', { s: `%${search}%` });
    }
    if (role) qb.andWhere('user.role = :role', { role });
    if (status) qb.andWhere('user.status = :status', { status });

    qb.orderBy('user.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();

    return {
      data: data.map(({ passwordHash, totpSecret, emailVerificationToken, passwordResetToken, passwordResetExpires, walletNonce, ...safe }) => safe),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async updateStatus(id: string, status: string) {
    await this.userRepository.update(id, { status: status as any });
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) throw new Error('User not found');
    const { passwordHash, totpSecret, emailVerificationToken, passwordResetToken, passwordResetExpires, walletNonce, ...safe } = user;
    return safe;
  }
}
