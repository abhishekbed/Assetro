'use client';

import { useEffect } from 'react';
import { useWalletLink } from '@/hooks/useWalletLink';

/**
 * Mounted in the dashboard layout. Keeps the investor's current active wallet
 * synchronized with their session so whatever MetaMask wallet is connected
 * is used seamlessly without requiring manual registration or warnings.
 */
export function WalletLinkSync() {
  const { address, isConnected, isAuthenticated, linkedAddress, linkWallet } = useWalletLink();

  useEffect(() => {
    if (!isAuthenticated || !isConnected || !address) return;

    if (!linkedAddress || linkedAddress.toLowerCase() !== address.toLowerCase()) {
      linkWallet({ silent: true });
    }
  }, [address, isConnected, isAuthenticated, linkedAddress, linkWallet]);

  return null;
}
