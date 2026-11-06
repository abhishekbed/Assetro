'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useAuthStore, portalForRole, type AppRole } from '@/store/auth.store';

/**
 * Render gate for a portal's dashboard chrome.
 *
 * `AuthProvider` does the redirecting; this stops the wrong portal's sidebar,
 * header and page content from ever being painted while that redirect is in
 * flight. Both are needed: the redirect fixes the URL, this fixes what the
 * user can see — including on a hard refresh straight into a deep link.
 */
export function RequireRole({ portal, children }: { portal: AppRole; children: ReactNode }) {
  const { isAuthenticated, user } = useAuthStore();
  const [hydrated, setHydrated] = useState(() => {
    if (typeof window === 'undefined') return false;
    return useAuthStore.persist?.hasHydrated?.() ?? false;
  });

  // Until the persisted session is read back, we know nothing — rendering
  // either branch now would flash the wrong thing.
  useEffect(() => {
    if (useAuthStore.persist.hasHydrated()) {
      setHydrated(true);
      return;
    }
    return useAuthStore.persist.onFinishHydration(() => setHydrated(true));
  }, []);

  const allowed = isAuthenticated && portalForRole(user?.role) === portal;

  if (!hydrated || !allowed) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface">
        <div
          className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-accent"
          role="status"
          aria-label="Loading"
        />
      </div>
    );
  }

  return <>{children}</>;
}
