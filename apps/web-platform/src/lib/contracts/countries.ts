export function parseCountryNumericCode(value: string): number {
  const normalized = value.trim();

  if (!/^\d{1,3}$/.test(normalized)) {
    throw new Error('Country must be an ISO 3166-1 numeric code, for example 840 or 356.');
  }

  return Number(normalized);
}

export function formatCountryCode(value: string | number): string {
  return String(value).padStart(3, '0');
}
