'use client';

import { useCallback } from 'react';
import { useAccount } from 'wagmi';
import { toast } from 'sonner';
import { create } from 'zustand';
import { useAuthStore } from '@/store/auth.store';
import { disconnectWallet } from '@/lib/wallet-disconnect';
import api from '@/lib/api';

// Shared (non-persisted) progress flags so the navbar and the Settings page
// show the same "Saving… / Unlinking…" state.
const useWalletLinkStatus = create<{
  linking: boolean;
  unlinking: boolean;
  set: (s: Partial<{ linking: boolean; unlinking: boolean }>) => void;
}>((set) => ({ linking: false, unlinking: false, set }));

const sameAddress = (a?: string | null, b?: string | null) =>
  !!a && !!b && a.toLowerCase() === b.toLowerCase();

/**
 * Connected-wallet ⇄ investor-account link state and actions.
 * Reactive to wallet connect / disconnect / account switch from anywhere in the app.
 */
export function useWalletLink() {
  const { address, isConnected, chain } = useAccount();
  const { user, setUser, isAuthenticated } = useAuthStore();
  const { linking, unlinking, set } = useWalletLinkStatus();

  const linkedAddress = user?.walletAddress || null;
  const isLinked = isConnected && sameAddress(address, linkedAddress);

  const linkWallet = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!address || !user || useWalletLinkStatus.getState().linking) return;
      set({ linking: true });
      try {
        await api.patch('/kyc/wallet', { wallet_address: address });
        setUser({ ...user, walletAddress: address });
        if (!opts?.silent) toast.success('Wallet linked to your account');
        else toast.success('Wallet connected & linked to your account');
      } catch (err: unknown) {
        const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
        toast.error(msg || 'Failed to link wallet. Please try again.');
      } finally {
        set({ linking: false });
      }
    },
    [address, user, setUser, set],
  );

  const unlinkWallet = useCallback(async () => {
    if (!user) return;
    if (!confirm('Unlink your wallet? You will need to re-connect to receive tokens.')) return;
    set({ unlinking: true });
    try {
      await api.delete('/kyc/wallet');
      setUser({ ...user, walletAddress: undefined });
      await disconnectWallet();
      toast.success('Wallet unlinked from your account');
    } catch {
      toast.error('Failed to unlink wallet.');
    } finally {
      set({ unlinking: false });
    }
  }, [user, setUser, set]);

  return {
    address,
    chain,
    isConnected,
    isAuthenticated,
    linkedAddress,
    isLinked,
    /** Connected wallet differs from the one saved on the account */
    isMismatch: isConnected && !!linkedAddress && !sameAddress(address, linkedAddress),
    linking,
    unlinking,
    linkWallet,
    unlinkWallet,
    disconnect: disconnectWallet,
  };
}
