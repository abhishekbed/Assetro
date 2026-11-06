import { Injectable, Logger } from '@nestjs/common';
import { ethers } from 'ethers';
import { ProviderService } from './provider.service';
import { TransactionManagerService } from './transaction-manager.service';
import { TransactionType } from '../entities/transaction.entity';

// Placeholder ABIs - replace with compiled artifacts from Hardhat
import * as TokenArtifact from '../contracts/Token.json';
import * as IdentityRegistryArtifact from '../contracts/IdentityRegistry.json';
import * as ClaimTopicsRegistryArtifact from '../contracts/ClaimTopicsRegistry.json';
import * as TrustedIssuersRegistryArtifact from '../contracts/TrustedIssuersRegistry.json';
import * as ModularComplianceArtifact from '../contracts/ModularCompliance.json';

export interface DeployedSuite {
  tokenAddress: string;
  identityRegistryAddress: string;
  claimTopicsRegistryAddress: string;
  trustedIssuersRegistryAddress: string;
  modularComplianceAddress: string;
  deploymentTxHashes: string[];
}

@Injectable()
export class ContractDeployerService {
  private readonly logger = new Logger(ContractDeployerService.name);

  constructor(
    private readonly providerService: ProviderService,
    private readonly transactionManager: TransactionManagerService,
  ) {}

  async deployTokenSuite(
    chainId: number,
    tokenName: string,
    tokenSymbol: string,
    tokenDecimals: number,
    initiatedBy: string,
  ): Promise<DeployedSuite> {
    const signer = this.providerService.getSigner(chainId);
    const deploymentTxHashes: string[] = [];

    this.logger.log(
      `Deploying ERC-3643 token suite: ${tokenName} (${tokenSymbol}) on chain ${chainId}`,
    );

    // 1. Deploy Claim Topics Registry
    const claimTopicsRegistry = await this.deployContract(
      signer,
      ClaimTopicsRegistryArtifact.abi,
      ClaimTopicsRegistryArtifact.bytecode,
      [],
    );
    deploymentTxHashes.push(claimTopicsRegistry.deploymentTransaction()!.hash);
    await claimTopicsRegistry.waitForDeployment();
    const claimTopicsRegistryAddress = await claimTopicsRegistry.getAddress();
    this.logger.log(`ClaimTopicsRegistry deployed at: ${claimTopicsRegistryAddress}`);

    // 2. Deploy Trusted Issuers Registry
    const trustedIssuersRegistry = await this.deployContract(
      signer,
      TrustedIssuersRegistryArtifact.abi,
      TrustedIssuersRegistryArtifact.bytecode,
      [],
    );
    deploymentTxHashes.push(trustedIssuersRegistry.deploymentTransaction()!.hash);
    await trustedIssuersRegistry.waitForDeployment();
    const trustedIssuersRegistryAddress = await trustedIssuersRegistry.getAddress();
    this.logger.log(`TrustedIssuersRegistry deployed at: ${trustedIssuersRegistryAddress}`);

    // 3. Deploy Identity Registry
    const identityRegistry = await this.deployContract(
      signer,
      IdentityRegistryArtifact.abi,
      IdentityRegistryArtifact.bytecode,
      [trustedIssuersRegistryAddress, claimTopicsRegistryAddress],
    );
    deploymentTxHashes.push(identityRegistry.deploymentTransaction()!.hash);
    await identityRegistry.waitForDeployment();
    const identityRegistryAddress = await identityRegistry.getAddress();
    this.logger.log(`IdentityRegistry deployed at: ${identityRegistryAddress}`);

    // 4. Deploy Modular Compliance
    const modularCompliance = await this.deployContract(
      signer,
      ModularComplianceArtifact.abi,
      ModularComplianceArtifact.bytecode,
      [],
    );
    deploymentTxHashes.push(modularCompliance.deploymentTransaction()!.hash);
    await modularCompliance.waitForDeployment();
    const modularComplianceAddress = await modularCompliance.getAddress();
    this.logger.log(`ModularCompliance deployed at: ${modularComplianceAddress}`);

    // 5. Deploy Token
    const token = await this.deployContract(
      signer,
      TokenArtifact.abi,
      TokenArtifact.bytecode,
      [
        identityRegistryAddress,
        modularComplianceAddress,
        tokenName,
        tokenSymbol,
        tokenDecimals,
      ],
    );
    deploymentTxHashes.push(token.deploymentTransaction()!.hash);
    await token.waitForDeployment();
    const tokenAddress = await token.getAddress();
    this.logger.log(`Token deployed at: ${tokenAddress}`);

    // Record all deployment transactions
    for (const txHash of deploymentTxHashes) {
      await this.transactionManager.submitTransaction(
        chainId,
        txHash,
        TransactionType.DEPLOY,
        initiatedBy,
      );
    }

    return {
      tokenAddress,
      identityRegistryAddress,
      claimTopicsRegistryAddress: claimTopicsRegistryAddress,
      trustedIssuersRegistryAddress: trustedIssuersRegistryAddress,
      modularComplianceAddress,
      deploymentTxHashes,
    };
  }

  private async deployContract(
    signer: ethers.Wallet,
    abi: ethers.InterfaceAbi,
    bytecode: string,
    constructorArgs: unknown[],
  ): Promise<ethers.BaseContract> {
    const factory = new ethers.ContractFactory(abi, bytecode, signer);
    const contract = await factory.deploy(...constructorArgs);
    return contract;
  }
}
