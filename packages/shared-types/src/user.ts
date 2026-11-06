/**
 * User and role types for multi-tenant user management.
 */

/** Platform user roles ordered by descending privilege */
export enum UserRole {
  /** Full platform access across all tenants */
  SUPER_ADMIN = 'super_admin',
  /** Full access within a single tenant/issuer */
  ISSUER_ADMIN = 'issuer_admin',
  /** Operational access within a single tenant/issuer */
  ISSUER_MEMBER = 'issuer_member',
  /** Investor-facing access: portfolio view, KYC submission, transfers */
  INVESTOR = 'investor',
}

export enum UserStatus {
  /** Account created but email not yet verified */
  PENDING = 'pending',
  /** Email verified, account fully active */
  ACTIVE = 'active',
  /** Temporarily disabled by an admin */
  SUSPENDED = 'suspended',
  /** Permanently deactivated */
  DEACTIVATED = 'deactivated',
}

/** Core user entity */
export interface User {
  /** UUID */
  id: string;
  /** UUID of the tenant this user belongs to */
  tenantId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  status: UserStatus;
  /** Checksummed Ethereum wallet address, if linked */
  walletAddress: string | null;
  /** Whether two-factor authentication is enabled */
  twoFactorEnabled: boolean;
  /** URL to the user's avatar image */
  avatarUrl: string | null;
  /** ISO 8601 timestamp of last successful login */
  lastLoginAt: string | null;
  /** ISO 8601 */
  createdAt: string;
  /** ISO 8601 */
  updatedAt: string;
}

/** Partial update payload for user profile fields */
export interface UpdateUserDto {
  firstName?: string;
  lastName?: string;
  walletAddress?: string | null;
  avatarUrl?: string | null;
}

/** Extended user profile including KYC and investment summary */
export interface UserProfile {
  /** UUID */
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  status: UserStatus;
  walletAddress: string | null;
  avatarUrl: string | null;
  twoFactorEnabled: boolean;
  /** UUID of the user's most recent KYC submission, if any */
  kycSubmissionId: string | null;
  /** Current KYC verification status */
  kycStatus: string | null;
  /** Number of distinct tokens held */
  totalTokensHeld: number;
  /** ISO 8601 */
  createdAt: string;
  /** ISO 8601 */
  updatedAt: string;
}
