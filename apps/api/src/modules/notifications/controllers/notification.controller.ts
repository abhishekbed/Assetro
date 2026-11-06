import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  Headers,
  ParseUUIDPipe,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import { NotificationService } from '../services/notification.service';

@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Post()
  async create(
    @Body()
    body: {
      user_id?: string;
      userId?: string;
      title: string;
      message: string;
      type?: string;
      channel?: string;
      category?: string;
      metadata?: Record<string, unknown>;
      tenant_id?: string;
      tenantId?: string;
    },
  ) {
    return this.notificationService.create({
      userId: (body.user_id ?? body.userId) || 'system',
      title: body.title,
      message: body.message,
      type: body.type,
      channel: body.channel,
      category: body.category,
      metadata: body.metadata,
      tenantId: body.tenant_id ?? body.tenantId,
    });
  }

  @Get()
  async list(
    @Headers('x-user-id') userId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.notificationService.getByUser(userId, page, limit);
  }

  @Patch(':id/read')
  async markAsRead(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('x-user-id') userId: string,
  ) {
    return this.notificationService.markAsRead(id, userId);
  }

  @Patch('read-all')
  async markAllAsRead(@Headers('x-user-id') userId: string) {
    return this.notificationService.markAllAsRead(userId);
  }

  @Get('unread-count')
  async getUnreadCount(@Headers('x-user-id') userId: string) {
    return this.notificationService.getUnreadCount(userId);
  }
}
