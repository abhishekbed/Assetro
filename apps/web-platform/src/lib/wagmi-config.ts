import { http, createConfig, createStorage, noopStorage } from 'wagmi';
import { mainnet, polygon, sepolia } from 'wagmi/chains';
import { defineChain } from 'viem';
import { injected, walletConnect } from 'wagmi/connectors';

export const polygonAmoy = defineChain({
  id: 80002,
  name: 'Polygon Amoy',
  nativeCurrency: {
    decimals: 18,
    name: 'POL',
    symbol: 'POL',
  },
  rpcUrls: {
    default: {
      http: [process.env.NEXT_PUBLIC_POLYGON_AMOY_RPC_URL || 'https://rpc-amoy.polygon.technology'],
    },
  },
  blockExplorers: {
    default: {
      name: 'PolygonScan',
      url: 'https://amoy.polygonscan.com',
    },
  },
  testnet: true,
});

export const bharatChain = defineChain({
  id: 8272,
  name: 'Bharat Blockchain',
  nativeCurrency: {
    decimals: 18,
    name: 'Bharat Token',
    symbol: 'BHT',
  },
  rpcUrls: {
    default: {
      http: [process.env.NEXT_PUBLIC_BHARAT_RPC_URL || 'https://rpc.bharatblockchain.io'],
    },
  },
  blockExplorers: {
    default: {
      name: 'Bharat Explorer',
      url: 'https://explorer.bharatblockchain.io',
    },
  },
  testnet: false,
});

export const arcTestnet = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: {
    default: {
      http: [process.env.NEXT_PUBLIC_RPC_URL_5042002 || 'https://rpc.testnet.arc.network'],
    },
  },
  blockExplorers: {
    default: { name: 'ArcScan', url: 'https://testnet.arcscan.app' },
  },
  testnet: true,
});

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || '';
const isBrowser = typeof window !== 'undefined';

/** Chains the issuer deployment flows offer; also the app's full chain set. */
export const issuerSupportedChains = [
  arcTestnet,
  mainnet,
  sepolia,
  polygon,
  polygonAmoy,
  bharatChain,
] as const;

export const wagmiConfig = createConfig({
  chains: issuerSupportedChains,
  storage: createStorage({
    // localStorage (not sessionStorage) so the connection survives reloads and new tabs;
    // disconnectWallet() clears it on logout.
    storage: isBrowser ? window.localStorage : noopStorage,
    key: 'assetro_wallet',
  }),
  connectors: [
    injected({
      shimDisconnect: true,
    }),
    ...(isBrowser && projectId
      ? [
          walletConnect({
            projectId,
            metadata: {
              name: 'Assetro Platform',
              description: 'Tokenization platform for real-world assets',
              url: 'https://assetro.io',
              icons: ['https://assetro.io/favicon.ico'],
            },
          }),
        ]
      : []),
  ],
  transports: {
    [arcTestnet.id]: http(
      process.env.NEXT_PUBLIC_RPC_URL_5042002 || 'https://rpc.testnet.arc.network'
    ),
    [mainnet.id]: http(),
    [sepolia.id]: http(
      process.env.NEXT_PUBLIC_RPC_URL_11155111 || 'https://rpc.sepolia.org'
    ),
    [polygon.id]: http(),
    [polygonAmoy.id]: http(
      process.env.NEXT_PUBLIC_POLYGON_AMOY_RPC_URL || 'https://rpc-amoy.polygon.technology'
    ),
    [bharatChain.id]: http(),
  },
});
