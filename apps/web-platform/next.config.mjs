import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRootEnvPath = path.resolve(
  __dirname,
  '../..',
  process.env.NODE_ENV === 'production' ? '.env' : '.env.local',
);

function loadRootEnvFile(envPath) {
  if (!fs.existsSync(envPath)) {
    return;
  }

  const envContent = fs.readFileSync(envPath, 'utf8');

  for (const rawLine of envContent.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const separatorIndex = line.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    if (!key || process.env[key] !== undefined) {
      continue;
    }

    const normalizedValue =
      value.startsWith('"') && value.endsWith('"')
        ? value.slice(1, -1)
        : value.startsWith("'") && value.endsWith("'")
        ? value.slice(1, -1)
        : value;

    process.env[key] = normalizedValue;
  }
}

loadRootEnvFile(repoRootEnvPath);

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    optimizePackageImports: [
      'lucide-react',
      'recharts',
      'date-fns',
      'wagmi',
      'viem',
      '@tanstack/react-query',
    ],
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  env: {
    NEXT_PUBLIC_API_URL:
      process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1',
    NEXT_PUBLIC_DEFAULT_CHAIN_ID:
      process.env.NEXT_PUBLIC_DEFAULT_CHAIN_ID || '11155111',
    NEXT_PUBLIC_RPC_URL_5042002:
      process.env.NEXT_PUBLIC_RPC_URL_5042002 ||
      process.env.ARC_TESTNET_RPC_URL ||
      'https://rpc.testnet.arc.network',
    NEXT_PUBLIC_TREX_FACTORY_ADDRESS_5042002:
      process.env.NEXT_PUBLIC_TREX_FACTORY_ADDRESS_5042002 || '',
    NEXT_PUBLIC_TOKEN_FACTORY_ADDRESS_5042002:
      process.env.NEXT_PUBLIC_TOKEN_FACTORY_ADDRESS_5042002 || '',
    NEXT_PUBLIC_TREX_GATEWAY_ADDRESS_5042002:
      process.env.NEXT_PUBLIC_TREX_GATEWAY_ADDRESS_5042002 || '',
    NEXT_PUBLIC_ID_FACTORY_ADDRESS_5042002:
      process.env.NEXT_PUBLIC_ID_FACTORY_ADDRESS_5042002 || '',
    NEXT_PUBLIC_OID_GATEWAY_ADDRESS_5042002:
      process.env.NEXT_PUBLIC_OID_GATEWAY_ADDRESS_5042002 || '',
    NEXT_PUBLIC_CLAIM_ISSUER_ADDRESS_5042002:
      process.env.NEXT_PUBLIC_CLAIM_ISSUER_ADDRESS_5042002 || '',
    NEXT_PUBLIC_RPC_URL_11155111:
      process.env.NEXT_PUBLIC_RPC_URL_11155111 ||
      process.env.NEXT_PUBLIC_ETHEREUM_TESTNET_RPC_URL ||
      process.env.SEPOLIA_RPC_URL ||
      process.env.ETHEREUM_TESTNET_RPC_URL ||
      'https://rpc.sepolia.org',
    NEXT_PUBLIC_TOKEN_FACTORY_ADDRESS_11155111:
      process.env.NEXT_PUBLIC_TOKEN_FACTORY_ADDRESS_11155111 ||
      process.env.NEXT_PUBLIC_TREX_FACTORY_ADDRESS_11155111 ||
      process.env.NEXT_PUBLIC_SEPOLIA_FACTORY_ADDRESS ||
      process.env.SEPOLIA_FACTORY_ADDRESS ||
      process.env.FACTORY_ADDRESS ||
      '',
    NEXT_PUBLIC_SEPOLIA_FACTORY_ADDRESS:
      process.env.NEXT_PUBLIC_SEPOLIA_FACTORY_ADDRESS ||
      process.env.NEXT_PUBLIC_TREX_FACTORY_ADDRESS_11155111 ||
      process.env.SEPOLIA_FACTORY_ADDRESS ||
      process.env.FACTORY_ADDRESS ||
      '',
    NEXT_PUBLIC_SEPOLIA_TOKEN_PROXY_ADDRESS:
      process.env.NEXT_PUBLIC_SEPOLIA_TOKEN_PROXY_ADDRESS ||
      process.env.SEPOLIA_TOKEN_PROXY_ADDRESS ||
      '',
    NEXT_PUBLIC_SEPOLIA_IDENTITY_REGISTRY_ADDRESS:
      process.env.NEXT_PUBLIC_SEPOLIA_IDENTITY_REGISTRY_ADDRESS ||
      process.env.SEPOLIA_IDENTITY_REGISTRY_ADDRESS ||
      '',
    NEXT_PUBLIC_SEPOLIA_CLAIM_TOPICS_REGISTRY_ADDRESS:
      process.env.NEXT_PUBLIC_SEPOLIA_CLAIM_TOPICS_REGISTRY_ADDRESS ||
      process.env.SEPOLIA_CLAIM_TOPICS_REGISTRY_ADDRESS ||
      '',
    NEXT_PUBLIC_SEPOLIA_TRUSTED_ISSUERS_REGISTRY_ADDRESS:
      process.env.NEXT_PUBLIC_SEPOLIA_TRUSTED_ISSUERS_REGISTRY_ADDRESS ||
      process.env.SEPOLIA_TRUSTED_ISSUERS_REGISTRY_ADDRESS ||
      '',
    NEXT_PUBLIC_SEPOLIA_MODULAR_COMPLIANCE_ADDRESS:
      process.env.NEXT_PUBLIC_SEPOLIA_MODULAR_COMPLIANCE_ADDRESS ||
      process.env.SEPOLIA_MODULAR_COMPLIANCE_ADDRESS ||
      '',
    NEXT_PUBLIC_TREX_GATEWAY_ADDRESS_11155111:
      process.env.NEXT_PUBLIC_TREX_GATEWAY_ADDRESS_11155111 || '',
    NEXT_PUBLIC_PLATFORM_AGENT_ADDRESS:
      process.env.NEXT_PUBLIC_PLATFORM_AGENT_ADDRESS ||
      process.env.PLATFORM_AGENT_ADDRESS ||
      '0xea2Fe42e772784807C33DF5FD7D25D7021244048',
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      'pino-pretty': false,
      '@react-native-async-storage/async-storage': false,
    };
    config.externals.push('pino-pretty', 'encoding');
    return config;
  },
  async redirects() {
    return [
      {
        source: '/login',
        destination: '/investor/login',
        permanent: false,
      },
      {
        source: '/register',
        destination: '/investor/register',
        permanent: false,
      },
    ];
  },
  async rewrites() {
    const rawApiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';
    const origin = rawApiUrl.replace(/\/api\/v1\/?$/, '');
    return [
      {
        source: '/api/v1/uploads/:path*',
        destination: `${origin}/api/v1/uploads/:path*`,
      },
      {
        source: '/uploads/:path*',
        destination: `${origin}/uploads/:path*`,
      },
    ];
  },
};

export default nextConfig;
