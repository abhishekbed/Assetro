import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';
import { WhitelistService } from './whitelist.service';
import { RuleEngineService, TransferEvaluationResult } from './rule-engine.service';
import { IdentityRegistryService } from '../../identity/services/identity-registry.service';

const COMPLIANCE_ABI = [
  'function canTransfer(address _from, address _to, uint256 _value) external view returns (bool)',
];

export interface OnchainModuleResult {
  allowed: boolean;
  // Raw result from compliance.canTransfer() — true = all bound modules allow
  complianceCanTransfer: boolean | null; // null when address not available
}

export interface TransferValidationResult {
  allowed: boolean;
  senderWhitelisted: boolean;
  recipientWhitelisted: boolean;
  senderVerifiedOnchain: boolean;
  recipientVerifiedOnchain: boolean;
  ruleEvaluation: TransferEvaluationResult;
  onchainModules: OnchainModuleResult;
  reasons: string[];
}

@Injectable()
export class TransferValidatorService {
  private readonly logger = new Logger(TransferValidatorService.name);

  constructor(
    private readonly whitelistService: WhitelistService,
    private readonly ruleEngineService: RuleEngineService,
    private readonly identityRegistry: IdentityRegistryService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Validate whether a transfer is permitted.
   *
   * Checks (in order):
   *   1. On-chain IR.isVerified(from/to)
   *   2. On-chain ModularCompliance.canTransfer() — enforces all bound modules
   *      (SupplyLimit, MaxBalance, MaxHolder, CountryRestrict, TransferWindow, etc.)
   *   3. DB whitelist — secondary check for compliance rule metadata
   *   4. Off-chain rule engine — DB-stored compliance rules
   */
  async validateTransfer(
    tokenId: string,
    fromAddress: string,
    toAddress: string,
    amount: string,
    tenantId?: string,
    identityRegistryAddress?: string,
    complianceAddress?: string,
  ): Promise<TransferValidationResult> {
    const reasons: string[] = [];

    // ── 1. On-chain IR.isVerified() ────────────────────────────────────────
    let senderVerifiedOnchain = false;
    let recipientVerifiedOnchain = false;

    if (identityRegistryAddress) {
      this.logger.log(
        `[TransferValidator] On-chain whitelist check  ir=${identityRegistryAddress}  from=${fromAddress}  to=${toAddress}`,
      );

      [senderVerifiedOnchain, recipientVerifiedOnchain] = await Promise.all([
        this.identityRegistry.isRegistered(fromAddress, identityRegistryAddress),
        this.identityRegistry.isRegistered(toAddress, identityRegistryAddress),
      ]);

      if (!senderVerifiedOnchain) {
        reasons.push(`Sender ${fromAddress} is NOT verified in IdentityRegistry`);
      }
      if (!recipientVerifiedOnchain) {
        reasons.push(`Recipient ${toAddress} is NOT verified in IdentityRegistry`);
      }
    } else {
      this.logger.warn(`[TransferValidator] identityRegistryAddress not provided — skipping IR check`);
    }

    // ── 2. On-chain ModularCompliance.canTransfer() — module enforcement ───
    const onchainModules: OnchainModuleResult = { allowed: true, complianceCanTransfer: null };

    if (complianceAddress) {
      try {
        const rpcUrl = this.config.get<string>('SEPOLIA_RPC_URL');
        if (rpcUrl) {
          const provider = new ethers.JsonRpcProvider(rpcUrl, undefined, { staticNetwork: true });
          const compliance = new ethers.Contract(complianceAddress, COMPLIANCE_ABI, provider);
          const decimals = 18; // default; parseUnits handles token amount
          const amountWei = ethers.parseUnits(
            parseFloat(amount).toFixed(decimals).replace(/\.?0+$/, '') || '0',
            decimals,
          );
          // For mints: from = address(0)
          const from = (!fromAddress || fromAddress === '') ? ethers.ZeroAddress : fromAddress;
          const canTransfer: boolean = await compliance.canTransfer(from, toAddress, amountWei);
          onchainModules.complianceCanTransfer = canTransfer;
          onchainModules.allowed = canTransfer;

          if (!canTransfer) {
            reasons.push('Transfer blocked by on-chain compliance module. Check SupplyLimit, MaxBalance, MaxHolder, CountryRestrict, or TransferWindow rules.');
            this.logger.warn(`[TransferValidator] ✗ compliance.canTransfer = FALSE  addr=${complianceAddress}`);
          } else {
            this.logger.log(`[TransferValidator] ✓ compliance.canTransfer = TRUE  addr=${complianceAddress}`);
          }
        }
      } catch (err) {
        this.logger.warn(`[TransferValidator] canTransfer RPC call failed: ${(err as Error).message}`);
        onchainModules.complianceCanTransfer = null; // couldn't verify — don't block
      }
    }

    // ── 3. DB whitelist ────────────────────────────────────────────────────
    const senderWhitelisted = await this.whitelistService.isWhitelisted(tokenId, fromAddress);
    const recipientWhitelisted = await this.whitelistService.isWhitelisted(tokenId, toAddress);

    if (!senderWhitelisted && !identityRegistryAddress) {
      reasons.push(`Sender ${fromAddress} is not whitelisted`);
    }
    if (!recipientWhitelisted && !identityRegistryAddress) {
      reasons.push(`Recipient ${toAddress} is not whitelisted`);
    }

    // ── 4. Off-chain compliance rule engine ────────────────────────────────
    const ruleEvaluation = await this.ruleEngineService.evaluateTransfer(
      tokenId,
      fromAddress,
      toAddress,
      amount,
      tenantId,
    );

    for (const failed of ruleEvaluation.failedRules) {
      reasons.push(failed.reason);
    }

    // ── Combine ─────────────────────────────────────────────────────────────
    const whitelistPassed = identityRegistryAddress
      ? senderVerifiedOnchain && recipientVerifiedOnchain
      : senderWhitelisted && recipientWhitelisted;

    const allowed = whitelistPassed && onchainModules.allowed && ruleEvaluation.allowed;

    this.logger.log(
      `[TransferValidator] result  token=${tokenId}  from=${fromAddress}  to=${toAddress}  allowed=${allowed}  onchainIR=(${senderVerifiedOnchain},${recipientVerifiedOnchain})  onchainModules=${onchainModules.complianceCanTransfer}  rules=${ruleEvaluation.allowed}`,
    );

    return {
      allowed,
      senderWhitelisted,
      recipientWhitelisted,
      senderVerifiedOnchain,
      recipientVerifiedOnchain,
      ruleEvaluation,
      onchainModules,
      reasons,
    };
  }
}
