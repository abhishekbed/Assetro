'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Copy, ExternalLink, LogOut, Wallet } from 'lucide-react';
import { clsx } from 'clsx';
import { useAccount, useBalance, useConnect, useDisconnect } from 'wagmi';
import { disconnectWallet } from '@/lib/wallet-disconnect';

function truncateAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function ConnectWallet() {
  const { address, chain, isConnected } = useAccount();
  const { connectors, connect, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { data: balance } = useBalance({ address });
  const [showMenu, setShowMenu] = useState(false);
  const [showConnectors, setShowConnectors] = useState(false);
  const [mounted, setMounted] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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

  // wagmi's wallet state is only known after the client mounts (it can differ
  // from the server-rendered output if a wallet auto-reconnects), so we render
  // the same "disconnected" markup on the server and on the first client pass
  // to avoid a hydration mismatch, then swap in the real state post-mount.
  useEffect(() => {
    setMounted(true);
  }, []);

  const copyAddress = () => {
    if (address) {
      navigator.clipboard.writeText(address);
    }
  };

  if (mounted && isConnected && address) {
    return (
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setShowMenu((current) => !current)}
          className="btn gap-2"
        >
          <span className="h-2 w-2 rounded-full bg-success" />
          <span className="font-mono text-xs">{truncateAddress(address)}</span>
          {balance && (
            <span className="hidden text-xs text-muted lg:inline">
              {parseFloat(balance.formatted).toFixed(3)} {balance.symbol}
            </span>
          )}
          <ChevronDown className={clsx('h-3.5 w-3.5 text-muted transition-transform', showMenu && 'rotate-180')} />
        </button>

        {showMenu && (
          <div className="card absolute right-0 top-full z-50 mt-2 w-[min(15rem,calc(100vw-2rem))] py-1">
            <div className="border-b border-line px-4 py-2.5">
              <p className="label">Connected to</p>
              <p className="mt-0.5 text-sm font-semibold text-ink">{chain?.name || 'Unknown Network'}</p>
            </div>
            <button
              onClick={copyAddress}
              className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-ink transition-colors hover:bg-surface-header"
            >
              <Copy className="h-4 w-4 text-muted" />
              Copy Address
            </button>
            {chain?.blockExplorers?.default?.url && (
              <a
                href={`${chain.blockExplorers.default.url}/address/${address}`}
                target="_blank"
                rel="noreferrer"
                className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-ink transition-colors hover:bg-surface-header"
              >
                <ExternalLink className="h-4 w-4 text-muted" />
                View on Explorer
              </a>
            )}
            <hr className="my-1 border-line" />
            <button
              onClick={async () => {
                await disconnectWallet();
                setShowMenu(false);
              }}
              className="flex w-full items-center gap-2.5 px-4 py-2 text-sm font-semibold text-danger transition-colors hover:bg-danger-100"
            >
              <LogOut className="h-4 w-4" />
              Disconnect
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setShowConnectors((current) => !current)}
        disabled={isPending}
        className="btn-secondary gap-2 whitespace-nowrap"
      >
        <Wallet className="h-4 w-4" />
        <span className="hidden sm:inline">{isPending ? 'Connecting...' : 'Connect Wallet'}</span>
      </button>

      {showConnectors && (
        <div className="card absolute right-0 top-full z-50 mt-2 min-w-52 max-w-[calc(100vw-2rem)] py-1">
          <p className="label border-b border-line px-4 pb-2 pt-2.5">Select Wallet</p>
          {connectors.map((connector) => (
            <button
              key={connector.uid}
              onClick={() => {
                connect({ connector });
                setShowConnectors(false);
              }}
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-ink transition-colors hover:bg-surface-header"
            >
              <Wallet className="h-4 w-4 text-muted" />
              {connector.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
