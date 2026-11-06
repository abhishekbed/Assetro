'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { toast } from 'sonner';
import {
  Plus,
  Landmark,
  Vote,
  Megaphone,
  ArrowDownCircle,
  Calendar,
  Coins,
  Play,
  Loader2,
  GitMerge,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';

interface CorporateAction {
  id: string;
  type: 'dividend' | 'stock_split' | 'voting' | 'buyback' | 'announcement';
  title: string;
  description: string | null;
  tokenId: string;
  status: 'draft' | 'active' | 'executing' | 'completed' | 'cancelled';
  recordDate: string;
  paymentDate: string | null;
  parameters: Record<string, unknown> | null;
  executedAt: string | null;
  executionResult: Record<string, unknown> | null;
  createdAt: string;
}

const TYPE_ICON: Record<string, React.ElementType> = {
  dividend: Coins,
  stock_split: GitMerge,
  voting: Vote,
  buyback: ArrowDownCircle,
  announcement: Megaphone,
};

const TYPE_BADGE: Record<string, string> = {
  dividend: 'bg-emerald-500/10 text-emerald-400',
  stock_split: 'bg-blue-500/10 text-blue-400',
  voting: 'bg-violet-500/10 text-violet-400',
  buyback: 'bg-amber-500/10 text-amber-400',
  announcement: 'bg-sky-500/10 text-sky-400',
};

const STATUS_BADGE: Record<string, string> = {
  draft: 'bg-slate-700/50 text-slate-400',
  active: 'bg-emerald-500/10 text-emerald-400',
  executing: 'bg-amber-500/10 text-amber-400',
  completed: 'bg-blue-500/10 text-blue-400',
  cancelled: 'bg-red-500/10 text-red-400',
};

function fmtDate(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function CorporateActionsPage() {
  const { user } = useAuthStore();
  const headers = user?.id ? { 'x-user-id': user.id } : {};

  const [actions, setActions] = useState<CorporateAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [executingId, setExecutingId] = useState<string | null>(null);

  const loadActions = useCallback(async () => {
    try {
      const res = await api.get('/corporate-actions', { headers });
      setActions(res.data?.data ?? []);
    } catch {
      toast.error('Failed to load corporate actions');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { loadActions(); }, [loadActions]);

  const handleActivate = async (id: string) => {
    try {
      await api.post(`/corporate-actions/${id}/activate`, {}, { headers });
      toast.success('Action activated');
      loadActions();
    } catch {
      toast.error('Failed to activate action');
    }
  };

  const handleExecute = async (action: CorporateAction) => {
    if (!confirm(`Execute "${action.title}"? This will ${action.type === 'dividend' ? 'distribute dividends' : action.type === 'stock_split' ? 'mint split tokens' : 'finalize'} and cannot be undone.`)) return;
    setExecutingId(action.id);
    try {
      const res = await api.post(`/corporate-actions/${action.id}/execute`, {}, { headers });
      const result = res.data?.data;

      if (action.type === 'dividend' && result?.exportReady) {
        toast.success('Dividend calculated — download CSV for wire payments');
        window.open(`${process.env.NEXT_PUBLIC_API_URL}/corporate-actions/${action.id}/export-csv`, '_blank');
      } else {
        toast.success(`Executed! ${result?.txHash ? `Tx: ${String(result.txHash).slice(0, 12)}…` : ''}`);
      }
      loadActions();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Execution failed';
      toast.error(msg);
    } finally {
      setExecutingId(null);
    }
  };

  const handleCancel = async (id: string) => {
    if (!confirm('Cancel this corporate action?')) return;
    try {
      await api.delete(`/corporate-actions/${id}`, { headers });
      toast.success('Action cancelled');
      loadActions();
    } catch {
      toast.error('Failed to cancel action');
    }
  };

  const counts = {
    total: actions.length,
    active: actions.filter(a => a.status === 'active').length,
    draft: actions.filter(a => a.status === 'draft').length,
    completed: actions.filter(a => a.status === 'completed').length,
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">Corporate Actions</h1>
          <p className="text-slate-400">Manage dividends, voting, stock splits, and buybacks</p>
        </div>
        <Link
          href="/issuer/corporate-actions/create"
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-slate-950 shadow-lg transition-all hover:-translate-y-0.5"
        >
          <Plus className="h-4 w-4" />
          Create Action
        </Link>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          { label: 'Total', value: counts.total, icon: Landmark, color: 'text-blue-400', bg: 'bg-blue-500/10' },
          { label: 'Active', value: counts.active, icon: Play, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
          { label: 'Drafts', value: counts.draft, icon: Calendar, color: 'text-amber-400', bg: 'bg-amber-500/10' },
          { label: 'Completed', value: counts.completed, icon: CheckCircle2, color: 'text-violet-400', bg: 'bg-violet-500/10' },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-400">{label}</p>
              <div className={`rounded-lg p-2 ${bg}`}>
                <Icon className={`h-5 w-5 ${color}`} />
              </div>
            </div>
            <p className="mt-3 text-2xl font-bold text-ink">{value}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60">
        {loading ? (
          <div className="flex justify-center p-12">
            <Loader2 className="h-7 w-7 animate-spin text-blue-400" />
          </div>
        ) : actions.length === 0 ? (
          <div className="p-12 text-center">
            <Landmark className="mx-auto mb-3 h-10 w-10 text-slate-600" />
            <p className="font-medium text-slate-300">No corporate actions yet</p>
            <Link
              href="/issuer/corporate-actions/create"
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-slate-950 shadow-lg transition-all hover:-translate-y-0.5"
            >
              <Plus className="h-4 w-4" /> Create Action
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-800/40">
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Title</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Record Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Created</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-slate-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {actions.map(action => {
                  const Icon = TYPE_ICON[action.type] ?? Landmark;
                  return (
                    <tr key={action.id} className="hover:bg-slate-800/40">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4 text-slate-500" />
                          <span className={clsx('rounded-full px-2 py-0.5 text-xs font-medium capitalize', TYPE_BADGE[action.type] ?? 'bg-slate-700/50 text-slate-400')}>
                            {action.type.replace('_', ' ')}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-medium text-ink">
                        <Link href={`/issuer/corporate-actions/${action.id}`} className="hover:text-blue-400">
                          {action.title}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <span className={clsx('rounded-full px-2 py-0.5 text-xs font-medium capitalize', STATUS_BADGE[action.status] ?? 'bg-slate-700/50 text-slate-400')}>
                          {action.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-400">{fmtDate(action.recordDate)}</td>
                      <td className="px-4 py-3 text-slate-400">{fmtDate(action.createdAt)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          {action.status === 'draft' && (
                            <button
                              onClick={() => handleActivate(action.id)}
                              className="rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-400 hover:bg-emerald-500/20"
                            >
                              Activate
                            </button>
                          )}
                          {action.status === 'active' && (
                            <button
                              onClick={() => handleExecute(action)}
                              disabled={executingId === action.id}
                              className="flex items-center gap-1 rounded-md border border-blue-500/20 bg-blue-500/10 px-2.5 py-1 text-xs font-medium text-blue-400 hover:bg-blue-500/20 disabled:opacity-50"
                            >
                              {executingId === action.id
                                ? <><Loader2 className="h-3 w-3 animate-spin" /> Running…</>
                                : <><Play className="h-3 w-3" /> Execute</>}
                            </button>
                          )}
                          {action.status === 'completed' && action.type === 'dividend' && (
                            <a
                              href={`${process.env.NEXT_PUBLIC_API_URL}/corporate-actions/${action.id}/export-csv`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="rounded-md border border-slate-700 px-2.5 py-1 text-xs font-medium text-slate-300 hover:bg-slate-800"
                            >
                              CSV
                            </a>
                          )}
                          {(action.status === 'active' || action.status === 'draft') && (
                            <button
                              onClick={() => handleCancel(action.id)}
                              className="rounded-md px-2.5 py-1 text-xs font-medium text-red-400 hover:bg-red-500/10"
                            >
                              Cancel
                            </button>
                          )}
                          <Link
                            href={`/issuer/corporate-actions/${action.id}`}
                            className="rounded-md px-2.5 py-1 text-xs font-medium text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                          >
                            View
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
