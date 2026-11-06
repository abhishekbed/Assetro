/**
 * Platform role definitions and their associated permissions.
 *
 * Permissions follow the pattern `resource:action` where resources map to
 * domain entities and actions describe the allowed operations.
 */

export const PERMISSIONS = {
  // Token lifecycle
  TOKEN_CREATE: 'token:create',
  TOKEN_DEPLOY: 'token:deploy',
  TOKEN_PAUSE: 'token:pause',
  TOKEN_MINT: 'token:mint',
  TOKEN_BURN: 'token:burn',
  TOKEN_TRANSFER: 'token:transfer',
  TOKEN_VIEW: 'token:view',
  TOKEN_CONFIGURE: 'token:configure',

  // KYC / Identity
  KYC_REVIEW: 'kyc:review',
  KYC_APPROVE: 'kyc:approve',
  KYC_REJECT: 'kyc:reject',
  KYC_SUBMIT: 'kyc:submit',
  KYC_VIEW: 'kyc:view',

  // Compliance
  COMPLIANCE_CONFIGURE: 'compliance:configure',
  COMPLIANCE_VIEW: 'compliance:view',

  // User management
  USER_MANAGE: 'user:manage',
  USER_INVITE: 'user:invite',
  USER_VIEW: 'user:view',

  // Investor operations
  INVESTOR_VIEW: 'investor:view',
  INVESTOR_MANAGE: 'investor:manage',

  // Reports
  REPORT_VIEW: 'report:view',
  REPORT_EXPORT: 'report:export',

  // Platform administration
  PLATFORM_SETTINGS: 'platform:settings',
  PLATFORM_AUDIT: 'platform:audit',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export type RoleName = 'super_admin' | 'issuer_admin' | 'issuer_member' | 'investor';

export interface RoleDefinition {
  readonly label: string;
  readonly description: string;
  readonly permissions: readonly Permission[];
}

export const ROLES: Record<RoleName, RoleDefinition> = {
  super_admin: {
    label: 'Super Admin',
    description: 'Full platform access including system configuration',
    permissions: Object.values(PERMISSIONS),
  },

  issuer_admin: {
    label: 'Issuer Admin',
    description: 'Full control over tokens, compliance, and investor management for their organisation',
    permissions: [
      PERMISSIONS.TOKEN_CREATE,
      PERMISSIONS.TOKEN_DEPLOY,
      PERMISSIONS.TOKEN_PAUSE,
      PERMISSIONS.TOKEN_MINT,
      PERMISSIONS.TOKEN_BURN,
      PERMISSIONS.TOKEN_TRANSFER,
      PERMISSIONS.TOKEN_VIEW,
      PERMISSIONS.TOKEN_CONFIGURE,
      PERMISSIONS.KYC_REVIEW,
      PERMISSIONS.KYC_APPROVE,
      PERMISSIONS.KYC_REJECT,
      PERMISSIONS.KYC_VIEW,
      PERMISSIONS.COMPLIANCE_CONFIGURE,
      PERMISSIONS.COMPLIANCE_VIEW,
      PERMISSIONS.USER_INVITE,
      PERMISSIONS.USER_VIEW,
      PERMISSIONS.INVESTOR_VIEW,
      PERMISSIONS.INVESTOR_MANAGE,
      PERMISSIONS.REPORT_VIEW,
      PERMISSIONS.REPORT_EXPORT,
    ],
  },

  issuer_member: {
    label: 'Issuer Member',
    description: 'Day-to-day token operations and KYC review within their organisation',
    permissions: [
      PERMISSIONS.TOKEN_VIEW,
      PERMISSIONS.TOKEN_MINT,
      PERMISSIONS.TOKEN_BURN,
      PERMISSIONS.TOKEN_TRANSFER,
      PERMISSIONS.KYC_REVIEW,
      PERMISSIONS.KYC_APPROVE,
      PERMISSIONS.KYC_REJECT,
      PERMISSIONS.KYC_VIEW,
      PERMISSIONS.COMPLIANCE_VIEW,
      PERMISSIONS.INVESTOR_VIEW,
      PERMISSIONS.REPORT_VIEW,
    ],
  },

  investor: {
    label: 'Investor',
    description: 'Submit KYC documents and view owned token holdings',
    permissions: [
      PERMISSIONS.KYC_SUBMIT,
      PERMISSIONS.KYC_VIEW,
      PERMISSIONS.TOKEN_VIEW,
      PERMISSIONS.INVESTOR_VIEW,
      PERMISSIONS.REPORT_VIEW,
    ],
  },
} as const;

/** Check whether a role includes a specific permission. */
export function roleHasPermission(role: RoleName, permission: Permission): boolean {
  return (ROLES[role].permissions as readonly string[]).includes(permission);
}
