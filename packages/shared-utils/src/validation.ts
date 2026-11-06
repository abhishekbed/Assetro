/**
 * Common validation utilities for the Assetro platform.
 * All functions are pure and have no external dependencies.
 */

const ETH_ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/;
const EMAIL_REGEX =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Supported chain IDs for quick validation without importing shared-constants. */
const KNOWN_CHAIN_IDS = new Set([1, 11155111, 137, 80002, 8272, 5042002]);

/**
 * Validate an Ethereum address (mixed-case hex, 20 bytes).
 * Does NOT perform EIP-55 checksum validation.
 */
export function isValidEthereumAddress(address: string): boolean {
  return ETH_ADDRESS_REGEX.test(address);
}

/** Validate a basic email address format (RFC 5322 simplified). */
export function isValidEmail(email: string): boolean {
  if (email.length > 254) return false;
  return EMAIL_REGEX.test(email);
}

/** Validate a UUID v4 string. */
export function isValidUUID(value: string): boolean {
  return UUID_V4_REGEX.test(value);
}

/**
 * Check whether a numeric chain ID corresponds to a chain
 * supported by the Assetro platform.
 */
export function isValidChainId(chainId: number): boolean {
  return KNOWN_CHAIN_IDS.has(chainId);
}
