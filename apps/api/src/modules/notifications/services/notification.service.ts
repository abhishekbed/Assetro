import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification } from '../entities/notification.entity';

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface CreateNotificationParams {
  userId: string;
  title: string;
  message: string;
  type?: string;
  channel?: string;
  category?: string;
  metadata?: Record<string, unknown>;
  tenantId?: string;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
  ) {}

  async create(params: CreateNotificationParams): Promise<Notification> {
    const notification = this.notificationRepository.create({
      userId: params.userId,
      title: params.title,
      message: params.message,
      type: params.type ?? 'info',
      channel: params.channel ?? 'in_app',
      category: params.category ?? null,
      metadata: params.metadata ?? null,
      tenantId: params.tenantId ?? null,
    });

    const saved = await this.notificationRepository.save(notification);

    this.logger.log(`Notification created for user ${params.userId}: ${saved.id}`);
    return saved;
  }

  async getByUser(
    userId: string,
    page = 1,
    limit = 20,
  ): Promise<PaginatedResult<Notification>> {
    const take = Math.min(limit, 100);
    const skip = (page - 1) * take;

    const [data, total] = await this.notificationRepository.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC' },
      take,
      skip,
    });

    return {
      data,
      total,
      page,
      limit: take,
      totalPages: Math.ceil(total / take),
    };
  }

  async markAsRead(id: string, userId: string): Promise<Notification> {
    const notification = await this.notificationRepository.findOne({
      where: { id, userId },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    notification.isRead = true;
    notification.readAt = new Date();

    return this.notificationRepository.save(notification);
  }

  async markAllAsRead(userId: string): Promise<{ updated: number }> {
    const result = await this.notificationRepository.update(
      { userId, isRead: false },
      { isRead: true, readAt: new Date() },
    );

    this.logger.log(`Marked ${result.affected} notifications as read for user ${userId}`);

    return { updated: result.affected ?? 0 };
  }

  async getUnreadCount(userId: string): Promise<{ count: number }> {
    const count = await this.notificationRepository.count({
      where: { userId, isRead: false },
    });

    return { count };
  }
}
