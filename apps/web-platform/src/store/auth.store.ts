import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { disconnectWallet } from '@/lib/wallet-disconnect';

/**
 * One session for the combined Investor/Issuer app.
 *
 * Both portals share this store, so `User` is the union of what each side
 * needs: `kycStatus` / wallet fields are investor-only, `tenantId` is
 * issuer-only, and `role` is what the route guards switch on. Only one role
 * is ever signed in at a time — logging in replaces the whole session.
 */

/** Roles this app serves. `admin` lives in its own separate application. */
export type AppRole = 'investor' | 'issuer';

export interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  /** Investor-only */
  kycStatus?: 'none' | 'pending' | 'approved' | 'rejected';
  walletAddress?: string;
  identityContractAddress?: string | null;
  /** Issuer-only — sent as the X-Tenant-ID header by the api client. */
  tenantId?: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  /** Incremented whenever qualification state changes — pages subscribe to trigger re-fetch */
  kycRefreshTick: number;
  login: (user: User, token: string, refreshToken: string) => void;
  logout: () => void;
  setUser: (user: User) => void;
  setToken: (token: string) => void;
  /** Call after any qualification change to notify all subscribed pages */
  bumpKycRefresh: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      refreshToken: null,
      isAuthenticated: false,
      kycRefreshTick: 0,

      login: (user, token, refreshToken) => {
        disconnectWallet();
        return set({
          user,
          token,
          refreshToken,
          isAuthenticated: true,
        });
      },

      logout: () => {
        disconnectWallet();
        return set({
          user: null,
          token: null,
          refreshToken: null,
          isAuthenticated: false,
          kycRefreshTick: 0,
        });
      },

      setUser: (user) => set({ user }),

      setToken: (token) => set({ token }),

      bumpKycRefresh: () => set((s) => ({ kycRefreshTick: s.kycRefreshTick + 1 })),
    }),
    {
      name: 'assetro-auth',
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);

/** The portal a role belongs to, or null for a role this app does not serve. */
export function portalForRole(role: string | undefined): AppRole | null {
  if (role === 'investor') return 'investor';
  if (role === 'issuer') return 'issuer';
  return null;
}

/** Where a signed-in user of this role lands. */
export function homeForRole(role: string | undefined): string {
  return portalForRole(role) === 'issuer' ? '/issuer/dashboard' : '/dashboard';
}

/** The login page for a portal. */
export function loginPathFor(portal: AppRole): string {
  return portal === 'issuer' ? '/issuer/login' : '/investor/login';
}
