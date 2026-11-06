/**
 * KYC (Know Your Customer) and investor verification types.
 */

/** Status of a KYC submission through the review pipeline */
export enum KycStatus {
  /** Submission received, awaiting reviewer assignment */
  PENDING = 'pending',
  /** A compliance officer is actively reviewing the submission */
  UNDER_REVIEW = 'under_review',
  /** Submission approved; investor is verified */
  APPROVED = 'approved',
  /** Submission rejected; investor must re-submit */
  REJECTED = 'rejected',
}

/** Accepted identity and compliance document types */
export enum DocumentType {
  /** Government-issued ID (passport, national ID, driver's license) */
  ID_PROOF = 'id_proof',
  /** Proof of residential address (utility bill, bank statement) */
  ADDRESS_PROOF = 'address_proof',
  /** Live selfie or video for liveness verification */
  SELFIE = 'selfie',
  /** Accredited investor certification letter */
  ACCREDITATION_CERT = 'accreditation_cert',
}

/** Investor entity classification */
export enum InvestorType {
  INDIVIDUAL = 'individual',
  INSTITUTIONAL = 'institutional',
}

/** Investor accreditation classification */
export enum AccreditationType {
  /** Meets accredited investor criteria (e.g. SEC Rule 501) */
  ACCREDITED = 'accredited',
  /** Retail / non-accredited investor */
  RETAIL = 'retail',
  /** Qualified purchaser or qualified institutional buyer */
  QUALIFIED = 'qualified',
}

/** A complete KYC submission from an investor */
export interface KycSubmission {
  /** UUID */
  id: string;
  /** UUID of the tenant */
  tenantId: string;
  /** UUID of the submitting investor */
  userId: string;
  status: KycStatus;
  investorType: InvestorType;
  accreditationType: AccreditationType | null;
  /** Legal first name as it appears on identity documents */
  firstName: string;
  /** Legal last name as it appears on identity documents */
  lastName: string;
  /** Date of birth in YYYY-MM-DD format */
  dateOfBirth: string;
  /** ISO 3166-1 alpha-2 country code of nationality */
  nationality: string;
  /** ISO 3166-1 alpha-2 country code of residence */
  countryOfResidence: string;
  /** Full residential address */
  address: string;
  /** Attached supporting documents */
  documents: KycDocument[];
  /** Rejection reason provided by the reviewer (null if not rejected) */
  rejectionReason: string | null;
  /** UUID of the compliance officer who reviewed the submission */
  reviewedBy: string | null;
  /** ISO 8601 timestamp of when the review was completed */
  reviewedAt: string | null;
  /** ISO 8601 */
  createdAt: string;
  /** ISO 8601 */
  updatedAt: string;
}

/** An uploaded document attached to a KYC submission */
export interface KycDocument {
  /** UUID */
  id: string;
  /** UUID of the parent KYC submission */
  kycSubmissionId: string;
  documentType: DocumentType;
  /** Original filename as uploaded */
  fileName: string;
  /** MIME type (e.g. "application/pdf", "image/jpeg") */
  mimeType: string;
  /** File size in bytes */
  fileSize: number;
  /** Secure storage URL (pre-signed, time-limited) */
  storageUrl: string;
  /** ISO 8601 */
  uploadedAt: string;
}

/** Request payload for submitting KYC information */
export interface SubmitKycDto {
  investorType: InvestorType;
  accreditationType?: AccreditationType;
  firstName: string;
  lastName: string;
  /** YYYY-MM-DD */
  dateOfBirth: string;
  /** ISO 3166-1 alpha-2 */
  nationality: string;
  /** ISO 3166-1 alpha-2 */
  countryOfResidence: string;
  address: string;
  /** UUIDs of previously uploaded documents to attach */
  documentIds: string[];
}

/** Request payload for a compliance officer reviewing a KYC submission */
export interface ReviewKycDto {
  /** UUID of the KYC submission being reviewed */
  kycSubmissionId: string;
  /** Approval decision */
  decision: KycStatus.APPROVED | KycStatus.REJECTED;
  /** Required when decision is REJECTED */
  rejectionReason?: string;
}
