/**
 * Cryptographic helper type declarations and lightweight utilities.
 *
 * Heavy implementations (signing, hashing with keccak256, signature recovery)
 * depend on ethers.js and are provided by the backend. This module exposes
 * portable helpers and the shared type surface so that both frontend and
 * backend can reference the same signatures.
 */

import * as nodeCrypto from 'crypto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A hex-encoded Ethereum signature (132 characters including `0x`). */
export type EthSignature = string;

/** Result of a signature verification operation. */
export interface VerifySignatureResult {
  /** Whether the recovered address matches the expected signer. */
  valid: boolean;
  /** The address recovered from the signature. */
  recoveredAddress: string;
}

/** Options for nonce generation. */
export interface NonceOptions {
  /** Byte length of the random nonce (default 32 -> 64 hex chars). */
  length?: number;
  /** Optional prefix prepended to the hex string. */
  prefix?: string;
}

// ---------------------------------------------------------------------------
// Portable Implementations
// ---------------------------------------------------------------------------

/**
 * Generate a cryptographically random nonce suitable for wallet-auth
 * challenge messages.
 *
 * Works in both Node.js (via `crypto.randomBytes`) and browsers
 * (via `crypto.getRandomValues`).
 */
export function generateNonce(options: NonceOptions = {}): string {
  const { length = 32, prefix = '' } = options;

  let hexString: string;

  if (
    typeof globalThis !== 'undefined' &&
    (globalThis as any).crypto &&
    typeof (globalThis as any).crypto.getRandomValues === 'function'
  ) {
    // Browser or modern Node (>= 19) with Web Crypto
    const bytes = new Uint8Array(length);
    (globalThis as any).crypto.getRandomValues(bytes);
    hexString = Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  } else {
    // Node.js fallback
    hexString = nodeCrypto.randomBytes(length).toString('hex');
  }

  return `${prefix}${hexString}`;
}

// ---------------------------------------------------------------------------
// Type-only declarations for backend-provided implementations
// ---------------------------------------------------------------------------

/**
 * Hash a human-readable message using EIP-191 personal sign prefix.
 * Implementation provided by the backend (ethers.js).
 */
export type HashMessageFn = (message: string) => string;

/**
 * Verify that `signature` over `message` was produced by `expectedAddress`.
 * Implementation provided by the backend (ethers.js).
 */
export type VerifySignatureFn = (
  message: string,
  signature: EthSignature,
  expectedAddress: string,
) => VerifySignatureResult;
