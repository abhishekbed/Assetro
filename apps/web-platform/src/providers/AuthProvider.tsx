'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore, portalForRole, homeForRole, type AppRole } from '@/store/auth.store';

/**
 * Route guard for the combined Investor/Issuer app.
 *
 * Three things are enforced here:
 *   1. a protected route requires a session;
 *   2. an expired token ends that session;
 *   3. a session may only enter *its own* portal — an issuer that navigates to
 *      an investor route (or the reverse) is bounced to their own dashboard,
 *      which is what keeps requirement "no cross-role access" true for direct
 *      URL entry and refreshes, not just for in-app navigation.
 */

/** Open to everyone, matched exactly. */
const PUBLIC_EXACT = ['/', '/launch', '/issuer'];

/** Open to everyone, matched by prefix. */
const PUBLIC_PREFIXES = [
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/issuer/login',
  '/issuer/register',
  '/investor/login',
  '/investor/register',
  '/terms',
  '/privacy',
  '/terms-of-service',
  '/terms-and-conditions',
];

/** Prefixes that belong to the issuer portal. Everything else protected is the investor's. */
const ISSUER_PREFIXES = ['/issuer'];

function isPublic(pathname: string) {
  return (
    PUBLIC_EXACT.includes(pathname) ||
    PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'))
  );
}

/** Which portal a protected path belongs to. */
function portalForPath(pathname: string): AppRole {
  return ISSUER_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'))
    ? 'issuer'
    : 'investor';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, token, user, logout } = useAuthStore();
  const [hydrated, setHydrated] = useState(false);

  // Wait for Zustand persist middleware to finish reading from localStorage
  useEffect(() => {
    if (useAuthStore.persist.hasHydrated()) {
      setHydrated(true);
      return;
    }
    const unsub = useAuthStore.persist.onFinishHydration(() => setHydrated(true));
    return unsub;
  }, []);

  useEffect(() => {
    if (!hydrated) return;

    const publicPath = isPublic(pathname);
    const wanted = portalForPath(pathname);

    if (!isAuthenticated && !publicPath) {
      // Send them to the login page for the portal they were reaching for.
      router.replace(wanted === 'issuer' ? '/issuer/login' : '/investor/login');
      return;
    }

    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        const isExpired = payload.exp * 1000 < Date.now();
        if (isExpired) {
          logout();
          router.replace(wanted === 'issuer' ? '/issuer/login' : '/investor/login');
          return;
        }
      } catch {
        logout();
        router.replace(wanted === 'issuer' ? '/issuer/login' : '/investor/login');
        return;
      }
    }

    // Signed in, on a protected page that belongs to the other portal.
    if (isAuthenticated && !publicPath) {
      const held = portalForRole(user?.role);
      if (held && held !== wanted) {
        router.replace(homeForRole(user?.role));
      }
    }
  }, [hydrated, isAuthenticated, token, user?.role, pathname, router, logout]);

  return <>{children}</>;
}
