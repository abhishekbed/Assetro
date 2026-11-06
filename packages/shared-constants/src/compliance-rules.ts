/**
 * Compliance rule type definitions and claim topic mappings used
 * throughout the Assetro tokenization platform.
 */

export interface ComplianceRuleParamSchema {
  readonly type: 'string' | 'number' | 'boolean' | 'string[]' | 'number[]';
  readonly label: string;
  readonly required: boolean;
}

export interface ComplianceRuleType {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly defaultParams: Record<string, unknown>;
  readonly paramSchema: Record<string, ComplianceRuleParamSchema>;
}

export const COMPLIANCE_RULE_TYPES: Record<string, ComplianceRuleType> = {
  country_restriction: {
    id: 'country_restriction',
    label: 'Country Restriction',
    description: 'Restrict token transfers to or from specific countries',
    defaultParams: {
      blockedCountries: [],
      mode: 'blocklist',
    },
    paramSchema: {
      blockedCountries: {
        type: 'string[]',
        label: 'Blocked Countries (ISO 3166-1 alpha-2)',
        required: true,
      },
      mode: {
        type: 'string',
        label: 'Mode (blocklist | allowlist)',
        required: true,
      },
    },
  },

  investor_limit: {
    id: 'investor_limit',
    label: 'Investor Limit',
    description: 'Set a maximum number of token holders',
    defaultParams: {
      maxInvestors: 500,
    },
    paramSchema: {
      maxInvestors: {
        type: 'number',
        label: 'Maximum Number of Investors',
        required: true,
      },
    },
  },

  min_holding_period: {
    id: 'min_holding_period',
    label: 'Minimum Holding Period',
    description: 'Enforce a lock-up period before tokens can be transferred',
    defaultParams: {
      durationDays: 365,
    },
    paramSchema: {
      durationDays: {
        type: 'number',
        label: 'Holding Period (days)',
        required: true,
      },
    },
  },

  max_balance: {
    id: 'max_balance',
    label: 'Maximum Balance',
    description: 'Limit the maximum token balance per investor',
    defaultParams: {
      maxBalance: '1000000',
    },
    paramSchema: {
      maxBalance: {
        type: 'string',
        label: 'Maximum Balance (token units)',
        required: true,
      },
    },
  },

  accredited_investor: {
    id: 'accredited_investor',
    label: 'Accredited Investor Only',
    description: 'Restrict transfers to accredited or qualified investors only',
    defaultParams: {
      requireAccreditation: true,
    },
    paramSchema: {
      requireAccreditation: {
        type: 'boolean',
        label: 'Require Accreditation',
        required: true,
      },
    },
  },

  transfer_amount_limit: {
    id: 'transfer_amount_limit',
    label: 'Transfer Amount Limit',
    description: 'Set minimum and maximum amounts for a single transfer',
    defaultParams: {
      minAmount: '1',
      maxAmount: '100000',
    },
    paramSchema: {
      minAmount: {
        type: 'string',
        label: 'Minimum Transfer Amount',
        required: true,
      },
      maxAmount: {
        type: 'string',
        label: 'Maximum Transfer Amount',
        required: true,
      },
    },
  },

  time_based_restriction: {
    id: 'time_based_restriction',
    label: 'Time-Based Transfer Restriction',
    description: 'Allow transfers only within specified date windows',
    defaultParams: {
      allowedFromHour: 0,
      allowedToHour: 24,
    },
    paramSchema: {
      allowedFromHour: {
        type: 'number',
        label: 'Allowed From Hour (UTC, 0-23)',
        required: true,
      },
      allowedToHour: {
        type: 'number',
        label: 'Allowed To Hour (UTC, 1-24)',
        required: true,
      },
    },
  },
} as const;

// ---------------------------------------------------------------------------
// Claim Topics — ERC-735 / T-REX compatible topic identifiers
// ---------------------------------------------------------------------------

export interface ClaimTopicDefinition {
  readonly id: number;
  readonly name: string;
  readonly description: string;
}

export const CLAIM_TOPICS: Record<number, ClaimTopicDefinition> = {
  1: {
    id: 1,
    name: 'KYC',
    description: 'Know Your Customer identity verification',
  },
  2: {
    id: 2,
    name: 'AML',
    description: 'Anti-Money Laundering screening clearance',
  },
  3: {
    id: 3,
    name: 'Accredited',
    description: 'Accredited or qualified investor status',
  },
  4: {
    id: 4,
    name: 'Country',
    description: 'Country of residence or incorporation',
  },
  5: {
    id: 5,
    name: 'Age',
    description: 'Age verification (minimum age requirement)',
  },
  10: {
    id: 10,
    name: 'Institutional',
    description: 'Institutional investor classification',
  },
} as const;

/** Convenience lookup: topic ID to human-readable name. */
export function getClaimTopicName(topicId: number): string | undefined {
  return CLAIM_TOPICS[topicId]?.name;
}
