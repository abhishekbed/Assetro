import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Query,
  Headers,
  ParseUUIDPipe,
  DefaultValuePipe,
  ParseIntPipe,
  BadRequestException,
} from '@nestjs/common';
import { PaymentService } from '../services/payment.service';
import { CreateCheckoutDto } from '../dto/create-checkout.dto';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { JwtPayload } from '../../auth/services/jwt.service';
import { ownerTenantFor } from '../../auth/interceptors/trusted-identity.interceptor';
import { UserRole } from '../../auth/entities/user.entity';

@Controller('payments')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Post('wire')
  async createWirePayment(
    @Body() dto: CreateCheckoutDto,
    @Headers('x-user-id') userId: string,
    @Headers('x-tenant-id') tenantId?: string,
  ) {
    if (!userId) throw new BadRequestException('x-user-id header is required');
    return this.paymentService.createWirePayment(userId, dto, tenantId);
  }

  @Post('checkout')
  async createCheckout(
    @Body() dto: CreateCheckoutDto,
    @Headers('x-user-id') userId: string,
    @Headers('x-tenant-id') tenantId?: string,
  ) {
    if (!userId) {
      throw new BadRequestException('x-user-id header is required');
    }
    return this.paymentService.createCheckout(userId, dto, tenantId);
  }

  @Roles(UserRole.INVESTOR)
  @Post('demo-purchase')
  async createDemoPurchase(
    @Body() dto: CreateCheckoutDto,
    @Headers('x-user-id') userId: string,
  ) {
    if (!userId) throw new BadRequestException('x-user-id header is required');
    return this.paymentService.createDemoPurchase(userId, dto);
  }

  @Get('history')
  async getPaymentHistory(
    @Headers('x-user-id') userId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.paymentService.getPaymentHistory(userId, page, limit);
  }

  @Post('confirm/:sessionId')
  async confirmCheckoutSession(
    @Param('sessionId') sessionId: string,
  ) {
    return this.paymentService.confirmCheckoutSession(sessionId);
  }

  /**
   * Read-through with repair: the success page polls this, so if the webhook
   * never landed we notice here, confirm with Stripe, and fulfil. A paid order
   * can then never be stranded by a single missed webhook delivery.
   */
  @Get('session/:sessionId')
  async getPaymentBySession(
    @Param('sessionId') sessionId: string,
  ) {
    const payment = await this.paymentService.verifyAndReconcileSession(sessionId);
    return { success: true, data: payment ?? null };
  }

  // Platform-wide, unscoped by tenant — admin only.
  @Roles(UserRole.ADMIN)
  @Get('all')
  async getAllPayments(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    return this.paymentService.getAllPayments(page, limit);
  }

  @Roles(UserRole.ISSUER, UserRole.ADMIN)
  @Get('token/:tokenId')
  async getPaymentsByToken(
    @Param('tokenId', ParseUUIDPipe) tokenId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('status') status?: string,
    @CurrentUser() user?: JwtPayload,
  ) {
    return this.paymentService.getPaymentsByToken(tokenId, page, limit, status, ownerTenantFor(user));
  }

  @Roles(UserRole.ISSUER, UserRole.ADMIN)
  @Post('token/:tokenId/confirm-wire/:paymentId')
  async confirmWirePayment(
    @Param('tokenId', ParseUUIDPipe) tokenId: string,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @Headers('x-user-id') issuerId: string,
    @CurrentUser() user?: JwtPayload,
  ) {
    if (!issuerId) throw new BadRequestException('x-user-id header is required');
    const result = await this.paymentService.confirmWirePayment(tokenId, paymentId, issuerId, ownerTenantFor(user));
    return { success: true, data: result };
  }

  @Roles(UserRole.ISSUER, UserRole.ADMIN)
  @Post('token/:tokenId/complete/:paymentId')
  async completePayment(
    @Param('tokenId', ParseUUIDPipe) tokenId: string,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @Body() body: { tx_hash: string; block_number: number },
    @Headers('x-user-id') issuerId: string,
    @CurrentUser() user?: JwtPayload,
  ) {
    if (!issuerId) throw new BadRequestException('x-user-id header is required');
    if (!body.tx_hash) throw new BadRequestException('tx_hash is required');
    const payment = await this.paymentService.completePayment(
      tokenId,
      paymentId,
      body.tx_hash,
      body.block_number ?? 0,
      issuerId,
      ownerTenantFor(user),
    );
    return { success: true, data: payment };
  }

  @Post(':id/confirm-mint')
  async confirmInvestorMint(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { tx_hash: string; block_number?: number },
  ) {
    if (!body?.tx_hash) throw new BadRequestException('tx_hash is required');
    const payment = await this.paymentService.confirmInvestorMint(
      id,
      body.tx_hash,
      body.block_number,
    );
    return { success: true, data: payment };
  }

  @Get(':id')
  async getPayment(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('x-user-id') userId: string,
  ) {
    return this.paymentService.getPayment(id, userId);
  }
}
