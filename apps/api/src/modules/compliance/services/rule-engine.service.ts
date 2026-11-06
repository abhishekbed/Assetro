import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { parseUnits } from 'ethers';
import { ComplianceService } from './compliance.service';
import { WhitelistService } from './whitelist.service';
import { RuleType } from '../entities/compliance-rule.entity';
import { CapTable } from '../../tokens/entities/cap-table.entity';
import { Token } from '../../tokens/entities/token.entity';
import { Payment, PaymentStatus } from '../../payments/entities/payment.entity';

export interface RuleEvaluationResult {
  ruleId: string;
  ruleType: RuleType;
  passed: boolean;
  reason: string;
  // Populated only for transfer_fee rules
  fee?: {
    feeBps: number;
    feePercent: number;
    feeAmount: string;       // human-readable tokens
    netAmount: string;       // human-readable tokens after fee
    collectorAddress: string;
  };
}

export interface TransferEvaluationResult {
  allowed: boolean;
  results: RuleEvaluationResult[];
  failedRules: RuleEvaluationResult[];
  // Aggregated fee info (populated when a transfer_fee rule is present)
  fee?: RuleEvaluationResult['fee'];
}

@Injectable()
export class RuleEngineService {
  private readonly logger = new Logger(RuleEngineService.name);

  constructor(
    private readonly complianceService: ComplianceService,
    private readonly whitelistService: WhitelistService,
    @InjectRepository(CapTable)
    private readonly capTableRepo: Repository<CapTable>,
    @InjectRepository(Token)
    private readonly tokenRepo: Repository<Token>,
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
  ) {}

  /**
   * `amount` is always a human-readable token quantity (e.g. "100" or "1.5"),
   * which is what every caller passes. Returns base units, or null when the
   * value is not a valid non-negative decimal.
   */
  private toBaseUnits(value: unknown, decimals: number): bigint | null {
    try {
      const v = parseUnits(String(value).trim(), decimals);
      return v >= 0n ? v : null;
    } catch {
      return null;
    }
  }

  async evaluateTransfer(
    tokenId: string,
    fromAddress: string,
    toAddress: string,
    amount: string,
    tenantId?: string,
  ): Promise<TransferEvaluationResult> {
    if (this.toBaseUnits(amount, 18) === null) {
      const invalid: RuleEvaluationResult = {
        ruleId: '',
        ruleType: RuleType.TRANSFER_RESTRICTION,
        passed: false,
        reason: `Invalid transfer amount: ${amount}`,
      };
      return { allowed: false, results: [invalid], failedRules: [invalid] };
    }

    const rules = await this.complianceService.getRules(tokenId, tenantId, true);
    const results: RuleEvaluationResult[] = [];

    for (const rule of rules) {
      let result: RuleEvaluationResult;

      switch (rule.ruleType) {
        case RuleType.COUNTRY_RESTRICTION:
          result = await this.evaluateCountryRestriction(
            rule.id,
            tokenId,
            toAddress,
            rule.parameters,
          );
          break;

        case RuleType.INVESTOR_LIMIT:
          result = await this.evaluateInvestorLimit(
            rule.id,
            tokenId,
            rule.parameters,
          );
          break;

        case RuleType.TRANSFER_RESTRICTION:
          result = this.evaluateTransferRestriction(
            rule.id,
            amount,
            rule.parameters,
          );
          break;

        case RuleType.INVESTOR_CLASS:
          result = await this.evaluateInvestorClass(
            rule.id,
            tokenId,
            toAddress,
            rule.parameters,
          );
          break;

        case RuleType.TIME_BASED:
          result = this.evaluateTimeBased(rule.id, rule.parameters);
          break;

        case RuleType.SUPPLY_LIMIT:
          result = await this.evaluateSupplyLimit(rule.id, tokenId, fromAddress, amount, tenantId);
          break;

        case RuleType.MAX_BALANCE:
          result = await this.evaluateMaxBalance(rule.id, tokenId, toAddress, amount);
          break;

        case RuleType.DAILY_MONTHLY_LIMIT:
          result = await this.evaluateDailyMonthlyLimit(rule.id, tokenId, fromAddress, amount, rule.parameters);
          break;

        case RuleType.EXCHANGE_MONTHLY_LIMIT:
          result = await this.evaluateExchangeMonthlyLimit(rule.id, tokenId, fromAddress, toAddress, amount, rule.parameters);
          break;

        case RuleType.TRANSFER_FEE:
          result = await this.evaluateTransferFee(rule.id, tokenId, amount, rule.parameters);
          break;

        case RuleType.SENDER_WHITELIST:
          result = this.evaluateSenderWhitelist(rule.id, fromAddress, rule.parameters);
          break;

        default:
          result = {
            ruleId: rule.id,
            ruleType: rule.ruleType,
            passed: false,
            reason: `Unknown rule type: ${rule.ruleType}`,
          };
      }

      results.push(result);
    }

    const failedRules = results.filter((r) => !r.passed);

    // Extract fee info from any transfer_fee rule result
    const feeResult = results.find(r => r.ruleType === RuleType.TRANSFER_FEE && r.fee);

    return {
      allowed: failedRules.length === 0,
      results,
      failedRules,
      ...(feeResult?.fee ? { fee: feeResult.fee } : {}),
    };
  }

  private async evaluateCountryRestriction(
    ruleId: string,
    tokenId: string,
    toAddress: string,
    parameters: Record<string, unknown>,
  ): Promise<RuleEvaluationResult> {
    const blockedCountries = (parameters.blocked_countries as string[]) || [];
    const allowedCountries = (parameters.allowed_countries as string[]) || [];

    const whitelistEntry = await this.whitelistService.findByTokenAndWallet(tokenId, toAddress);

    if (!whitelistEntry || !whitelistEntry.country) {
      return {
        ruleId,
        ruleType: RuleType.COUNTRY_RESTRICTION,
        passed: false,
        reason: 'Recipient country information not available',
      };
    }

    const country = whitelistEntry.country.toUpperCase();

    if (blockedCountries.length > 0 && blockedCountries.includes(country)) {
      return {
        ruleId,
        ruleType: RuleType.COUNTRY_RESTRICTION,
        passed: false,
        reason: `Country ${country} is restricted for this token`,
      };
    }

    if (allowedCountries.length > 0 && !allowedCountries.includes(country)) {
      return {
        ruleId,
        ruleType: RuleType.COUNTRY_RESTRICTION,
        passed: false,
        reason: `Country ${country} is not in the allowed list for this token`,
      };
    }

    return {
      ruleId,
      ruleType: RuleType.COUNTRY_RESTRICTION,
      passed: true,
      reason: 'Country restriction check passed',
    };
  }

  private async evaluateInvestorLimit(
    ruleId: string,
    tokenId: string,
    parameters: Record<string, unknown>,
  ): Promise<RuleEvaluationResult> {
    const maxInvestors = Number(parameters.max_investors ?? parameters.max_holders) || 0;

    if (!maxInvestors) {
      return {
        ruleId,
        ruleType: RuleType.INVESTOR_LIMIT,
        passed: true,
        reason: 'No investor limit configured',
      };
    }

    const currentCount = await this.whitelistService.countActiveByToken(tokenId);

    if (currentCount >= maxInvestors) {
      return {
        ruleId,
        ruleType: RuleType.INVESTOR_LIMIT,
        passed: false,
        reason: `Investor limit reached: ${currentCount}/${maxInvestors}`,
      };
    }

    return {
      ruleId,
      ruleType: RuleType.INVESTOR_LIMIT,
      passed: true,
      reason: `Within investor limit: ${currentCount}/${maxInvestors}`,
    };
  }

  private evaluateTransferRestriction(
    ruleId: string,
    amount: string,
    parameters: Record<string, unknown>,
  ): RuleEvaluationResult {
    const minAmount = parameters.min_transfer_amount as string | undefined;
    const maxAmount = parameters.max_transfer_amount as string | undefined;
    const lockInEndDate = parameters.lock_in_end_date as string | undefined;

    // Compare in fixed-point so decimal amounts ("1.5") never throw.
    const transferAmount = this.toBaseUnits(amount, 18) ?? 0n;
    const minUnits = minAmount ? this.toBaseUnits(minAmount, 18) : null;
    const maxUnits = maxAmount ? this.toBaseUnits(maxAmount, 18) : null;

    if (lockInEndDate) {
      const lockEnd = new Date(lockInEndDate);
      if (new Date() < lockEnd) {
        return {
          ruleId,
          ruleType: RuleType.TRANSFER_RESTRICTION,
          passed: false,
          reason: `Tokens are locked until ${lockInEndDate}`,
        };
      }
    }

    if (minUnits !== null && transferAmount > 0n && transferAmount < minUnits) {
      return {
        ruleId,
        ruleType: RuleType.TRANSFER_RESTRICTION,
        passed: false,
        reason: `Transfer amount ${amount} is below minimum ${minAmount}`,
      };
    }

    if (maxUnits !== null && transferAmount > maxUnits) {
      return {
        ruleId,
        ruleType: RuleType.TRANSFER_RESTRICTION,
        passed: false,
        reason: `Transfer amount ${amount} exceeds maximum ${maxAmount}`,
      };
    }

    return {
      ruleId,
      ruleType: RuleType.TRANSFER_RESTRICTION,
      passed: true,
      reason: 'Transfer restriction check passed',
    };
  }

  private async evaluateInvestorClass(
    ruleId: string,
    tokenId: string,
    toAddress: string,
    parameters: Record<string, unknown>,
  ): Promise<RuleEvaluationResult> {
    const allowedTypes = (parameters.allowed_investor_types as string[]) || [];

    if (allowedTypes.length === 0) {
      return {
        ruleId,
        ruleType: RuleType.INVESTOR_CLASS,
        passed: true,
        reason: 'No investor class restriction configured',
      };
    }

    const whitelistEntry = await this.whitelistService.findByTokenAndWallet(tokenId, toAddress);

    if (!whitelistEntry) {
      return {
        ruleId,
        ruleType: RuleType.INVESTOR_CLASS,
        passed: false,
        reason: 'Recipient is not whitelisted',
      };
    }

    if (!allowedTypes.includes(whitelistEntry.investorType)) {
      return {
        ruleId,
        ruleType: RuleType.INVESTOR_CLASS,
        passed: false,
        reason: `Investor type ${whitelistEntry.investorType} is not allowed. Allowed: ${allowedTypes.join(', ')}`,
      };
    }

    return {
      ruleId,
      ruleType: RuleType.INVESTOR_CLASS,
      passed: true,
      reason: 'Investor class check passed',
    };
  }

  private evaluateTimeBased(
    ruleId: string,
    parameters: Record<string, unknown>,
  ): RuleEvaluationResult {
    const tradingWindowStart = parameters.trading_window_start as string | undefined;
    const tradingWindowEnd = parameters.trading_window_end as string | undefined;
    const blackoutStart = parameters.blackout_start as string | undefined;
    const blackoutEnd = parameters.blackout_end as string | undefined;

    const now = new Date();

    // Check blackout period
    if (blackoutStart && blackoutEnd) {
      const bStart = new Date(blackoutStart);
      const bEnd = new Date(blackoutEnd);
      if (now >= bStart && now <= bEnd) {
        return {
          ruleId,
          ruleType: RuleType.TIME_BASED,
          passed: false,
          reason: `Transfer blocked during blackout period (${blackoutStart} to ${blackoutEnd})`,
        };
      }
    }

    // Check trading window
    if (tradingWindowStart && tradingWindowEnd) {
      const twStart = new Date(tradingWindowStart);
      const twEnd = new Date(tradingWindowEnd);
      if (now < twStart || now > twEnd) {
        return {
          ruleId,
          ruleType: RuleType.TIME_BASED,
          passed: false,
          reason: `Transfer only allowed during trading window (${tradingWindowStart} to ${tradingWindowEnd})`,
        };
      }
    }

    return {
      ruleId,
      ruleType: RuleType.TIME_BASED,
      passed: true,
      reason: 'Time-based check passed',
    };
  }

  // ── Phase 6.1 evaluators ──────────────────────────────────────────────────

  /**
   * SupplyLimit: blocks when totalSupply + mintAmount would exceed the configured cap.
   * For regular transfers (fromAddress is a real wallet) this always passes.
   * For mints (fromAddress is '' or '0x000...') it checks against the DB totalSupply.
   */
  private async evaluateSupplyLimit(
    ruleId: string,
    tokenId: string,
    fromAddress: string,
    amount: string,
    tenantId?: string,
  ): Promise<RuleEvaluationResult> {
    // Only mints add to supply; ordinary transfers never change it.
    if (fromAddress && fromAddress !== '0x0000000000000000000000000000000000000000') {
      return { ruleId, ruleType: RuleType.SUPPLY_LIMIT, passed: true, reason: 'Not a mint — supply limit does not apply' };
    }

    const token = await this.tokenRepo.findOne({ where: { id: tokenId } });
    if (!token) {
      return { ruleId, ruleType: RuleType.SUPPLY_LIMIT, passed: true, reason: 'Token not found — skipped' };
    }

    const params = await this.complianceService.getRules(tokenId, tenantId, true)
      .then(rules => rules.find(r => r.ruleType === RuleType.SUPPLY_LIMIT)?.parameters ?? {});

    const supplyLimitRaw = params.supply_limit as string | number | undefined;
    if (!supplyLimitRaw) {
      return { ruleId, ruleType: RuleType.SUPPLY_LIMIT, passed: true, reason: 'No supply limit configured' };
    }

    const decimals = token.decimals ?? 18;
    const limitUnits = parseFloat(String(supplyLimitRaw));
    // token.totalSupply and `amount` are human-readable; compare in base units.
    const currentSupplyWei = this.toBaseUnits(token.totalSupply ?? '0', decimals) ?? 0n;
    const mintAmountWei = this.toBaseUnits(amount, decimals) ?? 0n;
    const limitWei = this.toBaseUnits(supplyLimitRaw, decimals) ?? 0n;

    if (currentSupplyWei + mintAmountWei > limitWei) {
      return {
        ruleId,
        ruleType: RuleType.SUPPLY_LIMIT,
        passed: false,
        reason: `Minting would exceed supply limit of ${limitUnits.toLocaleString()} ${token.symbol}`,
      };
    }
    return {
      ruleId,
      ruleType: RuleType.SUPPLY_LIMIT,
      passed: true,
      reason: `Within supply limit (${limitUnits.toLocaleString()} ${token.symbol})`,
    };
  }

  /**
   * MaxBalance: blocks when the recipient wallet's current balance + transfer amount
   * would exceed the per-wallet cap. Uses cap_table for current balance.
   */
  private async evaluateMaxBalance(
    ruleId: string,
    tokenId: string,
    toAddress: string,
    amount: string,
  ): Promise<RuleEvaluationResult> {
    const token = await this.tokenRepo.findOne({ where: { id: tokenId } });
    if (!token) {
      return { ruleId, ruleType: RuleType.MAX_BALANCE, passed: true, reason: 'Token not found — skipped' };
    }

    const params = await this.complianceService.getRules(tokenId, undefined, true)
      .then(rules => rules.find(r => r.ruleType === RuleType.MAX_BALANCE)?.parameters ?? {});

    const maxBalanceRaw = params.max_balance as string | number | undefined;
    if (!maxBalanceRaw) {
      return { ruleId, ruleType: RuleType.MAX_BALANCE, passed: true, reason: 'No max balance configured' };
    }

    const decimals = token.decimals ?? 18;
    const maxUnits = parseFloat(String(maxBalanceRaw));
    const maxWei = this.toBaseUnits(maxBalanceRaw, decimals) ?? 0n;
    const transferWei = this.toBaseUnits(amount, decimals) ?? 0n;

    if (transferWei > maxWei) {
      return {
        ruleId,
        ruleType: RuleType.MAX_BALANCE,
        passed: false,
        reason: `Single transfer of ${amount} ${token.symbol} exceeds max balance of ${maxUnits.toLocaleString()} ${token.symbol}`,
      };
    }

    // Look up current on-platform balance from cap_table
    const entry = await this.capTableRepo.findOne({
      where: { tokenId, walletAddress: toAddress.toLowerCase() },
    });
    const currentWei = BigInt(entry?.balance ?? '0');

    if (currentWei + transferWei > maxWei) {
      return {
        ruleId,
        ruleType: RuleType.MAX_BALANCE,
        passed: false,
        reason: `Transfer would push wallet balance above max of ${maxUnits.toLocaleString()} ${token.symbol}`,
      };
    }
    return {
      ruleId,
      ruleType: RuleType.MAX_BALANCE,
      passed: true,
      reason: `Within max balance limit (${maxUnits.toLocaleString()} ${token.symbol})`,
    };
  }

  /**
   * DayMonthLimits: blocks when the sender's outbound volume in the last 24h or 30d
   * would exceed the configured thresholds. Uses completed payments as the data source.
   */
  private async evaluateDailyMonthlyLimit(
    ruleId: string,
    tokenId: string,
    fromAddress: string,
    amount: string,
    parameters: Record<string, unknown>,
  ): Promise<RuleEvaluationResult> {
    const dailyLimitRaw  = parameters.daily_limit  as number | string | undefined;
    const monthlyLimitRaw = parameters.monthly_limit as number | string | undefined;
    if (!dailyLimitRaw && !monthlyLimitRaw) {
      return { ruleId, ruleType: RuleType.DAILY_MONTHLY_LIMIT, passed: true, reason: 'No limits configured' };
    }

    const now = new Date();
    const since24h  = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const since30d  = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Sum completed outbound transfers via platform payments in the time windows
    const [daily24h, daily30d] = await Promise.all([
      this.paymentRepo.createQueryBuilder('p')
        .where('p.token_id = :tokenId', { tokenId })
        .andWhere("p.status = 'completed'")
        .andWhere('p.created_at >= :since', { since: since24h })
        .andWhere(new Brackets(b => b
          .where("p.metadata->>'from_address' = :addr", { addr: fromAddress.toLowerCase() })
          .orWhere('p.user_id = :addr', { addr: fromAddress.toLowerCase() })))
        .select('SUM(CAST(p.token_amount AS DECIMAL))', 'total')
        .getRawOne(),
      this.paymentRepo.createQueryBuilder('p')
        .where('p.token_id = :tokenId', { tokenId })
        .andWhere("p.status = 'completed'")
        .andWhere('p.created_at >= :since', { since: since30d })
        .andWhere(new Brackets(b => b
          .where("p.metadata->>'from_address' = :addr", { addr: fromAddress.toLowerCase() })
          .orWhere('p.user_id = :addr', { addr: fromAddress.toLowerCase() })))
        .select('SUM(CAST(p.token_amount AS DECIMAL))', 'total')
        .getRawOne(),
    ]);

    const amountUnits = parseFloat(amount);
    const sent24h  = parseFloat(daily24h?.total  ?? '0');
    const sent30d  = parseFloat(daily30d?.total ?? '0');

    if (dailyLimitRaw) {
      const dailyLimit = parseFloat(String(dailyLimitRaw));
      if (sent24h + amountUnits > dailyLimit) {
        return {
          ruleId,
          ruleType: RuleType.DAILY_MONTHLY_LIMIT,
          passed: false,
          reason: `Daily limit of ${dailyLimit.toLocaleString()} tokens would be exceeded (sent today: ${sent24h.toFixed(2)})`,
        };
      }
    }

    if (monthlyLimitRaw) {
      const monthlyLimit = parseFloat(String(monthlyLimitRaw));
      if (sent30d + amountUnits > monthlyLimit) {
        return {
          ruleId,
          ruleType: RuleType.DAILY_MONTHLY_LIMIT,
          passed: false,
          reason: `Monthly limit of ${monthlyLimit.toLocaleString()} tokens would be exceeded (sent this month: ${sent30d.toFixed(2)})`,
        };
      }
    }

    return {
      ruleId,
      ruleType: RuleType.DAILY_MONTHLY_LIMIT,
      passed: true,
      reason: 'Daily/monthly transfer limits satisfied',
    };
  }

  /**
   * ExchangeMonthlyLimit: blocks when the sender's outbound volume to a registered
   * exchange address in the last 30d would exceed the configured cap.
   */
  private async evaluateExchangeMonthlyLimit(
    ruleId: string,
    tokenId: string,
    fromAddress: string,
    toAddress: string,
    amount: string,
    parameters: Record<string, unknown>,
  ): Promise<RuleEvaluationResult> {
    const exchangeAddresses = (parameters.exchange_addresses as string[]) ?? [];
    const monthlyLimitRaw   = parameters.monthly_limit as number | string | undefined;

    if (exchangeAddresses.length === 0 || !monthlyLimitRaw) {
      return { ruleId, ruleType: RuleType.EXCHANGE_MONTHLY_LIMIT, passed: true, reason: 'No exchange limits configured' };
    }

    // Only fire when sending TO a registered exchange
    const isExchange = exchangeAddresses.some(
      addr => addr.toLowerCase() === toAddress.toLowerCase()
    );
    if (!isExchange) {
      return { ruleId, ruleType: RuleType.EXCHANGE_MONTHLY_LIMIT, passed: true, reason: 'Receiver is not a registered exchange' };
    }

    const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const result = await this.paymentRepo.createQueryBuilder('p')
      .where('p.token_id = :tokenId', { tokenId })
      .andWhere("p.status = 'completed'")
      .andWhere('p.created_at >= :since', { since: since30d })
      .andWhere("p.metadata->>'to_address' IN (:...exchanges)", { exchanges: exchangeAddresses.map(a => a.toLowerCase()) })
      .andWhere(new Brackets(b => b
        .where("p.metadata->>'from_address' = :from", { from: fromAddress.toLowerCase() })
        .orWhere('p.user_id = :from', { from: fromAddress.toLowerCase() })))
      .select('SUM(CAST(p.token_amount AS DECIMAL))', 'total')
      .getRawOne();

    const amountUnits = parseFloat(amount);
    const sentThisMonth = parseFloat(result?.total ?? '0');
    const monthlyLimit  = parseFloat(String(monthlyLimitRaw));

    if (sentThisMonth + amountUnits > monthlyLimit) {
      return {
        ruleId,
        ruleType: RuleType.EXCHANGE_MONTHLY_LIMIT,
        passed: false,
        reason: `Exchange monthly deposit limit of ${monthlyLimit.toLocaleString()} tokens would be exceeded (sent this month: ${sentThisMonth.toFixed(2)})`,
      };
    }

    return {
      ruleId,
      ruleType: RuleType.EXCHANGE_MONTHLY_LIMIT,
      passed: true,
      reason: `Within exchange monthly deposit limit (${monthlyLimit.toLocaleString()} tokens/month)`,
    };
  }

  /**
   * TransferFee: computes the fee amount and net amount for the transfer.
   * Always passes (fees never block transfers) but returns fee details in the result.
   * Parameters: { fee_bps: number (1–10000), collector_address: string }
   */
  private async evaluateTransferFee(
    ruleId: string,
    tokenId: string,
    amount: string,
    parameters: Record<string, unknown>,
  ): Promise<RuleEvaluationResult> {
    const feeBps = Number(parameters.fee_bps ?? 0);
    const collectorAddress = (parameters.collector_address as string) ?? '';

    if (!feeBps || feeBps <= 0 || !collectorAddress) {
      return {
        ruleId,
        ruleType: RuleType.TRANSFER_FEE,
        passed: true,
        reason: 'No transfer fee configured',
      };
    }

    const token = await this.tokenRepo.findOne({ where: { id: tokenId } });
    const decimals = token?.decimals ?? 18;

    const amountWei = this.toBaseUnits(amount, decimals) ?? 0n;
    const feeWei = (amountWei * BigInt(feeBps)) / BigInt(10000);
    const netWei = amountWei - feeWei;

    const feeUnits = Number(feeWei) / 10 ** decimals;
    const netUnits = Number(netWei) / 10 ** decimals;
    const feePercent = feeBps / 100;

    return {
      ruleId,
      ruleType: RuleType.TRANSFER_FEE,
      passed: true,
      reason: `Transfer fee of ${feePercent}% applies (${feeUnits.toFixed(6)} ${token?.symbol ?? 'tokens'} to collector)`,
      fee: {
        feeBps,
        feePercent,
        feeAmount: feeUnits.toFixed(6),
        netAmount: netUnits.toFixed(6),
        collectorAddress,
      },
    };
  }

  /**
   * SenderWhitelist: blocks the transfer if the sender wallet is not in the
   * configured allowed-senders list.
   * Parameters: { allowed_senders: string[] }  (wallet addresses, case-insensitive)
   * Mints (fromAddress is '' or '0x000...') always pass.
   */
  private evaluateSenderWhitelist(
    ruleId: string,
    fromAddress: string,
    parameters: Record<string, unknown>,
  ): RuleEvaluationResult {
    const allowedSenders = (parameters.allowed_senders as string[] | undefined) ?? [];

    // Mint: no sender to restrict
    if (!fromAddress || fromAddress === '0x0000000000000000000000000000000000000000') {
      return {
        ruleId,
        ruleType: RuleType.SENDER_WHITELIST,
        passed: true,
        reason: 'Mint — sender whitelist does not apply',
      };
    }

    if (allowedSenders.length === 0) {
      return {
        ruleId,
        ruleType: RuleType.SENDER_WHITELIST,
        passed: true,
        reason: 'No sender whitelist configured — all senders allowed',
      };
    }

    const normalized = fromAddress.toLowerCase();
    const isAllowed = allowedSenders.some(a => a.toLowerCase() === normalized);

    if (!isAllowed) {
      return {
        ruleId,
        ruleType: RuleType.SENDER_WHITELIST,
        passed: false,
        reason: `Sender ${fromAddress} is not in the approved sender whitelist for this token`,
      };
    }

    return {
      ruleId,
      ruleType: RuleType.SENDER_WHITELIST,
      passed: true,
      reason: 'Sender is in the approved whitelist',
    };
  }
}
