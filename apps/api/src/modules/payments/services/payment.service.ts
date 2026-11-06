import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Payment, PaymentStatus } from '../entities/payment.entity';
import { StripeService } from './stripe.service';
import { CreateCheckoutDto } from '../dto/create-checkout.dto';
import { AuditLogService } from '../../admin/services/audit-log.service';
import { User } from '../../auth/entities/user.entity';
import { Token } from '../../tokens/entities/token.entity';
import { CapTable } from '../../tokens/entities/cap-table.entity';
import { TokenLifecycleService } from '../../tokens/services/token-lifecycle.service';
import { TokenEligibilityService } from '../../kyc/services/token-eligibility.service';
import { CapTableService } from '../../tokens/services/cap-table.service';
import { JsonRpcProvider, parseUnits, getAddress } from 'ethers';

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Token)
    private readonly tokenRepository: Repository<Token>,
    @InjectRepository(CapTable)
    private readonly capTableRepository: Repository<CapTable>,
    private readonly stripeService: StripeService,
    private readonly configService: ConfigService,
    private readonly auditLog: AuditLogService,
    @Inject(forwardRef(() => TokenLifecycleService))
    private readonly tokenLifecycle: TokenLifecycleService,
    private readonly tokenEligibility: TokenEligibilityService,
    private readonly capTableService: CapTableService,
  ) {}

  // ── Wire payment creation ─────────────────────────────────────────────────

  async createWirePayment(
    userId: string,
    dto: CreateCheckoutDto,
    tenantId?: string,
  ): Promise<{ paymentId: string; reference: string; fiatAmount: string; currency: string }> {
    const tokenAmount = parseFloat(dto.token_amount);
    if (isNaN(tokenAmount) || tokenAmount <= 0) {
      throw new BadRequestException('Invalid token amount');
    }

    const user = await this.userRepository.findOne({ where: { id: userId } });
    const rawWallet = dto.wallet_address || user?.walletAddress;
    if (!rawWallet) {
      throw new BadRequestException('You must connect or link a wallet before purchasing tokens.');
    }
    const walletAddress = getAddress(rawWallet);

    if (user && (!user.walletAddress || user.walletAddress.toLowerCase() !== walletAddress.toLowerCase())) {
      user.walletAddress = walletAddress;
      await this.userRepository.save(user);
    }

    const token = await this.tokenRepository.findOne({ where: { id: dto.token_id } });
    if (!token) throw new BadRequestException('Token not found');

    const offering = (token.metadata as any)?.offering;
    const minInvestment = offering?.min_investment != null && offering.min_investment !== '' ? Number(offering.min_investment) : null;
    const maxInvestment = offering?.max_investment != null && offering.max_investment !== '' ? Number(offering.max_investment) : null;

    if (minInvestment != null && tokenAmount < minInvestment) {
      throw new BadRequestException(
        `Minimum investment is ${minInvestment} tokens. You requested ${tokenAmount} tokens.`,
      );
    }

    if (maxInvestment != null && tokenAmount > maxInvestment) {
      throw new BadRequestException(
        `Maximum investment is ${maxInvestment} tokens. You requested ${tokenAmount} tokens.`,
      );
    }

    const eligibility = await this.tokenEligibility.canPurchase(userId, token.id, dto.token_amount);
    if (!eligibility.eligible) {
      throw new BadRequestException(`Investor is not eligible: ${eligibility.reasons.join('; ')}`);
    }

    const pricePerToken = await this.getTokenPrice(dto.token_id);
    const fiatAmount = tokenAmount * pricePerToken;

    const payment = this.paymentRepository.create({
      userId,
      tokenId: dto.token_id,
      tokenAmount: dto.token_amount,
      fiatAmount: fiatAmount.toFixed(2),
      currency: (dto.currency || 'USD').toUpperCase(),
      status: PaymentStatus.PENDING,
      paymentMethod: 'bank_transfer' as any,
      tenantId: tenantId ?? null,
      metadata: {
        wallet_address: walletAddress,
        token_name: token.name,
        token_symbol: token.symbol,
        payment_type: 'wire_transfer',
      },
    });

    await this.paymentRepository.save(payment);

    const reference = `PAY-${payment.id.replace(/-/g, '').toUpperCase().slice(-12)}`;

    this.logger.log(
      `Wire payment created: payment=${payment.id}  reference=${reference}  user=${userId}  amount=${dto.token_amount} ${token.symbol}`,
    );

    this.auditLog.create({
      tenant_id: tenantId ?? 'system',
      actor_id: userId,
      actor_role: 'investor',
      action: 'payment.created',
      resource_type: 'payment',
      resource_id: payment.id,
      details: { token_id: dto.token_id, amount: dto.token_amount, fiat: fiatAmount, method: 'wire' },
    }).catch(() => {});

    return {
      paymentId: payment.id,
      reference,
      fiatAmount: fiatAmount.toFixed(2),
      currency: (dto.currency || 'USD').toUpperCase(),
    };
  }

  // ── Checkout creation ─────────────────────────────────────────────────────

  async createCheckout(
    userId: string,
    dto: CreateCheckoutDto,
    tenantId?: string,
  ): Promise<{ sessionId: string; sessionUrl: string }> {
    const tokenAmount = parseFloat(dto.token_amount);
    if (isNaN(tokenAmount) || tokenAmount <= 0) {
      throw new BadRequestException('Invalid token amount');
    }

    // Investor must have a linked or connected wallet — tokens are minted to it after payment
    const user = await this.userRepository.findOne({ where: { id: userId } });
    const rawWallet = dto.wallet_address || user?.walletAddress;
    if (!rawWallet) {
      throw new BadRequestException('You must connect or link a wallet before purchasing tokens.');
    }
    const walletAddress = getAddress(rawWallet);

    if (user && (!user.walletAddress || user.walletAddress.toLowerCase() !== walletAddress.toLowerCase())) {
      user.walletAddress = walletAddress;
      await this.userRepository.save(user);
    }

    const token = await this.tokenRepository.findOne({ where: { id: dto.token_id } });
    if (!token) throw new BadRequestException('Token not found');

    const offering = (token.metadata as any)?.offering;
    const minInvestment = offering?.min_investment != null && offering.min_investment !== '' ? Number(offering.min_investment) : null;
    const maxInvestment = offering?.max_investment != null && offering.max_investment !== '' ? Number(offering.max_investment) : null;

    if (minInvestment != null && tokenAmount < minInvestment) {
      throw new BadRequestException(
        `Minimum investment is ${minInvestment} tokens. You requested ${tokenAmount} tokens.`,
      );
    }

    if (maxInvestment != null && tokenAmount > maxInvestment) {
      throw new BadRequestException(
        `Maximum investment is ${maxInvestment} tokens. You requested ${tokenAmount} tokens.`,
      );
    }

    const eligibility = await this.tokenEligibility.canPurchase(
      userId,
      token.id,
      dto.token_amount,
    );

    if (!eligibility.eligible) {
      throw new BadRequestException(
        `Investor is not eligible to buy this token: ${eligibility.reasons.join('; ')}`,
      );
    }

    const pricePerToken = await this.getTokenPrice(dto.token_id);
    const fiatAmount = tokenAmount * pricePerToken;

    const investorUrl = this.configService.get<string>(
      'NEXT_PUBLIC_INVESTOR_URL',
      'http://localhost:3001',
    );

    const session = await this.stripeService.createCheckoutSession({
      lineItems: [
        {
          price_data: {
            currency: (dto.currency || 'USD').toLowerCase(),
            product_data: {
              name: token.name,
              description: `${dto.token_amount} ${token.symbol} tokens`,
            },
            unit_amount: Math.round(fiatAmount * 100), // Stripe uses cents
          },
          quantity: 1,
        },
      ],
      successUrl: `${investorUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${investorUrl}/payment/cancel?token_id=${dto.token_id}`,
      metadata: {
        token_id: dto.token_id,
        user_id: userId,
        token_amount: dto.token_amount,
        wallet_address: walletAddress,
        tenant_id: tenantId ?? '',
      },
      customerEmail: user?.email,
    });

    const payment = this.paymentRepository.create({
      userId,
      tokenId: dto.token_id,
      tokenAmount: dto.token_amount,
      fiatAmount: fiatAmount.toFixed(2),
      currency: (dto.currency || 'USD').toUpperCase(),
      status: PaymentStatus.PENDING,
      stripeSessionId: session.id,
      tenantId: tenantId ?? null,
      metadata: {
        wallet_address: walletAddress,
        token_name: token.name,
        token_symbol: token.symbol,
      },
    });

    await this.paymentRepository.save(payment);

    this.logger.log(
      `Checkout created: payment=${payment.id}  session=${session.id}  user=${userId}  wallet=${walletAddress}`,
    );
    this.auditLog.create({
      tenant_id: tenantId ?? 'system',
      actor_id: userId,
      actor_role: 'investor',
      action: 'payment.created',
      resource_type: 'payment',
      resource_id: payment.id,
      details: { token_id: dto.token_id, amount: dto.token_amount, fiat: fiatAmount },
    }).catch(() => {});

    return { sessionId: session.id, sessionUrl: session.url };
  }

  // ── Webhook event router ──────────────────────────────────────────────────

  async handleWebhookEvent(event: { type: string; data: { object: Record<string, unknown> } }): Promise<void> {
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded':
        await this.handleCheckoutCompleted(event.data.object);
        break;
      case 'checkout.session.expired':
        await this.handleCheckoutExpired(event.data.object);
        break;
      case 'payment_intent.payment_failed':
        await this.handlePaymentFailed(event.data.object);
        break;
      default:
        this.logger.debug(`Unhandled Stripe event: ${event.type}`);
    }
  }

  // ── Stripe event handlers ─────────────────────────────────────────────────

  private async handleCheckoutCompleted(session: Record<string, unknown>): Promise<void> {
    const sessionId = session.id as string;
    if (!sessionId || sessionId.startsWith('mock_session_')) {
      this.logger.warn('[Webhook] Ignoring a non-Stripe checkout session');
      return;
    }
    const confirmedSession = await this.stripeService.retrieveSession(sessionId);
    if (confirmedSession.payment_status !== 'paid') {
      this.logger.log(`[Webhook] Session ${sessionId} has not been paid; mint skipped`);
      return;
    }
    const sessionMetadata = confirmedSession.metadata;

    const payment = await this.paymentRepository.findOne({
      where: { stripeSessionId: sessionId },
    });

    if (!payment) {
      this.logger.warn(`[Webhook] Payment not found for session: ${sessionId}`);
      return;
    }

    // Already processed — idempotency guard
    if ([PaymentStatus.COMPLETED, PaymentStatus.FAILED, PaymentStatus.PAID, PaymentStatus.PROCESSING].includes(payment.status)) {
      this.logger.log(`[Webhook] Payment ${payment.id} already processed: ${payment.status}`);
      return;
    }

    const paymentIntentId = confirmedSession.payment_intent || null;
    payment.stripePaymentIntentId = paymentIntentId;

    // Resolve wallet address and store in metadata
    let walletAddress: string | undefined =
      sessionMetadata.wallet_address ||
      ((payment.metadata as Record<string, unknown> | null)?.wallet_address as string | undefined);

    if (!walletAddress && payment.userId) {
      const user = await this.userRepository.findOne({ where: { id: payment.userId } });
      walletAddress = user?.walletAddress ?? undefined;
    }

    // ── Mark as PAID ──
    payment.status = PaymentStatus.PAID;
    payment.metadata = {
      ...(payment.metadata ?? {}),
      ...(walletAddress ? { wallet_address: walletAddress } : {}),
      stripe_confirmed_at: new Date().toISOString(),
      ready_for_mint: true,
    };
    const paidClaim = await this.paymentRepository.createQueryBuilder()
      .update(Payment)
      .set({
        status: PaymentStatus.PAID,
        stripePaymentIntentId: paymentIntentId,
        // TypeORM's deep partial type cannot represent arbitrary JSON metadata.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        metadata: payment.metadata as any,
      })
      .where('id = :id AND status = :status', { id: payment.id, status: PaymentStatus.PENDING })
      .execute();
    if (paidClaim.affected !== 1) {
      this.logger.log(`[Webhook] Payment ${payment.id} was already claimed for fulfillment`);
      return;
    }

    this.logger.log(
      `[Webhook] checkout.session.completed → payment=${payment.id} marked PAID, preparing investor on-chain for MetaMask mint...`,
    );
    this.auditLog.create({
      tenant_id: payment.tenantId ?? 'system',
      actor_id: payment.userId,
      actor_role: 'investor',
      action: 'payment.paid',
      resource_type: 'payment',
      resource_id: payment.id,
      details: { token_id: payment.tokenId, amount: payment.tokenAmount, stripe_session: sessionId },
    }).catch(() => {});

    // Automatically execute on-chain mint directly to investor registered wallet
    await this.executeAutoMint(payment);
  }

  private async handleCheckoutExpired(session: Record<string, unknown>): Promise<void> {
    const payment = await this.paymentRepository.findOne({
      where: { stripeSessionId: session.id as string },
    });
    if (!payment || payment.status !== PaymentStatus.PENDING) return;
    payment.status = PaymentStatus.CANCELLED;
    payment.failureReason = 'Checkout session expired';
    await this.paymentRepository.save(payment);
    this.logger.log(`[Webhook] Payment cancelled (session expired): ${payment.id}`);
  }

  private async handlePaymentFailed(paymentIntent: Record<string, unknown>): Promise<void> {
    const payment = await this.paymentRepository.findOne({
      where: { stripePaymentIntentId: paymentIntent.id as string },
    });
    if (!payment) return;
    const lastError = paymentIntent.last_payment_error as Record<string, unknown> | undefined;
    await this.markFailed(payment, (lastError?.message as string) ?? 'Payment failed');
    this.logger.log(`[Webhook] Payment failed: ${payment.id}`);
  }

  private async markFailed(payment: Payment, reason: string): Promise<void> {
    payment.status = PaymentStatus.FAILED;
    payment.failureReason = reason.length > 497 ? reason.slice(0, 497) + '…' : reason;
    await this.paymentRepository.save(payment);
  }

  /**
   * Automatically executes on-chain minting of tokens directly to the investor's
   * registered wallet via the on-chain agent, marks payment completed, and syncs cap table.
   */
  async executeAutoMint(payment: Payment): Promise<Payment> {
    if (payment.status === PaymentStatus.COMPLETED) return payment;
    if (payment.status !== PaymentStatus.PAID) return payment;

    let walletAddress =
      (payment.metadata as Record<string, unknown> | null)?.wallet_address as string | undefined;

    if (!walletAddress && payment.userId) {
      const user = await this.userRepository.findOne({ where: { id: payment.userId } });
      walletAddress = user?.walletAddress ?? undefined;
    }

    if (!walletAddress) {
      payment.failureReason = 'Payment confirmed; investor wallet is missing';
      await this.paymentRepository.save(payment);
      this.logger.warn(`[AutoMint] Cannot auto-mint payment ${payment.id}: no wallet address found`);
      return payment;
    }

    const claim = await this.paymentRepository.createQueryBuilder()
      .update(Payment)
      .set({ status: PaymentStatus.PROCESSING })
      .where('id = :id AND status = :status', { id: payment.id, status: PaymentStatus.PAID })
      .execute();
    if (claim.affected !== 1) {
      return (await this.paymentRepository.findOne({ where: { id: payment.id } })) ?? payment;
    }
    payment.status = PaymentStatus.PROCESSING;

    try {
      this.logger.log(
        `[AutoMint] Initiating automatic on-chain mint: payment=${payment.id} token=${payment.tokenId} to=${walletAddress} amount=${payment.tokenAmount}`,
      );

      const mintResult = await this.tokenLifecycle.mint(
        {
          token_id: payment.tokenId,
          to_address: walletAddress,
          amount: payment.tokenAmount,
          user_id: payment.userId,
        },
        payment.tenantId ?? undefined,
      );

      payment.status = PaymentStatus.COMPLETED;
      payment.completedAt = new Date();
      payment.failureReason = null;
      payment.metadata = {
        ...(payment.metadata ?? {}),
        mint_tx_hash: mintResult.transactionHash,
        mint_block: mintResult.blockNumber,
        auto_minted: true,
        confirmed_at: new Date().toISOString(),
      };
      await this.paymentRepository.save(payment);
      await this.syncCapTableFromCompletedPayment(payment);

      this.logger.log(
        `[AutoMint] Successfully minted on-chain: payment=${payment.id} tx=${mintResult.transactionHash}`,
      );
      this.auditLog.create({
        tenant_id: payment.tenantId ?? 'system',
        actor_id: payment.userId,
        actor_role: 'investor',
        action: 'payment.completed',
        resource_type: 'payment',
        resource_id: payment.id,
        details: { token_id: payment.tokenId, investor_id: payment.userId, amount: payment.tokenAmount, tx: mintResult.transactionHash },
      }).catch(() => {});
    } catch (mintErr: unknown) {
      payment.failureReason = 'Payment confirmed; on-chain mint requires review';
      await this.paymentRepository.save(payment);
      this.logger.error(
        `[AutoMint] Automatic mint failed for payment ${payment.id}: ${(mintErr as Error).message}`,
        (mintErr as Error).stack,
      );
    }
    return payment;
  }

  // ── Queries ───────────────────────────────────────────────────────────────

  async getPaymentBySession(sessionId: string): Promise<Payment | null> {
    return this.paymentRepository.findOne({ where: { stripeSessionId: sessionId } });
  }

  /**
   * Reconcile a checkout session straight from Stripe.
   *
   * The webhook is the primary fulfilment path, but it is delivered by Stripe's
   * servers and can simply never arrive — unreachable host (a laptop running
   * localhost), a deploy window, a signature mismatch, an endpoint that was
   * never registered. When that happens the buyer has been charged and the
   * order sits PENDING forever with nothing to recover it.
   *
   * So the success page also asks us to check. We pull the session from Stripe
   * and, if Stripe says the money moved, run the exact same handler the webhook
   * would have. Both routes are idempotent, so whichever lands first wins and
   * the other is a no-op.
   */
  async verifyAndReconcileSession(sessionId: string): Promise<Payment | null> {
    let payment = await this.paymentRepository.findOne({
      where: { stripeSessionId: sessionId },
    });
    if (!payment) return null;

    if (sessionId.startsWith('mock_session_') && payment.status !== PaymentStatus.COMPLETED) {
      await this.markFailed(payment, 'Checkout was not completed through Stripe');
      return payment;
    }

    if (payment.status === PaymentStatus.PENDING) {
      let session;
      try {
        session = await this.stripeService.retrieveSession(sessionId);
      } catch (err) {
        this.logger.warn(
          `[Reconcile] Could not retrieve session ${sessionId}: ${(err as Error).message}`,
        );
        return payment;
      }

      if (session.payment_status !== 'paid') {
        this.logger.debug(
          `[Reconcile] Session ${sessionId} not paid yet (payment_status=${session.payment_status})`,
        );
        return payment;
      }

      this.logger.warn(
        `[Reconcile] Session ${sessionId} is paid at Stripe but payment ${payment.id} was still PENDING — ` +
          'the webhook never landed. Fulfilling now.',
      );

      await this.handleCheckoutCompleted({
        id: sessionId,
        payment_intent: session.payment_intent,
        metadata: session.metadata,
        payment_status: session.payment_status,
      });

      payment = await this.paymentRepository.findOne({ where: { stripeSessionId: sessionId } });
    } else if (payment.status === PaymentStatus.PAID) {
      payment = await this.executeAutoMint(payment);
    }

    return payment;
  }

  async getPaymentHistory(
    userId: string,
    page = 1,
    limit = 20,
  ): Promise<PaginatedResult<Payment>> {
    const take = Math.min(limit, 100);
    const skip = (page - 1) * take;
    const [data, total] = await this.paymentRepository.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC' },
      take,
      skip,
    });
    return { data, total, page, limit: take, totalPages: Math.ceil(total / take) };
  }

  /** Reconcile an order only after Stripe confirms that Checkout was paid. */
  async confirmCheckoutSession(sessionId: string): Promise<Payment> {
    const payment = await this.verifyAndReconcileSession(sessionId);
    if (!payment) throw new NotFoundException(`Payment not found for session: ${sessionId}`);
    return payment;
  }

  async getAllPayments(page = 1, limit = 50): Promise<PaginatedResult<Payment>> {
    const take = Math.min(limit, 100);
    const skip = (page - 1) * take;
    const [data, total] = await this.paymentRepository.findAndCount({
      order: { createdAt: 'DESC' },
      take,
      skip,
    });
    return { data, total, page, limit: take, totalPages: Math.ceil(total / take) };
  }

  async getPaymentsByToken(tokenId: string, page = 1, limit = 50, status?: string, ownerTenant?: string): Promise<PaginatedResult<Payment>> {
    await this.assertTokenInTenant(tokenId, ownerTenant);
    const take = Math.min(limit, 100);
    const skip = (page - 1) * take;
    const where: Record<string, unknown> = { tokenId };
    if (status) where.status = status;
    const [data, total] = await this.paymentRepository.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      take,
      skip,
    });

    return { data, total, page, limit: take, totalPages: Math.ceil(total / take) };
  }

  /**
   * Confirms a mint transaction signed directly by the investor's MetaMask wallet:
   * Marks payment COMPLETED, records mint_tx_hash, updates cap table, and revokes temporary agent.
   */
  async confirmInvestorMint(
    paymentId: string,
    txHash: string,
    blockNumber?: number,
  ): Promise<Payment> {
    const payment = await this.paymentRepository.findOne({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException(`Payment ${paymentId} not found`);

    if (payment.status === PaymentStatus.COMPLETED) return payment;
    if (payment.status !== PaymentStatus.PAID) {
      throw new BadRequestException('Payment must be confirmed by Stripe before minting can be recorded');
    }

    payment.status = PaymentStatus.COMPLETED;
    payment.completedAt = new Date();
    payment.metadata = {
      ...(payment.metadata ?? {}),
      mint_tx_hash: txHash,
      mint_block: blockNumber ?? null,
      minted_by_investor: true,
      confirmed_at: new Date().toISOString(),
    };
    await this.paymentRepository.save(payment);

    await this.syncCapTableFromCompletedPayment(payment);

    const walletAddress =
      (payment.metadata as Record<string, unknown> | null)?.wallet_address as string | undefined;
    if (walletAddress) {
      this.tokenLifecycle.removeInvestorAgent(payment.tokenId, walletAddress).catch(() => {});
    }

    this.logger.log(`[Payment] Investor mint confirmed: payment=${payment.id} tx=${txHash}`);
    return payment;
  }

  async getPayment(id: string, userId: string): Promise<Payment> {
    const payment = await this.paymentRepository.findOne({ where: { id, userId } });
    if (!payment) throw new NotFoundException('Payment not found');
    return payment;
  }

  /**
   * Returns payment details so the issuer frontend can prepare the MetaMask mint transaction.
   * Does NOT mint — minting is done by the issuer's wallet directly on-chain.
   */
  async confirmWirePayment(tokenId: string, paymentId: string, _issuerId: string, ownerTenant?: string): Promise<{
    payment: Payment;
    mintTo: string;
    mintAmount: string;
    tokenAddress: string;
    decimals: number;
  }> {
    await this.assertTokenInTenant(tokenId, ownerTenant);
    const payment = await this.paymentRepository.findOne({ where: { id: paymentId, tokenId } });
    if (!payment) throw new NotFoundException(`Payment ${paymentId} not found for token ${tokenId}`);

    if (payment.status === PaymentStatus.COMPLETED) {
      throw new BadRequestException('This payment has already been confirmed and tokens minted.');
    }
    if (payment.status === PaymentStatus.CANCELLED || payment.status === PaymentStatus.REFUNDED) {
      throw new BadRequestException(`Cannot confirm a ${payment.status} payment.`);
    }

    let walletAddress =
      (payment.metadata as Record<string, unknown> | null)?.wallet_address as string | undefined;

    if (!walletAddress && payment.userId) {
      const user = await this.userRepository.findOne({ where: { id: payment.userId } });
      walletAddress = user?.walletAddress ?? undefined;
    }

    if (!walletAddress) {
      throw new BadRequestException('No wallet address on this payment — investor must connect or link a wallet first.');
    }

    const token = await this.tokenRepository.findOne({ where: { id: tokenId } });
    if (!token?.tokenAddress) throw new BadRequestException('Token contract address not found — deploy the token first.');

    if (walletAddress.toLowerCase() === token.tokenAddress.toLowerCase()) {
      throw new BadRequestException('Cannot mint to token contract address. Recipient must be the investor wallet.');
    }

    if (payment.userId) {
      const investor = await this.userRepository.findOne({ where: { id: payment.userId } });
      if (investor?.identityContractAddress && walletAddress.toLowerCase() === investor.identityContractAddress.toLowerCase()) {
        if (investor.walletAddress && investor.walletAddress.toLowerCase() !== investor.identityContractAddress.toLowerCase()) {
          this.logger.warn(`[Confirm] Target address was set to ONCHAINID contract instead of investor wallet. Using investor wallet ${investor.walletAddress}`);
          walletAddress = investor.walletAddress;
        }
      }
    }

    const mintAmount = this.toPlainDecimal(payment.tokenAmount);

    this.logger.log(`[Confirm] Prepared mint  payment=${paymentId}  wallet=${walletAddress}  amount=${mintAmount}`);

    return {
      payment,
      mintTo: walletAddress,
      mintAmount,
      tokenAddress: token.tokenAddress,
      decimals: token.decimals ?? 18,
    };
  }

  /**
   * Called by issuer frontend AFTER the on-chain mint tx confirms in MetaMask.
   * Records the tx hash, marks payment completed, syncs cap table.
   * Platform backend never mints — issuer's wallet does.
   */
  async completePayment(
    tokenId: string,
    paymentId: string,
    txHash: string,
    blockNumber: number,
    issuerId?: string,
    ownerTenant?: string,
  ): Promise<Payment> {
    const token = await this.assertTokenInTenant(tokenId, ownerTenant);
    const payment = await this.paymentRepository.findOne({ where: { id: paymentId, tokenId } });
    if (!payment) throw new NotFoundException(`Payment ${paymentId} not found`);

    if (payment.status === PaymentStatus.COMPLETED) return payment; // idempotent
    if (
      payment.status === PaymentStatus.CANCELLED ||
      payment.status === PaymentStatus.FAILED ||
      payment.status === PaymentStatus.REFUNDED
    ) {
      throw new BadRequestException(`Cannot complete a ${payment.status} payment.`);
    }
    if (!token) throw new NotFoundException(`Token ${tokenId} not found`);
    await this.verifyMintTransaction(token, txHash);

    payment.status = PaymentStatus.COMPLETED;
    payment.completedAt = new Date();
    payment.failureReason = null;
    payment.metadata = {
      ...(payment.metadata ?? {}),
      mint_tx_hash: txHash,
      mint_block: blockNumber,
      confirmed_by_issuer: true,
      confirmed_at: new Date().toISOString(),
    };
    await this.paymentRepository.save(payment);
    await this.syncCapTableFromCompletedPayment(payment);

    this.logger.log(`[Confirm] Payment completed  payment=${paymentId}  tx=${txHash}`);
    this.auditLog.create({
      tenant_id: payment.tenantId ?? 'system',
      actor_id: issuerId ?? payment.userId,
      actor_role: issuerId ? 'issuer' : 'investor',
      action: 'payment.completed',
      resource_type: 'payment',
      resource_id: payment.id,
      details: { token_id: tokenId, investor_id: payment.userId, amount: payment.tokenAmount, tx: txHash },
    }).catch(() => {});

    return payment;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /** Stops an issuer reaching another tenant's token; `ownerTenant` is set for issuers only. */
  private async assertTokenInTenant(tokenId: string, ownerTenant?: string): Promise<Token | null> {
    const token = await this.tokenRepository.findOne({ where: { id: tokenId } });
    if (ownerTenant && (!token || token.tenantId !== ownerTenant)) {
      throw new NotFoundException(`Token ${tokenId} not found`);
    }
    return token;
  }

  /** Plain decimal string with no exponent and no trailing zeros ("10.50000000" -> "10.5"). */
  private toPlainDecimal(value: string): string {
    const n = String(value).trim();
    if (!/^\d+(\.\d+)?$/.test(n)) return n;
    return n.includes('.') ? n.replace(/0+$/, '').replace(/\.$/, '') : n;
  }

  /** Exact base-unit amount from a decimal string, truncating digits beyond `decimals`. */
  private toBaseUnits(value: string, decimals: number): bigint {
    const plain = this.toPlainDecimal(value);
    const [whole, frac = ''] = plain.split('.');
    return parseUnits(`${whole || '0'}${frac ? '.' + frac.slice(0, decimals) : ''}`, decimals);
  }

  /**
   * The issuer's mint is signed in their own wallet, so the hash they report must
   * be a successful transaction sent to this token's contract — otherwise anyone
   * could credit an investor with a made-up hash.
   */
  private async verifyMintTransaction(token: Token, txHash: string): Promise<void> {
    if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
      throw new BadRequestException('tx_hash must be a valid transaction hash');
    }
    const mode = this.configService.get<string>('BLOCKCHAIN_MODE', 'local');
    const rpcUrl = mode === 'local'
      ? this.configService.get<string>('LOCAL_BLOCKCHAIN_RPC_URL')
      : this.configService.get<string>('SEPOLIA_RPC_URL');
    if (!rpcUrl || !token.tokenAddress) {
      this.logger.warn(`[Confirm] No RPC or token address — mint tx ${txHash} not verified on-chain`);
      return;
    }

    const provider = new JsonRpcProvider(rpcUrl, undefined, { staticNetwork: true });
    let receipt = null;
    for (let attempt = 0; attempt < 4 && !receipt; attempt++) {
      try {
        receipt = await provider.getTransactionReceipt(txHash);
      } catch (err) {
        this.logger.warn(`[Confirm] Receipt lookup failed for ${txHash}: ${(err as Error).message}`);
      }
      if (!receipt) await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    if (!receipt) {
      throw new BadRequestException('Mint transaction not found or not confirmed yet — try again in a moment.');
    }
    if (receipt.status !== 1) {
      throw new BadRequestException('Mint transaction failed on-chain.');
    }
    if ((receipt.to ?? '').toLowerCase() !== token.tokenAddress.toLowerCase()) {
      throw new BadRequestException('Transaction was not sent to this token contract.');
    }
  }

  private async getTokenPrice(tokenId: string): Promise<number> {
    const token = await this.tokenRepository.findOne({ where: { id: tokenId } });
    const offering = (token?.metadata as Record<string, unknown> | null)?.offering as Record<string, unknown> | undefined;
    const price = offering?.initial_price;
    return typeof price === 'number' && price > 0 ? price : 1.0;
  }

  private async syncCapTableFromCompletedPayment(payment: Payment): Promise<void> {
    const user = await this.userRepository.findOne({ where: { id: payment.userId } });
    const rawWallet =
      ((payment.metadata as Record<string, unknown> | null)?.wallet_address as string | undefined) ||
      user?.walletAddress;
    if (!rawWallet) return;

    const token = await this.tokenRepository.findOne({ where: { id: payment.tokenId } });
    if (!token) return;

    const walletAddress = rawWallet.toLowerCase();
    const decimals = token.decimals ?? 18;

    // Get current DB balance for this wallet and add the minted amount
    const existing = await this.capTableRepository.findOne({
      where: { tokenId: payment.tokenId, walletAddress },
    });
    const currentBalance = existing ? BigInt(existing.balance || '0') : 0n;
    const addedBalance = this.toBaseUnits(payment.tokenAmount, decimals);
    const nextBalance = (currentBalance + addedBalance).toString();

    // Use CapTableService.updateOrInsertEntry which also recalculates ALL holders' percentages
    await this.capTableService.updateOrInsertEntry(
      payment.tokenId,
      walletAddress,
      payment.userId,
      nextBalance,
    );

    this.logger.log(
      `[CapTable] synced from payment=${payment.id}  wallet=${walletAddress}  added=${payment.tokenAmount}`,
    );
  }
}
