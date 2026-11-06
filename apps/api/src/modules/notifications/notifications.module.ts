import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notification } from './entities/notification.entity';
import { EmailOtp } from './entities/email-otp.entity';
import { NotificationService } from './services/notification.service';
import { EmailService } from './services/email.service';
import { TemplateService } from './services/template.service';
import { OtpService } from './services/otp.service';
import { NotificationController } from './controllers/notification.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Notification, EmailOtp])],
  controllers: [NotificationController],
  providers: [NotificationService, EmailService, TemplateService, OtpService],
  exports: [NotificationService, EmailService, OtpService],
})
export class NotificationsModule {}
