/**
 * Blockchain interaction and transaction types.
 */

/** Supported EVM-compatible chains */
export interface SupportedChain {
  /** EIP-155 chain ID */
  chainId: number;
  /** Human-readable chain name */
  name: string;
  /** Short name for display (e.g. "ETH", "MATIC") */
  shortName: string;
  /** Native currency symbol */
  nativeCurrency: string;
  /** JSON-RPC endpoint URL */
  rpcUrl: string;
  /** Block explorer base URL */
  explorerUrl: string;
  /** Whether this chain is a testnet */
  isTestnet: boolean;
  /** Whether the platform currently supports deployment to this chain */
  isActive: boolean;
}

/** On-chain transaction types tracked by the platform */
export enum TransactionType {
  MINT = 'mint',
  BURN = 'burn',
  TRANSFER = 'transfer',
  FREEZE = 'freeze',
  UNFREEZE = 'unfreeze',
  PAUSE = 'pause',
  UNPAUSE = 'unpause',
}

/** Status of a blockchain transaction */
export enum TransactionStatus {
  /** Transaction built but not yet submitted */
  PENDING = 'pending',
  /** Transaction submitted to the network, awaiting confirmation */
  SUBMITTED = 'submitted',
  /** Transaction included in a block and confirmed */
  CONFIRMED = 'confirmed',
  /** Transaction reverted on-chain */
  FAILED = 'failed',
}

/** Record of a blockchain transaction initiated by the platform */
export interface Transaction {
  /** UUID */
  id: string;
  /** UUID of the tenant */
  tenantId: string;
  /** UUID of the token involved */
  tokenId: string;
  type: TransactionType;
  status: TransactionStatus;
  /** EIP-155 chain ID */
  chainId: number;
  /** Transaction hash (null until submitted) */
  txHash: string | null;
  /** Block number the transaction was included in (null until confirmed) */
  blockNumber: number | null;
  /** Sender address */
  fromAddress: string;
  /** Recipient address (null for pause/unpause operations) */
  toAddress: string | null;
  /** Token amount involved (raw units as string, null for pause/unpause) */
  amount: string | null;
  /** Gas used by the transaction (null until confirmed) */
  gasUsed: string | null;
  /** Effective gas price in wei (null until confirmed) */
  gasPrice: string | null;
  /** Error message if the transaction failed */
  errorMessage: string | null;
  /** UUID of the user who initiated the transaction */
  initiatedBy: string;
  /** ISO 8601 */
  createdAt: string;
  /** ISO 8601 */
  updatedAt: string;
}

/** Request payload for deploying T-REX contracts */
export interface DeployContractDto {
  /** UUID of the token to deploy */
  tokenId: string;
  /** Target chain ID */
  chainId: number;
  /** Deployer wallet address */
  deployerAddress: string;
  /** Initial compliance module identifiers to include */
  complianceModules: string[];
  /** Country codes to restrict (ISO 3166-1 numeric) */
  countryRestrictions: number[];
}

/**
 * Deployed contract addresses for a T-REX token suite.
 * Mirrors TokenDeployment but used in blockchain-specific contexts.
 */
export interface ContractAddresses {
  /** ERC-3643 token proxy address */
  token: string;
  /** Identity Registry proxy address */
  identityRegistry: string;
  /** Identity Registry Storage address */
  identityRegistryStorage: string;
  /** Modular Compliance proxy address */
  compliance: string;
  /** Trusted Issuers Registry address */
  trustedIssuersRegistry: string;
  /** Claim Topics Registry address */
  claimTopicsRegistry: string;
  /** Issuer ONCHAINID identity address */
  issuerIdentity: string;
}
