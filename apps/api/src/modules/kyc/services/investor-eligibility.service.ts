import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  IssuerInvestorQualification,
  QualificationStatus,
} from '../entities/issuer-investor-qualification.entity';
import { TokenRequiredClaim, CLAIM_TOPIC_NAMES } from '../entities/token-required-claim.entity';
import { Token } from '../../tokens/entities/token.entity';
import { User } from '../../auth/entities/user.entity';
import { IdentityRegistryService } from '../../identity/services/identity-registry.service';
import { IdentityDeploymentService } from '../../identity/services/identity-deployment.service';
import { AdminKycStatus, InvestorProfile } from '../entities/investor-profile.entity';
import { resolveAdminKycStatus } from './admin-kyc-status';
import { KycSubmission, KycStatus } from '../entities/kyc-submission.entity';
import { InvestorClaim, ClaimStatus } from '../entities/investor-claim.entity';

const COUNTRY_CODES: Record<string, number> = {
  IN: 356, US: 840, GB: 826, DE: 276, FR: 250, SG: 702, AE: 784,
  JP: 392, CN: 156, AU: 36, CA: 124, BR: 76, ZA: 710, NG: 566,
};

// ── Result types ──────────────────────────────────────────────────────────────

export interface QualificationCheck {
  qualified: boolean;
  /** Platform-admin KYC level; the issuer-level `status` below only counts once this is approved. */
  adminStatus: AdminKycStatus;
  status: QualificationStatus | null;
  qualificationId: string | null;
  issuerId: string | null;
  approvedAt: Date | null;
  expiresAt: Date | null;
  claimsVerified: Record<string, string>;
  rejectedReason?: string | null;
}

export interface ClaimsCheck {
  valid: boolean;
  missingClaims: number[];
  claimsVerified: Record<string, string>;
  requiredClaims: number[];
}

export interface OnchainCheck {
  registered: boolean;
  walletAddress: string | null;
  identityAddress: string | null;
}

export interface EligibilityResult {
  eligible: boolean;
  reason: string;
  /** Platform-admin KYC level. */
  adminStatus: AdminKycStatus;
  /** The issuer of the token, i.e. who the investor must request approval from. */
  issuerId: string | null;
  issuerStatus: QualificationStatus | null;
  missingClaims: number[];
  isOnChainVerified: boolean;
  identityAddress: string | null;
  rejectedReason?: string | null;
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class InvestorEligibilityService {
  private readonly logger = new Logger(InvestorEligibilityService.name);
  /** In-flight self-heal registrations, keyed by investor+token, so polling can't double-send txs. */
  private readonly healing = new Map<string, Promise<void>>();

  constructor(
    @InjectRepository(IssuerInvestorQualification)
    private readonly qualRepo: Repository<IssuerInvestorQualification>,
    @InjectRepository(TokenRequiredClaim)
    private readonly requiredClaimsRepo: Repository<TokenRequiredClaim>,
    @InjectRepository(Token)
    private readonly tokenRepo: Repository<Token>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(InvestorProfile)
    private readonly profileRepo: Repository<InvestorProfile>,
    @InjectRepository(KycSubmission)
    private readonly kycRepo: Repository<KycSubmission>,
    @InjectRepository(InvestorClaim)
    private readonly claimRepo: Repository<InvestorClaim>,
    private readonly identityRegistry: IdentityRegistryService,
    private readonly identityDeployment: IdentityDeploymentService,
  ) {}

  /**
   * An investor may buy from an issuer only when BOTH levels hold:
   *   1. the platform admin has approved their KYC, and
   *   2. this specific issuer has approved them (not expired, rejected or revoked).
   * One issuer approval covers every token of that issuer, so it is not
   * repeated per token. Approval from a different issuer does not count.
   */
  async isInvestorQualified(
    investorId: string,
    issuerId: string,
  ): Promise<QualificationCheck> {
    const adminStatus = await resolveAdminKycStatus(
      { profileRepo: this.profileRepo, qualRepo: this.qualRepo, kycRepo: this.kycRepo },
      investorId,
    );

    const qual = await this.qualRepo.findOne({ where: { issuerId, investorId } });
    const profile = await this.profileRepo.findOne({ where: { userId: investorId } });
    const rejectedReason = qual?.rejectedReason ?? profile?.adminReason ?? qual?.reviewNotes ?? null;

    if (!qual) {
      return {
        qualified: false,
        adminStatus,
        status: null,
        qualificationId: null,
        issuerId,
        approvedAt: null,
        expiresAt: null,
        claimsVerified: {},
        rejectedReason,
      };
    }

    // An approval past its expiry date is no longer valid: persist that so every
    // screen agrees, and require a fresh request.
    if (
      qual.status === QualificationStatus.APPROVED &&
      qual.expiresAt &&
      qual.expiresAt < new Date()
    ) {
      qual.status = QualificationStatus.EXPIRED;
      await this.qualRepo.save(qual);
    }

    return {
      qualified: adminStatus === AdminKycStatus.APPROVED && qual.status === QualificationStatus.APPROVED,
      adminStatus,
      status: qual.status,
      qualificationId: qual.id,
      issuerId,
      approvedAt: qual.approvedAt,
      expiresAt: qual.expiresAt,
      claimsVerified: qual.claimsVerified ?? {},
      rejectedReason,
    };
  }

  /**
   * Check whether the investor's on-chain claims satisfy what a specific token requires.
   * Uses the DB-mirrored `claimsVerified` map — no on-chain call needed.
   * If the token has no required claims set, all investors pass automatically.
   */
  async hasValidClaims(investorId: string, tokenId: string): Promise<ClaimsCheck> {
    const required = await this.requiredClaimsRepo.find({
      where: { tokenId, isRequired: true },
    });

    if (required.length === 0) {
      return { valid: true, missingClaims: [], claimsVerified: {}, requiredClaims: [] };
    }

    const token = await this.tokenRepo.findOne({ where: { id: tokenId } });
    if (!token) {
      return {
        valid: false,
        missingClaims: required.map((r) => r.claimTopic),
        claimsVerified: {},
        requiredClaims: required.map((r) => r.claimTopic),
      };
    }

    let qual = await this.qualRepo.findOne({
      where: { issuerId: token.createdBy, investorId },
    });

    if (!qual || !qual.claimsVerified || Object.keys(qual.claimsVerified).length === 0) {
      const anyApproved = await this.qualRepo.findOne({
        where: { investorId, status: QualificationStatus.APPROVED },
        order: { approvedAt: 'DESC' },
      });
      if (anyApproved) qual = anyApproved;
    }

    const claimsVerified = qual?.claimsVerified ?? {};
    let missing = required
      .filter((r) => !claimsVerified[String(r.claimTopic)])
      .map((r) => r.claimTopic);

    // If still missing claims, check if investor has active rows in investor_claims table
    if (missing.length > 0) {
      const activeClaims = await this.claimRepo.find({
        where: { investorId, status: ClaimStatus.ACTIVE },
      });
      const activeTopicSet = new Set(activeClaims.map((c) => c.claimTopic));
      missing = missing.filter((t) => !activeTopicSet.has(t));
    }

    // Standard KYC approval covers identity (1), jurisdiction (2), accreditation (3)
    if (missing.length > 0) {
      const approvedKyc = await this.kycRepo.findOne({
        where: { userId: investorId, status: KycStatus.APPROVED },
      });
      if (approvedKyc) {
        const kycTopics = new Set([1, 2, 3]);
        missing = missing.filter((t) => !kycTopics.has(t));
      }
    }

    return {
      valid: missing.length === 0,
      missingClaims: missing,
      claimsVerified,
      requiredClaims: required.map((r) => r.claimTopic),
    };
  }

  /**
   * Authoritative whitelist check: calls IdentityRegistry.isVerified(wallet) on-chain.
   *
   * This is the REAL whitelist — not database state. Works in both local and live modes.
   * An investor must be registered in the token's IdentityRegistry to be eligible to buy.
   */
  async isWhitelistedOnchain(investorId: string, tokenId: string): Promise<OnchainCheck> {
    const user = await this.userRepo.findOne({ where: { id: investorId } });
    const walletAddress = user?.walletAddress ?? null;

    // Resolve identity address from the deployed ONCHAINID record (authoritative source)
    const onchainId = await this.identityDeployment.getIdentityByUser(investorId);
    const identityAddress = onchainId?.identityContractAddress ?? user?.identityContractAddress ?? null;

    if (!walletAddress) {
      return { registered: false, walletAddress: null, identityAddress };
    }

    const token = await this.tokenRepo.findOne({ where: { id: tokenId } });
    if (!token?.identityRegistryAddress) {
      this.logger.warn(
        `[Eligibility] Token ${tokenId} has no identityRegistryAddress — cannot verify whitelist`,
      );
      return { registered: false, walletAddress, identityAddress };
    }

    try {
      // IR.isVerified(wallet) is the single source of truth for whitelist status
      const registered = await this.identityRegistry.isRegistered(
        walletAddress,
        token.identityRegistryAddress,
      );
      this.logger.log(
        `[Eligibility] IR.isVerified(${walletAddress}) = ${registered}  tokenId=${tokenId}  ir=${token.identityRegistryAddress}`,
      );
      return { registered, walletAddress, identityAddress };
    } catch (err: unknown) {
      this.logger.warn(
        `[Eligibility] isVerified check failed for token ${tokenId}: ${(err as Error).message}`,
      );
      return { registered: false, walletAddress, identityAddress };
    }
  }

  /**
   * Full buy eligibility check for an investor against a specific token.
   *
   * Steps (in order):
   *   1. Issuer-level qualification — reusable across all tokens of the same issuer
   *   2. Token-required claims — checked via DB mirror (no on-chain call)
   *   3. On-chain IdentityRegistry registration — authoritative buy gate
   *
   * An investor NEVER repeats KYC for a second token from the same issuer.
   */
  async canBuyToken(investorId: string, tokenId: string): Promise<EligibilityResult> {
    const token = await this.tokenRepo.findOne({ where: { id: tokenId } });
    if (!token) throw new NotFoundException(`Token ${tokenId} not found`);

    // ── Step 1: Issuer qualification ─────────────────────────────────────────
    const qualCheck = await this.isInvestorQualified(investorId, token.createdBy);
    if (!qualCheck.qualified) {
      let reason: string;
      if (qualCheck.adminStatus !== AdminKycStatus.APPROVED) {
        reason =
          qualCheck.adminStatus === AdminKycStatus.PENDING
            ? 'Your KYC is awaiting platform admin approval.'
            : qualCheck.rejectedReason
            ? `Your platform KYC was rejected: ${qualCheck.rejectedReason}`
            : `Your platform KYC is "${qualCheck.adminStatus}". Admin approval is required before you can invest.`;
      } else if (!qualCheck.status) {
        reason = 'Request Issuer KYC approval to invest in this issuer\'s tokens.';
      } else {
        reason =
          qualCheck.status === QualificationStatus.REJECTED && qualCheck.rejectedReason
            ? `Issuer KYC approval was rejected: ${qualCheck.rejectedReason}`
            : `Issuer KYC approval is "${qualCheck.status}". Approval from this issuer is required.`;
      }
      return {
        eligible: false,
        reason,
        adminStatus: qualCheck.adminStatus,
        issuerId: token.createdBy,
        issuerStatus: qualCheck.status,
        missingClaims: [],
        isOnChainVerified: false,
        identityAddress: null,
        rejectedReason: qualCheck.rejectedReason,
      };
    }

    // ── Step 2: Token-required claims (DB check, no on-chain call) ────────────
    const claimsCheck = await this.hasValidClaims(investorId, tokenId);

    // ── Step 3: On-chain registration ────────────────────────────────────────
    const onchainCheck = await this.isWhitelistedOnchain(investorId, tokenId);

    // Self-heal: the investor is approved but the approval pipeline never got them into
    // this token's IdentityRegistry (failed/stalled job, wallet change, token deployed
    // later). Fire registration in the background WITHOUT blocking the HTTP response!
    if (!onchainCheck.registered && onchainCheck.walletAddress && token.identityRegistryAddress) {
      void this.healRegistration(investorId, onchainCheck.walletAddress, token);
    }

    if (!claimsCheck.valid) {
      const names = claimsCheck.missingClaims
        .map((t) => CLAIM_TOPIC_NAMES[t] ?? `TOPIC_${t}`)
        .join(', ');
      return {
        eligible: false,
        reason: `Missing required claims: ${names}`,
        adminStatus: qualCheck.adminStatus,
        issuerId: token.createdBy,
        issuerStatus: QualificationStatus.APPROVED,
        missingClaims: claimsCheck.missingClaims,
        isOnChainVerified: onchainCheck.registered,
        identityAddress: onchainCheck.identityAddress,
      };
    }

    return {
      eligible: true,
      reason: onchainCheck.registered
        ? 'Investor is approved, all claims verified, and registered in IdentityRegistry.'
        : 'Investor is approved. Identity registration is syncing on-chain.',
      adminStatus: qualCheck.adminStatus,
      issuerId: token.createdBy,
      issuerStatus: QualificationStatus.APPROVED,
      missingClaims: [],
      isOnChainVerified: onchainCheck.registered,
      identityAddress: onchainCheck.identityAddress,
    };
  }

  private healRegistration(investorId: string, walletAddress: string, token: Token): Promise<void> {
    const key = `${investorId}:${token.id}`;
    const inflight = this.healing.get(key);
    if (inflight) return inflight;

    const run = (async () => {
      try {
        const profile = await this.profileRepo.findOne({ where: { userId: investorId } });
        const countryCode = COUNTRY_CODES[(profile?.country ?? '').toUpperCase()] ?? 0;
        const result = await this.identityRegistry.registerInToken(
          investorId,
          walletAddress,
          token.id,
          token.identityRegistryAddress!,
          countryCode,
        );
        this.logger.log(
          `[Eligibility] self-heal registered investor=${investorId} token=${token.id} tx=${result.txHash || '(existing)'} isWhitelisted=${result.isWhitelisted}`,
        );
      } catch (err: unknown) {
        this.logger.warn(
          `[Eligibility] self-heal failed investor=${investorId} token=${token.id}: ${(err as Error).message}`,
        );
      } finally {
        this.healing.delete(key);
      }
    })();
    this.healing.set(key, run);
    return run;
  }

  /**
   * Full receive eligibility check (used for transfer compliance).
   * Currently mirrors buy eligibility; can be extended with transfer-specific
   * compliance rules (e.g. ModularCompliance.canTransfer) in the future.
   */
  async canReceiveToken(investorId: string, tokenId: string): Promise<EligibilityResult> {
    return this.canBuyToken(investorId, tokenId);
  }
}
