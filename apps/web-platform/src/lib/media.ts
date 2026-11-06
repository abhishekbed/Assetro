/**
 * Resolves a media or document URL safely across both localhost and production environments.
 * Strips hardcoded `localhost:3000` or `127.0.0.1` origins stored in legacy database records,
 * and prefixes relative upload paths (`/api/v1/uploads/...`) with the configured API origin.
 */
export function getMediaUrl(url: string | null | undefined): string {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed) return '';

  const isBrowser = typeof window !== 'undefined';
  const isLocalClient = isBrowser && (
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    window.location.hostname === '0.0.0.0'
  );

  // If already an absolute URL on localhost:3000 and we are running locally, keep it!
  if (isLocalClient && (trimmed.startsWith('http://localhost:3000') || trimmed.startsWith('http://127.0.0.1:3000'))) {
    return trimmed;
  }

  let path = trimmed;

  // If URL contains localhost or 127.0.0.1, strip origin
  if (trimmed.startsWith('http://localhost') || trimmed.startsWith('https://localhost') ||
      trimmed.startsWith('http://127.0.0.1') || trimmed.startsWith('https://127.0.0.1')) {
    try {
      const parsed = new URL(trimmed);
      path = parsed.pathname + parsed.search;
    } catch {
      path = trimmed.replace(/^https?:\/\/[^/]+/, '');
    }
  }

  // If it's a standard external URL (S3, Cloudinary, etc.), return as is
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('blob:') || path.startsWith('data:')) {
    return path;
  }

  // Ensure path starts with leading slash
  const cleanPath = path.startsWith('/') ? path : `/${path}`;

  // 1. Check process.env.NEXT_PUBLIC_API_URL
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
  if (apiUrl) {
    try {
      const parsedApi = new URL(apiUrl);
      // If we're on localhost and apiUrl points to port 3000, use it
      return `${parsedApi.origin}${cleanPath}`;
    } catch {
      // ignore
    }
  }

  // 2. If running locally in browser (web-platform is on port 3001),
  // NestJS API is always on port 3000! Never use window.location.origin (which is 3001) for uploads.
  if (isLocalClient) {
    return `http://localhost:3000${cleanPath}`;
  }

  // 3. Fallback to window.location.origin in production client environment
  if (isBrowser && window.location?.origin) {
    return `${window.location.origin}${cleanPath}`;
  }

  return cleanPath;
}
