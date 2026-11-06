import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';

const TRUSTED_ISSUERS_REGISTRY_ABI = [
  'function addTrustedIssuer(address _trustedIssuer, uint256[] calldata _claimTopics) external',
  'function removeTrustedIssuer(address _trustedIssuer) external',
  'function isTrustedIssuer(address _issuer) external view returns (bool)',
  'function getTrustedIssuers() external view returns (address[] memory)',
  'function getTrustedIssuerClaimTopics(address _trustedIssuer) external view returns (uint256[] memory)',
];

@Injectable()
export class TrustedIssuersRegistryService {
  private readonly logger = new Logger(TrustedIssuersRegistryService.name);
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
   * Register the platform's claim issuer as a trusted issuer in a token's TrustedIssuersRegistry.
   * Called once after token deployment for each new token.
   */
  async addTrustedIssuer(
    trustedIssuersAddress: string,
    claimIssuerAddress: string,
    claimTopics: number[],
  ): Promise<void> {
    const blockchainMode = this.config.get<string>('BLOCKCHAIN_MODE', 'local');

    if (blockchainMode === 'local') {
      this.logger.warn(
        `LOCAL mode: skip addTrustedIssuer on TIR ${trustedIssuersAddress} for issuer ${claimIssuerAddress}`,
      );
      return;
    }

    const signer = this.getSigner();
    const tir = new ethers.Contract(trustedIssuersAddress, TRUSTED_ISSUERS_REGISTRY_ABI, signer);

    const alreadyTrusted: boolean = await tir.isTrustedIssuer(claimIssuerAddress);
    if (alreadyTrusted) {
      this.logger.log(`${claimIssuerAddress} already trusted in TIR ${trustedIssuersAddress}`);
      return;
    }

    const tx = await tir.addTrustedIssuer(claimIssuerAddress, claimTopics);
    const receipt = await tx.wait();
    this.logger.log(
      `Added trusted issuer ${claimIssuerAddress} to TIR ${trustedIssuersAddress}, topics=[${claimTopics}], tx=${receipt.hash}`,
    );
  }

  async isTrustedIssuer(trustedIssuersAddress: string, issuerAddress: string): Promise<boolean> {
    const blockchainMode = this.config.get<string>('BLOCKCHAIN_MODE', 'local');
    if (blockchainMode === 'local') return true;

    try {
      const signer = this.getSigner();
      const tir = new ethers.Contract(trustedIssuersAddress, TRUSTED_ISSUERS_REGISTRY_ABI, signer);
      return tir.isTrustedIssuer(issuerAddress);
    } catch {
      return false;
    }
  }
}
