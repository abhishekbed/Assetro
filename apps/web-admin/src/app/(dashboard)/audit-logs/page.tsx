'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Filter,
  Search,
  Loader2,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  ShieldCheck,
  Activity,
  Clock,
  Globe,
  Database,
  X,
  FileSpreadsheet,
} from 'lucide-react';
import api from '@/lib/api';

interface AuditLog {
  id: string;
  tenant_id: string;
  actor_id: string;
  actor_role: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  details: Record<string, unknown> | null;
  ip_address: string | null;
  timestamp: string;
}

const ACTION_BADGES: Record<string, { bg: string; text: string; border: string }> = {
  'token.mint': { bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/30' },
  'token.deploy': { bg: 'bg-cyan-500/15', text: 'text-cyan-400', border: 'border-cyan-500/30' },
  'token.pause': { bg: 'bg-amber-500/15', text: 'text-amber-400', border: 'border-amber-500/30' },
  'kyc.approve': { bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/30' },
  'kyc.reject': { bg: 'bg-red-500/15', text: 'text-red-400', border: 'border-red-500/30' },
  'kyc.submit': { bg: 'bg-purple-500/15', text: 'text-purple-400', border: 'border-purple-500/30' },
  'tenant.create': { bg: 'bg-purple-500/15', text: 'text-purple-400', border: 'border-purple-500/30' },
  'tenant.suspend': { bg: 'bg-red-500/15', text: 'text-red-400', border: 'border-red-500/30' },
  'user.login': { bg: 'bg-blue-500/15', text: 'text-blue-400', border: 'border-blue-500/30' },
  'user.register': { bg: 'bg-cyan-500/15', text: 'text-cyan-400', border: 'border-cyan-500/30' },
  'user.delete': { bg: 'bg-red-500/15', text: 'text-red-400', border: 'border-red-500/30' },
  'compliance.update': { bg: 'bg-amber-500/15', text: 'text-amber-400', border: 'border-amber-500/30' },
  'payment.completed': { bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/30' },
  'payment.failed': { bg: 'bg-red-500/15', text: 'text-red-400', border: 'border-red-500/30' },
};

const getActionBadge = (action: string) => {
  if (ACTION_BADGES[action]) return ACTION_BADGES[action];
  if (action.startsWith('token.')) return { bg: 'bg-cyan-500/15', text: 'text-cyan-400', border: 'border-cyan-500/30' };
  if (action.startsWith('kyc.')) return { bg: 'bg-purple-500/15', text: 'text-purple-400', border: 'border-purple-500/30' };
  if (action.startsWith('user.')) return { bg: 'bg-blue-500/15', text: 'text-blue-400', border: 'border-blue-500/30' };
  if (action.startsWith('tenant.')) return { bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/30' };
  if (action.startsWith('payment.')) return { bg: 'bg-amber-500/15', text: 'text-amber-400', border: 'border-amber-500/30' };
  return { bg: 'bg-slate-800/80', text: 'text-slate-300', border: 'border-slate-700' };
};

const getRoleBadge = (role: string) => {
  const r = (role || '').toLowerCase();
  if (r.includes('admin')) {
    return 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300';
  }
  if (r.includes('issuer')) {
    return 'border-purple-500/30 bg-purple-500/10 text-purple-300';
  }
  if (r.includes('investor')) {
    return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300';
  }
  return 'border-slate-700 bg-slate-800 text-slate-300';
};

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 25;

  const [filterAction, setFilterAction] = useState('');
  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page, limit };
      if (filterAction) params.action = filterAction;
      if (search) params.actor = search;
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;

      const res = await api.get('/admin/audit-logs', { params });
      setLogs(res.data.data ?? []);
      setTotal(res.data.total ?? 0);
    } catch (err) {
      console.error('Failed to fetch audit logs:', err);
    } finally {
      setLoading(false);
    }
  }, [page, filterAction, search, startDate, endDate]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    setPage(1);
  }, [filterAction, search, startDate, endDate]);

  const handleExport = () => {
    const headers = 'Timestamp,Tenant,Actor ID,Actor Role,Action,Resource Type,Resource ID,IP Address\n';
    const rows = logs
      .map(
        (l) =>
          `"${l.timestamp}","${l.tenant_id}","${l.actor_id}","${l.actor_role}","${l.action}","${l.resource_type}","${l.resource_id ?? ''}","${l.ip_address ?? ''}"`
      )
      .join('\n');
    const blob = new Blob([headers + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatDetails = (details: Record<string, unknown> | null): string => {
    if (!details) return '—';
    return Object.entries(details)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ');
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-6">
      {/* ─── Page Title Header ─── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-ink">
              Audit Logs
            </h1>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-0.5 text-xs font-semibold text-cyan-300">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-500" />
              </span>
              Live Immutable Ledger
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-400">
            {total.toLocaleString()} verifiable transactions &amp; state transitions recorded platform-wide
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3">
          <button
            onClick={fetchLogs}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-700/80 bg-slate-800/60 px-4 py-2 text-sm font-semibold text-slate-200 transition-all duration-200 hover:border-slate-600 hover:bg-slate-800 hover:text-ink disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 text-cyan-400 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          <button
            onClick={handleExport}
            disabled={logs.length === 0}
            className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-bold text-slate-950 shadow-md transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
          >
            <FileSpreadsheet className="h-4 w-4" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* ─── Quick Stats Summary Bar ─── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-3.5">
          <div className="flex items-center gap-2 text-slate-400 text-xs">
            <Database className="h-3.5 w-3.5 text-cyan-400" />
            <span>Total Logged</span>
          </div>
          <p className="mt-1 text-xl font-black text-ink">{total.toLocaleString()}</p>
        </div>

        <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-3.5">
          <div className="flex items-center gap-2 text-slate-400 text-xs">
            <Activity className="h-3.5 w-3.5 text-blue-400" />
            <span>Current Page</span>
          </div>
          <p className="mt-1 text-xl font-black text-ink">{logs.length} entries</p>
        </div>

        <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-3.5">
          <div className="flex items-center gap-2 text-slate-400 text-xs">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
            <span>Compliance Mode</span>
          </div>
          <p className="mt-1 text-xl font-black text-emerald-400">Strict Audit</p>
        </div>

        <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-3.5">
          <div className="flex items-center gap-2 text-slate-400 text-xs">
            <Globe className="h-3.5 w-3.5 text-purple-400" />
            <span>Isolation</span>
          </div>
          <p className="mt-1 text-xl font-black text-purple-400">Cross-Tenant</p>
        </div>
      </div>

      {/* ─── Search & Filters Bar ─── */}
      <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-4 shadow-xl">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-slate-400 text-xs font-semibold uppercase tracking-wider">
            <Filter className="h-4 w-4 text-cyan-400" />
            <span>Filter</span>
          </div>

          {/* Search by Actor */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Search by actor ID or user..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-slate-700/80 bg-slate-950/80 py-2 pl-9 pr-4 text-xs sm:text-sm text-ink placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400 transition-colors"
            />
          </div>

          {/* Action Select Filter */}
          <div className="min-w-[150px]">
            <select
              value={filterAction}
              onChange={(e) => setFilterAction(e.target.value)}
              className="w-full rounded-xl border border-slate-700/80 bg-slate-950/80 px-3 py-2 text-xs sm:text-sm text-ink focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400 transition-colors"
            >
              <option value="" className="bg-slate-950 text-ink">All Actions</option>
              <option value="user.login" className="bg-slate-950 text-ink">User Login</option>
              <option value="user" className="bg-slate-950 text-ink">All User Actions</option>
              <option value="token" className="bg-slate-950 text-ink">Token Operations</option>
              <option value="kyc" className="bg-slate-950 text-ink">KYC Verifications</option>
              <option value="tenant" className="bg-slate-950 text-ink">Tenant Operations</option>
              <option value="compliance" className="bg-slate-950 text-ink">Compliance</option>
              <option value="payment" className="bg-slate-950 text-ink">Payments</option>
            </select>
          </div>

          {/* Date Range Inputs */}
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="rounded-xl border border-slate-700/80 bg-slate-950/80 px-3 py-1.5 text-xs sm:text-sm text-ink focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400 [color-scheme:dark]"
              title="Start Date"
            />
            <span className="text-xs text-slate-500 font-medium">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="rounded-xl border border-slate-700/80 bg-slate-950/80 px-3 py-1.5 text-xs sm:text-sm text-ink focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400 [color-scheme:dark]"
              title="End Date"
            />
          </div>

          {/* Clear Filters Button */}
          {(search || filterAction || startDate || endDate) && (
            <button
              onClick={() => {
                setSearch('');
                setFilterAction('');
                setStartDate('');
                setEndDate('');
              }}
              className="inline-flex items-center gap-1 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-400 hover:bg-red-500/20 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
              <span>Reset</span>
            </button>
          )}
        </div>
      </div>

      {/* ─── Audit Log Table ─── */}
      <div className="overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-900/60 shadow-2xl">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 space-y-3">
            <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
            <p className="text-sm font-medium text-slate-400">Querying platform audit log entries...</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-850/60">
                  <th className="px-5 py-3.5 text-xs font-bold uppercase tracking-wider text-slate-400 whitespace-nowrap">
                    Timestamp
                  </th>
                  <th className="px-5 py-3.5 text-xs font-bold uppercase tracking-wider text-slate-400">
                    Tenant
                  </th>
                  <th className="px-5 py-3.5 text-xs font-bold uppercase tracking-wider text-slate-400">
                    Actor
                  </th>
                  <th className="px-5 py-3.5 text-xs font-bold uppercase tracking-wider text-slate-400">
                    Action
                  </th>
                  <th className="px-5 py-3.5 text-xs font-bold uppercase tracking-wider text-slate-400">
                    Resource
                  </th>
                  <th className="px-5 py-3.5 text-xs font-bold uppercase tracking-wider text-slate-400 max-w-xs">
                    Details
                  </th>
                  <th className="px-5 py-3.5 text-xs font-bold uppercase tracking-wider text-slate-400">
                    IP Address
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {logs.map((log) => {
                  const badge = getActionBadge(log.action);
                  const roleBadgeClass = getRoleBadge(log.actor_role);

                  return (
                    <tr
                      key={log.id}
                      className="group transition-colors duration-150 hover:bg-slate-800/40"
                    >
                      {/* Timestamp */}
                      <td className="px-5 py-3.5 text-xs font-mono text-slate-300 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Clock className="h-3 w-3 text-slate-500" />
                          <span>{new Date(log.timestamp).toLocaleString()}</span>
                        </div>
                      </td>

                      {/* Tenant */}
                      <td className="px-5 py-3.5 text-xs font-mono">
                        {log.tenant_id ? (
                          <span className="rounded-md border border-slate-800 bg-slate-950/60 px-2 py-0.5 text-slate-400">
                            {log.tenant_id.slice(0, 8)}…
                          </span>
                        ) : (
                          <span className="text-slate-600">system…</span>
                        )}
                      </td>

                      {/* Actor */}
                      <td className="px-5 py-3.5">
                        <div className="flex flex-col">
                          <span className="font-mono text-xs font-semibold text-slate-200">
                            {log.actor_id ? log.actor_id.slice(0, 8) + '…' : '—'}
                          </span>
                          <span
                            className={`mt-1 inline-flex w-fit items-center rounded-full border px-2 py-0.2 text-[10px] font-semibold capitalize ${roleBadgeClass}`}
                          >
                            {log.actor_role || 'System'}
                          </span>
                        </div>
                      </td>

                      {/* Action */}
                      <td className="px-5 py-3.5">
                        <span
                          className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold font-mono tracking-wide ${badge.bg} ${badge.text} ${badge.border}`}
                        >
                          {log.action}
                        </span>
                      </td>

                      {/* Resource */}
                      <td className="px-5 py-3.5 text-xs">
                        <div className="flex items-center gap-1">
                          <span className="font-bold text-ink capitalize">{log.resource_type}</span>
                          {log.resource_id && (
                            <span className="font-mono text-cyan-400 text-[11px]">
                              {log.resource_id.slice(0, 8)}…
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Details */}
                      <td className="px-5 py-3.5 text-xs max-w-xs truncate text-slate-300">
                        {log.details ? (
                          <span
                            className="font-mono rounded bg-slate-950/80 px-2 py-1 text-slate-300 border border-slate-800 inline-block truncate max-w-xs"
                            title={formatDetails(log.details)}
                          >
                            {formatDetails(log.details)}
                          </span>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>

                      {/* IP */}
                      <td className="px-5 py-3.5 text-xs font-mono text-slate-400">
                        {log.ip_address ? (
                          <span className="rounded bg-slate-950/60 px-2 py-0.5 border border-slate-800/80">
                            {log.ip_address}
                          </span>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Empty State */}
        {!loading && logs.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-800 bg-slate-950/80 text-slate-600 mb-3">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <p className="text-base font-bold text-ink">No Audit Records Found</p>
            <p className="mt-1 text-xs text-slate-400">
              Try adjusting your actor search, action filter, or date range.
            </p>
          </div>
        )}

        {/* ─── Pagination Bar ─── */}
        {!loading && totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-800/80 bg-slate-950/50 px-6 py-4">
            <p className="text-xs text-slate-400">
              Showing <span className="font-semibold text-ink">{(page - 1) * limit + 1}</span>–
              <span className="font-semibold text-ink">{Math.min(page * limit, total)}</span> of{' '}
              <span className="font-semibold text-ink">{total.toLocaleString()}</span> entries
            </p>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-900/80 px-2.5 py-1.5 text-xs font-semibold text-slate-300 hover:border-slate-700 hover:bg-slate-800 hover:text-ink disabled:opacity-40 transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
                <span>Prev</span>
              </button>

              <span className="rounded-lg border border-slate-800 bg-slate-900/80 px-3 py-1.5 text-xs font-mono font-semibold text-cyan-400">
                {page} / {totalPages}
              </span>

              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-900/80 px-2.5 py-1.5 text-xs font-semibold text-slate-300 hover:border-slate-700 hover:bg-slate-800 hover:text-ink disabled:opacity-40 transition-colors"
              >
                <span>Next</span>
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
