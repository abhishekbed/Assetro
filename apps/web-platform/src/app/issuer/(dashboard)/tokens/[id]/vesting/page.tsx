'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Clock,
  Plus,
  Loader2,
  Trash2,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Coins,
} from 'lucide-react';
import { getWalletClient, getPublicClient, getAccount } from 'wagmi/actions';
import { parseUnits, type Address } from 'viem';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { wagmiConfig } from '@/lib/wagmi-config';

const MINT_ABI = [
  {
    name: 'mint',
    type: 'function' as const,
    stateMutability: 'nonpayable' as const,
    inputs: [
      { name: '_to', type: 'address' },
      { name: '_amount', type: 'uint256' },
    ],
    outputs: [],
  },
] as const;

interface TokenInfo {
  id: string;
  name: string;
  symbol: string;
  decimals: number;
  tokenAddress?: string;
  status: string;
}

interface CapTableEntry {
  holderAddress: string;
  userId?: string | null;
  balance: number;
}

interface UpcomingRelease {
  date: string;
  amount: string;
}

interface VestingSchedule {
  id: string;
  tokenId: string;
  beneficiaryId: string;
  beneficiaryAddress: string;
  beneficiaryName: string;
  beneficiaryEmail: string;
  totalAmount: string;
  releasedAmount: string;
  startDate: string;
  endDate: string;
  cliffDate: string | null;
  vestingIntervalDays: number;
  status: 'pending' | 'active' | 'completed' | 'cancelled';
  revocable: boolean;
  revokedAt: string | null;
  tokenDecimals: number;
  tokenSymbol: string;
  vestedAmount: string;
  claimableAmount: string;
  progressPercent: number;
  nextReleaseDate: string | null;
  upcomingReleases: UpcomingRelease[];
}

const INTERVAL_OPTIONS = [
  { value: 1, label: 'Daily' },
  { value: 7, label: 'Weekly' },
  { value: 30, label: 'Monthly' },
  { value: 91, label: 'Quarterly' },
  { value: 365, label: 'Yearly' },
];

function fmtTokens(wei: string, decimals: number, symbol: string): string {
  if (!wei || wei === '0') return `0 ${symbol}`;
  try {
    const n = Number(BigInt(wei)) / 10 ** decimals;
    return `${n.toLocaleString('en-US', { maximumFractionDigits: 4 })} ${symbol}`;
  } catch {
    return `${wei} ${symbol}`;
  }
}

function statusBadge(status: VestingSchedule['status']) {
  const map: Record<string, string> = {
    active: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
    pending: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
    completed: 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
    cancelled: 'bg-rose-500/10 text-rose-400 border border-rose-500/20',
  };
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium border ${map[status] ?? 'bg-slate-800 text-slate-400 border-slate-700'}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
      <div
        className="h-2 rounded-full bg-accent transition-all duration-300 shadow-sm"
        style={{ width: `${Math.min(100, pct)}%` }}
      />
    </div>
  );
}

export default function VestingPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuthStore();
  const headers = user?.id ? { 'x-user-id': user.id } : {};

  const [token, setToken] = useState<TokenInfo | null>(null);
  const [schedules, setSchedules] = useState<VestingSchedule[]>([]);
  const [holders, setHolders] = useState<CapTableEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Create form
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    beneficiary_address: '',
    beneficiary_id: '',
    total_amount: '',
    start_date: '',
    end_date: '',
    cliff_date: '',
    vesting_interval_days: 30,
    revocable: false,
  });

  // Release state
  const [releasingId, setReleasingId] = useState<string | null>(null);

  // Load data
  const loadData = useCallback(async () => {
    try {
      const [tokenRes, schedulesRes] = await Promise.all([
        api.get(`/tokens/${id}`),
        api.get(`/tokens/${id}/vesting-schedules`, { headers }),
      ]);
      setToken(tokenRes.data?.data ?? null);
      setSchedules(schedulesRes.data?.data ?? []);

      // Load cap table for beneficiary dropdown
      const capRes = await api.get(`/tokens/cap-table/tokens/${id}`, { headers }).catch(() => null);
      if (capRes?.data?.data) {
        setHolders(capRes.data.data.map((e: CapTableEntry & Record<string, unknown>) => ({
          holderAddress: e.holderAddress ?? e['holder_address'],
          userId: e.userId ?? e['user_id'] ?? null,
          balance: e.balance,
        })));
      }
    } catch (e) {
      toast.error('Failed to load vesting data');
    } finally {
      setLoading(false);
    }
  }, [id, user?.id]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.beneficiary_address || !form.total_amount || !form.start_date || !form.end_date) {
      toast.error('Please fill in all required fields');
      return;
    }
    setCreating(true);
    try {
      await api.post(`/tokens/${id}/vesting-schedules`, {
        beneficiary_address: form.beneficiary_address,
        beneficiary_id: form.beneficiary_id || '00000000-0000-0000-0000-000000000000',
        total_amount: form.total_amount,
        start_date: form.start_date,
        end_date: form.end_date,
        cliff_date: form.cliff_date || undefined,
        vesting_interval_days: form.vesting_interval_days,
        revocable: form.revocable,
      }, { headers });
      toast.success('Vesting schedule created');
      setShowCreateForm(false);
      setForm({ beneficiary_address: '', beneficiary_id: '', total_amount: '', start_date: '', end_date: '', cliff_date: '', vesting_interval_days: 30, revocable: false });
      loadData();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to create schedule';
      toast.error(msg);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (scheduleId: string) => {
    if (!confirm('Cancel this vesting schedule?')) return;
    try {
      await api.delete(`/tokens/${id}/vesting-schedules/${scheduleId}`, { headers });
      toast.success('Schedule cancelled');
      loadData();
    } catch {
      toast.error('Failed to cancel schedule');
    }
  };

  const handleRelease = async (schedule: VestingSchedule) => {
    if (!token?.tokenAddress) {
      toast.error('Token not deployed — cannot release');
      return;
    }
    const claimableWei = BigInt(schedule.claimableAmount);
    if (claimableWei <= BigInt(0)) {
      toast.error('No tokens available to release yet');
      return;
    }

    const decimals = token.decimals ?? 18;
    const claimableDisplay = Number(claimableWei) / 10 ** decimals;

    setReleasingId(schedule.id);
    try {
      const walletClient = await getWalletClient(wagmiConfig);
      if (!walletClient) {
        toast.error('No wallet connected — connect MetaMask first');
        return;
      }

      toast.info(`Minting ${claimableDisplay.toFixed(4)} ${token.symbol} to ${schedule.beneficiaryAddress.slice(0, 10)}…`);

      const hash = await walletClient.writeContract({
        address: token.tokenAddress as Address,
        abi: MINT_ABI,
        functionName: 'mint',
        args: [schedule.beneficiaryAddress as Address, claimableWei],
        account: walletClient.account,
      });

      const publicClient = getPublicClient(wagmiConfig);
      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash });
      }

      // Record the release on backend
      await api.post(`/tokens/${id}/vesting-schedules/${schedule.id}/release`, {
        released_amount: claimableDisplay.toString(),
        tx_hash: hash,
      }, { headers });

      toast.success(`Released ${claimableDisplay.toFixed(4)} ${token.symbol}! Tx: ${hash.slice(0, 12)}…`);
      loadData();
    } catch (err: unknown) {
      const msg = (err as Error).message ?? String(err);
      toast.error(msg.includes('User rejected') ? 'Transaction cancelled' : `Release failed: ${msg.slice(0, 120)}`);
    } finally {
      setReleasingId(null);
    }
  };

  const handleBulkRelease = async () => {
    const eligible = schedules.filter(
      s => s.status === 'active' && BigInt(s.claimableAmount) > BigInt(0)
    );
    if (eligible.length === 0) {
      toast.error('No schedules have tokens available to release');
      return;
    }
    if (!confirm(`Release vested tokens for ${eligible.length} schedule(s)?`)) return;
    for (const s of eligible) {
      await handleRelease(s);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
      </div>
    );
  }

  const active = schedules.filter(s => s.status === 'active');
  const eligibleCount = active.filter(s => BigInt(s.claimableAmount) > BigInt(0)).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link
            href={`/issuer/tokens/${id}`}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-800 bg-slate-900/60 text-slate-400 hover:text-ink transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-ink">Vesting Schedules</h1>
            <p className="text-sm text-slate-400">{token?.name} ({token?.symbol}) · Linear & cliff schedule lockups</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          {eligibleCount > 0 && (
            <button
              onClick={handleBulkRelease}
              className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-semibold text-emerald-400 hover:bg-emerald-500/20 transition-colors shadow-sm"
            >
              <Coins className="h-4 w-4" />
              Bulk Release ({eligibleCount})
            </button>
          )}
          <button
            onClick={() => setShowCreateForm(v => !v)}
            className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-slate-950 shadow-lg hover:-translate-y-0.5 transition-all"
          >
            <Plus className="h-4 w-4" />
            Create Schedule
          </button>
        </div>
      </div>

      {/* Create form */}
      {showCreateForm && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl">
          <h2 className="mb-4 text-lg font-semibold text-ink">New Vesting Schedule</h2>
          <form onSubmit={handleCreate} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Beneficiary */}
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                Beneficiary Wallet Address *
              </label>
              {holders.length > 0 ? (
                <select
                  className="w-full rounded-xl border border-slate-700 bg-slate-800/80 px-3.5 py-2.5 text-sm text-ink focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                  value={form.beneficiary_address}
                  onChange={e => {
                    const h = holders.find(h => h.holderAddress === e.target.value);
                    setForm(f => ({ ...f, beneficiary_address: e.target.value, beneficiary_id: h?.userId ?? '' }));
                  }}
                >
                  <option value="" className="bg-slate-900 text-slate-400">Select from cap table…</option>
                  {holders.map(h => (
                    <option key={h.holderAddress} value={h.holderAddress} className="bg-slate-900 text-ink">
                      {h.holderAddress} (Balance: {h.balance.toLocaleString('en-US')})
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  className="w-full rounded-xl border border-slate-700 bg-slate-800/80 px-3.5 py-2.5 font-mono text-sm text-ink placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                  placeholder="0x..."
                  value={form.beneficiary_address}
                  onChange={e => setForm(f => ({ ...f, beneficiary_address: e.target.value }))}
                  required
                />
              )}
              {holders.length > 0 && (
                <input
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-800/80 px-3.5 py-2.5 font-mono text-sm text-ink placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                  placeholder="Or enter address manually: 0x..."
                  value={form.beneficiary_address}
                  onChange={e => setForm(f => ({ ...f, beneficiary_address: e.target.value }))}
                />
              )}
            </div>

            {/* Total amount */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                Total Amount ({token?.symbol}) *
              </label>
              <input
                type="number"
                min="1"
                step="any"
                className="w-full rounded-xl border border-slate-700 bg-slate-800/80 px-3.5 py-2.5 text-sm text-ink placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                placeholder="e.g. 10000"
                value={form.total_amount}
                onChange={e => setForm(f => ({ ...f, total_amount: e.target.value }))}
                required
              />
            </div>

            {/* Interval */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                Vesting Interval *
              </label>
              <select
                className="w-full rounded-xl border border-slate-700 bg-slate-800/80 px-3.5 py-2.5 text-sm text-ink focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                value={form.vesting_interval_days}
                onChange={e => setForm(f => ({ ...f, vesting_interval_days: Number(e.target.value) }))}
              >
                {INTERVAL_OPTIONS.map(o => (
                  <option key={o.value} value={o.value} className="bg-slate-900 text-ink">{o.label}</option>
                ))}
              </select>
            </div>

            {/* Start date */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                Start Date *
              </label>
              <input
                type="date"
                className="w-full rounded-xl border border-slate-700 bg-slate-800/80 px-3.5 py-2.5 text-sm text-ink focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                value={form.start_date}
                onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                required
              />
            </div>

            {/* End date */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                End Date *
              </label>
              <input
                type="date"
                className="w-full rounded-xl border border-slate-700 bg-slate-800/80 px-3.5 py-2.5 text-sm text-ink focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                value={form.end_date}
                onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
                required
              />
            </div>

            {/* Cliff date */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                Cliff Date (optional)
              </label>
              <input
                type="date"
                className="w-full rounded-xl border border-slate-700 bg-slate-800/80 px-3.5 py-2.5 text-sm text-ink focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                value={form.cliff_date}
                onChange={e => setForm(f => ({ ...f, cliff_date: e.target.value }))}
              />
            </div>

            {/* Revocable */}
            <div className="flex items-center gap-2 pt-3">
              <input
                type="checkbox"
                id="revocable"
                checked={form.revocable}
                onChange={e => setForm(f => ({ ...f, revocable: e.target.checked }))}
                className="h-4 w-4 rounded border-slate-700 bg-slate-800 text-cyan-500 focus:ring-cyan-500"
              />
              <label htmlFor="revocable" className="text-sm font-medium text-slate-300 cursor-pointer">Revocable schedule</label>
            </div>

            <div className="sm:col-span-2 flex justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creating}
                className="inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-2 text-sm font-semibold text-slate-950 shadow-lg disabled:opacity-40 transition-all"
              >
                {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                Create Schedule
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total Schedules</p>
          <p className="mt-2 text-2xl font-bold text-ink">{schedules.length}</p>
          <p className="text-xs text-slate-400 mt-1">{active.length} active lockups</p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Ready to Release</p>
          <p className="mt-2 text-2xl font-bold text-emerald-400">{eligibleCount}</p>
          <p className="text-xs text-slate-400 mt-1">schedules with claimable tokens</p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total Vesting Pool</p>
          <p className="mt-2 text-2xl font-bold text-cyan-400">
            {schedules.reduce((sum, s) => {
              try { return sum + Number(BigInt(s.totalAmount)) / 10 ** (s.tokenDecimals ?? 18); } catch { return sum; }
            }, 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}
          </p>
          <p className="text-xs text-slate-400 mt-1">{token?.symbol || 'Tokens'}</p>
        </div>
      </div>

      {/* Schedule list */}
      {schedules.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-800 bg-slate-900/60 p-12 text-center">
          <Clock className="h-12 w-12 text-slate-600" />
          <p className="mt-3 font-medium text-ink">No vesting schedules yet</p>
          <p className="text-sm text-slate-400">Create a schedule to allocate tokens over time</p>
          <button
            onClick={() => setShowCreateForm(true)}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-slate-950 shadow-lg"
          >
            <Plus className="h-4 w-4" /> Create Schedule
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {schedules.map(s => {
            const isExpanded = expandedId === s.id;
            const decimals = s.tokenDecimals ?? 18;
            const sym = s.tokenSymbol ?? token?.symbol ?? '';
            const claimable = BigInt(s.claimableAmount ?? '0');
            const hasClaimable = claimable > BigInt(0);

            return (
              <div key={s.id} className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden hover:border-slate-700/80 transition-all">
                {/* Row header */}
                <div className="flex items-center gap-4 p-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-ink text-sm truncate">
                        {s.beneficiaryName}
                      </span>
                      {statusBadge(s.status)}
                      {hasClaimable && s.status === 'active' && (
                        <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-400 font-medium">
                          Ready to release
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 font-mono mt-1">
                      {s.beneficiaryAddress.slice(0, 14)}…{s.beneficiaryAddress.slice(-6)}
                    </p>
                  </div>

                  {/* Progress */}
                  <div className="hidden sm:block w-36">
                    <ProgressBar pct={s.progressPercent} />
                    <p className="text-xs text-slate-400 mt-1.5 text-right font-mono">{s.progressPercent.toFixed(1)}% released</p>
                  </div>

                  {/* Total */}
                  <div className="text-right hidden md:block">
                    <p className="text-sm font-semibold text-ink">{fmtTokens(s.totalAmount, decimals, sym)}</p>
                    <p className="text-xs text-slate-400">total allocation</p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    {s.status === 'active' && (
                      <button
                        onClick={() => handleRelease(s)}
                        disabled={!hasClaimable || releasingId === s.id}
                        className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all ${
 hasClaimable
 ? 'bg-success text-slate-950 shadow-md' : 'border border-slate-700 bg-slate-800 text-slate-500 cursor-not-allowed opacity-50' }`}
                      >
                        {releasingId === s.id
                          ? <><Loader2 className="h-3 w-3 animate-spin" /> Releasing…</>
                          : <><Coins className="h-3.5 w-3.5" /> Release</>}
                      </button>
                    )}
                    {(s.status === 'active' || s.status === 'pending') && s.revocable && (
                      <button
                        onClick={() => handleDelete(s.id)}
                        className="rounded-lg p-2 text-slate-400 hover:bg-rose-500/10 hover:text-rose-400 transition-colors"
                        title="Cancel schedule"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : s.id)}
                      className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-ink transition-colors"
                    >
                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="border-t border-slate-800 bg-slate-800/40 p-5 grid grid-cols-2 gap-4 sm:grid-cols-4 text-sm">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Vested So Far</p>
                      <p className="mt-1 font-semibold text-ink">{fmtTokens(s.vestedAmount, decimals, sym)}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Released</p>
                      <p className="mt-1 font-semibold text-ink">{fmtTokens(s.releasedAmount, decimals, sym)}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Claimable Now</p>
                      <p className={`mt-1 font-semibold ${hasClaimable ? 'text-emerald-400' : 'text-slate-400'}`}>
                        {fmtTokens(s.claimableAmount, decimals, sym)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Next Release</p>
                      <p className="mt-1 font-semibold text-ink">
                        {s.nextReleaseDate ? new Date(s.nextReleaseDate).toLocaleDateString() : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Start Date</p>
                      <p className="mt-1 font-semibold text-ink">{new Date(s.startDate).toLocaleDateString()}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wider text-slate-400">End Date</p>
                      <p className="mt-1 font-semibold text-ink">{new Date(s.endDate).toLocaleDateString()}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Cliff Date</p>
                      <p className="mt-1 font-semibold text-ink">
                        {s.cliffDate ? new Date(s.cliffDate).toLocaleDateString() : 'None'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Interval</p>
                      <p className="mt-1 font-semibold text-ink">
                        {INTERVAL_OPTIONS.find(o => o.value === s.vestingIntervalDays)?.label ?? `${s.vestingIntervalDays} days`}
                      </p>
                    </div>
                    {s.upcomingReleases.length > 0 && (
                      <div className="col-span-2 sm:col-span-4 mt-2">
                        <p className="text-xs font-medium uppercase tracking-wider text-slate-400 mb-2">Upcoming Releases</p>
                        <div className="flex flex-wrap gap-2">
                          {s.upcomingReleases.map((r, i) => (
                            <span key={i} className="rounded-lg bg-slate-800 border border-slate-700 px-2.5 py-1 text-xs text-cyan-300 font-mono">
                              {new Date(r.date).toLocaleDateString()}: {fmtTokens(r.amount, decimals, sym)}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {s.beneficiaryEmail && (
                      <div className="col-span-2 mt-2">
                        <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Beneficiary Email</p>
                        <p className="mt-1 font-semibold text-ink">{s.beneficiaryEmail}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
