'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { useAccount, useConnect, useSignMessage } from 'wagmi';
import api from '@/lib/api';
import { setConnectedWallet } from '@/lib/connected-wallet';

interface IssuerWalletState {
  /** Wallet registered on the issuer's account, lowercase, or null. */
  registered: string | null;
  /** Wallet currently connected in MetaMask, lowercase, or null. */
  connected: string | null;
  loading: boolean;
  /** MetaMask is still reconnecting after a page load; don't flash "not connected". */
  connecting: boolean;
  saving: boolean;
  /** True when a registered wallet exists and the connected one is it. */
  matches: boolean;
  /** Sign with the connected wallet and register / replace it. */
  registerConnected: () => Promise<void>;
  /**
   * Gate for every on-chain action: toasts and returns false unless the
   * connected wallet is the registered issuer wallet.
   */
  assertCanTransact: () => boolean;
}

const Ctx = createContext<IssuerWalletState | null>(null);

// Must stay identical to issuerWalletMessage() in the API.
function buildMessage(userId: string, wallet: string, issuedAt: string) {
  return `Assetro: register issuer wallet\nAccount: ${userId}\nWallet: ${wallet.toLowerCase()}\nIssued: ${issuedAt}`;
}

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export function IssuerWalletProvider({
  userId,
  children,
}: {
  userId: string;
  children: ReactNode;
}) {
  const { address, status } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [registered, setRegistered] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const connected = address ? address.toLowerCase() : null;
  const connecting = status === 'connecting' || status === 'reconnecting';

  useEffect(() => {
    setConnectedWallet(connected);
  }, [connected]);

  useEffect(() => {
    let cancelled = false;
    api
      .get('/issuer/wallet')
      .then((res) => {
        if (!cancelled) setRegistered(res.data?.data?.wallet_address ?? null);
      })
      .catch(() => {
        /* leave unregistered; the gate banner will prompt */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const registerConnected = useCallback(async () => {
    if (!connected) {
      toast.error('Connect your MetaMask wallet first.');
      return;
    }
    setSaving(true);
    try {
      const issuedAt = new Date().toISOString();
      const signature = await signMessageAsync({ message: buildMessage(userId, connected, issuedAt) });
      const res = await api.put('/issuer/wallet', {
        wallet_address: connected,
        issued_at: issuedAt,
        signature,
      });
      setRegistered(res.data?.data?.wallet_address ?? connected);
      toast.success('Issuer wallet registered.');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } }; shortMessage?: string; message?: string };
      toast.error(e.response?.data?.message || e.shortMessage || e.message || 'Could not register wallet.');
    } finally {
      setSaving(false);
    }
  }, [connected, signMessageAsync, userId]);

  const matches = !!registered && registered === connected;

  const assertCanTransact = useCallback(() => {
    if (!registered) {
      toast.error('Register your issuer wallet in Settings before sending transactions.');
      return false;
    }
    if (!connected) {
      toast.error('Connect your registered issuer wallet.');
      return false;
    }
    if (connected !== registered) {
      toast.error(
        `Connected wallet ${short(connected)} is not your registered issuer wallet ${short(registered)}. Switch account in MetaMask.`,
      );
      return false;
    }
    return true;
  }, [registered, connected]);

  const value = useMemo(
    () => ({ registered, connected, loading, connecting, saving, matches, registerConnected, assertCanTransact }),
    [registered, connected, loading, connecting, saving, matches, registerConnected, assertCanTransact],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useIssuerWallet(): IssuerWalletState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useIssuerWallet must be used inside IssuerWalletProvider');
  return ctx;
}

/** Banner shown above every issuer page until the connected wallet is the registered one. */
export function IssuerWalletBanner() {
  const { registered, connected, loading, connecting, saving, matches, registerConnected } = useIssuerWallet();
  const { connectors, connect, isPending } = useConnect();

  if (loading || connecting || matches) return null;

  if (!registered) {
    return (
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-card border border-warning/40 bg-warning/10 p-4">
        <div className="flex items-start gap-3">
          <Wallet className="mt-0.5 h-5 w-5 text-warning" />
          <div>
            <p className="text-sm font-semibold text-ink">Register your issuer wallet</p>
            <p className="text-xs text-muted">
              Token deployment, minting, freezing and pausing are only allowed from your registered MetaMask wallet.
            </p>
          </div>
        </div>
        {connected ? (
          <button onClick={registerConnected} disabled={saving} className="btn-primary">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Register {short(connected)}
          </button>
        ) : (
          <button
            onClick={() => connectors[0] && connect({ connector: connectors[0] })}
            disabled={isPending || !connectors[0]}
            className="btn-primary"
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
            Connect MetaMask
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-card border border-danger/40 bg-danger/10 p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 text-danger" />
        <div>
          <p className="text-sm font-semibold text-ink">
            {connected ? 'Connected wallet is not your registered issuer wallet' : 'Registered issuer wallet not connected'}
          </p>
          <p className="text-xs text-muted">
            Registered: <span className="font-mono">{short(registered)}</span>
            {connected && (
              <>
                {' '}· Connected: <span className="font-mono">{short(connected)}</span>
              </>
            )}
            . Switch account in MetaMask to continue
            {connected ? ', or make the connected wallet your new issuer wallet.' : '.'}
          </p>
        </div>
      </div>
      {connected ? (
        <button onClick={registerConnected} disabled={saving} className="btn-secondary">
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Change registered wallet to {short(connected)}
        </button>
      ) : (
        <button
          onClick={() => connectors[0] && connect({ connector: connectors[0] })}
          disabled={isPending || !connectors[0]}
          className="btn-primary"
        >
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
          Connect MetaMask
        </button>
      )}
    </div>
  );
}

/** Settings card: shows the registered wallet and lets the issuer replace it. */
export function IssuerWalletCard() {
  const { registered, connected, loading, saving, matches, registerConnected } = useIssuerWallet();
  const canChange = !!connected && connected !== registered;

  return (
    <div className="card p-6">
      <h3 className="text-base font-bold text-ink">Issuer Wallet</h3>
      <p className="mt-1 text-sm text-muted">
        The only wallet allowed to deploy tokens, mint, freeze, unfreeze, pause and unpause for your account.
      </p>
      <div className="mt-4 rounded-lg border border-line bg-surface-header p-3">
        <p className="text-xs text-muted">Registered wallet</p>
        <p className="mt-1 break-all font-mono text-sm text-ink">
          {loading ? 'Loading…' : registered ?? 'None registered'}
        </p>
        {registered && (
          <p className={`mt-1 text-xs ${matches ? 'text-success' : 'text-warning'}`}>
            {matches ? 'Connected in MetaMask' : 'Not the wallet currently connected'}
          </p>
        )}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button onClick={registerConnected} disabled={saving || !canChange} className="btn-primary">
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {registered ? 'Change to connected wallet' : 'Register connected wallet'}
        </button>
        {!connected && <span className="text-xs text-muted">Connect MetaMask, switch to the new account, then click.</span>}
        {connected && !canChange && registered && (
          <span className="text-xs text-muted">To change, switch to a different account in MetaMask first.</span>
        )}
      </div>
    </div>
  );
}
