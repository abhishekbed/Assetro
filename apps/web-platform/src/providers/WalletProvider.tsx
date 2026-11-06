'use client';

import { WagmiProvider } from 'wagmi';
import { wagmiConfig } from '@/lib/wagmi-config';
import { QueryProvider } from './QueryProvider';
import { type ReactNode } from 'react';

export function WalletProvider({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig} reconnectOnMount>
      <QueryProvider>{children}</QueryProvider>
    </WagmiProvider>
  );
}
