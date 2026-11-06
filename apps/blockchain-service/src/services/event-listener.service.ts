import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ethers } from 'ethers';
import { ProviderService } from './provider.service';
import { Transaction, TransactionStatus, TransactionType } from '../entities/transaction.entity';
import * as TokenArtifact from '../contracts/Token.json';

interface ListenerRegistration {
  chainId: number;
  tokenAddress: string;
  contract: ethers.Contract;
}

@Injectable()
export class EventListenerService implements OnModuleDestroy {
  private readonly logger = new Logger(EventListenerService.name);
  private readonly listeners: ListenerRegistration[] = [];

  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    private readonly providerService: ProviderService,
  ) {}

  async startListening(chainId: number, tokenAddress: string): Promise<void> {
    const existing = this.listeners.find(
      (l) => l.chainId === chainId && l.tokenAddress === tokenAddress,
    );
    if (existing) {
      this.logger.warn(`Already listening to events on ${tokenAddress} (chain ${chainId})`);
      return;
    }

    const provider = this.providerService.getProvider(chainId);
    const contract = new ethers.Contract(tokenAddress, TokenArtifact.abi, provider);

    // Listen for Transfer events
    contract.on('Transfer', (from: string, to: string, value: bigint, event: ethers.Log) => {
      this.handleEvent(chainId, tokenAddress, 'Transfer', { from, to, value }, event).catch(
        (err) => this.logger.error(`Error handling Transfer event: ${err.message}`),
      );
    });

    this.listeners.push({ chainId, tokenAddress, contract });
    this.logger.log(`Started listening for events on ${tokenAddress} (chain ${chainId})`);
  }

  stopListening(chainId: number, tokenAddress: string): void {
    const index = this.listeners.findIndex(
      (l) => l.chainId === chainId && l.tokenAddress === tokenAddress,
    );

    if (index !== -1) {
      const listener = this.listeners[index];
      listener.contract.removeAllListeners();
      this.listeners.splice(index, 1);
      this.logger.log(`Stopped listening for events on ${tokenAddress} (chain ${chainId})`);
    }
  }

  private async handleEvent(
    chainId: number,
    tokenAddress: string,
    eventName: string,
    args: Record<string, unknown>,
    event: ethers.Log,
  ): Promise<void> {
    this.logger.log(
      `Event ${eventName} on ${tokenAddress} (chain ${chainId}): ${JSON.stringify(args, (_, v) => typeof v === 'bigint' ? v.toString() : v)}`,
    );

    let txType = TransactionType.OTHER;
    const from = args.from as string;
    const to = args.to as string;

    if (from === ethers.ZeroAddress) {
      txType = TransactionType.MINT;
    } else if (to === ethers.ZeroAddress) {
      txType = TransactionType.BURN;
    } else {
      txType = TransactionType.TRANSFER;
    }

    // Check if transaction record already exists
    const existingTx = await this.transactionRepository.findOne({
      where: { txHash: event.transactionHash },
    });

    if (!existingTx) {
      const transaction = this.transactionRepository.create({
        txHash: event.transactionHash,
        chainId,
        fromAddress: from,
        toAddress: to,
        txType,
        status: TransactionStatus.CONFIRMED,
        value: args.value ? (args.value as bigint).toString() : null,
        blockNumber: event.blockNumber,
      });

      await this.transactionRepository.save(transaction);
      this.logger.log(`Transaction record created for event: ${event.transactionHash}`);
    }
  }

  onModuleDestroy(): void {
    for (const listener of this.listeners) {
      listener.contract.removeAllListeners();
    }
    this.listeners.length = 0;
    this.logger.log('All event listeners removed');
  }
}
