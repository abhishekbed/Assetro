/**
 * Notification types for real-time and async user notifications.
 */

/** Categories of platform notifications */
export enum NotificationType {
  /** Investor KYC submission has been approved */
  KYC_APPROVED = 'kyc_approved',
  /** Investor KYC submission has been rejected */
  KYC_REJECTED = 'kyc_rejected',
  /** New KYC submission received (sent to compliance officers) */
  KYC_SUBMITTED = 'kyc_submitted',
  /** Token transfer completed on-chain */
  TRANSFER_COMPLETED = 'transfer_completed',
  /** Token transfer failed on-chain */
  TRANSFER_FAILED = 'transfer_failed',
  /** Payment has been confirmed by Stripe */
  PAYMENT_CONFIRMED = 'payment_confirmed',
  /** Payment has failed */
  PAYMENT_FAILED = 'payment_failed',
  /** Token contracts have been deployed on-chain */
  TOKEN_DEPLOYED = 'token_deployed',
  /** Token deployment failed */
  TOKEN_DEPLOYMENT_FAILED = 'token_deployment_failed',
  /** New tokens have been minted to an investor */
  TOKENS_MINTED = 'tokens_minted',
  /** Investor has been added to the whitelist */
  WHITELIST_ADDED = 'whitelist_added',
  /** Investor has been removed from the whitelist */
  WHITELIST_REMOVED = 'whitelist_removed',
  /** Compliance rule violation detected */
  COMPLIANCE_ALERT = 'compliance_alert',
  /** Tenant subscription plan changed */
  PLAN_CHANGED = 'plan_changed',
}

/** Delivery channels for notifications */
export enum NotificationChannel {
  /** In-app notification (real-time via WebSocket) */
  IN_APP = 'in_app',
  /** Email notification */
  EMAIL = 'email',
  /** External webhook delivery */
  WEBHOOK = 'webhook',
}

/** A notification sent to a user */
export interface Notification {
  /** UUID */
  id: string;
  /** UUID of the tenant */
  tenantId: string;
  /** UUID of the recipient user */
  userId: string;
  type: NotificationType;
  /** Notification title for display */
  title: string;
  /** Notification body / detail message */
  message: string;
  /** Channel through which this notification was delivered */
  channel: NotificationChannel;
  /** Whether the user has read/acknowledged this notification */
  isRead: boolean;
  /**
   * Structured metadata relevant to the notification type.
   * e.g. { tokenId: "...", txHash: "..." } for TRANSFER_COMPLETED
   */
  metadata: Record<string, unknown>;
  /** Deep link URL within the application */
  actionUrl: string | null;
  /** ISO 8601 */
  createdAt: string;
  /** ISO 8601 timestamp of when the notification was read (null if unread) */
  readAt: string | null;
}
