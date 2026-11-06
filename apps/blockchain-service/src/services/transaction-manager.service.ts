import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ethers } from 'ethers';
import { ProviderService } from './provider.service';
import {
  Transaction,
  TransactionStatus,
  TransactionType,
} from '../entities/transaction.entity';

const CONFIRMATION_POLL_INTERVAL_MS = 5000;
const MAX_CONFIRMATION_ATTEMPTS = 60;

@Injectable()
export class TransactionManagerService {
  private readonly logger = new Logger(TransactionManagerService.name);
  private readonly nonceLocks = new Map<string, Promise<void>>();

  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    private readonly providerService: ProviderService,
  ) {}

  async submitTransaction(
    chainId: number,
    txHash: string,
    txType: TransactionType,
    initiatedBy: string,
    tokenId?: string,
  ): Promise<Transaction> {
    const signer = this.providerService.getSigner(chainId);

    const transaction = this.transactionRepository.create({
      txHash,
      chainId,
      fromAddress: signer.address,
      txType,
      status: TransactionStatus.SUBMITTED,
      initiatedBy,
      tokenId: tokenId || null,
    });

    const saved = await this.transactionRepository.save(transaction);
    this.logger.log(`Transaction recorded: ${saved.id} (${txHash})`);

    // Asynchronously confirm the transaction
    this.confirmTransaction(saved.id, chainId, txHash).catch((err) =>
      this.logger.error(`Failed to confirm transaction ${txHash}: ${err.message}`),
    );

    return saved;
  }

  async confirmTransaction(
    transactionId: string,
    chainId: number,
    txHash: string,
  ): Promise<Transaction> {
    const provider = this.providerService.getProvider(chainId);

    let attempts = 0;
    let receipt: ethers.TransactionReceipt | null = null;

    while (attempts < MAX_CONFIRMATION_ATTEMPTS) {
      receipt = await provider.getTransactionReceipt(txHash);
      if (receipt) {
        break;
      }

      attempts++;
      await new Promise((resolve) => setTimeout(resolve, CONFIRMATION_POLL_INTERVAL_MS));
    }

    const transaction = await this.transactionRepository.findOne({
      where: { id: transactionId },
    });

    if (!transaction) {
      throw new NotFoundException(`Transaction record ${transactionId} not found`);
    }

    if (!receipt) {
      transaction.status = TransactionStatus.FAILED;
      transaction.errorMessage = 'Transaction confirmation timed out';
      await this.transactionRepository.save(transaction);
      this.logger.warn(`Transaction ${txHash} confirmation timed out`);
      return transaction;
    }

    if (receipt.status === 1) {
      transaction.status = TransactionStatus.CONFIRMED;
    } else {
      transaction.status = TransactionStatus.REVERTED;
      transaction.errorMessage = 'Transaction reverted on-chain';
    }

    transaction.blockNumber = receipt.blockNumber;
    transaction.gasUsed = receipt.gasUsed.toString();
    transaction.gasPrice = receipt.gasPrice?.toString() || null;
    transaction.confirmations = await receipt.confirmations();

    const savedTx = await this.transactionRepository.save(transaction);
    this.logger.log(
      `Transaction ${txHash} ${transaction.status} at block ${receipt.blockNumber}`,
    );

    return savedTx;
  }

  async getTransaction(txHash: string): Promise<Transaction> {
    const transaction = await this.transactionRepository.findOne({
      where: { txHash },
    });

    if (!transaction) {
      throw new NotFoundException(`Transaction with hash ${txHash} not found`);
    }

    return transaction;
  }

  async getTransactionById(id: string): Promise<Transaction> {
    const transaction = await this.transactionRepository.findOne({
      where: { id },
    });

    if (!transaction) {
      throw new NotFoundException(`Transaction ${id} not found`);
    }

    return transaction;
  }

  async getNextNonce(chainId: number): Promise<number> {
    const signer = this.providerService.getSigner(chainId);
    const signerKey = `${chainId}:${signer.address}`;

    // Simple nonce management: get the latest nonce from the network
    // and compare with the highest nonce in our pending transactions
    const [networkNonce, latestPendingTx] = await Promise.all([
      signer.getNonce('pending'),
      this.transactionRepository.findOne({
        where: {
          chainId,
          fromAddress: signer.address,
          status: TransactionStatus.SUBMITTED,
        },
        order: { nonce: 'DESC' },
      }),
    ]);

    const dbNonce = latestPendingTx?.nonce != null ? latestPendingTx.nonce + 1 : 0;
    return Math.max(networkNonce, dbNonce);
  }
}
