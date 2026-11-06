import { Injectable, Logger } from '@nestjs/common';
import { ethers } from 'ethers';
import { ProviderService } from './provider.service';
import * as TokenArtifact from '../contracts/Token.json';
import * as IdentityRegistryArtifact from '../contracts/IdentityRegistry.json';

@Injectable()
export class ContractInteractionService {
  private readonly logger = new Logger(ContractInteractionService.name);

  constructor(private readonly providerService: ProviderService) {}

  async mint(
    chainId: number,
    tokenAddress: string,
    toAddress: string,
    amount: string,
  ): Promise<ethers.TransactionResponse> {
    const contract = this.getTokenContract(chainId, tokenAddress);
    this.logger.log(`Minting ${amount} tokens to ${toAddress} on ${tokenAddress}`);
    const tx = await contract.mint(toAddress, ethers.parseUnits(amount, 18));
    return tx;
  }

  async burn(
    chainId: number,
    tokenAddress: string,
    fromAddress: string,
    amount: string,
  ): Promise<ethers.TransactionResponse> {
    const contract = this.getTokenContract(chainId, tokenAddress);
    this.logger.log(`Burning ${amount} tokens from ${fromAddress} on ${tokenAddress}`);
    const tx = await contract.burn(fromAddress, ethers.parseUnits(amount, 18));
    return tx;
  }

  async transfer(
    chainId: number,
    tokenAddress: string,
    toAddress: string,
    amount: string,
  ): Promise<ethers.TransactionResponse> {
    const contract = this.getTokenContract(chainId, tokenAddress);
    this.logger.log(`Transferring ${amount} tokens to ${toAddress} on ${tokenAddress}`);
    const tx = await contract.transfer(toAddress, ethers.parseUnits(amount, 18));
    return tx;
  }

  async pause(
    chainId: number,
    tokenAddress: string,
  ): Promise<ethers.TransactionResponse> {
    const contract = this.getTokenContract(chainId, tokenAddress);
    this.logger.log(`Pausing token ${tokenAddress}`);
    const tx = await contract.pause();
    return tx;
  }

  async unpause(
    chainId: number,
    tokenAddress: string,
  ): Promise<ethers.TransactionResponse> {
    const contract = this.getTokenContract(chainId, tokenAddress);
    this.logger.log(`Unpausing token ${tokenAddress}`);
    const tx = await contract.unpause();
    return tx;
  }

  async freezeAddress(
    chainId: number,
    tokenAddress: string,
    targetAddress: string,
  ): Promise<ethers.TransactionResponse> {
    const contract = this.getTokenContract(chainId, tokenAddress);
    this.logger.log(`Freezing address ${targetAddress} on ${tokenAddress}`);
    const tx = await contract.setAddressFrozen(targetAddress, true);
    return tx;
  }

  async unfreezeAddress(
    chainId: number,
    tokenAddress: string,
    targetAddress: string,
  ): Promise<ethers.TransactionResponse> {
    const contract = this.getTokenContract(chainId, tokenAddress);
    this.logger.log(`Unfreezing address ${targetAddress} on ${tokenAddress}`);
    const tx = await contract.setAddressFrozen(targetAddress, false);
    return tx;
  }

  async addToIdentityRegistry(
    chainId: number,
    identityRegistryAddress: string,
    userAddress: string,
    identityAddress: string,
    country: number,
  ): Promise<ethers.TransactionResponse> {
    const contract = this.getIdentityRegistryContract(chainId, identityRegistryAddress);
    this.logger.log(`Adding ${userAddress} to identity registry ${identityRegistryAddress}`);
    const tx = await contract.registerIdentity(userAddress, identityAddress, country);
    return tx;
  }

  async removeFromIdentityRegistry(
    chainId: number,
    identityRegistryAddress: string,
    userAddress: string,
  ): Promise<ethers.TransactionResponse> {
    const contract = this.getIdentityRegistryContract(chainId, identityRegistryAddress);
    this.logger.log(`Removing ${userAddress} from identity registry ${identityRegistryAddress}`);
    const tx = await contract.deleteIdentity(userAddress);
    return tx;
  }

  async getBalance(
    chainId: number,
    tokenAddress: string,
    walletAddress: string,
  ): Promise<string> {
    const provider = this.providerService.getProvider(chainId);
    const contract = new ethers.Contract(tokenAddress, TokenArtifact.abi, provider);
    const balance = await contract.balanceOf(walletAddress);
    return ethers.formatUnits(balance, 18);
  }

  private getTokenContract(chainId: number, tokenAddress: string): ethers.Contract {
    const signer = this.providerService.getSigner(chainId);
    return new ethers.Contract(tokenAddress, TokenArtifact.abi, signer);
  }

  private getIdentityRegistryContract(
    chainId: number,
    registryAddress: string,
  ): ethers.Contract {
    const signer = this.providerService.getSigner(chainId);
    return new ethers.Contract(registryAddress, IdentityRegistryArtifact.abi, signer);
  }
}
