import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Token } from './entities/token.entity';
import { CapTable } from './entities/cap-table.entity';
import { VestingSchedule } from './entities/vesting-schedule.entity';
import { TokenDocument } from './entities/token-document.entity';
import { ComplianceRule } from '../compliance/entities/compliance-rule.entity';
import { User } from '../auth/entities/user.entity';
import { Payment } from '../payments/entities/payment.entity';
import { TokenService } from './services/token.service';
import { TokenDeploymentService } from './services/token-deployment.service';
import { TokenLifecycleService } from './services/token-lifecycle.service';
import { CapTableService } from './services/cap-table.service';
import { InvestorPortfolioService } from './services/investor-portfolio.service';
import { VestingService } from './services/vesting.service';
import { TokenDocumentService } from './services/token-document.service';
import { TokenController } from './controllers/token.controller';
import { TokenApprovalController } from './controllers/token-approval.controller';
import { CapTableController } from './controllers/cap-table.controller';
import { KycModule } from '../kyc/kyc.module';
import { IdentityModule } from '../identity/identity.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuditLogService } from '../admin/services/audit-log.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Token, CapTable, VestingSchedule, TokenDocument, ComplianceRule, User, Payment]),
    MulterModule.register({ storage: memoryStorage() }),
    forwardRef(() => KycModule),
    IdentityModule,
    NotificationsModule,
  ],
  controllers: [TokenController, CapTableController, TokenApprovalController],
  providers: [
    TokenService,
    TokenDeploymentService,
    TokenLifecycleService,
    CapTableService,
    InvestorPortfolioService,
    VestingService,
    TokenDocumentService,
    AuditLogService,
  ],
  exports: [TokenService, TokenLifecycleService, CapTableService, VestingService],
})
export class TokensModule {}
