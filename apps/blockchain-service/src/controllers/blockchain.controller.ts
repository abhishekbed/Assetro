import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Headers,
  ParseIntPipe,
  BadRequestException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { IsString, IsNotEmpty, IsNumber, IsEthereumAddress } from 'class-validator';
import { ProviderService } from '../services/provider.service';
import { ContractInteractionService } from '../services/contract-interaction.service';
import { TransactionManagerService } from '../services/transaction-manager.service';
import { GasEstimatorService } from '../services/gas-estimator.service';

class TransferDto {
  @IsNumber()
  @IsNotEmpty()
  chain_id: number;

  @IsString()
  @IsNotEmpty()
  token_address: string;

  @IsString()
  @IsNotEmpty()
  to_address: string;

  @IsString()
  @IsNotEmpty()
  amount: string;
}

@Controller()
export class BlockchainController {
  constructor(
    private readonly providerService: ProviderService,
    private readonly contractInteractionService: ContractInteractionService,
    private readonly transactionManager: TransactionManagerService,
    private readonly gasEstimator: GasEstimatorService,
  ) {}

  @Get('chains')
  async getChains() {
    const chains = this.providerService.getSupportedChains();
    return { success: true, data: chains };
  }

  @Get('chains/:chainId/status')
  async getChainStatus(@Param('chainId', ParseIntPipe) chainId: number) {
    const status = await this.providerService.getChainStatus(chainId);
    return { success: true, data: status };
  }

  @Get('transactions/:txHash')
  async getTransaction(@Param('txHash') txHash: string) {
    if (!txHash || !txHash.startsWith('0x') || txHash.length !== 66) {
      throw new BadRequestException('Invalid transaction hash format');
    }
    const transaction = await this.transactionManager.getTransaction(txHash);
    return { success: true, data: transaction };
  }

  @Get('tokens/:address/balance/:wallet')
  async getTokenBalance(
    @Param('address') tokenAddress: string,
    @Param('wallet') walletAddress: string,
    @Headers('x-chain-id') chainIdHeader: string,
  ) {
    const chainId = parseInt(chainIdHeader, 10);
    if (isNaN(chainId)) {
      throw new BadRequestException('x-chain-id header is required and must be a number');
    }

    const balance = await this.contractInteractionService.getBalance(
      chainId,
      tokenAddress,
      walletAddress,
    );

    return {
      success: true,
      data: {
        token_address: tokenAddress,
        wallet_address: walletAddress,
        balance,
        chain_id: chainId,
      },
    };
  }

  @Post('transfer')
  @HttpCode(HttpStatus.CREATED)
  async transfer(
    @Headers('x-user-id') userId: string,
    @Body() dto: TransferDto,
  ) {
    if (!userId) {
      throw new BadRequestException('x-user-id header is required');
    }

    const tx = await this.contractInteractionService.transfer(
      dto.chain_id,
      dto.token_address,
      dto.to_address,
      dto.amount,
    );

    return {
      success: true,
      data: {
        tx_hash: tx.hash,
        chain_id: dto.chain_id,
        from: tx.from,
        to: dto.to_address,
        amount: dto.amount,
      },
    };
  }
}
