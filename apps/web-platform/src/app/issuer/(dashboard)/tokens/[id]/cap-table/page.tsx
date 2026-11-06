'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import clsx from 'clsx';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Users,
  Coins,
  RefreshCw,
  Download,
  Loader2,
  AlertCircle,
  Info,
} from 'lucide-react';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';

interface TokenInfo {
  id: string;
  name: string;
  symbol: string;
  totalSupply: number;
  circulatingSupply?: number;
  holders?: number;
  status: string;
}

interface CapTableEntry {
  holderAddress: string;
  userId?: string | null;
  balance: number;
  ownershipPercent: number;
  lastSynced: string;
  source: 'blockchain' | 'payments';
}

function truncateAddress(address: string): string {
  if (!address || address.length < 12) return address || '-';
  return address.slice(0, 6) + '...' + address.slice(-4);
}

function formatDate(dateStr: string | undefined): string {
  if (!dateStr) return '-';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

export default function CapTablePage() {
  const params = useParams();
  const id = params.id as string;
  const { user } = useAuthStore();

  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);
  const [capTable, setCapTable] = useState<CapTableEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [noCapData, setNoCapData] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const headers = user?.id ? { 'x-user-id': user.id } : {};

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const tokenRes = await api.get('/tokens/' + id);
      const token = tokenRes.data.data || tokenRes.data;
      setTokenInfo(token);

      let capData: CapTableEntry[] = [];

      // 1. Try the real cap table (populated by blockchain sync)
      try {
        const capRes = await api.get('/tokens/cap-table/tokens/' + id, { headers });
        const raw: any[] = capRes.data.data || [];
        if (Array.isArray(raw) && raw.length > 0) {
          const totalBalance = raw.reduce((sum, e) => sum + Number(e.balance || 0), 0);
          capData = raw.map((entry) => ({
            holderAddress: entry.walletAddress || entry.wallet_address || '',
            userId: entry.userId || entry.user_id || null,
            balance: Number(entry.balance || 0),
            ownershipPercent: Number(entry.percentage ?? (totalBalance > 0 ? (Number(entry.balance || 0) / totalBalance) * 100 : 0)),
            lastSynced: entry.lastSyncedAt || entry.last_synced_at || entry.updatedAt || '',
            source: 'blockchain' as const,
          }));
        }
      } catch (capErr: any) {
        if (capErr?.response?.status !== 404) {
          console.warn('Cap table fetch error:', capErr?.message);
        }
      }

      // 2. If no blockchain data, derive holders from completed payments
      if (capData.length === 0) {
        setNoCapData(true);
        try {
          const paymentsRes = await api.get('/payments/token/' + id, { headers });
          const payments: any[] = paymentsRes.data.data || paymentsRes.data || [];
          const completed = Array.isArray(payments)
            ? payments.filter((p) => p.status === 'completed')
            : [];

          // Aggregate token amounts by userId
          const holderMap: Record<string, { userId: string; tokenAmount: number; latestDate: string }> = {};
          for (const p of completed) {
            const uid = p.userId || p.user_id || 'unknown';
            if (!holderMap[uid]) {
              holderMap[uid] = { userId: uid, tokenAmount: 0, latestDate: p.createdAt || '' };
            }
            holderMap[uid].tokenAmount += Number(p.tokenAmount || 0);
            if (p.createdAt > holderMap[uid].latestDate) {
              holderMap[uid].latestDate = p.createdAt;
            }
          }

          const holders = Object.values(holderMap).filter((h) => h.tokenAmount > 0);
          const totalTokens = holders.reduce((sum, h) => sum + h.tokenAmount, 0);
          capData = holders.map((h) => ({
            holderAddress: '-',
            userId: h.userId,
            balance: h.tokenAmount,
            ownershipPercent: totalTokens > 0 ? (h.tokenAmount / totalTokens) * 100 : 0,
            lastSynced: h.latestDate,
            source: 'payments' as const,
          }));
        } catch {
          // No payment data either
        }
      } else {
        setNoCapData(false);
      }

      setCapTable(capData);
    } catch (err: any) {
      const message = err?.response?.data?.message || err?.message || 'Failed to load data';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [id, user?.id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      await api.post('/tokens/cap-table/tokens/' + id + '/sync', {}, { headers });
      await fetchData();
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Blockchain sync not available yet.';
      toast.error(msg);
    } finally {
      setSyncing(false);
    }
  };

  const handleExportCSV = () => {
    if (capTable.length === 0) return;
    const csvHeader = 'Holder Address,Balance,Ownership %,Last Synced\n';
    const csvRows = capTable
      .map(
        (row) =>
          `"${row.holderAddress}",${row.balance},${row.ownershipPercent.toFixed(2)},"${row.lastSynced || '-'}"`
      )
      .join('\n');
    const csvContent = csvHeader + csvRows;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `cap-table-${tokenInfo?.symbol || id}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const totalHolders = capTable.filter((e) => e.balance > 0).length;
  const totalSupply = tokenInfo?.totalSupply || 0;
  const circulatingSupply = tokenInfo?.circulatingSupply || capTable.reduce((sum, e) => sum + e.balance, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
      </div>
    );
  }

  if (error || !tokenInfo) {
    return (
      <div className="space-y-6">
        <Link
          href={'/issuer/tokens/' + id}
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-400 hover:text-cyan-400 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Token
        </Link>
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-center">
          <AlertCircle className="mx-auto mb-2 h-8 w-8 text-red-400" />
          <p className="text-red-400 font-medium">{error || 'Token not found'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link
        href={'/issuer/tokens/' + id}
        className="group inline-flex items-center gap-2 text-sm font-semibold text-slate-400 hover:text-cyan-400 transition-colors"
      >
        <ArrowLeft className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-1" />
        Back to Token
      </Link>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-ink">
            {tokenInfo.name} Cap Table
          </h1>
          <p className="mt-1 text-sm font-mono text-cyan-400/80">
            {tokenInfo.symbol} <span className="text-slate-500">&middot;</span> Ownership distribution
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={handleExportCSV}
            disabled={capTable.length === 0}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-700/80 bg-slate-800/60 px-4 py-2 text-sm font-semibold text-slate-200 hover:border-slate-600 hover:bg-slate-800 hover:text-ink transition-all disabled:opacity-40"
          >
            <Download className="h-4 w-4" />
            <span>Export CSV</span>
          </button>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-2 text-sm font-bold text-slate-950 shadow-md hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {syncing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            <span>Sync from Blockchain</span>
          </button>
        </div>
      </div>

      {noCapData && capTable.length > 0 && (
        <div className="flex items-start gap-3.5 rounded-2xl border border-blue-500/30 bg-blue-500/10 p-4 shadow-lg">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-500/20 text-cyan-400 border border-blue-500/30">
            <Info className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-bold text-blue-300">Derived from payment records</p>
            <p className="mt-0.5 text-xs text-blue-200/70 leading-relaxed">
              Blockchain sync is not yet active. Showing holders derived from completed purchases. Wallet addresses will appear once blockchain integration is live.
            </p>
          </div>
        </div>
      )}

      {noCapData && capTable.length === 0 && (
        <div className="flex items-start gap-3.5 rounded-2xl border border-blue-500/30 bg-blue-500/10 p-4 shadow-lg">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-500/20 text-cyan-400 border border-blue-500/30">
            <Info className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-bold text-blue-300">No holders yet</p>
            <p className="mt-0.5 text-xs text-blue-200/70 leading-relaxed">
              Cap table will populate once tokens are purchased or blockchain sync is active.
            </p>
          </div>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-5 shadow-lg transition-all hover:border-slate-700/80 hover:bg-slate-900/90">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total Holders</p>
            <div className="rounded-xl p-2 bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <Users className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-3 text-3xl font-extrabold tracking-tight text-ink">
            {totalHolders.toLocaleString('en-US')}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-5 shadow-lg transition-all hover:border-slate-700/80 hover:bg-slate-900/90">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total Supply</p>
            <div className="rounded-xl p-2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Coins className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-3 text-3xl font-extrabold tracking-tight text-ink">
            {Number(totalSupply).toLocaleString('en-US')}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-5 shadow-lg transition-all hover:border-slate-700/80 hover:bg-slate-900/90">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Circulating Supply</p>
            <div className="rounded-xl p-2 bg-purple-500/10 text-purple-400 border border-purple-500/20">
              <Coins className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-3 text-3xl font-extrabold tracking-tight text-ink">
            {Number(circulatingSupply).toLocaleString('en-US')}
          </p>
        </div>
      </div>

      {/* Cap Table */}
      <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 overflow-hidden shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <h3 className="text-base font-bold text-ink tracking-tight">Holders</h3>
          <span className="rounded-full border border-slate-700/80 bg-slate-800/80 px-2.5 py-0.5 text-xs font-semibold text-slate-300">
            {totalHolders} {totalHolders === 1 ? 'record' : 'records'}
          </span>
        </div>
        {capTable.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-14 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-800 bg-slate-950/60 text-slate-500 mb-3 shadow-inner">
              <Users className="h-7 w-7" />
            </div>
            <p className="text-base font-bold text-ink">No Holders Found</p>
            <p className="mt-1 max-w-sm text-xs text-slate-400">
              Mint tokens or whitelist addresses to see real-time ownership distribution here.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/60">
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Holder
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Tokens
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Ownership %
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Last Activity
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Source
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {capTable.map((entry, idx) => (
                  <tr key={entry.holderAddress !== '-' ? entry.holderAddress : (entry.userId || idx)} className="hover:bg-slate-800/40 transition-colors">
                    <td className="px-6 py-4 text-sm text-slate-300">
                      {entry.holderAddress !== '-' ? (
                        <span className="font-mono text-cyan-300" title={entry.holderAddress}>
                          {truncateAddress(entry.holderAddress)}
                        </span>
                      ) : (
                        <span className="text-slate-400 font-mono text-xs">
                          {entry.userId ? `User ${entry.userId.slice(0, 8)}...` : 'Unknown'}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-bold text-ink">
                      {entry.balance.toLocaleString('en-US')}
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-medium text-slate-300">
                      {entry.ownershipPercent.toFixed(2)}%
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-400">
                      {entry.lastSynced ? formatDate(entry.lastSynced) : '-'}
                    </td>
                    <td className="px-6 py-4">
                      <span className={clsx(
                        'inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold',
                        entry.source === 'blockchain'
                          ? 'border border-emerald-500/30 bg-emerald-500/15 text-emerald-400'
                          : 'border border-blue-500/30 bg-blue-500/15 text-blue-400'
                      )}>
                        {entry.source === 'blockchain' ? 'Blockchain' : 'Payments'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
