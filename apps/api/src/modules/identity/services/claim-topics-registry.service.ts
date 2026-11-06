import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';

const CLAIM_TOPICS_REGISTRY_ABI = [
  'function addClaimTopic(uint256 _claimTopic) external',
  'function removeClaimTopic(uint256 _claimTopic) external',
  'function getClaimTopics() external view returns (uint256[] memory)',
];

@Injectable()
export class ClaimTopicsRegistryService {
  private readonly logger = new Logger(ClaimTopicsRegistryService.name);
  private provider: ethers.JsonRpcProvider | null = null;
  private signer: ethers.Wallet | null = null;

  constructor(private readonly config: ConfigService) {}

  private getProvider(): ethers.JsonRpcProvider {
    if (!this.provider) {
      const rpcUrl =
        this.config.get<string>('SEPOLIA_RPC_URL') ||
        this.config.get<string>('NEXT_PUBLIC_ETHEREUM_TESTNET_RPC_URL');
      if (!rpcUrl) throw new InternalServerErrorException('RPC URL not configured');
      this.provider = new ethers.JsonRpcProvider(rpcUrl, undefined, { staticNetwork: true });
    }
    return this.provider;
  }

  private getSigner(): ethers.Wallet {
    if (!this.signer) {
      const pk = this.config.get<string>('DEPLOYER_PRIVATE_KEY');
      if (!pk) throw new InternalServerErrorException('DEPLOYER_PRIVATE_KEY not configured');
      this.signer = new ethers.Wallet(pk.startsWith('0x') ? pk : `0x${pk}`, this.getProvider());
    }
    return this.signer;
  }

  /**
   * Register required claim topics on a token's ClaimTopicsRegistry.
   * Called once after token deployment. No-op in local mode.
   */
  async setupTopics(claimTopicsAddress: string, topics: number[]): Promise<void> {
    const blockchainMode = this.config.get<string>('BLOCKCHAIN_MODE', 'local');

    if (blockchainMode === 'local') {
      this.logger.warn(
        `LOCAL mode: skip setupTopics on CTR ${claimTopicsAddress} for topics=[${topics}]`,
      );
      return;
    }

    const signer = this.getSigner();
    const ctr = new ethers.Contract(claimTopicsAddress, CLAIM_TOPICS_REGISTRY_ABI, signer);

    // Get currently registered topics to avoid duplicates
    const existing: bigint[] = await ctr.getClaimTopics();
    const existingNums = existing.map(Number);

    for (const topic of topics) {
      if (existingNums.includes(topic)) {
        this.logger.log(`Topic ${topic} already registered in CTR ${claimTopicsAddress}`);
        continue;
      }
      const tx = await ctr.addClaimTopic(topic);
      await tx.wait();
      this.logger.log(`Added claim topic ${topic} to CTR ${claimTopicsAddress}`);
    }
  }

  async getTopics(claimTopicsAddress: string): Promise<number[]> {
    const blockchainMode = this.config.get<string>('BLOCKCHAIN_MODE', 'local');
    if (blockchainMode === 'local') return [];

    try {
      const signer = this.getSigner();
      const ctr = new ethers.Contract(claimTopicsAddress, CLAIM_TOPICS_REGISTRY_ABI, signer);
      const topics: bigint[] = await ctr.getClaimTopics();
      return topics.map(Number);
    } catch {
      return [];
    }
  }
}
