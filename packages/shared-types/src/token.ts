/**
 * Security token types aligned with the ERC-3643 (T-REX) standard.
 */

/** Lifecycle status of a security token */
export enum TokenStatus {
  /** Token configuration saved but not yet deployed on-chain */
  DRAFT = 'draft',
  /** Smart contract deployment transaction submitted */
  DEPLOYING = 'deploying',
  /** Token is deployed and operational */
  ACTIVE = 'active',
  /** Token transfers are temporarily paused by the issuer */
  PAUSED = 'paused',
  /** Token is fully frozen by compliance or regulatory action */
  FROZEN = 'frozen',
}

/** Asset class the token represents */
export enum AssetType {
  EQUITY = 'equity',
  REAL_ESTATE = 'real_estate',
  FUND = 'fund',
  DEBT = 'debt',
  COMMODITY = 'commodity',
}

/** Security token entity */
export interface Token {
  /** UUID */
  id: string;
  /** UUID of the issuing tenant */
  tenantId: string;
  /** On-chain token name (e.g. "Acme Corp Series A") */
  name: string;
  /** On-chain token symbol (e.g. "ACME-A") */
  symbol: string;
  /** ERC-20 decimals (typically 18 for equity, 0 for whole units) */
  decimals: number;
  status: TokenStatus;
  assetType: AssetType;
  /** Total supply currently minted (raw units as string to avoid precision loss) */
  totalSupply: string;
  /** Maximum supply that can ever be minted (null = unlimited) */
  maxSupply: string | null;
  /** Chain ID where the token is deployed */
  chainId: number | null;
  /** On-chain token contract address */
  contractAddress: string | null;
  /** Full set of deployed T-REX contract addresses */
  deployment: TokenDeployment | null;
  /** Human-readable description of the offering */
  description: string;
  /** URL to the token's legal documentation / prospectus */
  documentUrl: string | null;
  /** URL to the token's image/logo */
  imageUrl: string | null;
  /** UUID of the user who created the token */
  createdBy: string;
  /** ISO 8601 */
  createdAt: string;
  /** ISO 8601 */
  updatedAt: string;
}

/** Request payload for creating a new token in draft status */
export interface CreateTokenDto {
  name: string;
  symbol: string;
  decimals: number;
  assetType: AssetType;
  /** Maximum supply (null = unlimited) */
  maxSupply?: string | null;
  description: string;
  documentUrl?: string;
  imageUrl?: string;
}

/** Request payload for deploying a draft token on-chain */
export interface DeployTokenDto {
  /** UUID of the token to deploy */
  tokenId: string;
  /** Target chain ID */
  chainId: number;
  /** Initial compliance rules to configure during deployment */
  complianceModules?: string[];
  /** Country codes to restrict during deployment (ISO 3166-1 numeric) */
  initialCountryRestrictions?: number[];
}

/** Request payload for minting new tokens to an investor */
export interface MintTokenDto {
  /** UUID of the token */
  tokenId: string;
  /** Recipient wallet address (must be whitelisted) */
  toAddress: string;
  /** Amount to mint (raw units as string) */
  amount: string;
}

/**
 * Addresses of all T-REX framework contracts deployed for a token.
 * See ERC-3643 specification for contract responsibilities.
 */
export interface TokenDeployment {
  /** ERC-3643 token contract address */
  tokenAddress: string;
  /** Identity Registry contract address */
  identityRegistryAddress: string;
  /** Identity Registry Storage contract address */
  identityRegistryStorageAddress: string;
  /** Modular Compliance contract address */
  complianceAddress: string;
  /** Trusted Issuers Registry contract address */
  trustedIssuersRegistryAddress: string;
  /** Claim Topics Registry contract address */
  claimTopicsRegistryAddress: string;
  /** ONCHAINID Identity contract address for the token issuer */
  issuerIdentityAddress: string;
  /** Block number at which the contracts were deployed */
  deploymentBlock: number;
  /** Transaction hash of the deployment transaction */
  deploymentTxHash: string;
}

/** A single entry in a token's capitalization table */
export interface CapTableEntry {
  /** UUID */
  id: string;
  /** UUID of the token */
  tokenId: string;
  /** Investor wallet address */
  walletAddress: string;
  /** UUID of the investor user, if known */
  userId: string | null;
  /** Token balance held (raw units as string) */
  balance: string;
  /** Percentage of total supply held */
  percentageOwnership: number;
  /** ISO 8601 timestamp of the investor's first token receipt */
  firstAcquiredAt: string;
  /** ISO 8601 timestamp of the most recent balance change */
  lastUpdatedAt: string;
}
