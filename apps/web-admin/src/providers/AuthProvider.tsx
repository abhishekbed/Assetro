'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth.store';

const PUBLIC_PATHS = ['/login'];
// Exact-match public routes (the login page at root)
const PUBLIC_EXACT_PATHS = ['/'];

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, token, logout } = useAuthStore();
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (useAuthStore.persist.hasHydrated()) {
      setHydrated(true);
      return;
    }

    const unsubscribe = useAuthStore.persist.onFinishHydration(() => setHydrated(true));
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    const isPublicPath =
      PUBLIC_EXACT_PATHS.includes(pathname) || PUBLIC_PATHS.some((path) => pathname.startsWith(path));

    if (!isAuthenticated && !isPublicPath) {
      router.replace('/');
      return;
    }

    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        if (payload.exp * 1000 < Date.now()) {
          logout();
          router.replace('/');
        }
      } catch {
        logout();
        router.replace('/');
      }
    }
  }, [hydrated, isAuthenticated, logout, pathname, router, token]);

  return <>{children}</>;
}
