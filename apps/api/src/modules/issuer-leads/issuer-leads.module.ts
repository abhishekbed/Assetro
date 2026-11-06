import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IssuerLead } from './entities/issuer-lead.entity';
import { IssuerLeadsController } from './controllers/issuer-leads.controller';
import { IssuerLeadsService } from './services/issuer-leads.service';
import { Tenant } from '../admin/entities/tenant.entity';
import { User } from '../auth/entities/user.entity';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    NotificationsModule,
    TypeOrmModule.forFeature([IssuerLead, Tenant, User]),
  ],
  controllers: [IssuerLeadsController],
  providers: [IssuerLeadsService],
  exports: [IssuerLeadsService],
})
export class IssuerLeadsModule {}
