import { BadRequestException, Injectable, Logger, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const StripeLib = require('stripe');

export interface CheckoutSession {
  id: string;
  url: string;
  payment_intent: string;
  metadata: Record<string, string>;
  /** Session lifecycle: open | complete | expired */
  status: string;
  /** Whether money actually moved: paid | unpaid | no_payment_required */
  payment_status: string;
}

export interface WebhookEvent {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
}

@Injectable()
export class StripeService implements OnModuleInit {
  private readonly logger = new Logger(StripeService.name);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private stripe: any = null;
  private readonly isLive: boolean;

  constructor(private readonly configService: ConfigService) {
    const key = this.configService.get<string>('STRIPE_SECRET_KEY', '');
    // Real key is sk_test_... or sk_live_... with length > 20 (placeholder is sk_test_xxx)
    this.isLive = (key.startsWith('sk_test_') || key.startsWith('sk_live_')) && key.length > 20;
    if (this.isLive) {
      const StripeConstructor = StripeLib.default ?? StripeLib;
      this.stripe = new StripeConstructor(key, { apiVersion: '2024-06-20' });
    }
  }

  onModuleInit() {
    if (this.isLive) {
      this.logger.log(`Stripe Checkout ready (${this.configService.get<string>('STRIPE_SECRET_KEY')?.startsWith('sk_test_') ? 'test' : 'live'} mode)`);
    } else {
      this.logger.warn('Stripe Checkout unavailable — set STRIPE_SECRET_KEY to enable purchases');
    }
  }

  async createCheckoutSession(params: {
    lineItems: Array<{
      price_data?: {
        currency: string;
        product_data: { name: string; description?: string };
        unit_amount: number;
      };
      quantity: number;
    }>;
    successUrl: string;
    cancelUrl: string;
    metadata: Record<string, string>;
    customerEmail?: string;
  }): Promise<CheckoutSession> {
    if (this.isLive && this.stripe) {
      const session = await this.stripe.checkout.sessions.create({
        line_items: params.lineItems,
        mode: 'payment',
        success_url: params.successUrl,
        cancel_url: params.cancelUrl,
        metadata: params.metadata,
        customer_email: params.customerEmail,
      });
      return {
        id: session.id,
        url: session.url ?? '',
        payment_intent: typeof session.payment_intent === 'string' ? session.payment_intent : '',
        metadata: (session.metadata ?? {}) as Record<string, string>,
        status: session.status ?? 'open',
        payment_status: session.payment_status ?? 'unpaid',
      };
    }

    throw new ServiceUnavailableException('Stripe Checkout is not configured. Purchases are unavailable.');
  }

  constructWebhookEvent(payload: Buffer, signature: string): WebhookEvent {
    const webhookSecret = this.configService.get<string>('STRIPE_WEBHOOK_SECRET', '');
    const isRealSecret = webhookSecret.startsWith('whsec_') && webhookSecret.length > 20;

    if (this.isLive && this.stripe && isRealSecret) {
      return this.stripe.webhooks.constructEvent(
        payload,
        signature,
        webhookSecret,
      ) as unknown as WebhookEvent;
    }

    throw new BadRequestException('Stripe webhook signature verification is not configured');
  }

  async retrieveSession(sessionId: string): Promise<CheckoutSession> {
    if (sessionId.startsWith('mock_session_')) {
      throw new BadRequestException('This checkout session was not created by Stripe');
    }
    if (this.isLive && this.stripe) {
      const session = await this.stripe.checkout.sessions.retrieve(sessionId);
      return {
        id: session.id,
        url: session.url ?? '',
        payment_intent: typeof session.payment_intent === 'string' ? session.payment_intent : '',
        metadata: (session.metadata ?? {}) as Record<string, string>,
        status: session.status ?? 'complete',
        payment_status: session.payment_status ?? 'unpaid',
      };
    }
    throw new ServiceUnavailableException('Stripe Checkout is not configured');
  }
}
