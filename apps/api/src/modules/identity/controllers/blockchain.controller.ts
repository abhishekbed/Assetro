import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { JwtPayload } from '../../auth/services/jwt.service';
import { UserRole } from '../../auth/entities/user.entity';
import { IdentityDeploymentService } from '../services/identity-deployment.service';
import { ClaimIssuanceService } from '../services/claim-issuance.service';
import { IdentityRegistryService } from '../services/identity-registry.service';
import { BlockchainSyncService } from '../services/blockchain-sync.service';
import { OnchainIdentityService } from '../services/onchain-identity.service';
import {
  CreateOnchainIdDto,
  IssueClaimsApiDto,
  RegisterIdentityApiDto,
} from '../dto/blockchain.dto';

const AGENT_ROLES = [UserRole.ISSUER, UserRole.COMPLIANCE_OFFICER, UserRole.TRANSFER_AGENT];

@UseGuards(JwtAuthGuard)
@Controller('blockchain')
export class BlockchainController {
  constructor(
    private readonly identityDeployment: IdentityDeploymentService,
    private readonly claimIssuance: ClaimIssuanceService,
    private readonly identityRegistry: IdentityRegistryService,
    private readonly blockchainSync: BlockchainSyncService,
    private readonly onchainIdentity: OnchainIdentityService,
  ) {}

  // ─── POST /blockchain/deploy-approval ───────────────────────────────────────
  // Pre-flight check for the investor-wallet-signed ONCHAINID deployment flow
  // (DeployOnchainIdButton.tsx). Read-only — any authenticated user may check
  // their own wallet. Returns what the frontend needs to build the MetaMask
  // transactions: the deployer's key hash, the OID gateway address, whether an
  // identity already exists for this wallet, and whether the platform deployer
  // still needs to be granted management-key access to it.

  @Post('deploy-approval')
  @HttpCode(HttpStatus.OK)
  async getDeployApproval(@Body() dto: { wallet_address?: string }) {
    if (!dto.wallet_address) {
      throw new BadRequestException('wallet_address is required');
    }
    if (!/^0x[a-fA-F0-9]{40}$/.test(dto.wallet_address)) {
      throw new BadRequestException('wallet_address is not a valid EVM address');
    }

    const approval = await this.onchainIdentity.getDeploymentApproval(dto.wallet_address);

    return {
      success: true,
      data: {
        deployer_key_hash: approval.deployerKeyHash,
        gateway_address: approval.gatewayAddress,
        existing_identity: approval.existingIdentity,
        deployer_needs_access: approval.deployerNeedsAccess,
      },
    };
  }

  // ─── POST /blockchain/onchainid/create ──────────────────────────────────────
  // Deploy an ONCHAINID contract for an investor, then sync the DB mirror.
  // Agents (ISSUER, CO, TA) may target any user_id.
  // Investors do not manually create ONCHAINID; issuer/backend approval pipeline does it.

  @Post('onchainid/create')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(RolesGuard)
  @Roles(...AGENT_ROLES)
  async createOnchainId(
    @CurrentUser() caller: JwtPayload,
    @Body() dto: CreateOnchainIdDto,
  ) {
    const targetUserId = this.resolveTargetUser(caller, dto.user_id);

    const identity = await this.identityDeployment.getOrDeployIdentity(
      targetUserId,
      dto.wallet_address,
    );

    // Sync claims/whitelist state back to DB from chain
    const syncReport = await this.blockchainSync.syncAllForInvestor(targetUserId);

    return {
      success: true,
      data: {
        identity_address: identity.identityContractAddress,
        deployment_tx_hash: identity.deploymentTxHash,
        chain_id: identity.chainId,
        deployed_at: identity.deployedAt,
        sync: {
          claims_synced: syncReport.claimsSynced.length,
          whitelist_entries: syncReport.whitelistEntries.length,
          errors: syncReport.errors,
        },
      },
    };
  }

  // ─── POST /blockchain/claims/issue ──────────────────────────────────────────
  // Issue the three mandatory ERC-3643 KYC claims on the investor's ONCHAINID,
  // then read them back from chain to populate claimId/signatureValid/issuerTrusted in DB.

  @Post('claims/issue')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(RolesGuard)
  @Roles(...AGENT_ROLES)
  async issueClaims(
    @CurrentUser() caller: JwtPayload,
    @Body() dto: IssueClaimsApiDto,
  ) {
    const targetUserId = this.resolveTargetUser(caller, dto.user_id);

    const identity = await this.identityDeployment.getIdentityByUser(targetUserId);
    if (!identity) {
      throw new NotFoundException(
        `No deployed ONCHAINID for user ${targetUserId}. Deploy identity first via POST /blockchain/onchainid/create`,
      );
    }

    const issuedClaims = await this.claimIssuance.issueKycClaims(targetUserId, '', {
      countryCode: dto.country_code,
      isAccredited: dto.is_accredited ?? false,
    });

    // Read back from chain → write claimId, signatureValid, issuerTrusted to DB
    const claimSyncResults = await this.blockchainSync.syncClaims(
      targetUserId,
      identity.identityContractAddress,
    );

    return {
      success: true,
      data: {
        identity_address: identity.identityContractAddress,
        claims_issued: issuedClaims.map((c) => ({
          topic: c.topic,
          topic_name: c.topicName,
          tx_hash: c.txHash,
          claim_id: c.claimId,
          signature_valid: c.signatureValid,
          issuer_trusted: c.issuerTrusted,
        })),
        chain_verified: claimSyncResults.map((r) => ({
          topic: r.topic,
          claim_id: r.claimId,
          exists_on_chain: r.existed,
          signature_valid: r.signatureValid,
          issuer_trusted: r.issuerTrusted,
        })),
      },
    };
  }

  // ─── POST /blockchain/register-identity ─────────────────────────────────────
  // Register an investor's wallet + ONCHAINID in a token's IdentityRegistry,
  // then sync the whitelist entry from chain to DB.

  @Post('register-identity')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles(...AGENT_ROLES)
  async registerIdentity(
    @CurrentUser() caller: JwtPayload,
    @Body() dto: RegisterIdentityApiDto,
  ) {
    const targetUserId = this.resolveTargetUser(caller, dto.user_id);

    const irResult = await this.identityRegistry.registerInToken(
      targetUserId,
      '',
      dto.token_id,
      dto.identity_registry_address,
      dto.country_code ?? 0,
    );

    // Sync whitelist entry: call IR.isVerified() + IR.identity() from chain, write to DB
    const syncResult = await this.blockchainSync.syncWhitelistEntry(
      irResult.walletAddress,
      dto.token_id,
      dto.identity_registry_address,
      {
        userId: targetUserId,
        txHash: irResult.txHash || undefined,
        countryCode: dto.country_code,
      },
    );

    return {
      success: true,
      data: {
        wallet_address: irResult.walletAddress,
        identity_address: irResult.identityAddress,
        tx_hash: irResult.txHash,
        country: irResult.country,
        already_registered: irResult.alreadyRegistered,
        verification_passed: irResult.verificationPassed,
        // Authoritative: what IR.isVerified() actually returned after the tx
        is_whitelisted: syncResult.verifiedOnChain,
        registered_identity: syncResult.registeredIdentity,
        country_code_on_chain: syncResult.countryCode,
      },
    };
  }

  // ─── GET /blockchain/identity/:wallet ───────────────────────────────────────
  // Read the full on-chain identity state for a wallet: contract existence,
  // management keys, per-token IR.isVerified() + IR.identity().
  // Pure chain read — does NOT modify the DB.

  @Get('identity/:wallet')
  async getIdentityByWallet(@Param('wallet') wallet: string) {
    if (!wallet.match(/^0x[0-9a-fA-F]{40}$/)) {
      throw new BadRequestException(`Invalid wallet address: ${wallet}`);
    }

    const state = await this.blockchainSync.readIdentityOnChain(wallet);

    return {
      success: true,
      data: {
        wallet_address: state.walletAddress,
        identity_address: state.identityAddress,
        contract_deployed: state.contractDeployed,
        identity_address_match: state.identityAddressMatch,
        management_keys: state.managementKeys,
        db_record: state.dbRecord,
        token_whitelist_status: state.tokenStates.map((t) => ({
          token_id: t.tokenId,
          ir_address: t.irAddress,
          is_verified: t.isVerified,
          registered_identity: t.registeredIdentity,
          country_code: t.countryCode,
        })),
      },
    };
  }

  // ─── GET /blockchain/verify/:wallet ─────────────────────────────────────────
  // Full on-chain verification: identity state + claim existence/signature/trust
  // + per-token IR.isVerified(). Also re-syncs the DB mirror with the chain state.
  // Use this to confirm an investor is fully set up.

  @Get('verify/:wallet')
  async verifyWallet(@Param('wallet') wallet: string) {
    if (!wallet.match(/^0x[0-9a-fA-F]{40}$/)) {
      throw new BadRequestException(`Invalid wallet address: ${wallet}`);
    }

    const state = await this.blockchainSync.readVerificationOnChain(wallet);

    // Re-sync DB with what we just read from chain.
    await this.blockchainSync.syncAllForWallet(wallet).catch(() => {
      /* sync errors are non-fatal for this read endpoint */
    });

    return {
      success: true,
      data: {
        wallet_address: state.walletAddress,
        fully_verified: state.fullyVerified,
        identity_address: state.identityAddress,
        contract_deployed: state.contractDeployed,
        identity_address_match: state.identityAddressMatch,
        claims: state.claims.map((c) => ({
          topic: c.topic,
          topic_name: c.topicName,
          claim_id: c.claimId,
          exists_on_chain: c.exists,
          signature_valid: c.signatureValid,
          issuer_trusted: c.issuerTrusted,
        })),
        token_whitelist_status: state.tokenStates.map((t) => ({
          token_id: t.tokenId,
          ir_address: t.irAddress,
          is_verified: t.isVerified,
          registered_identity: t.registeredIdentity,
          country_code: t.countryCode,
        })),
        db_record: state.dbRecord,
      },
    };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /**
   * Agents (ISSUER, CO, TA) may act on any user_id from the request body.
   * Investors always act on themselves (dto.user_id is ignored even if provided).
   */
  private resolveTargetUser(caller: JwtPayload, dtoUserId?: string): string {
    const isAgent = AGENT_ROLES.includes(caller.role as UserRole);
    if (isAgent && dtoUserId) return dtoUserId;
    return caller.sub;
  }

}
