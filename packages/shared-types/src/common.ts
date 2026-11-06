/**
 * Common types shared across the Assetro platform.
 */

/** Standard API response wrapper */
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  /** ISO 8601 timestamp of when the response was generated */
  timestamp: string;
}

/** Paginated API response with metadata */
export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: {
    /** Current page number (1-based) */
    page: number;
    /** Number of items per page */
    limit: number;
    /** Total number of items across all pages */
    totalItems: number;
    /** Total number of pages */
    totalPages: number;
    /** Whether there is a next page */
    hasNext: boolean;
    /** Whether there is a previous page */
    hasPrevious: boolean;
  };
  timestamp: string;
}

/** Parameters for pagination queries */
export interface PaginationParams {
  /** Page number (1-based, default: 1) */
  page?: number;
  /** Items per page (default: 20, max: 100) */
  limit?: number;
}

/** Parameters for sorting queries */
export interface SortParams {
  /** Field name to sort by */
  sortBy?: string;
  /** Sort direction */
  sortOrder?: 'asc' | 'desc';
}

/** Standard error response */
export interface ErrorResponse {
  success: false;
  error: {
    /** Machine-readable error code */
    code: string;
    /** Human-readable error message */
    message: string;
    /** Detailed validation errors, keyed by field name */
    details?: Record<string, string[]>;
  };
  /** ISO 8601 timestamp */
  timestamp: string;
}

/**
 * Audit log entry for tracking all significant actions in the platform.
 * Every mutation operation should produce an audit log entry.
 */
export interface AuditLog {
  /** UUID */
  id: string;
  /** UUID of the tenant this action belongs to */
  tenantId: string;
  /** UUID of the user who performed the action */
  userId: string;
  /** Dot-notation action identifier (e.g. "token.mint", "kyc.approve") */
  action: string;
  /** Type of entity affected */
  entityType: string;
  /** UUID of the entity affected */
  entityId: string;
  /** Snapshot of the entity state before the action (null for create actions) */
  previousState: Record<string, unknown> | null;
  /** Snapshot of the entity state after the action */
  newState: Record<string, unknown>;
  /** IP address of the requester */
  ipAddress: string;
  /** User agent string of the requester */
  userAgent: string;
  /** ISO 8601 timestamp */
  createdAt: string;
}
