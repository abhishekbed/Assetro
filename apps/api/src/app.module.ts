import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { TrustedIdentityInterceptor } from './modules/auth/interceptors/trusted-identity.interceptor';

// Auth guards — registered globally so every route requires a valid JWT by
// default; only routes explicitly marked @Public() are exempt. See
// modules/auth/guards/{jwt-auth,roles}.guard.ts.
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from './modules/auth/guards/roles.guard';

// Feature modules
import { AuthModule } from './modules/auth/auth.module';
import { TokensModule } from './modules/tokens/tokens.module';
import { ComplianceModule } from './modules/compliance/compliance.module';
import { KycModule } from './modules/kyc/kyc.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AdminModule } from './modules/admin/admin.module';
import { AuditModule } from './shared/audit.module';
import { IssuerLeadsModule } from './modules/issuer-leads/issuer-leads.module';
import { IdentityModule } from './modules/identity/identity.module';
import { CorporateActionsModule } from './modules/corporate-actions/corporate-actions.module';
import { CorporateAction } from './modules/corporate-actions/entities/corporate-action.entity';
import { CorporateActionVote } from './modules/corporate-actions/entities/corporate-action-vote.entity';
import { TransfersModule } from './modules/transfers/transfers.module';
import { TransferApproval } from './modules/transfers/entities/transfer-approval.entity';

// All entities
import { User } from './modules/auth/entities/user.entity';
import { Token } from './modules/tokens/entities/token.entity';
import { CapTable } from './modules/tokens/entities/cap-table.entity';
import { VestingSchedule } from './modules/tokens/entities/vesting-schedule.entity';
import { TokenDocument } from './modules/tokens/entities/token-document.entity';
import { ComplianceRule } from './modules/compliance/entities/compliance-rule.entity';
import { Whitelist } from './modules/compliance/entities/whitelist.entity';
import { KycSubmission } from './modules/kyc/entities/kyc-submission.entity';
import { KycDocument } from './modules/kyc/entities/kyc-document.entity';
import { InvestorProfile } from './modules/kyc/entities/investor-profile.entity';
import { IssuerInvestorQualification } from './modules/kyc/entities/issuer-investor-qualification.entity';
import { TokenRequiredClaim } from './modules/kyc/entities/token-required-claim.entity';
import { InvestorWallet } from './modules/kyc/entities/investor-wallet.entity';
import { InvestorClaim } from './modules/kyc/entities/investor-claim.entity';
import { Payment } from './modules/payments/entities/payment.entity';
import { Notification } from './modules/notifications/entities/notification.entity';
import { EmailOtp } from './modules/notifications/entities/email-otp.entity';
import { Tenant } from './modules/admin/entities/tenant.entity';
import { IssuerLead } from './modules/issuer-leads/entities/issuer-lead.entity';
import { OnchainIdentity } from './modules/identity/entities/onchain-identity.entity';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [process.env.NODE_ENV === 'production' ? '../../.env' : '../../.env.local'],
    }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
          password: config.get<string>('REDIS_PASSWORD') || undefined,
        },
      }),
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const host =
          config.get<string>('DB_HOST') ??
          config.get<string>('DATABASE_HOST') ??
          'localhost';
        const port = Number(
          config.get<string>('DB_PORT') ??
            config.get<string>('DATABASE_PORT') ??
            5432,
        );
        const username =
          config.get<string>('DB_USERNAME') ??
          config.get<string>('DB_USER') ??
          config.get<string>('DATABASE_USER') ??
          config.get<string>('DATABASE_USERNAME') ??
          'assetro';
        const password =
          config.get<string>('DB_PASSWORD') ??
          config.get<string>('DATABASE_PASSWORD') ??
          'change_me_in_production';
        const database =
          config.get<string>('DB_NAME') ??
          config.get<string>('DB_DATABASE') ??
          config.get<string>('DATABASE_NAME') ??
          'assetro_platform';
        const schema = config.get<string>('DB_SCHEMA') ?? 'tenant_demo';

        return {
          type: 'postgres',
          host,
          port,
          username,
          password,
          database,
          schema,
          entities: [
            User,
            Token,
            CapTable,
            VestingSchedule,
            ComplianceRule,
            Whitelist,
            KycSubmission,
            KycDocument,
            InvestorProfile,
            IssuerInvestorQualification,
            TokenRequiredClaim,
            InvestorWallet,
            InvestorClaim,
            Payment,
            Notification,
            EmailOtp,
            Tenant,
            IssuerLead,
            OnchainIdentity,
            CorporateAction,
            CorporateActionVote,
            TokenDocument,
            TransferApproval,
          ],
          synchronize: true,
          logging: config.get<string>('NODE_ENV') !== 'production',
        };
      },
    }),
    AuditModule,
    AuthModule,
    TokensModule,
    ComplianceModule,
    KycModule,
    PaymentsModule,
    NotificationsModule,
    AdminModule,
    IssuerLeadsModule,
    IdentityModule,
    CorporateActionsModule,
    TransfersModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_INTERCEPTOR, useClass: TrustedIdentityInterceptor },
  ],
})
export class AppModule {}
