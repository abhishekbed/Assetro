import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { OnchainIdentity } from './entities/onchain-identity.entity';
import { User } from '../auth/entities/user.entity';
import { Token } from '../tokens/entities/token.entity';
import { InvestorClaim } from '../kyc/entities/investor-claim.entity';
import { Whitelist } from '../compliance/entities/whitelist.entity';
import { IdentityDeploymentService } from './services/identity-deployment.service';
import { OnchainIdentityService } from './services/onchain-identity.service';
import { ClaimIssuanceService } from './services/claim-issuance.service';
import { IdentityRegistryService } from './services/identity-registry.service';
import { TrustedIssuersRegistryService } from './services/trusted-issuers-registry.service';
import { ClaimTopicsRegistryService } from './services/claim-topics-registry.service';
import { ContractEventListenerService } from './services/contract-event-listener.service';
import { BlockchainSyncService } from './services/blockchain-sync.service';
import { IdentityController } from './controllers/identity.controller';
import { BlockchainController } from './controllers/blockchain.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([OnchainIdentity, User, Token, InvestorClaim, Whitelist]),
    ConfigModule,
  ],
  controllers: [IdentityController, BlockchainController],
  providers: [
    OnchainIdentityService,
    IdentityDeploymentService,
    ClaimIssuanceService,
    IdentityRegistryService,
    TrustedIssuersRegistryService,
    ClaimTopicsRegistryService,
    ContractEventListenerService,
    BlockchainSyncService,
  ],
  exports: [
    OnchainIdentityService,
    IdentityDeploymentService,
    ClaimIssuanceService,
    IdentityRegistryService,
    TrustedIssuersRegistryService,
    ClaimTopicsRegistryService,
    BlockchainSyncService,
  ],
})
export class IdentityModule {}
