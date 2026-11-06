import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from './entities/tenant.entity';
import { User } from '../auth/entities/user.entity';
import { Token } from '../tokens/entities/token.entity';
import { CapTable } from '../tokens/entities/cap-table.entity';
import { Payment } from '../payments/entities/payment.entity';
import { InvestorProfile } from '../kyc/entities/investor-profile.entity';
import { TenantService } from './services/tenant.service';
import { AnalyticsService } from './services/analytics.service';
import { IssuerAnalyticsService } from './services/issuer-analytics.service';
import { AuditLogService } from './services/audit-log.service';
import { AdminUsersService } from './services/users.service';
import { TenantController } from './controllers/tenant.controller';
import { AnalyticsController } from './controllers/analytics.controller';
import { IssuerAnalyticsController } from './controllers/issuer-analytics.controller';
import { AuditLogController } from './controllers/audit-log.controller';
import { AdminUsersController } from './controllers/users.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Tenant, User, Token, CapTable, Payment, InvestorProfile])],
  controllers: [TenantController, AnalyticsController, IssuerAnalyticsController, AuditLogController, AdminUsersController],
  providers: [TenantService, AnalyticsService, IssuerAnalyticsService, AuditLogService, AdminUsersService],
  exports: [TenantService],
})
export class AdminModule {}
