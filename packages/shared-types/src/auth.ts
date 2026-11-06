/**
 * Authentication and authorization types for the Assetro platform.
 */

/** Standard email/password login request */
export interface LoginDto {
  email: string;
  password: string;
  /** Optional TOTP code when 2FA is enabled */
  twoFactorCode?: string;
}

/** New user registration request */
export interface RegisterDto {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  /** UUID of the tenant the user is registering under */
  tenantId: string;
}

/** Web3 wallet-based login request using SIWE (Sign-In with Ethereum) */
export interface WalletLoginDto {
  /** Ethereum wallet address (checksummed) */
  walletAddress: string;
  /** EIP-4361 (SIWE) signed message */
  signature: string;
  /** The original message that was signed */
  message: string;
  /** Chain ID the wallet is connected to */
  chainId: number;
}

/** Response returned upon successful authentication */
export interface AuthResponse {
  user: {
    /** UUID */
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    tenantId: string;
  };
  tokens: TokenPair;
  /** Whether the user has 2FA enabled */
  twoFactorEnabled: boolean;
  /** True if a 2FA code is still required to complete login */
  twoFactorRequired: boolean;
}

/**
 * JWT payload embedded in access tokens.
 * Used for request-scoped authorization checks.
 */
export interface JwtPayload {
  /** UUID of the authenticated user */
  userId: string;
  /** User's email address */
  email: string;
  /** User's role within their tenant */
  role: string;
  /** UUID of the tenant the user belongs to */
  tenantId: string;
  /** Token issued-at (Unix timestamp in seconds) */
  iat: number;
  /** Token expiration (Unix timestamp in seconds) */
  exp: number;
}

/** Access and refresh token pair */
export interface TokenPair {
  /** Short-lived JWT access token */
  accessToken: string;
  /** Long-lived opaque refresh token */
  refreshToken: string;
  /** Access token TTL in seconds */
  expiresIn: number;
}

/** Response when setting up two-factor authentication */
export interface TwoFactorSetup {
  /** Base32-encoded TOTP secret */
  secret: string;
  /** otpauth:// URI for QR code generation */
  otpAuthUrl: string;
  /** Pre-generated single-use backup codes */
  backupCodes: string[];
}
