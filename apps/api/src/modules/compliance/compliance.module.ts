import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { ComplianceRule } from './entities/compliance-rule.entity';
import { Whitelist } from './entities/whitelist.entity';
import { CapTable } from '../tokens/entities/cap-table.entity';
import { Token } from '../tokens/entities/token.entity';
import { Payment } from '../payments/entities/payment.entity';
import { User } from '../auth/entities/user.entity';
import { InvestorProfile } from '../kyc/entities/investor-profile.entity';
import { KycSubmission } from '../kyc/entities/kyc-submission.entity';
import { IssuerInvestorQualification } from '../kyc/entities/issuer-investor-qualification.entity';
import { ComplianceService } from './services/compliance.service';
import { RuleEngineService } from './services/rule-engine.service';
import { WhitelistService } from './services/whitelist.service';
import { TransferValidatorService } from './services/transfer-validator.service';
import { ComplianceController } from './controllers/compliance.controller';
import { WhitelistController } from './controllers/whitelist.controller';
import { IdentityModule } from '../identity/identity.module';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([
      ComplianceRule,
      Whitelist,
      CapTable,
      Token,
      Payment,
      User,
      InvestorProfile,
      KycSubmission,
      IssuerInvestorQualification,
    ]),
    IdentityModule,
  ],
  controllers: [ComplianceController, WhitelistController],
  providers: [ComplianceService, RuleEngineService, WhitelistService, TransferValidatorService],
  exports: [ComplianceService, RuleEngineService, WhitelistService, TransferValidatorService],
})
export class ComplianceModule {}
