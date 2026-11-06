/**
 * KYC lifecycle status definitions, valid state transitions,
 * and document type metadata.
 */

export const KYC_STATUS = {
  NOT_STARTED: 'not_started',
  PENDING: 'pending',
  IN_REVIEW: 'in_review',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  EXPIRED: 'expired',
  SUSPENDED: 'suspended',
} as const;

export type KycStatus = (typeof KYC_STATUS)[keyof typeof KYC_STATUS];

/**
 * Map of each KYC status to the set of statuses it may transition to.
 * Any transition not listed here is considered invalid.
 */
export const KYC_STATUS_TRANSITIONS: Record<KycStatus, readonly KycStatus[]> = {
  [KYC_STATUS.NOT_STARTED]: [KYC_STATUS.PENDING],
  [KYC_STATUS.PENDING]: [KYC_STATUS.IN_REVIEW, KYC_STATUS.REJECTED],
  [KYC_STATUS.IN_REVIEW]: [KYC_STATUS.APPROVED, KYC_STATUS.REJECTED],
  [KYC_STATUS.APPROVED]: [KYC_STATUS.EXPIRED, KYC_STATUS.SUSPENDED],
  [KYC_STATUS.REJECTED]: [KYC_STATUS.PENDING],
  [KYC_STATUS.EXPIRED]: [KYC_STATUS.PENDING],
  [KYC_STATUS.SUSPENDED]: [KYC_STATUS.IN_REVIEW, KYC_STATUS.REJECTED],
};

/** Validate whether a KYC status transition is allowed. */
export function isValidKycTransition(from: KycStatus, to: KycStatus): boolean {
  return (KYC_STATUS_TRANSITIONS[from] as readonly string[]).includes(to);
}

// ---------------------------------------------------------------------------
// KYC Document Types
// ---------------------------------------------------------------------------

export interface KycDocumentType {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly required: boolean;
  readonly acceptedMimeTypes: readonly string[];
  readonly maxSizeBytes: number;
}

export const KYC_DOCUMENT_TYPES: Record<string, KycDocumentType> = {
  passport: {
    id: 'passport',
    label: 'Passport',
    description: 'Valid government-issued passport (photo page)',
    required: true,
    acceptedMimeTypes: ['image/jpeg', 'image/png', 'application/pdf'],
    maxSizeBytes: 10 * 1024 * 1024, // 10 MB
  },

  national_id: {
    id: 'national_id',
    label: 'National ID Card',
    description: 'Government-issued national identity card (front and back)',
    required: false,
    acceptedMimeTypes: ['image/jpeg', 'image/png', 'application/pdf'],
    maxSizeBytes: 10 * 1024 * 1024,
  },

  drivers_license: {
    id: 'drivers_license',
    label: "Driver's License",
    description: 'Valid driver\'s license (front and back)',
    required: false,
    acceptedMimeTypes: ['image/jpeg', 'image/png', 'application/pdf'],
    maxSizeBytes: 10 * 1024 * 1024,
  },

  proof_of_address: {
    id: 'proof_of_address',
    label: 'Proof of Address',
    description: 'Utility bill, bank statement, or government letter dated within the last 3 months',
    required: true,
    acceptedMimeTypes: ['image/jpeg', 'image/png', 'application/pdf'],
    maxSizeBytes: 10 * 1024 * 1024,
  },

  selfie: {
    id: 'selfie',
    label: 'Selfie with ID',
    description: 'Photograph of yourself holding your identity document',
    required: true,
    acceptedMimeTypes: ['image/jpeg', 'image/png'],
    maxSizeBytes: 5 * 1024 * 1024, // 5 MB
  },

  accreditation_certificate: {
    id: 'accreditation_certificate',
    label: 'Accreditation Certificate',
    description: 'Proof of accredited or qualified investor status issued by an authorised body',
    required: false,
    acceptedMimeTypes: ['application/pdf'],
    maxSizeBytes: 10 * 1024 * 1024,
  },

  corporate_registration: {
    id: 'corporate_registration',
    label: 'Corporate Registration',
    description: 'Certificate of incorporation or equivalent company registration document',
    required: false,
    acceptedMimeTypes: ['application/pdf'],
    maxSizeBytes: 15 * 1024 * 1024, // 15 MB
  },
} as const;

/** Return only the document types that are marked as required. */
export function getRequiredDocumentTypes(): KycDocumentType[] {
  return Object.values(KYC_DOCUMENT_TYPES).filter((d) => d.required);
}
