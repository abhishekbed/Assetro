/**
 * Compliance rule and transfer restriction types for ERC-3643 modular compliance.
 */

/** Types of compliance rules that can be configured per token */
export enum RuleType {
  /** Restrict transfers to/from specific countries (ISO 3166-1 numeric) */
  COUNTRY_RESTRICTION = 'country_restriction',
  /** Limit the maximum number of token holders */
  INVESTOR_LIMIT = 'investor_limit',
  /** Custom transfer restrictions (e.g. lock-up periods, max transfer size) */
  TRANSFER_RESTRICTION = 'transfer_restriction',
  /** Restrict transfers based on investor classification (accredited, qualified, etc.) */
  INVESTOR_CLASS = 'investor_class',
  /** Time-based restrictions (e.g. holding period, trading windows) */
  TIME_BASED = 'time_based',
}

/** Status of a wallet on the identity registry whitelist */
export enum WhitelistStatus {
  /** Wallet is approved and can hold/transfer tokens */
  ACTIVE = 'active',
  /** Whitelist entry has been revoked */
  REVOKED = 'revoked',
  /** Whitelist entry is pending on-chain confirmation */
  PENDING = 'pending',
}

/** A compliance rule configured for a specific token */
export interface ComplianceRule {
  /** UUID */
  id: string;
  /** UUID of the token this rule applies to */
  tokenId: string;
  /** UUID of the tenant */
  tenantId: string;
  ruleType: RuleType;
  /** Human-readable rule name */
  name: string;
  /** Human-readable description of the rule's effect */
  description: string;
  /**
   * Rule-specific configuration parameters.
   * Structure depends on ruleType:
   * - COUNTRY_RESTRICTION: { restrictedCountries: number[] }
   * - INVESTOR_LIMIT: { maxInvestors: number }
   * - TRANSFER_RESTRICTION: { maxTransferAmount?: string, minHoldingPeriodDays?: number }
   * - INVESTOR_CLASS: { allowedClasses: string[] }
   * - TIME_BASED: { startDate?: string, endDate?: string, lockUpDays?: number }
   */
  parameters: Record<string, unknown>;
  /** Whether this rule is currently enforced */
  isActive: boolean;
  /** On-chain compliance module address implementing this rule (null if off-chain only) */
  onChainModuleAddress: string | null;
  /** ISO 8601 */
  createdAt: string;
  /** ISO 8601 */
  updatedAt: string;
}

/** Request payload for creating a new compliance rule */
export interface CreateRuleDto {
  /** UUID of the token */
  tokenId: string;
  ruleType: RuleType;
  name: string;
  description?: string;
  parameters: Record<string, unknown>;
  isActive?: boolean;
}

/** An entry in the token's identity registry whitelist */
export interface WhitelistEntry {
  /** UUID */
  id: string;
  /** UUID of the token */
  tokenId: string;
  /** UUID of the tenant */
  tenantId: string;
  /** Investor wallet address */
  walletAddress: string;
  /** UUID of the investor user */
  userId: string;
  status: WhitelistStatus;
  /** ISO 3166-1 numeric country code of the investor */
  investorCountry: number;
  /** On-chain ONCHAINID identity contract address */
  identityAddress: string | null;
  /** Transaction hash of the on-chain whitelist registration */
  registrationTxHash: string | null;
  /** ISO 8601 */
  createdAt: string;
  /** ISO 8601 */
  updatedAt: string;
}

/** Request to check whether a proposed transfer would pass compliance */
export interface TransferCheckRequest {
  /** UUID of the token being transferred */
  tokenId: string;
  /** Sender wallet address */
  fromAddress: string;
  /** Recipient wallet address */
  toAddress: string;
  /** Transfer amount (raw units as string) */
  amount: string;
}

/** Result of a single compliance rule check */
export interface TransferCheckResult {
  /** UUID of the rule that was evaluated */
  ruleId: string;
  ruleName: string;
  ruleType: RuleType;
  /** Whether the transfer passed this rule */
  passed: boolean;
  /** Human-readable reason if the check failed */
  reason: string | null;
}

/** Aggregated response from a transfer compliance check */
export interface TransferCheckResponse {
  /** Whether the transfer passes all compliance rules */
  isCompliant: boolean;
  /** Individual results from each compliance rule */
  results: TransferCheckResult[];
  /** ISO 8601 timestamp of when the check was performed */
  checkedAt: string;
}
