/**
 * Blockchain networks supported by the Assetro platform.
 */

export interface ChainConfig {
  readonly id: string;
  readonly name: string;
  readonly chainId: number;
  readonly rpcUrl: string;
  readonly explorerUrl: string;
  readonly isTestnet: boolean;
  readonly nativeCurrency: {
    readonly name: string;
    readonly symbol: string;
    readonly decimals: number;
  };
}

export const SUPPORTED_CHAINS: readonly ChainConfig[] = [
  {
    id: 'arc-testnet',
    name: 'Arc Testnet',
    chainId: 5042002,
    rpcUrl: 'https://rpc.testnet.arc.network',
    explorerUrl: 'https://testnet.arcscan.app',
    isTestnet: true,
    nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  },
  {
    id: 'ethereum-mainnet',
    name: 'Ethereum Mainnet',
    chainId: 1,
    rpcUrl: 'https://mainnet.infura.io/v3/YOUR_API_KEY',
    explorerUrl: 'https://etherscan.io',
    isTestnet: false,
    nativeCurrency: {
      name: 'Ether',
      symbol: 'ETH',
      decimals: 18,
    },
  },
  {
    id: 'ethereum-sepolia',
    name: 'Ethereum Sepolia',
    chainId: 11155111,
    rpcUrl: 'https://sepolia.infura.io/v3/YOUR_API_KEY',
    explorerUrl: 'https://sepolia.etherscan.io',
    isTestnet: true,
    nativeCurrency: {
      name: 'Sepolia Ether',
      symbol: 'ETH',
      decimals: 18,
    },
  },
  {
    id: 'polygon-mainnet',
    name: 'Polygon Mainnet',
    chainId: 137,
    rpcUrl: 'https://polygon-rpc.com',
    explorerUrl: 'https://polygonscan.com',
    isTestnet: false,
    nativeCurrency: {
      name: 'POL',
      symbol: 'POL',
      decimals: 18,
    },
  },
  {
    id: 'polygon-amoy',
    name: 'Polygon Amoy',
    chainId: 80002,
    rpcUrl: 'https://rpc-amoy.polygon.technology',
    explorerUrl: 'https://amoy.polygonscan.com',
    isTestnet: true,
    nativeCurrency: {
      name: 'POL',
      symbol: 'POL',
      decimals: 18,
    },
  },
  {
    id: 'bharat-blockchain',
    name: 'Bharat Blockchain',
    chainId: 8272,
    rpcUrl: 'https://rpc.bharatblockchain.io',
    explorerUrl: 'https://explorer.bharatblockchain.io',
    isTestnet: false,
    nativeCurrency: {
      name: 'Bharat Token',
      symbol: 'BHT',
      decimals: 18,
    },
  },
] as const;

/** Look up a chain configuration by its numeric chain ID. */
export function getChainById(chainId: number): ChainConfig | undefined {
  return SUPPORTED_CHAINS.find((c) => c.chainId === chainId);
}

/** Look up a chain configuration by its string identifier. */
export function getChainByStringId(id: string): ChainConfig | undefined {
  return SUPPORTED_CHAINS.find((c) => c.id === id);
}

/** All supported chain IDs as a set for fast membership checks. */
export const SUPPORTED_CHAIN_IDS: ReadonlySet<number> = new Set(
  SUPPORTED_CHAINS.map((c) => c.chainId),
);
