import { Injectable, Logger } from '@nestjs/common';
import { ethers } from 'ethers';
import { ProviderService } from './provider.service';

export interface GasEstimate {
  gasLimit: string;
  gasPrice: string;
  maxFeePerGas: string | null;
  maxPriorityFeePerGas: string | null;
  estimatedCostWei: string;
  estimatedCostEth: string;
}

@Injectable()
export class GasEstimatorService {
  private readonly logger = new Logger(GasEstimatorService.name);

  constructor(private readonly providerService: ProviderService) {}

  async estimateGas(
    chainId: number,
    contractAddress: string,
    abi: ethers.InterfaceAbi,
    methodName: string,
    args: unknown[],
  ): Promise<GasEstimate> {
    const signer = this.providerService.getSigner(chainId);
    const contract = new ethers.Contract(contractAddress, abi, signer);

    const gasLimit = await contract[methodName].estimateGas(...args);
    const feeData = await signer.provider!.getFeeData();

    const gasPrice = feeData.gasPrice || 0n;
    const estimatedCostWei = gasLimit * gasPrice;

    return {
      gasLimit: gasLimit.toString(),
      gasPrice: gasPrice.toString(),
      maxFeePerGas: feeData.maxFeePerGas?.toString() || null,
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas?.toString() || null,
      estimatedCostWei: estimatedCostWei.toString(),
      estimatedCostEth: ethers.formatEther(estimatedCostWei),
    };
  }

  async getGasPrice(
    chainId: number,
  ): Promise<{
    gasPrice: string;
    maxFeePerGas: string | null;
    maxPriorityFeePerGas: string | null;
  }> {
    const provider = this.providerService.getProvider(chainId);
    const feeData = await provider.getFeeData();

    return {
      gasPrice: feeData.gasPrice?.toString() || '0',
      maxFeePerGas: feeData.maxFeePerGas?.toString() || null,
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas?.toString() || null,
    };
  }

  async estimateDeploymentCost(
    chainId: number,
    abi: ethers.InterfaceAbi,
    bytecode: string,
    constructorArgs: unknown[],
  ): Promise<GasEstimate> {
    const signer = this.providerService.getSigner(chainId);
    const factory = new ethers.ContractFactory(abi, bytecode, signer);

    const deployTx = await factory.getDeployTransaction(...constructorArgs);
    const gasLimit = await signer.estimateGas(deployTx);
    const feeData = await signer.provider!.getFeeData();

    const gasPrice = feeData.gasPrice || 0n;
    const estimatedCostWei = gasLimit * gasPrice;

    return {
      gasLimit: gasLimit.toString(),
      gasPrice: gasPrice.toString(),
      maxFeePerGas: feeData.maxFeePerGas?.toString() || null,
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas?.toString() || null,
      estimatedCostWei: estimatedCostWei.toString(),
      estimatedCostEth: ethers.formatEther(estimatedCostWei),
    };
  }
}
