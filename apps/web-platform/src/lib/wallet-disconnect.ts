import { wagmiConfig } from '@/lib/wagmi-config';
import { disconnect } from 'wagmi/actions';

/**
 * Disconnects MetaMask and WalletConnect completely:
 * 1. Calls wagmi disconnect on all active connectors.
 * 2. Force resets wagmi internal state in memory to disconnected.
 * 3. Clears all wallet connection keys from localStorage and sessionStorage.
 * 4. Requests wallet_revokePermissions from MetaMask so that the browser does not
 *    remain silently authorized across sessions/tabs.
 */
export async function disconnectWallet(): Promise<void> {
  if (typeof window === 'undefined') return;

  // 1. Disconnect all wagmi connections via wagmi/actions
  try {
    const connections = Array.from(wagmiConfig.state.connections.values());
    for (const conn of connections) {
      try {
        await disconnect(wagmiConfig, { connector: conn.connector });
      } catch {
        // ignore connector disconnect failure
      }
    }
    if (wagmiConfig.state.current) {
      try {
        await disconnect(wagmiConfig);
      } catch {
        // ignore
      }
    }
  } catch (err) {
    console.warn('Wagmi disconnect failed:', err);
  }

  // 2. Force-reset wagmi internal state
  try {
    wagmiConfig.setState((x) => ({
      ...x,
      connections: new Map(),
      current: null,
      status: 'disconnected',
    }));
  } catch {
    // ignore
  }

  // 3. Clear all wagmi / wallet storage entries from localStorage and sessionStorage
  try {
    const clearStorage = (storage: Storage) => {
      const keysToRemove: string[] = [];
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (
          key &&
          (key.startsWith('wagmi') ||
            key.startsWith('wc@') ||
            key.startsWith('@walletconnect') ||
            key.startsWith('assetro_wallet') ||
            key.includes('injected') ||
            key.includes('connector'))
        ) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((k) => storage.removeItem(k));
    };

    clearStorage(localStorage);
    clearStorage(sessionStorage);
  } catch {
    // ignore
  }

  // 4. Revoke MetaMask account permissions with a short race timeout
  try {
    const eth = (window as unknown as {
      ethereum?: {
        request?: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      };
    }).ethereum;

    if (eth?.request) {
      await Promise.race([
        eth.request({
          method: 'wallet_revokePermissions',
          params: [{ eth_accounts: {} }],
        }),
        new Promise((resolve) => setTimeout(resolve, 300)),
      ]);
    }
  } catch {
    // ignore if wallet_revokePermissions is not supported
  }
}
