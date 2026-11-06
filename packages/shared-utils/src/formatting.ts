/**
 * Display formatting utilities for addresses, token amounts,
 * currencies, and percentages.
 */

/**
 * Truncate an Ethereum address to the familiar `0x1234...5678` form.
 *
 * @param address - Full hex address string.
 * @param prefixLen - Number of hex characters to show after `0x` (default 4).
 * @param suffixLen - Number of hex characters to show at the end (default 4).
 */
export function truncateAddress(
  address: string,
  prefixLen = 4,
  suffixLen = 4,
): string {
  if (!address || address.length < prefixLen + suffixLen + 2) {
    return address;
  }
  return `${address.slice(0, prefixLen + 2)}...${address.slice(-suffixLen)}`;
}

/**
 * Convert a BigInt (or numeric string) token amount into a human-readable
 * decimal representation.
 *
 * @param rawAmount - The raw on-chain amount (BigInt, string, or number).
 * @param decimals  - Number of decimal places the token uses (default 18).
 * @param displayDecimals - Maximum decimal places to show in output (default 4).
 */
export function formatTokenAmount(
  rawAmount: bigint | string | number,
  decimals = 18,
  displayDecimals = 4,
): string {
  const value = typeof rawAmount === 'bigint' ? rawAmount : BigInt(rawAmount);
  const divisor = 10n ** BigInt(decimals);
  const integerPart = value / divisor;
  const fractionalPart = value % divisor;

  if (fractionalPart === 0n) {
    return integerPart.toString();
  }

  const fractionalStr = fractionalPart
    .toString()
    .padStart(decimals, '0')
    .slice(0, displayDecimals)
    .replace(/0+$/, '');

  if (fractionalStr.length === 0) {
    return integerPart.toString();
  }

  return `${integerPart}.${fractionalStr}`;
}

/**
 * Format a number as a currency string.
 *
 * @param amount   - Numeric value.
 * @param currency - ISO 4217 currency code (default `USD`).
 * @param locale   - BCP 47 locale string (default `en-US`).
 */
export function formatCurrency(
  amount: number,
  currency = 'USD',
  locale = 'en-US',
): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Format a number as a percentage string.
 *
 * @param value  - The ratio (e.g. 0.1234 for 12.34%).
 * @param digits - Number of fractional digits (default 2).
 */
export function formatPercentage(value: number, digits = 2): string {
  return `${(value * 100).toFixed(digits)}%`;
}
