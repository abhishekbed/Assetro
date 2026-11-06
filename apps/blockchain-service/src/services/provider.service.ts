import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';

interface ChainConfig {
  rpcUrl: string;
  name: string;
  nativeCurrency: string;
}

const DEFAULT_CHAINS: Record<number, ChainConfig> = {
  1: { rpcUrl: '', name: 'Ethereum Mainnet', nativeCurrency: 'ETH' },
  5: { rpcUrl: '', name: 'Goerli Testnet', nativeCurrency: 'ETH' },
  11155111: { rpcUrl: '', name: 'Sepolia Testnet', nativeCurrency: 'ETH' },
  137: { rpcUrl: '', name: 'Polygon Mainnet', nativeCurrency: 'MATIC' },
  80001: { rpcUrl: '', name: 'Polygon Mumbai', nativeCurrency: 'MATIC' },
};

@Injectable()
export class ProviderService implements OnModuleDestroy {
  private readonly logger = new Logger(ProviderService.name);
  private readonly providers = new Map<number, ethers.JsonRpcProvider>();
  private readonly signers = new Map<number, ethers.Wallet>();

  constructor(private readonly configService: ConfigService) {}

  getProvider(chainId: number): ethers.JsonRpcProvider {
    const existing = this.providers.get(chainId);
    if (existing) {
      return existing;
    }

    const rpcUrl = this.resolveRpcUrl(chainId);
    if (!rpcUrl) {
      throw new Error(`No RPC URL configured for chain ${chainId}`);
    }

    const provider = new ethers.JsonRpcProvider(rpcUrl, chainId);
    this.providers.set(chainId, provider);
    this.logger.log(`Provider initialized for chain ${chainId}`);

    return provider;
  }

  getSigner(chainId: number): ethers.Wallet {
    const existing = this.signers.get(chainId);
    if (existing) {
      return existing;
    }

    const privateKey = this.configService.get<string>('DEPLOYER_PRIVATE_KEY');
    if (!privateKey) {
      throw new Error('DEPLOYER_PRIVATE_KEY is not configured');
    }

    const provider = this.getProvider(chainId);
    const signer = new ethers.Wallet(privateKey, provider);
    this.signers.set(chainId, signer);
    this.logger.log(`Signer initialized for chain ${chainId}: ${signer.address}`);

    return signer;
  }

  getSupportedChains(): Array<{ chainId: number; name: string; nativeCurrency: string }> {
    const chains: Array<{ chainId: number; name: string; nativeCurrency: string }> = [];

    for (const [chainIdStr, config] of Object.entries(DEFAULT_CHAINS)) {
      const chainId = parseInt(chainIdStr, 10);
      const rpcUrl = this.resolveRpcUrl(chainId);
      if (rpcUrl) {
        chains.push({
          chainId,
          name: config.name,
          nativeCurrency: config.nativeCurrency,
        });
      }
    }

    return chains;
  }

  async getChainStatus(
    chainId: number,
  ): Promise<{ chainId: number; blockNumber: number; gasPrice: string; connected: boolean }> {
    try {
      const provider = this.getProvider(chainId);
      const [blockNumber, feeData] = await Promise.all([
        provider.getBlockNumber(),
        provider.getFeeData(),
      ]);

      return {
        chainId,
        blockNumber,
        gasPrice: feeData.gasPrice?.toString() || '0',
        connected: true,
      };
    } catch (error) {
      this.logger.error(`Failed to get chain status for ${chainId}: ${error}`);
      return {
        chainId,
        blockNumber: 0,
        gasPrice: '0',
        connected: false,
      };
    }
  }

  private resolveRpcUrl(chainId: number): string | undefined {
    // Check for chain-specific env variable first
    const envKey = `RPC_URL_${chainId}`;
    const specificUrl = this.configService.get<string>(envKey);
    if (specificUrl) {
      return specificUrl;
    }

    // Fall back to default chain config
    const chainConfig = DEFAULT_CHAINS[chainId];
    return chainConfig?.rpcUrl || undefined;
  }

  onModuleDestroy() {
    for (const [chainId, provider] of this.providers) {
      provider.destroy();
      this.logger.log(`Provider destroyed for chain ${chainId}`);
    }
    this.providers.clear();
    this.signers.clear();
  }
}
