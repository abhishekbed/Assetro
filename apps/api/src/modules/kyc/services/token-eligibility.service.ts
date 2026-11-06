import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TokenRequiredClaim, CLAIM_TOPIC_NAMES } from '../entities/token-required-claim.entity';
import { InvestorEligibilityService, EligibilityResult } from './investor-eligibility.service';
import { RuleEngineService, RuleEvaluationResult } from '../../compliance/services/rule-engine.service';
import { User } from '../../auth/entities/user.entity';

// Re-export so existing imports keep working
export { EligibilityResult } from './investor-eligibility.service';

export interface SetClaimDto {
  claim_topic: number;
  claim_name?: string;
  is_required?: boolean;
}

// ── Purchase eligibility: combines on-chain IR check + compliance rules ────────

export interface PurchaseEligibilityResult {
  eligible: boolean;
  reasons: string[];
  // On-chain + qualification + claims (from InvestorEligibilityService)
  isWhitelisted: boolean;
  identityAddress: string | null;
  issuerStatus: string | null;
  /** Platform-admin KYC level, and the issuer the investor must request approval from. */
  adminStatus: string | null;
  issuerId: string | null;
  missingClaims: number[];
  // Compliance rules (from RuleEngineService)
  complianceAllowed: boolean;
  failedRules: RuleEvaluationResult[];
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class TokenEligibilityService {
  private readonly logger = new Logger(TokenEligibilityService.name);

  constructor(
    @InjectRepository(TokenRequiredClaim)
    private readonly requiredClaimsRepo: Repository<TokenRequiredClaim>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly eligibilityEngine: InvestorEligibilityService,
    private readonly ruleEngine: RuleEngineService,
  ) {}

  // ── Simple eligibility check (existing API, unchanged) ────────────────────

  /** Delegates to the centralized eligibility engine. */
  async checkEligibility(investorId: string, tokenId: string): Promise<EligibilityResult> {
    return this.eligibilityEngine.canBuyToken(investorId, tokenId);
  }

  // ── Full purchase gate: on-chain IR + compliance rules ────────────────────

  /**
   * Comprehensive purchase eligibility check by investor user ID.
   *
   * Two layers (both must pass):
   *   1. On-chain: IR.isVerified(wallet) = true AND issuer qualification AND claims
   *      → InvestorEligibilityService.canBuyToken()
   *   2. Compliance rules: country, investor limit, transfer restriction, time window
   *      → RuleEngineService.evaluateTransfer()
   */
  async canPurchase(
    investorId: string,
    tokenId: string,
    amount = '0',
    targetWallet?: string,
  ): Promise<PurchaseEligibilityResult> {
    const reasons: string[] = [];

    // ── Layer 1: On-chain IR + qualification + claims ───────────────────────
    const eligibility = await this.eligibilityEngine.canBuyToken(investorId, tokenId);

    if (!eligibility.eligible) {
      reasons.push(eligibility.reason);
    }

    this.logger.log(
      `[PurchaseGate] eligibility  investor=${investorId}  token=${tokenId}  eligible=${eligibility.eligible}  onchain=${eligibility.isOnChainVerified}  issuer=${eligibility.issuerStatus}`,
    );

    // ── Layer 2: Compliance rules ───────────────────────────────────────────
    const user = await this.userRepo.findOne({ where: { id: investorId } });
    const walletAddress = targetWallet || user?.walletAddress || '';

    const compliance = await this.ruleEngine.evaluateTransfer(
      tokenId,
      '', // no explicit sender for a "buy" check
      walletAddress,
      amount,
    );

    for (const failed of compliance.failedRules) {
      reasons.push(failed.reason);
    }

    this.logger.log(
      `[PurchaseGate] compliance  investor=${investorId}  token=${tokenId}  allowed=${compliance.allowed}  failedRules=${compliance.failedRules.length}`,
    );

    const eligible = eligibility.eligible && compliance.allowed;

    if (!eligible) {
      this.logger.warn(
        `[PurchaseGate] BLOCKED  investor=${investorId}  wallet=${walletAddress}  token=${tokenId}  reasons=${reasons.join(' | ')}`,
      );
    } else {
      this.logger.log(
        `[PurchaseGate] ✓ ELIGIBLE  investor=${investorId}  wallet=${walletAddress}  token=${tokenId}  isWhitelisted=${eligibility.isOnChainVerified}`,
      );
    }

    return {
      eligible,
      reasons,
      isWhitelisted: eligibility.isOnChainVerified,
      identityAddress: eligibility.identityAddress,
      issuerStatus: eligibility.issuerStatus,
      adminStatus: eligibility.adminStatus,
      issuerId: eligibility.issuerId,
      missingClaims: eligibility.missingClaims,
      complianceAllowed: compliance.allowed,
      failedRules: compliance.failedRules,
    };
  }

  /**
   * Purchase eligibility check by wallet address.
   * Resolves the platform user by walletAddress, then delegates to canPurchase().
   *
   * Used by TokenLifecycleService.mint() where only the recipient wallet is known.
   */
  async canPurchaseByWallet(
    walletAddress: string,
    tokenId: string,
    amount = '0',
    knownUserId?: string,
  ): Promise<PurchaseEligibilityResult> {
    let user = knownUserId
      ? await this.userRepo.findOne({ where: { id: knownUserId } })
      : null;

    if (!user) {
      user = await this.userRepo
        .createQueryBuilder('u')
        .where('LOWER(u.wallet_address) = LOWER(:wallet)', { wallet: walletAddress })
        .getOne();
    }

    if (!user) {
      this.logger.warn(
        `[PurchaseGate] No platform account for wallet ${walletAddress} — purchase blocked`,
      );
      return {
        eligible: false,
        reasons: [
          `No investor account found for wallet ${walletAddress}. ` +
            'The investor must register on the platform and complete KYC.',
        ],
        isWhitelisted: false,
        identityAddress: null,
        issuerStatus: null,
        adminStatus: null,
        issuerId: null,
        missingClaims: [],
        complianceAllowed: false,
        failedRules: [],
      };
    }

    return this.canPurchase(user.id, tokenId, amount, walletAddress);
  }

  // ── Token required-claim management ──────────────────────────────────────

  async setRequiredClaims(tokenId: string, claims: SetClaimDto[]): Promise<TokenRequiredClaim[]> {
    await this.requiredClaimsRepo.delete({ tokenId });
    const entities = claims.map((c) =>
      this.requiredClaimsRepo.create({
        tokenId,
        claimTopic: c.claim_topic,
        claimName: c.claim_name ?? CLAIM_TOPIC_NAMES[c.claim_topic] ?? `TOPIC_${c.claim_topic}`,
        isRequired: c.is_required ?? true,
      }),
    );
    return this.requiredClaimsRepo.save(entities);
  }

  async getRequiredClaims(tokenId: string): Promise<TokenRequiredClaim[]> {
    return this.requiredClaimsRepo.find({ where: { tokenId } });
  }
}
