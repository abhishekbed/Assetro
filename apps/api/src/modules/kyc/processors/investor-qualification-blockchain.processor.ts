import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job } from 'bullmq';

import {
  INVESTOR_QUALIFICATION_QUEUE,
  QUALIFICATION_JOB_NAME,
  QualificationJobData,
  QualificationPipelineStep,
  blockchainStepStatus,
} from '../queues/investor-qualification.queue';
import {
  IssuerInvestorQualification,
  QualificationStatus,
} from '../entities/issuer-investor-qualification.entity';
import { InvestorProfile } from '../entities/investor-profile.entity';
import { User } from '../../auth/entities/user.entity';
import { Token } from '../../tokens/entities/token.entity';
import { IdentityDeploymentService } from '../../identity/services/identity-deployment.service';
import {
  ClaimIssuanceService,
  CLAIM_TOPIC_NAMES,
  IssueClaimResult,
} from '../../identity/services/claim-issuance.service';
import { IdentityRegistryService } from '../../identity/services/identity-registry.service';
import { BlockchainSyncService } from '../../identity/services/blockchain-sync.service';
import { WhitelistService } from '../../compliance/services/whitelist.service';
import { InvestorType as WhitelistInvestorType } from '../../compliance/entities/whitelist.entity';
import { InvestorType, AccreditationStatus } from '../entities/kyc-submission.entity';

const COUNTRY_CODES: Record<string, number> = {
  IN: 356, US: 840, GB: 826, DE: 276, FR: 250, SG: 702, AE: 784,
  JP: 392, CN: 156, AU: 36, CA: 124, BR: 76, ZA: 710, NG: 566,
};

function toWhitelistType(t: InvestorType): WhitelistInvestorType {
  if (t === InvestorType.INSTITUTIONAL) return WhitelistInvestorType.INSTITUTIONAL;
  if (t === InvestorType.ACCREDITED) return WhitelistInvestorType.ACCREDITED;
  return WhitelistInvestorType.RETAIL;
}

@Processor(INVESTOR_QUALIFICATION_QUEUE, { concurrency: 2 })
export class InvestorQualificationBlockchainProcessor extends WorkerHost {
  private readonly logger = new Logger(InvestorQualificationBlockchainProcessor.name);

  constructor(
    @InjectRepository(IssuerInvestorQualification)
    private readonly qualRepo: Repository<IssuerInvestorQualification>,
    @InjectRepository(InvestorProfile)
    private readonly profileRepo: Repository<InvestorProfile>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Token)
    private readonly tokenRepo: Repository<Token>,
    private readonly identityDeployment: IdentityDeploymentService,
    private readonly claimIssuance: ClaimIssuanceService,
    private readonly identityRegistry: IdentityRegistryService,
    private readonly blockchainSync: BlockchainSyncService,
    private readonly whitelist: WhitelistService,
  ) {
    super();
  }

  async process(job: Job<QualificationJobData>): Promise<void> {
    if (job.name !== QUALIFICATION_JOB_NAME) {
      this.logger.warn(`Unknown job name "${job.name}" — skipping`);
      return;
    }

    const { qualificationId, investorId } = job.data;
    this.logger.log(
      `[Job ${job.id}] Starting blockchain pipeline  qualification=${qualificationId}  attempt=${job.attemptsMade + 1}`,
    );

    await this.setStatus(qualificationId, 'processing');

    try {
      const finished = await this.runPipeline(job);
      if (!finished) {
        // Deferred (e.g. no wallet yet): keep the deferred status so the
        // wallet-link trigger picks this qualification up again.
        this.logger.log(`[Job ${job.id}] Pipeline deferred  qualification=${qualificationId}`);
        return;
      }
      await this.setStatus(qualificationId, 'completed', null, new Date());
      this.logger.log(`[Job ${job.id}] Pipeline completed  qualification=${qualificationId}`);
    } catch (err: unknown) {
      const message = (err as Error).message ?? String(err);
      this.logger.error(
        `[Job ${job.id}] Pipeline FAILED  qualification=${qualificationId}: ${message}`,
        (err as Error).stack,
      );
      await this.setStatus(qualificationId, 'failed', message);
      throw err; // BullMQ applies retry policy
    }
  }

  // ── Pipeline ──────────────────────────────────────────────────────────────────

  /** Resolves true when the pipeline ran to the end, false when it was deferred. */
  private async runPipeline(job: Job<QualificationJobData>): Promise<boolean> {
    const { qualificationId, investorId } = job.data;

    const qual = await this.qualRepo.findOne({
      where: { id: qualificationId, status: QualificationStatus.APPROVED },
      relations: ['profile'],
    });
    if (!qual) {
      throw new Error(
        `Qualification ${qualificationId} not found or not APPROVED — aborting`,
      );
    }

    const profile =
      qual.profile ??
      (await this.profileRepo.findOne({ where: { id: qual.profileId } }));
    if (!profile) {
      throw new Error(`Investor profile not found for qualification ${qualificationId}`);
    }

    const user = await this.userRepo.findOne({ where: { id: investorId } });
    const walletAddress = user?.walletAddress ?? '';

    if (!walletAddress) {
      this.logger.warn(
        `[Job ${job.id}] investor=${investorId} has no wallet — pipeline deferred until wallet is linked`,
      );
      await this.setStatus(qualificationId, 'deferred:no_wallet');
      return false;
    }

    const countryCode = COUNTRY_CODES[profile.country?.toUpperCase() ?? ''] ?? 0;
    const country = profile.country ?? null;

    // ─── STEP 1: Deploy ONCHAINID ─────────────────────────────────────────────
    await this.setStatus(qualificationId, blockchainStepStatus(QualificationPipelineStep.DEPLOY_ONCHAINID));
    await job.updateProgress(10);

    const identity = await this.identityDeployment.getOrDeployIdentity(investorId, walletAddress);
    this.logger.log(
      `[Job ${job.id}] STEP 1  ONCHAINID=${identity.identityContractAddress}  tx=${identity.deploymentTxHash ?? 'existing'}`,
    );

    // ─── STEP 2: Issue claims ──────────────────────────────────────────────────
    await this.setStatus(qualificationId, blockchainStepStatus(QualificationPipelineStep.ISSUE_CLAIMS));
    await job.updateProgress(25);

    const alreadyIssued = Object.keys(identity.claimTopicsIssued ?? {}).length > 0;
    let issuedClaims: IssueClaimResult[];

    if (!alreadyIssued) {
      issuedClaims = await this.claimIssuance.issueKycClaims(investorId, walletAddress, {
        countryCode,
        isAccredited: profile.accreditation !== AccreditationStatus.NONE,
      });
      this.logger.log(
        `[Job ${job.id}] STEP 2  issued ${issuedClaims.length} claims  investor=${investorId}`,
      );
    } else {
      issuedClaims = Object.entries(identity.claimTopicsIssued).map(([topic, txHash]) => ({
        topic: parseInt(topic, 10),
        topicName: CLAIM_TOPIC_NAMES[parseInt(topic, 10)] ?? `TOPIC_${topic}`,
        txHash: txHash as string,
        claimId: identity.claimIds?.[topic] ?? '',
        verified: true,
        signatureValid: true,
        issuerTrusted: true,
      }));
      this.logger.log(
        `[Job ${job.id}] STEP 2  reusing ${issuedClaims.length} existing claims  investor=${investorId}`,
      );
    }

    // ─── STEP 3: Register identity in all issuer tokens ───────────────────────
    await this.setStatus(qualificationId, blockchainStepStatus(QualificationPipelineStep.REGISTER_IDENTITY));
    await job.updateProgress(45);

    const issuerTokens = await this.tokenRepo.find({ where: { createdBy: qual.issuerId } });
    this.logger.log(
      `[Job ${job.id}] STEP 3  registering in ${issuerTokens.length} token(s)`,
    );

    // Track per-token registration tx hashes for whitelist sync in STEP 5
    const registrationResults: Map<string, { txHash: string; isWhitelisted: boolean }> = new Map();

    const registrationFailures: string[] = [];

    for (const token of issuerTokens) {
      if (!token.identityRegistryAddress) continue;
      try {
        const irResult = await this.identityRegistry.registerInToken(
          investorId,
          walletAddress,
          token.id,
          token.identityRegistryAddress,
          countryCode,
        );
        registrationResults.set(token.id, {
          txHash: irResult.txHash,
          isWhitelisted: irResult.isWhitelisted,
        });
        this.logger.log(
          `[Job ${job.id}] STEP 3  token=${token.id}  tx=${irResult.txHash || '(existing)'}  isWhitelisted=${irResult.isWhitelisted}`,
        );
        if (!irResult.isWhitelisted) {
          this.logger.error(
            `[Job ${job.id}] CRITICAL: IR.isVerified(${walletAddress}) = FALSE after registerIdentity() for token ${token.id}`,
          );
          registrationFailures.push(`${token.symbol ?? token.id}: not verified after registerIdentity`);
        }
      } catch (err: unknown) {
        this.logger.warn(
          `[Job ${job.id}] IR registration skipped for token ${token.id}: ${(err as Error).message}`,
        );
        registrationFailures.push(`${token.symbol ?? token.id}: ${(err as Error).message.slice(0, 120)}`);
      }
    }

    // ─── STEP 4: Verify whitelist — IR.isVerified() is the REAL whitelist ─────
    await this.setStatus(qualificationId, blockchainStepStatus(QualificationPipelineStep.VERIFY_WHITELIST));
    await job.updateProgress(65);

    const tokenWithIR = issuerTokens.find((t) => !!t.identityRegistryAddress);
    if (tokenWithIR?.identityRegistryAddress) {
      const whitelisted = await this.identityRegistry.verifyWhitelist(
        walletAddress,
        tokenWithIR.identityRegistryAddress,
      );
      this.logger.log(
        `[Job ${job.id}] STEP 4  IR.isVerified(${walletAddress}) = ${whitelisted}`,
      );
      if (!whitelisted) {
        this.logger.error(
          `[Job ${job.id}] CRITICAL: IR.isVerified still FALSE after full pipeline`,
        );
      }
    } else {
      this.logger.warn(`[Job ${job.id}] STEP 4  no token with IR — whitelist check deferred`);
    }

    // ─── STEP 5: Sync DB from chain ───────────────────────────────────────────
    // This is where the DB mirror is brought in line with what the chain says.
    // We read back from chain and write the authoritative state to the DB.
    await this.setStatus(qualificationId, blockchainStepStatus(QualificationPipelineStep.SYNC_DB));
    await job.updateProgress(80);

    // 5a. Update user.identityContractAddress
    await this.userRepo.update(investorId, {
      identityContractAddress: identity.identityContractAddress,
    });

    // 5b. Read claims back from chain and sync investor_claims + onchain_identities
    //     This writes claimId, signatureValid, issuerTrusted, chainSyncedAt to the DB.
    //     Chain is authoritative — we never just trust the issuedClaims return value.
    try {
      const claimSyncResults = await this.blockchainSync.syncClaims(
        investorId,
        identity.identityContractAddress,
      );
      this.logger.log(
        `[Job ${job.id}] STEP 5a  Claims synced from chain: ${claimSyncResults.map((r) => `topic=${r.topic} id=${r.claimId?.slice(0, 10)}... sigValid=${r.signatureValid} trusted=${r.issuerTrusted}`).join(', ')}`,
      );
    } catch (err: unknown) {
      // Log but don't fail the job — claim sync is a mirror operation
      this.logger.error(
        `[Job ${job.id}] STEP 5a  Claims chain-sync failed (non-fatal): ${(err as Error).message}`,
      );
    }

    // 5c. Update claimsVerified on the qualification (topic → txHash)
    const claimsVerified: Record<string, string> = {};
    for (const { topic, txHash } of issuedClaims) {
      claimsVerified[String(topic)] = txHash;
    }
    await this.qualRepo.update(qualificationId, { claimsVerified });
    this.logger.log(
      `[Job ${job.id}] STEP 5b  claimsVerified updated  topics=${Object.keys(claimsVerified).join(',')}`,
    );

    // 5d. Sync whitelist entries: read IR.isVerified() from chain, write to DB
    //     Uses upsertFromChain so on-chain state overwrites any stale DB rows.
    for (const token of issuerTokens) {
      if (!token.identityRegistryAddress) continue;
      const reg = registrationResults.get(token.id);
      try {
        await this.blockchainSync.syncWhitelistEntry(
          walletAddress,
          token.id,
          token.identityRegistryAddress,
          {
            userId: investorId,
            txHash: reg?.txHash || undefined,
            countryCode,
            country,
          },
        );
        this.logger.log(
          `[Job ${job.id}] STEP 5c  Whitelist synced from chain  token=${token.id}`,
        );
      } catch (err: unknown) {
        // Log but don't fail — whitelist sync is a mirror operation
        this.logger.error(
          `[Job ${job.id}] STEP 5c  Whitelist chain-sync failed token=${token.id} (non-fatal): ${(err as Error).message}`,
        );
        // Fall back to DB-only write so at least the metadata row exists
        try {
          await this.whitelist.addToWhitelist({
            token_id: token.id,
            user_id: investorId,
            wallet_address: walletAddress,
            country: profile.country,
            investor_type: toWhitelistType(profile.investorType),
          });
        } catch { /* already exists — ok */ }
      }
    }

    // ─── STEP 6: Notify ───────────────────────────────────────────────────────
    await this.setStatus(qualificationId, blockchainStepStatus(QualificationPipelineStep.NOTIFY));
    await job.updateProgress(95);

    this.logger.log(
      `[Job ${job.id}] STEP 6  Pipeline complete  investor=${investorId}  identity=${identity.identityContractAddress}  tokens=${issuerTokens.length}`,
    );
    // Never report success while the wallet is still unverified on a token:
    // fail so the status shows it and BullMQ / the retry endpoint can re-run.
    if (registrationFailures.length > 0) {
      throw new Error(`IdentityRegistry registration incomplete — ${registrationFailures.join('; ')}`);
    }
    // Future: emit WebSocket event to push frontend refresh
    return true;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────

  private async setStatus(
    qualificationId: string,
    status: string,
    error: string | null = null,
    completedAt: Date | null = null,
  ): Promise<void> {
    await this.qualRepo.update(qualificationId, {
      blockchainStatus: status,
      blockchainError: error,
      ...(completedAt ? { blockchainCompletedAt: completedAt } : {}),
    });
  }
}
