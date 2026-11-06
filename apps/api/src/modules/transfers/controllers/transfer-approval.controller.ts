import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  Headers,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  BadRequestException,
} from '@nestjs/common';
import { TransferApprovalService } from '../services/transfer-approval.service';
import { TransferApproval } from '../entities/transfer-approval.entity';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../auth/entities/user.entity';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { JwtPayload } from '../../auth/services/jwt.service';
import { ownerTenantFor } from '../../auth/interceptors/trusted-identity.interceptor';

class RequestTransferBody {
  token_id: string;
  from_address: string;
  to_address: string;
  amount: string;
  chain_id?: number;
}

class ApproveBody {
  notes?: string;
}

class RejectBody {
  notes: string;
}

@Controller('transfers')
export class TransferApprovalController {
  constructor(
    private readonly transferApprovalService: TransferApprovalService,
  ) {}

  /**
   * POST /transfers/request
   * Investor submits a transfer approval request.
   */
  @Post('request')
  @HttpCode(HttpStatus.CREATED)
  async requestTransfer(
    @Body() body: RequestTransferBody,
    @Headers('x-user-id') requesterId: string,
  ): Promise<TransferApproval> {
    if (!body.token_id) {
      throw new BadRequestException('token_id is required');
    }
    if (!body.from_address) {
      throw new BadRequestException('from_address is required');
    }
    if (!body.to_address) {
      throw new BadRequestException('to_address is required');
    }
    if (!body.amount) {
      throw new BadRequestException('amount is required');
    }

    return this.transferApprovalService.requestTransfer({
      tokenId: body.token_id,
      fromAddress: body.from_address,
      toAddress: body.to_address,
      amount: body.amount,
      requesterId: requesterId ?? undefined,
      chainId: body.chain_id,
    });
  }

  /**
   * GET /transfers/my-requests
   * Investor views their own transfer requests.
   * Must be defined BEFORE /:id routes to avoid route conflict.
   */
  @Get('my-requests')
  async getMyRequests(
    @Headers('x-user-id') requesterId: string,
  ): Promise<TransferApproval[]> {
    if (!requesterId) {
      throw new BadRequestException('x-user-id header is required');
    }
    return this.transferApprovalService.getMyRequests(requesterId);
  }

  /**
   * GET /transfers/pending?token_id=xxx
   * Issuer views pending transfer requests for a token.
   */
  @Roles(UserRole.ISSUER, UserRole.ADMIN, UserRole.TRANSFER_AGENT)
  @Get('pending')
  async getPendingByToken(
    @Query('token_id') tokenId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<TransferApproval[]> {
    if (!tokenId) {
      throw new BadRequestException('token_id query param is required');
    }
    return this.transferApprovalService.getPendingByToken(tokenId, ownerTenantFor(user));
  }

  /**
   * GET /transfers?token_id=xxx&status=yyy
   * Issuer views all transfer requests for a token with optional status filter.
   */
  @Roles(UserRole.ISSUER, UserRole.ADMIN, UserRole.TRANSFER_AGENT)
  @Get()
  async getAllByToken(
    @Query('token_id') tokenId: string,
    @Query('status') status?: string,
    @CurrentUser() user?: JwtPayload,
  ): Promise<TransferApproval[]> {
    if (!tokenId) {
      throw new BadRequestException('token_id query param is required');
    }
    return this.transferApprovalService.getAllByToken(tokenId, { status }, ownerTenantFor(user));
  }

  /**
   * POST /transfers/:id/approve
   * Issuer approves a transfer request.
   */
  @Roles(UserRole.ISSUER, UserRole.ADMIN, UserRole.TRANSFER_AGENT)
  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  async approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ApproveBody,
    @Headers('x-user-id') approverId: string,
    @CurrentUser() user?: JwtPayload,
  ): Promise<TransferApproval> {
    if (!approverId) {
      throw new BadRequestException('x-user-id header is required');
    }
    return this.transferApprovalService.approve(id, approverId, body.notes, ownerTenantFor(user));
  }

  /**
   * POST /transfers/:id/reject
   * Issuer rejects a transfer request.
   */
  @Roles(UserRole.ISSUER, UserRole.ADMIN, UserRole.TRANSFER_AGENT)
  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  async reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RejectBody,
    @Headers('x-user-id') approverId: string,
    @CurrentUser() user?: JwtPayload,
  ): Promise<TransferApproval> {
    if (!approverId) {
      throw new BadRequestException('x-user-id header is required');
    }
    if (!body.notes) {
      throw new BadRequestException('notes is required when rejecting');
    }
    return this.transferApprovalService.reject(id, approverId, body.notes, ownerTenantFor(user));
  }

  /**
   * POST /transfers/:id/cancel
   * Investor cancels their own pending transfer request.
   */
  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  async cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('x-user-id') requesterId: string,
  ): Promise<TransferApproval> {
    if (!requesterId) {
      throw new BadRequestException('x-user-id header is required');
    }
    return this.transferApprovalService.cancel(id, requesterId);
  }
}
