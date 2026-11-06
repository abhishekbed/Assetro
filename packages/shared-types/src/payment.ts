/**
 * Payment and checkout types for token subscription and purchase flows.
 */

/** Status of a payment through the processing pipeline */
export enum PaymentStatus {
  /** Payment intent created, awaiting customer action */
  PENDING = 'pending',
  /** Payment is being processed by the payment provider */
  PROCESSING = 'processing',
  /** Payment successfully captured */
  COMPLETED = 'completed',
  /** Payment failed (insufficient funds, declined, etc.) */
  FAILED = 'failed',
  /** Payment was refunded to the customer */
  REFUNDED = 'refunded',
}

/** Payment record for a token purchase */
export interface Payment {
  /** UUID */
  id: string;
  /** UUID of the tenant */
  tenantId: string;
  /** UUID of the investor making the payment */
  userId: string;
  /** UUID of the token being purchased */
  tokenId: string;
  status: PaymentStatus;
  /** Payment amount in the smallest currency unit (e.g. cents for USD) */
  amount: number;
  /** ISO 4217 currency code (e.g. "USD", "EUR") */
  currency: string;
  /** Number of tokens being purchased (raw units as string) */
  tokenAmount: string;
  /** Price per token at the time of purchase (in currency's smallest unit) */
  pricePerToken: number;
  /** Stripe PaymentIntent ID */
  stripePaymentIntentId: string | null;
  /** Stripe Checkout Session ID */
  stripeSessionId: string | null;
  /** Human-readable failure reason (null if not failed) */
  failureReason: string | null;
  /** Transaction hash of the on-chain mint triggered by this payment */
  mintTxHash: string | null;
  /** ISO 8601 */
  createdAt: string;
  /** ISO 8601 */
  updatedAt: string;
}

/** Request payload for creating a Stripe Checkout session */
export interface CreateCheckoutDto {
  /** UUID of the token to purchase */
  tokenId: string;
  /** Number of tokens to purchase (raw units as string) */
  tokenAmount: string;
  /** ISO 4217 currency code */
  currency: string;
  /** URL to redirect to after successful payment */
  successUrl: string;
  /** URL to redirect to if the customer cancels */
  cancelUrl: string;
}

/** Response after creating a checkout session */
export interface CheckoutResponse {
  /** UUID of the created payment record */
  paymentId: string;
  /** Stripe Checkout Session ID */
  stripeSessionId: string;
  /** Stripe-hosted checkout page URL */
  checkoutUrl: string;
}

/**
 * Stripe webhook event payload.
 * This is a simplified representation; the actual Stripe event
 * object contains additional metadata.
 */
export interface StripeWebhookEvent {
  /** Stripe event ID (e.g. "evt_...") */
  id: string;
  /** Event type (e.g. "checkout.session.completed", "payment_intent.succeeded") */
  type: string;
  /** Event data containing the affected Stripe object */
  data: {
    object: Record<string, unknown>;
  };
  /** Whether this event was sent from a live or test environment */
  livemode: boolean;
  /** Unix timestamp of when the event was created */
  created: number;
}
