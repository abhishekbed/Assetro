import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';

// Entities
import { KycSubmission } from './entities/kyc-submission.entity';
import { KycDocument } from './entities/kyc-document.entity';
import { InvestorProfile } from './entities/investor-profile.entity';
import { IssuerInvestorQualification } from './entities/issuer-investor-qualification.entity';
import { TokenRequiredClaim } from './entities/token-required-claim.entity';
import { InvestorWallet } from './entities/investor-wallet.entity';
import { InvestorClaim } from './entities/investor-claim.entity';
import { User } from '../auth/entities/user.entity';
import { Token } from '../tokens/entities/token.entity';

// Services
import { KycService } from './services/kyc.service';
import { DocumentService } from './services/document.service';
import { S3UploadService } from './services/s3-upload.service';
import { InvestorProfileService } from './services/investor-profile.service';
import { IssuerQualificationService } from './services/issuer-qualification.service';
import { TokenEligibilityService } from './services/token-eligibility.service';
import { InvestorEligibilityService } from './services/investor-eligibility.service';

// Queue + Processor
import { INVESTOR_QUALIFICATION_QUEUE } from './queues/investor-qualification.queue';
import { InvestorQualificationBlockchainProcessor } from './processors/investor-qualification-blockchain.processor';

// Controller
import { KycController } from './controllers/kyc.controller';
import { AdminKycController } from './controllers/admin-kyc.controller';

// Dependencies
import { IdentityModule } from '../identity/identity.module';
import { ComplianceModule } from '../compliance/compliance.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      KycSubmission,
      KycDocument,
      InvestorProfile,
      IssuerInvestorQualification,
      TokenRequiredClaim,
      InvestorWallet,
      InvestorClaim,
      User,
      Token,
    ]),
    MulterModule.register({ storage: undefined }),
    ConfigModule,
    IdentityModule,
    ComplianceModule,
    BullModule.registerQueue({ name: INVESTOR_QUALIFICATION_QUEUE }),
  ],
  controllers: [KycController, AdminKycController],
  providers: [
    KycService,
    DocumentService,
    S3UploadService,
    InvestorProfileService,
    IssuerQualificationService,
    InvestorEligibilityService,
    TokenEligibilityService,
    InvestorQualificationBlockchainProcessor,
  ],
  exports: [
    KycService,
    InvestorProfileService,
    IssuerQualificationService,
    InvestorEligibilityService,
    TokenEligibilityService,
  ],
})
export class KycModule {}
