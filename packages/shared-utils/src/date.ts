/**
 * Date and time utility functions.
 * All functions work with plain `Date` objects and have no external dependencies.
 */

/**
 * Format a date into a human-readable string.
 *
 * @param date   - Date instance or ISO string.
 * @param locale - BCP 47 locale (default `en-US`).
 * @param options - Intl.DateTimeFormat options override.
 */
export function formatDate(
  date: Date | string | number,
  locale = 'en-US',
  options?: Intl.DateTimeFormatOptions,
): string {
  const d = date instanceof Date ? date : new Date(date);
  const defaults: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    ...options,
  };
  return new Intl.DateTimeFormat(locale, defaults).format(d);
}

/**
 * Return a relative time string such as "3 minutes ago" or "in 2 days".
 *
 * @param date - The reference date.
 * @param now  - The current date (defaults to `new Date()`). Useful for testing.
 */
export function timeAgo(date: Date | string | number, now: Date = new Date()): string {
  const d = date instanceof Date ? date : new Date(date);
  const diffMs = now.getTime() - d.getTime();
  const absDiff = Math.abs(diffMs);
  const isFuture = diffMs < 0;

  const seconds = Math.floor(absDiff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  let label: string;

  if (seconds < 60) {
    label = 'just now';
    return label;
  } else if (minutes < 60) {
    label = `${minutes} minute${minutes === 1 ? '' : 's'}`;
  } else if (hours < 24) {
    label = `${hours} hour${hours === 1 ? '' : 's'}`;
  } else if (days < 30) {
    label = `${days} day${days === 1 ? '' : 's'}`;
  } else if (months < 12) {
    label = `${months} month${months === 1 ? '' : 's'}`;
  } else {
    label = `${years} year${years === 1 ? '' : 's'}`;
  }

  return isFuture ? `in ${label}` : `${label} ago`;
}

/**
 * Check whether a date (or ISO string) is in the past.
 *
 * @param expirationDate - The expiry date to check.
 * @param now            - Override for the current time (useful in tests).
 */
export function isExpired(
  expirationDate: Date | string | number,
  now: Date = new Date(),
): boolean {
  const d = expirationDate instanceof Date ? expirationDate : new Date(expirationDate);
  return d.getTime() < now.getTime();
}

/**
 * Return a new `Date` that is `days` calendar days after the given date.
 * Negative values move the date backwards.
 *
 * @param date - Starting date.
 * @param days - Number of days to add (can be negative).
 */
export function addDays(date: Date | string | number, days: number): Date {
  const d = date instanceof Date ? new Date(date.getTime()) : new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}
