import { Injectable, Logger, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';
import { OnchainIdentity } from '../entities/onchain-identity.entity';
import { OnchainIdentityService } from './onchain-identity.service';

@Injectable()
export class IdentityDeploymentService {
  private readonly logger = new Logger(IdentityDeploymentService.name);

  constructor(
    @InjectRepository(OnchainIdentity)
    private readonly identityRepo: Repository<OnchainIdentity>,
    private readonly config: ConfigService,
    private readonly onchainIdentity: OnchainIdentityService,
  ) {}

  private getChainId(): number {
    return parseInt(this.config.get<string>('DEFAULT_CHAIN_ID', '11155111'), 10);
  }

  /** Derive the EOA address from CLAIM_ISSUER_PRIVATE_KEY — this is the actual addClaim() caller. */
  private getClaimSignerAddress(): string | null {
    const pk = this.config.get<string>('CLAIM_ISSUER_PRIVATE_KEY');
    if (!pk) return null;
    try {
      return new ethers.Wallet(pk.startsWith('0x') ? pk : `0x${pk}`).address;
    } catch {
      return null;
    }
  }

  async getOrDeployIdentity(userId: string, walletAddress: string): Promise<OnchainIdentity> {
    const chainId = this.getChainId();

    const existing = await this.identityRepo.findOne({ where: { userId, chainId } });
    if (existing) {
      // Ensure the claim-issuer EOA has CLAIM key — idempotent, safe to call on every pipeline run
      const signerAddress = this.getClaimSignerAddress();
      if (signerAddress) {
        await this.onchainIdentity
          .addClaimKey(existing.identityContractAddress, signerAddress)
          .catch((err: Error) =>
            this.logger.warn(`addClaimKey (existing identity) skipped: ${err.message}`),
          );
      }
      return existing;
    }

    return this.deployIdentity(userId, walletAddress);
  }

  async deployIdentity(userId: string, walletAddress: string): Promise<OnchainIdentity> {
    const chainId = this.getChainId();

    const existing = await this.identityRepo.findOne({ where: { userId, chainId } });
    if (existing) {
      throw new ConflictException(`Identity already deployed for user ${userId} on chain ${chainId}`);
    }

    const result = await this.onchainIdentity.createIdentity(walletAddress);

    // Add the claim-issuer EOA as CLAIM key (purpose=3) so it can call addClaim().
    // Must use the EOA address (derived from CLAIM_ISSUER_PRIVATE_KEY), NOT the
    // ClaimIssuer contract address — the EOA is the actual msg.sender of addClaim().
    const claimSignerAddress = this.getClaimSignerAddress();
    if (claimSignerAddress) {
      await this.onchainIdentity
        .addClaimKey(result.identityContractAddress, claimSignerAddress)
        .catch((err: Error) =>
          this.logger.error(
            `addClaimKey failed for ${result.identityContractAddress}: ${err.message}`,
            err.stack,
          ),
        );
    }

    const record = this.identityRepo.create({
      userId,
      identityContractAddress: result.identityContractAddress,
      deploymentTxHash: result.deploymentTxHash,
      chainId,
      claimTopicsIssued: {},
      registeredTokenIds: [],
      deployedAt: result.deployedAt,
    });

    const saved = await this.identityRepo.save(record);
    this.logger.log(
      `ONCHAINID stored in DB for user ${userId}: ${result.identityContractAddress}  tx=${result.deploymentTxHash}`,
    );

    return saved;
  }

  async getIdentityByUser(userId: string): Promise<OnchainIdentity | null> {
    return this.identityRepo.findOne({ where: { userId, chainId: this.getChainId() } });
  }

  async updateClaimTopics(identityId: string, topic: number, txHash: string): Promise<void> {
    const record = await this.identityRepo.findOne({ where: { id: identityId } });
    if (!record) return;

    record.claimTopicsIssued = { ...record.claimTopicsIssued, [topic.toString()]: txHash };
    await this.identityRepo.save(record);
  }

  async addRegisteredToken(userId: string, tokenId: string): Promise<void> {
    const chainId = this.getChainId();
    const record = await this.identityRepo.findOne({ where: { userId, chainId } });
    if (!record) return;

    if (!record.registeredTokenIds.includes(tokenId)) {
      record.registeredTokenIds = [...record.registeredTokenIds, tokenId];
      await this.identityRepo.save(record);
    }
  }
}
