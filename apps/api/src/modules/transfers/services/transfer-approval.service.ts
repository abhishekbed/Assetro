import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  TransferApproval,
  TransferApprovalStatus,
} from '../entities/transfer-approval.entity';
import { Token } from '../../tokens/entities/token.entity';
import { User } from '../../auth/entities/user.entity';
import { NotificationService } from '../../notifications/services/notification.service';

export interface RequestTransferDto {
  tokenId: string;
  fromAddress: string;
  toAddress: string;
  amount: string;
  requesterId?: string;
  chainId?: number;
}

export interface GetAllByTokenFilters {
  status?: string;
}

@Injectable()
export class TransferApprovalService {
  private readonly logger = new Logger(TransferApprovalService.name);

  constructor(
    @InjectRepository(TransferApproval)
    private readonly transferApprovalRepository: Repository<TransferApproval>,
    @InjectRepository(Token)
    private readonly tokenRepository: Repository<Token>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly notificationService: NotificationService,
  ) {}

  async requestTransfer(dto: RequestTransferDto): Promise<TransferApproval> {
    const token = await this.tokenRepository.findOne({
      where: { id: dto.tokenId },
    });

    if (!token) {
      throw new NotFoundException(`Token with id ${dto.tokenId} not found`);
    }
    const amountNumber = Number(dto.amount);
    if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
      throw new BadRequestException('amount must be a positive number');
    }

    const approval = this.transferApprovalRepository.create({
      tokenId: dto.tokenId,
      tokenAddress: token.tokenAddress ?? null,
      fromAddress: dto.fromAddress,
      toAddress: dto.toAddress,
      amount: dto.amount,
      status: TransferApprovalStatus.PENDING,
      requesterId: dto.requesterId ?? null,
      chainId: dto.chainId ?? null,
    });

    const saved = await this.transferApprovalRepository.save(approval);

    // Notify the issuer (token creator)
    const issuerId: string | null = (token as any).createdBy ?? null;
    if (issuerId) {
      try {
        await this.notificationService.create({
          userId: issuerId,
          title: 'Transfer Approval Request',
          message: `A transfer request has been submitted for token "${(token as any).name ?? token.id}". From: ${dto.fromAddress}, To: ${dto.toAddress}, Amount: ${dto.amount}. Please review and approve or reject.`,
          type: 'info',
          channel: 'in_app',
          category: 'transfer_approval',
          metadata: {
            transferApprovalId: saved.id,
            tokenId: dto.tokenId,
            fromAddress: dto.fromAddress,
            toAddress: dto.toAddress,
            amount: dto.amount,
          },
        });
      } catch (err) {
        this.logger.warn(
          `Failed to send notification to issuer ${issuerId}: ${(err as Error).message}`,
        );
      }
    }

    this.logger.log(
      `Transfer approval request created: ${saved.id} for token ${dto.tokenId}`,
    );
    return saved;
  }

  /** Rejects access to another tenant's token; `ownerTenant` is set for issuers only. */
  private async assertTokenInTenant(tokenId: string, ownerTenant?: string): Promise<void> {
    if (!ownerTenant) return;
    const token = await this.tokenRepository.findOne({ where: { id: tokenId } });
    if (!token || token.tenantId !== ownerTenant) {
      throw new NotFoundException(`Token with id ${tokenId} not found`);
    }
  }

  async getPendingByToken(tokenId: string, ownerTenant?: string): Promise<TransferApproval[]> {
    await this.assertTokenInTenant(tokenId, ownerTenant);
    return this.transferApprovalRepository.find({
      where: { tokenId, status: TransferApprovalStatus.PENDING },
      order: { requestedAt: 'DESC' },
    });
  }

  async getAllByToken(
    tokenId: string,
    filters?: GetAllByTokenFilters,
    ownerTenant?: string,
  ): Promise<TransferApproval[]> {
    await this.assertTokenInTenant(tokenId, ownerTenant);
    const where: Record<string, unknown> = { tokenId };

    if (filters?.status) {
      where.status = filters.status;
    }

    return this.transferApprovalRepository.find({
      where,
      order: { requestedAt: 'DESC' },
    });
  }

  async getMyRequests(requesterId: string): Promise<TransferApproval[]> {
    return this.transferApprovalRepository.find({
      where: { requesterId },
      order: { requestedAt: 'DESC' },
    });
  }

  async approve(
    id: string,
    approverId: string,
    notes?: string,
    ownerTenant?: string,
  ): Promise<TransferApproval> {
    const approval = await this.findById(id);
    await this.assertTokenInTenant(approval.tokenId, ownerTenant);

    if (approval.status !== TransferApprovalStatus.PENDING) {
      throw new BadRequestException(
        `Transfer approval ${id} is not in pending state (current: ${approval.status})`,
      );
    }

    approval.status = TransferApprovalStatus.APPROVED;
    approval.approverId = approverId;
    approval.approverNotes = notes ?? null;
    approval.resolvedAt = new Date();

    const updated = await this.transferApprovalRepository.save(approval);

    // Notify requester
    if (approval.requesterId) {
      try {
        await this.notificationService.create({
          userId: approval.requesterId,
          title: 'Transfer Request Approved',
          message: `Your transfer request (ID: ${id}) for amount ${approval.amount} has been approved.`,
          type: 'success',
          channel: 'in_app',
          category: 'transfer_approval',
          metadata: {
            transferApprovalId: id,
            tokenId: approval.tokenId,
            status: TransferApprovalStatus.APPROVED,
          },
        });
      } catch (err) {
        this.logger.warn(
          `Failed to send approval notification to requester ${approval.requesterId}: ${(err as Error).message}`,
        );
      }
    }

    this.logger.log(`Transfer approval ${id} approved by ${approverId}`);
    return updated;
  }

  async reject(
    id: string,
    approverId: string,
    notes: string,
    ownerTenant?: string,
  ): Promise<TransferApproval> {
    const approval = await this.findById(id);
    await this.assertTokenInTenant(approval.tokenId, ownerTenant);

    if (approval.status !== TransferApprovalStatus.PENDING) {
      throw new BadRequestException(
        `Transfer approval ${id} is not in pending state (current: ${approval.status})`,
      );
    }

    approval.status = TransferApprovalStatus.REJECTED;
    approval.approverId = approverId;
    approval.approverNotes = notes;
    approval.resolvedAt = new Date();

    const updated = await this.transferApprovalRepository.save(approval);

    // Notify requester
    if (approval.requesterId) {
      try {
        await this.notificationService.create({
          userId: approval.requesterId,
          title: 'Transfer Request Rejected',
          message: `Your transfer request (ID: ${id}) for amount ${approval.amount} has been rejected. Reason: ${notes}`,
          type: 'error',
          channel: 'in_app',
          category: 'transfer_approval',
          metadata: {
            transferApprovalId: id,
            tokenId: approval.tokenId,
            status: TransferApprovalStatus.REJECTED,
            notes,
          },
        });
      } catch (err) {
        this.logger.warn(
          `Failed to send rejection notification to requester ${approval.requesterId}: ${(err as Error).message}`,
        );
      }
    }

    this.logger.log(`Transfer approval ${id} rejected by ${approverId}`);
    return updated;
  }

  async cancel(id: string, requesterId: string): Promise<TransferApproval> {
    const approval = await this.findById(id);

    if (approval.status !== TransferApprovalStatus.PENDING) {
      throw new BadRequestException(
        `Transfer approval ${id} cannot be cancelled (current status: ${approval.status})`,
      );
    }

    if (approval.requesterId !== requesterId) {
      throw new ForbiddenException(
        `User ${requesterId} is not the requester of transfer approval ${id}`,
      );
    }

    approval.status = TransferApprovalStatus.CANCELLED;
    approval.resolvedAt = new Date();

    const updated = await this.transferApprovalRepository.save(approval);

    this.logger.log(`Transfer approval ${id} cancelled by requester ${requesterId}`);
    return updated;
  }

  async findById(id: string): Promise<TransferApproval> {
    const approval = await this.transferApprovalRepository.findOne({
      where: { id },
    });

    if (!approval) {
      throw new NotFoundException(`Transfer approval with id ${id} not found`);
    }

    return approval;
  }
}
