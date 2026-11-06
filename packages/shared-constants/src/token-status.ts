/**
 * Token lifecycle statuses, valid state transitions,
 * and asset type configuration metadata.
 */

export const TOKEN_STATUS = {
  DRAFT: 'draft',
  PENDING_DEPLOYMENT: 'pending_deployment',
  DEPLOYING: 'deploying',
  DEPLOYED: 'deployed',
  PAUSED: 'paused',
  ARCHIVED: 'archived',
} as const;

export type TokenStatus = (typeof TOKEN_STATUS)[keyof typeof TOKEN_STATUS];

/**
 * Map of each token status to the statuses it may transition to.
 */
export const TOKEN_STATUS_TRANSITIONS: Record<TokenStatus, readonly TokenStatus[]> = {
  [TOKEN_STATUS.DRAFT]: [TOKEN_STATUS.PENDING_DEPLOYMENT, TOKEN_STATUS.ARCHIVED],
  [TOKEN_STATUS.PENDING_DEPLOYMENT]: [TOKEN_STATUS.DEPLOYING, TOKEN_STATUS.DRAFT],
  [TOKEN_STATUS.DEPLOYING]: [TOKEN_STATUS.DEPLOYED, TOKEN_STATUS.DRAFT],
  [TOKEN_STATUS.DEPLOYED]: [TOKEN_STATUS.PAUSED, TOKEN_STATUS.ARCHIVED],
  [TOKEN_STATUS.PAUSED]: [TOKEN_STATUS.DEPLOYED, TOKEN_STATUS.ARCHIVED],
  [TOKEN_STATUS.ARCHIVED]: [],
};

/** Validate whether a token status transition is allowed. */
export function isValidTokenTransition(from: TokenStatus, to: TokenStatus): boolean {
  return (TOKEN_STATUS_TRANSITIONS[from] as readonly string[]).includes(to);
}

// ---------------------------------------------------------------------------
// Asset Type Configuration
// ---------------------------------------------------------------------------

export interface AssetTypeConfig {
  readonly id: string;
  readonly displayName: string;
  readonly icon: string;
  readonly description: string;
}

export const ASSET_TYPE_CONFIG: Record<string, AssetTypeConfig> = {
  equity: {
    id: 'equity',
    displayName: 'Equity',
    icon: 'bar-chart-2',
    description: 'Tokenised equity shares representing ownership in a company',
  },

  bond: {
    id: 'bond',
    displayName: 'Bond',
    icon: 'landmark',
    description: 'Fixed-income debt instruments with defined maturity and coupon',
  },

  real_estate: {
    id: 'real_estate',
    displayName: 'Real Estate',
    icon: 'building',
    description: 'Fractional ownership tokens backed by real estate assets',
  },

  fund: {
    id: 'fund',
    displayName: 'Fund',
    icon: 'pie-chart',
    description: 'Tokenised fund units (venture capital, private equity, hedge fund)',
  },

  stablecoin: {
    id: 'stablecoin',
    displayName: 'Stablecoin',
    icon: 'dollar-sign',
    description: 'Fiat-backed or algorithmic stablecoin tokens',
  },

  commodity: {
    id: 'commodity',
    displayName: 'Commodity',
    icon: 'diamond',
    description: 'Tokens representing ownership of physical commodities (gold, silver, etc.)',
  },

  art: {
    id: 'art',
    displayName: 'Art & Collectibles',
    icon: 'palette',
    description: 'Fractional ownership of fine art and collectible items',
  },

  custom: {
    id: 'custom',
    displayName: 'Custom Asset',
    icon: 'box',
    description: 'Custom asset type with user-defined properties',
  },
} as const;
