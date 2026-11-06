'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { Loader2, Coins, ShoppingCart, TrendingUp, RefreshCw, AlertTriangle, Snowflake, Clock, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@/store/auth.store';
import api from '@/lib/api';
import { getAccount } from 'wagmi/actions';
import { wagmiConfig } from '@/lib/wagmi-config';
import { InvestorPosition, fetchOnchainBalance } from '@/lib/investor-positions';

interface OnchainData {
  balance: number | null;
  frozen: boolean | null;
  loading: boolean;
}

const CHART_COLORS = ['rgb(var(--accent))', '#f59e0b', 'rgb(var(--accent2))', '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899'];

interface Holding {
  id: string;
  name: string;
  symbol: string;
  tokensHeld: number;
  totalValue: number;
  avgPrice: number;
  orders: number;
  allocation: number;
  color: string;
  /** Paid for, awaiting the issuer's mint — not part of tokensHeld. */
  pendingTokens: number;
  pendingValue: number;
  pendingOrders: number;
}

export default function PortfolioContent() {
  const { user } = useAuthStore();
  // Use imperative wagmi actions (not hooks) — these read from config directly,
  // never throw WagmiProviderNotFoundError because they don't use React context.
  const address = getAccount(wagmiConfig).address;
  const [positions, setPositions] = useState<InvestorPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [onchainData, setOnchainData] = useState<Record<string, OnchainData>>({});
  const prevTotalRef = useRef<number>(0);

  const fetchData = useCallback(async (silent = false) => {
    if (!user?.id) { setLoading(false); return; }
    try {
      if (!silent) setLoading(true);
      else setRefreshing(true);

      const response = await api.get('/tokens/portfolio/me', {
        headers: { 'x-user-id': user.id },
        params: address ? { wallet_address: address } : undefined,
      });
      const data: InvestorPosition[] = response.data?.data || [];
      const newPositions = Array.isArray(data) ? data : [];

      const newTotal = newPositions.reduce((s, p) => s + Number(p.quantity || 0), 0);
      if (silent && prevTotalRef.current > 0 && newTotal > prevTotalRef.current) {
        const diff = newTotal - prevTotalRef.current;
        toast.success(`Portfolio updated! ${diff.toLocaleString('en-US')} new tokens added to your holdings.`);
      }
      prevTotalRef.current = newTotal;
      setPositions(newPositions);
    } catch {
      setPositions([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id, address]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') fetchData(true);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [fetchData]);

  // While an order is waiting on the issuer's mint, check back more often so
  // the holdings update shortly after it lands rather than up to 30s later.
  const awaitingMint = positions.some((p) => Number(p.pendingOrders || 0) > 0);

  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') fetchData(true);
    }, awaitingMint ? 10_000 : 30_000);
    return () => clearInterval(interval);
  }, [fetchData, awaitingMint]);

  // Fetch on-chain balances + frozen status via backend API (avoids browser CORS on RPC)
  useEffect(() => {
    if (!address || positions.length === 0) return;

    const deployed = positions.filter(p => p.tokenAddress && p.status === 'active');
    if (deployed.length === 0) return;

    setOnchainData(prev => {
      const next = { ...prev };
      deployed.forEach(p => { next[p.tokenId] = { balance: null, frozen: null, loading: true }; });
      return next;
    });

    deployed.forEach(async (pos) => {
      const { balance, frozen } = await fetchOnchainBalance(pos.tokenId, address);
      setOnchainData(prev => ({
        ...prev,
        [pos.tokenId]: { balance, frozen, loading: false },
      }));
    });
  }, [positions, address]);

  const holdings = useMemo<Holding[]>(() => {
    if (positions.length === 0) return [];
    const totalPortfolio = positions.reduce((sum, p) => sum + Number(p.investedAmount || 0), 0);
    return positions.map((position, i) => {
      const quantity = Number(position.quantity || 0);
      const totalValue = Number(position.investedAmount || 0);
      const purchasedQty = Number(position.purchasedQuantity ?? 0);
      return {
        id: position.tokenId,
        name: position.name,
        symbol: position.symbol,
        tokensHeld: quantity,
        totalValue,
        // Price per token paid: invested amount over the tokens those payments
        // bought. `quantity` is the on-chain balance, which also counts tokens
        // that were not purchased (direct mints, transfers in).
        avgPrice: purchasedQty > 0 ? totalValue / purchasedQty : 0,
        orders: position.orders,
        allocation: totalPortfolio > 0 ? (totalValue / totalPortfolio) * 100 : 0,
        color: CHART_COLORS[i % CHART_COLORS.length],
        pendingTokens: Number(position.pendingQuantity || 0),
        pendingValue: Number(position.pendingAmount || 0),
        pendingOrders: Number(position.pendingOrders || 0),
      };
    });
  }, [positions]);

  const totalPortfolioValue = holdings.reduce((s, h) => s + h.totalValue, 0);
  // Purchased through completed payments — unaffected by later transfers out.
  const totalTokensBought = positions.reduce((s, p) => s + Number(p.purchasedQuantity || 0), 0);
  const totalOrders = positions.reduce((sum, p) => sum + p.orders, 0);

  // Tokens currently sitting in the connected wallet (read from the chain).
  const trackedBalances = Object.values(onchainData);
  const balancesLoading = !!address && (trackedBalances.some((d) => d.loading) || (positions.some((p) => p.tokenAddress && p.status === 'active') && trackedBalances.length === 0));
  const walletBalance = trackedBalances.reduce((s, d) => s + (d.balance ?? 0), 0);
  const walletBalanceKnown = !!address && trackedBalances.some((d) => d.balance !== null);

  // Paid for, waiting on the issuer to mint.
  const pendingTokens = holdings.reduce((s, h) => s + h.pendingTokens, 0);
  const pendingValue = holdings.reduce((s, h) => s + h.pendingValue, 0);
  const pendingOrders = holdings.reduce((s, h) => s + h.pendingOrders, 0);
  const hasPending = pendingOrders > 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center p-16">
        <Loader2 className="h-6 w-6 animate-spin text-accent" />
        <span className="ml-3 text-muted">Loading portfolio...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">Portfolio</h1>
          <p className="text-muted">Your tokenized asset holdings</p>
        </div>
        <button
          onClick={() => fetchData(true)}
          disabled={refreshing}
          className="flex items-center gap-1.5 rounded-md border border-line bg-card px-3 py-2 text-sm font-medium text-ink hover:bg-surface-header disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {hasPending && (
        <div className="card flex items-start gap-3 border-warning bg-warning-100 p-4">
          <Clock className="mt-0.5 h-5 w-5 flex-shrink-0 text-warning" />
          <div className="text-sm">
            <p className="font-semibold text-ink">
              {pendingOrders} order{pendingOrders === 1 ? '' : 's'} awaiting issuer approval
            </p>
            <p className="mt-0.5 text-muted">
              Your payment has been received. {pendingTokens.toLocaleString('en-US')} token
              {pendingTokens === 1 ? '' : 's'} will appear in your holdings once the issuer mints
              them on-chain. This page refreshes automatically.
            </p>
          </div>
        </div>
      )}

      <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${hasPending ? 'lg:grid-cols-5' : 'lg:grid-cols-4'}`}>
        <div className="card p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-soft">
              <TrendingUp className="h-5 w-5 text-accent" />
            </div>
            <div>
              <p className="text-sm text-muted">Total Value</p>
              <p className="text-2xl font-bold text-ink">
                ${totalPortfolioValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        </div>
        <div className="card p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success-100">
              <Coins className="h-5 w-5 text-success" />
            </div>
            <div>
              <p className="text-sm text-muted">Tokens Bought</p>
              <p className="text-2xl font-bold text-ink">
                {totalTokensBought.toLocaleString('en-US')}
              </p>
            </div>
          </div>
        </div>
        <div className="card p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-soft">
              <Wallet className="h-5 w-5 text-accent" />
            </div>
            <div>
              <p className="text-sm text-muted">Available Tokens</p>
              <p className="text-2xl font-bold text-ink">
                {balancesLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin text-muted" />
                ) : walletBalanceKnown ? (
                  walletBalance.toLocaleString('en-US')
                ) : (
                  '—'
                )}
              </p>
              <p className="text-xs text-muted">
                {address ? `In ${address.slice(0, 6)}…${address.slice(-4)}` : 'No wallet connected'}
              </p>
            </div>
          </div>
        </div>
        <div className="card p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning-100">
              <ShoppingCart className="h-5 w-5 text-warning" />
            </div>
            <div>
              <p className="text-sm text-muted">Total Orders</p>
              <p className="text-2xl font-bold text-ink">{totalOrders}</p>
            </div>
          </div>
        </div>
        {hasPending && (
          <div className="card p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning-100">
                <Clock className="h-5 w-5 text-warning" />
              </div>
              <div>
                <p className="text-sm text-muted">Awaiting Mint</p>
                <p className="text-2xl font-bold text-ink">
                  {pendingTokens.toLocaleString('en-US')}
                </p>
                <p className="text-xs text-muted">
                  ${pendingValue.toLocaleString('en-US', { minimumFractionDigits: 2 })} paid
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {holdings.length === 0 ? (
        <div className="card p-12 text-center">
          <ShoppingCart className="mx-auto h-12 w-12 text-muted" />
          <p className="mt-3 text-muted">No holdings yet.</p>
          <Link href="/tokens" className="mt-2 inline-block text-sm text-accent hover:underline">
            Browse tokens to start investing
          </Link>
        </div>
      ) : (
        <>
          <div className="card p-6">
            <h3 className="mb-4 text-lg font-semibold text-ink">Allocation</h3>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={holdings} cx="50%" cy="50%" innerRadius={70} outerRadius={120} paddingAngle={3} dataKey="totalValue" nameKey="name">
                    {holdings.map((h, i) => <Cell key={`cell-${i}`} fill={h.color} />)}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '0.75rem', color: '#e2e8f0' }}
                    itemStyle={{ color: '#e2e8f0' }}
                    formatter={(value: number) => `$${value.toLocaleString('en-US', { minimumFractionDigits: 2 })}`} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-col justify-center space-y-3">
                {holdings.map((h, i) => (
                  <div key={`legend-${i}`} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-full" style={{ backgroundColor: h.color }} />
                      <span className="text-sm text-ink">{h.name} ({h.symbol})</span>
                    </div>
                    <span className="text-sm font-medium text-ink">{h.allocation.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="card overflow-hidden">
            <div className="border-b border-line px-6 py-4">
              <h3 className="text-lg font-semibold text-ink">Holdings</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-line bg-card">
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase text-muted">Token</th>
                    <th className="px-6 py-3 text-right text-xs font-medium uppercase text-muted">Tokens Held</th>
                    <th className="px-6 py-3 text-right text-xs font-medium uppercase text-muted">On-Chain</th>
                    <th className="px-6 py-3 text-right text-xs font-medium uppercase text-muted">Value</th>
                    <th className="px-6 py-3 text-right text-xs font-medium uppercase text-muted">Avg Price</th>
                    <th className="px-6 py-3 text-right text-xs font-medium uppercase text-muted">Orders</th>
                    <th className="px-6 py-3 text-right text-xs font-medium uppercase text-muted">Allocation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {holdings.map((h) => {
                    const oc = onchainData[h.id];
                    const outOfSync = oc && !oc.loading && oc.balance !== null && Math.abs(oc.balance - h.tokensHeld) > 0.001;
                    const isFrozen = oc?.frozen === true;
                    return (
                      <tr key={h.id} className={`hover:bg-surface-header ${isFrozen ? 'bg-danger-100' : ''}`}>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <div>
                              <p className="text-sm font-medium text-ink">{h.name}</p>
                              <p className="text-xs text-muted">{h.symbol}</p>
                            </div>
                            {isFrozen && (
                              <span className="flex items-center gap-0.5 rounded-full bg-danger-100 px-2 py-0.5 text-xs font-medium text-danger">
                                <Snowflake className="h-3 w-3" /> Frozen
                              </span>
                            )}
                            {h.pendingTokens > 0 && (
                              <span
                                className="flex items-center gap-0.5 rounded-full bg-warning-100 px-2 py-0.5 text-xs font-medium text-warning"
                                title={`${h.pendingOrders} order(s) paid, awaiting the issuer to mint`}
                              >
                                <Clock className="h-3 w-3" /> Pending
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right text-sm text-ink">
                          <div className="flex flex-col items-end gap-0.5">
                            <span>{h.tokensHeld.toLocaleString('en-US')}</span>
                            {h.pendingTokens > 0 && (
                              <span className="text-xs font-medium text-warning">
                                +{h.pendingTokens.toLocaleString('en-US')} pending
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right text-sm">
                          {oc?.loading ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted ml-auto" />
                          ) : oc?.balance !== null && oc?.balance !== undefined ? (
                            <div className="flex flex-col items-end gap-0.5">
                              <span className={outOfSync ? 'font-medium text-warning' : 'text-ink'}>
                                {oc.balance.toLocaleString('en-US')}
                              </span>
                              {outOfSync && (
                                <span className="flex items-center gap-0.5 text-xs text-warning">
                                  <AlertTriangle className="h-3 w-3" /> Out of sync
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-muted">—</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right text-sm font-medium text-ink">
                          ${h.totalValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-6 py-4 text-right text-sm text-ink">
                          ${h.avgPrice.toFixed(2)}
                        </td>
                        <td className="px-6 py-4 text-right text-sm text-ink">{h.orders}</td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="h-2 w-16 rounded-full bg-surface-header overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${h.allocation}%`, backgroundColor: h.color }} />
                            </div>
                            <span className="text-sm text-ink">{h.allocation.toFixed(1)}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
