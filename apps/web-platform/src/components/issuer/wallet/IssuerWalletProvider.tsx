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
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Wallet,
  Copy,
  ExternalLink,
  ShieldCheck,
  Check,
} from 'lucide-react';
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
      toast.success('Issuer wallet registered successfully.');
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
  const { connectors, connect, isPending } = useConnect();
  const [copied, setCopied] = useState(false);
  const canChange = !!connected && connected !== registered;

  const handleCopy = (address: string) => {
    navigator.clipboard.writeText(address);
    setCopied(true);
    toast.success('Wallet address copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative overflow-hidden rounded-2xl border border-line bg-card p-5 sm:p-7 shadow-card transition-all duration-300 hover:border-accent/30">
      {/* Background Ambient Glow */}
      <div className="pointer-events-none absolute -right-20 -top-20 h-48 w-48 rounded-full bg-accent/5 blur-3xl" />

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-line pb-4 sm:pb-5">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent shadow-sm border border-accent/20">
            <Wallet className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base sm:text-lg font-bold text-ink">Issuer On-Chain Wallet</h3>
              <span className="inline-flex items-center gap-1 rounded-full border border-accent/20 bg-accent-soft px-2 py-0.5 text-[10px] sm:text-xs font-semibold text-accent">
                <ShieldCheck className="h-3 w-3" />
                ERC-3643 Authority
              </span>
            </div>
            <p className="mt-0.5 text-xs text-muted">
              The sole cryptographic address authorized to deploy contracts, mint, burn, pause, and freeze tokens.
            </p>
          </div>
        </div>

        {/* Live Status Pill */}
        <div className="self-start sm:self-auto">
          {loading ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-header px-3 py-1 text-xs text-muted">
              <Loader2 className="h-3 w-3 animate-spin" /> Verifying…
            </span>
          ) : registered ? (
            matches ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success-subtle/30 px-3 py-1 text-xs font-semibold text-success">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
                </span>
                Active & Verified
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-warning/30 bg-warning-subtle/30 px-3 py-1 text-xs font-semibold text-warning">
                <AlertTriangle className="h-3 w-3" />
                Mismatch in MetaMask
              </span>
            )
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-header px-3 py-1 text-xs font-medium text-muted">
              Not Registered
            </span>
          )}
        </div>
      </div>

      {/* Wallet Details Grid */}
      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Registered Issuer Wallet */}
        <div className="rounded-xl border border-line bg-surface-header p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-muted">Registered Issuer Wallet</span>
            {registered && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleCopy(registered)}
                  className="rounded-lg p-1.5 text-muted hover:bg-card hover:text-ink transition-colors"
                  title="Copy registered address"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
                <a
                  href={`https://etherscan.io/address/${registered}`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg p-1.5 text-muted hover:bg-card hover:text-ink transition-colors"
                  title="View on block explorer"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            )}
          </div>

          <div className="mt-2 min-h-[2.5rem] flex items-center">
            {loading ? (
              <div className="flex items-center gap-2 text-xs text-muted">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Reading registry state…</span>
              </div>
            ) : registered ? (
              <p className="break-all font-mono text-xs sm:text-sm font-semibold text-ink select-all">
                {registered}
              </p>
            ) : (
              <p className="text-xs text-muted italic">
                No issuer wallet registered yet. Connect your MetaMask wallet to register.
              </p>
            )}
          </div>

          <div className="mt-2.5 flex items-center justify-between border-t border-line/60 pt-2 text-[11px]">
            <span className="text-muted">Status:</span>
            {registered ? (
              <span className={`font-semibold ${matches ? 'text-success' : 'text-warning'}`}>
                {matches ? '✓ Connected in MetaMask' : '⚠ Connected wallet does not match'}
              </span>
            ) : (
              <span className="text-muted">Awaiting Registration</span>
            )}
          </div>
        </div>

        {/* Connected Wallet (MetaMask) */}
        <div className="rounded-xl border border-line bg-surface-header p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-muted">Currently Connected in MetaMask</span>
            {connected && (
              <button
                type="button"
                onClick={() => handleCopy(connected)}
                className="rounded-lg p-1.5 text-muted hover:bg-card hover:text-ink transition-colors"
                title="Copy connected address"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="mt-2 min-h-[2.5rem] flex items-center">
            {connected ? (
              <p className="break-all font-mono text-xs sm:text-sm font-semibold text-ink select-all">
                {connected}
              </p>
            ) : (
              <div className="flex items-center gap-2 text-xs text-muted">
                <span>MetaMask wallet not connected.</span>
              </div>
            )}
          </div>

          <div className="mt-2.5 flex items-center justify-between border-t border-line/60 pt-2 text-[11px]">
            <span className="text-muted">Session:</span>
            {connected ? (
              <span className="font-semibold text-accent">Active MetaMask Session</span>
            ) : (
              <span className="text-muted">Disconnected</span>
            )}
          </div>
        </div>
      </div>

      {/* Action Footer */}
      <div className="mt-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-line/80 bg-surface-alt p-3.5">
        <div className="text-xs text-muted">
          {!connected ? (
            <span>Connect your MetaMask wallet, switch to your signing account, then register.</span>
          ) : connected && !canChange && registered ? (
            <span className="text-success font-medium">
              ✓ Connected wallet matches your registered issuer authority.
            </span>
          ) : (
            <span>Sign a cryptographic challenge with MetaMask to register this address.</span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {!connected ? (
            <button
              type="button"
              onClick={() => connectors[0] && connect({ connector: connectors[0] })}
              disabled={isPending || !connectors[0]}
              className="btn-primary w-full sm:w-auto text-xs py-2 px-4"
            >
              {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wallet className="h-3.5 w-3.5" />}
              Connect MetaMask
            </button>
          ) : (
            <button
              type="button"
              onClick={registerConnected}
              disabled={saving || !canChange}
              className={`btn w-full sm:w-auto text-xs py-2 px-4 font-semibold ${
                canChange
                  ? 'btn-primary shadow-sm shadow-accent/20'
                  : 'btn-secondary opacity-60 cursor-not-allowed'
              }`}
            >
              {saving ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Signing & Registering…
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {registered ? 'Change to Connected Wallet' : 'Register Connected Wallet'}
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
