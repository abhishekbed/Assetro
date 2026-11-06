'use client';

import { useConnect, useBalance, type Connector } from 'wagmi';
import { clsx } from 'clsx';
import { toast } from 'sonner';
import {
  Wallet,
  ChevronDown,
  LogOut,
  Copy,
  ExternalLink,
  Check,
  Link2,
  Unlink,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { useState, useRef, useEffect, useMemo } from 'react';
import { useWalletLink } from '@/hooks/useWalletLink';

function truncateAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * wagmi v2 discovers browser wallets via EIP-6963 (e.g. "MetaMask") in addition
 * to the generic `injected()` connector — hide the generic one when a named one exists.
 */
function useVisibleConnectors(connectors: readonly Connector[]) {
  return useMemo(() => {
    const named = connectors.filter((c) => c.type === 'injected' && c.id !== 'injected');
    return connectors.filter((c) => !(c.id === 'injected' && named.length > 0));
  }, [connectors]);
}

function connectErrorMessage(err: Error) {
  if (err.name === 'ProviderNotFoundError') return 'No wallet extension found. Install MetaMask to continue.';
  if (err.name === 'UserRejectedRequestError' || /reject/i.test(err.message)) return 'Connection request was rejected.';
  if (/already pending/i.test(err.message)) return 'Open your wallet — a connection request is already pending.';
  return (err as { shortMessage?: string }).shortMessage || err.message || 'Failed to connect wallet';
}

export function ConnectWallet({ fullWidth = false }: { fullWidth?: boolean }) {
  const {
    address,
    chain,
    isConnected,
    isAuthenticated,
    isLinked,
    isMismatch,
    linkedAddress,
    linking,
    unlinking,
    linkWallet,
    unlinkWallet,
    disconnect,
  } = useWalletLink();
  const { connectors, connect, isPending, variables } = useConnect({
    mutation: {
      onSuccess: () => setShowConnectors(false),
      onError: (err) => {
        const message = connectErrorMessage(err);
        // wagmi throws ProviderNotFoundError when no browser wallet is installed (not in its typed union)
        if ((err.name as string) === 'ProviderNotFoundError') {
          toast.error(message, {
            action: { label: 'Get MetaMask', onClick: () => window.open('https://metamask.io/download/', '_blank') },
          });
        } else {
          toast.error(message);
        }
      },
    },
  });
  const visibleConnectors = useVisibleConnectors(connectors);
  const { data: balance } = useBalance({ address });
  const [mounted, setMounted] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showConnectors, setShowConnectors] = useState(false);
  const [copied, setCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
        setShowConnectors(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const copyAddress = () => {
    if (!address) return;
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // Wallet state only exists in the browser — render a stable placeholder on the server.
  if (!mounted) {
    return (
      <button type="button" disabled className={clsx('btn-secondary gap-2 whitespace-nowrap', fullWidth && 'w-full')}>
        <Wallet className="h-4 w-4" />
        <span className={fullWidth ? '' : 'hidden sm:inline'}>Connect Wallet</span>
      </button>
    );
  }

  if (isConnected && address) {
    return (
      <div className="relative" ref={menuRef}>
        <button
          type="button"
          onClick={() => setShowMenu(!showMenu)}
          className={clsx(
            'flex items-center gap-2 rounded-xl border bg-card px-3 py-2 text-sm font-medium text-ink transition-colors hover:bg-surface-header',
            isMismatch ? 'border-amber-500/40 hover:border-amber-400/60' : 'border-line hover:border-cyan-500/40',
            fullWidth && 'w-full justify-center',
          )}
        >
          <span
            className={clsx(
              'h-2 w-2 rounded-full',
              isMismatch
                ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]'
                : 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]',
            )}
          />
          <span className="font-mono">{truncateAddress(address)}</span>
          {balance && (
            <span className="hidden text-muted lg:inline">
              {parseFloat(balance.formatted).toFixed(4)} {balance.symbol}
            </span>
          )}
          <ChevronDown className={clsx('h-3 w-3 transition-transform', showMenu && 'rotate-180')} />
        </button>

        {showMenu && (
          <div className="absolute right-0 top-full z-50 mt-2 w-[min(18rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-line bg-card shadow-2xl shadow-black/40 ">
            <div className="border-b border-line px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Connected to</p>
              <p className="mt-0.5 text-sm font-medium text-ink">{chain?.name || 'Unsupported network'}</p>
              <p className="mt-1 break-all font-mono text-xs text-muted">{address}</p>
            </div>

            {/* Account link status — only meaningful when signed in */}
            {isAuthenticated && (
              <div className="border-b border-line px-4 py-3">
                {linking ? (
                  <p className="flex items-center gap-2 text-xs text-accent">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Linking to your account…
                  </p>
                ) : isLinked ? (
                  <p className="flex items-center gap-2 text-xs text-emerald-300">
                    <Check className="h-3.5 w-3.5" /> Linked to your account
                  </p>
                ) : (
                  <div className="space-y-2">
                    {isMismatch ? (
                      <p className="flex items-start gap-2 text-xs text-amber-300">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                        <span>
                          Your account is linked to{' '}
                          <span className="font-mono">{truncateAddress(linkedAddress!)}</span>. Tokens are delivered
                          there.
                        </span>
                      </p>
                    ) : (
                      <p className="text-xs text-muted">This wallet is not linked to your account yet.</p>
                    )}
                    <button
                      type="button"
                      onClick={() => linkWallet()}
                      className="btn-primary w-full gap-1.5 py-1.5 text-xs"
                    >
                      <Link2 className="h-3.5 w-3.5" />
                      {isMismatch ? 'Link this wallet instead' : 'Link to my account'}
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="py-1">
              <button
                type="button"
                onClick={copyAddress}
                className="flex w-full items-center gap-2 px-4 py-2 text-sm text-ink hover:bg-surface-header"
              >
                {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                {copied ? 'Copied!' : 'Copy Address'}
              </button>
              {chain?.blockExplorers?.default?.url && (
                <a
                  href={`${chain.blockExplorers.default.url}/address/${address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex w-full items-center gap-2 px-4 py-2 text-sm text-ink hover:bg-surface-header"
                >
                  <ExternalLink className="h-4 w-4" />
                  View on Explorer
                </a>
              )}
              <button
                type="button"
                onClick={() => {
                  disconnect();
                  setShowMenu(false);
                  toast.info('Wallet disconnected');
                }}
                className="flex w-full items-center gap-2 px-4 py-2 text-sm text-ink hover:bg-surface-header"
              >
                <LogOut className="h-4 w-4" />
                Disconnect
              </button>
              {isAuthenticated && isLinked && (
                <button
                  type="button"
                  onClick={async () => {
                    setShowMenu(false);
                    await unlinkWallet();
                  }}
                  disabled={unlinking}
                  className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 disabled:opacity-50"
                >
                  {unlinking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unlink className="h-4 w-4" />}
                  Unlink from Account
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setShowConnectors(!showConnectors)}
        disabled={isPending}
        className={clsx('btn-secondary gap-2 whitespace-nowrap', fullWidth && 'w-full')}
        aria-label="Connect Wallet"
      >
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
        <span className={fullWidth ? '' : 'hidden sm:inline'}>{isPending ? 'Check your wallet…' : 'Connect Wallet'}</span>
      </button>

      {showConnectors && (
        <div
          className={clsx(
            'absolute top-full z-50 mt-2 overflow-hidden rounded-xl border border-line bg-card py-1 shadow-2xl shadow-black/40 ',
            fullWidth ? 'left-0 right-0' : 'right-0 w-64',
          )}
        >
          <p className="px-4 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
            Choose a wallet
          </p>
          {visibleConnectors.map((connector) => (
            <button
              type="button"
              key={connector.uid}
              disabled={isPending}
              onClick={() => connect({ connector })}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-ink hover:bg-surface-header disabled:opacity-50"
            >
              {connector.icon ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={connector.icon} alt="" className="h-5 w-5 rounded" />
              ) : (
                <Wallet className="h-5 w-5 text-muted" />
              )}
              <span className="flex-1 text-left">
                {connector.id === 'injected' ? 'Browser Wallet' : connector.name}
              </span>
              {isPending && variables?.connector === connector && (
                <Loader2 className="h-4 w-4 animate-spin text-accent" />
              )}
            </button>
          ))}
          {isAuthenticated && linkedAddress && (
            <p className="border-t border-line px-4 py-2 text-[11px] text-muted">
              Linked wallet: <span className="font-mono text-muted">{truncateAddress(linkedAddress)}</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
