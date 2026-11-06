/**
 * Multi-tenant organization types.
 */

/** Tenant account status */
export enum TenantStatus {
  /** Tenant created, awaiting activation */
  PENDING = 'pending',
  /** Tenant is fully operational */
  ACTIVE = 'active',
  /** Tenant temporarily disabled (e.g. payment lapse) */
  SUSPENDED = 'suspended',
  /** Tenant permanently deactivated */
  DEACTIVATED = 'deactivated',
}

/** Subscription plan tiers */
export enum TenantPlan {
  /** Free tier with limited features */
  STARTER = 'starter',
  /** Mid-tier with expanded token and investor limits */
  GROWTH = 'growth',
  /** Full-featured plan for established issuers */
  ENTERPRISE = 'enterprise',
  /** Fully customized plan with dedicated support */
  CUSTOM = 'custom',
}

/** Tenant (organization/issuer) entity */
export interface Tenant {
  /** UUID */
  id: string;
  /** Organization display name */
  name: string;
  /** URL-friendly unique slug (e.g. "acme-corp") */
  slug: string;
  status: TenantStatus;
  plan: TenantPlan;
  /** Primary contact email for the organization */
  contactEmail: string;
  /** Organization website URL */
  website: string | null;
  /** URL to the organization's logo */
  logoUrl: string | null;
  /** Stripe Customer ID for billing */
  stripeCustomerId: string | null;
  /** Tenant-specific configuration */
  settings: TenantSettings;
  /** ISO 8601 */
  createdAt: string;
  /** ISO 8601 */
  updatedAt: string;
}

/** Request payload for creating a new tenant */
export interface CreateTenantDto {
  name: string;
  slug: string;
  contactEmail: string;
  plan: TenantPlan;
  website?: string;
  logoUrl?: string;
  settings?: Partial<TenantSettings>;
}

/** Configurable settings for a tenant */
export interface TenantSettings {
  /** Maximum number of tokens the tenant can create */
  maxTokens: number;
  /** Maximum number of investors across all tokens */
  maxInvestors: number;
  /** Chain IDs the tenant is allowed to deploy to */
  allowedChains: number[];
  /** Whether the built-in KYC module is enabled */
  kycEnabled: boolean;
  /** Whether Stripe payment processing is enabled */
  paymentsEnabled: boolean;
  /** Custom branding primary color (hex, e.g. "#1A2B3C") */
  brandingPrimaryColor: string | null;
  /** Custom branding secondary color (hex) */
  brandingSecondaryColor: string | null;
  /** Custom domain for the tenant's investor portal */
  customDomain: string | null;
  /** Webhook URL for event notifications */
  webhookUrl: string | null;
  /** Secret for signing webhook payloads */
  webhookSecret: string | null;
}
