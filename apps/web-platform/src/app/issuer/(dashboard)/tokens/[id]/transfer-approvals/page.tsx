'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  Users,
  RefreshCw,
  X,
} from 'lucide-react';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';

type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

interface TransferRequest {
  id: string;
  tokenId: string;
  fromAddress: string;
  toAddress: string;
  amount: string;
  status: ApprovalStatus;
  requesterId: string | null;
  approverId: string | null;
  approverNotes: string | null;
  requestedAt: string;
  resolvedAt: string | null;
}

interface TokenInfo {
  id: string;
  name: string;
  symbol: string;
  tokenAddress?: string;
}

const STATUS_BADGE: Record<ApprovalStatus, string> = {
  pending:   'bg-amber-500/10 text-amber-400 border border-amber-500/20',
  approved:  'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
  rejected:  'bg-rose-500/10 text-rose-400 border border-rose-500/20',
  cancelled: 'bg-slate-800 text-slate-400 border border-slate-700',
};

const FILTERS = [
  { key: 'all',      label: 'All' },
  { key: 'pending',  label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
] as const;

function truncate(addr: string) {
  if (!addr) return '—';
  return `${addr.slice(0, 8)}…${addr.slice(-6)}`;
}

function fmtDate(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function TransferApprovalsPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuthStore();
  const headers = user?.id ? { 'x-user-id': user.id } : {};

  const [token, setToken] = useState<TokenInfo | null>(null);
  const [requests, setRequests] = useState<TransferRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');

  // Approve modal
  const [approveTarget, setApproveTarget] = useState<TransferRequest | null>(null);
  const [approveNotes, setApproveNotes] = useState('');
  const [approveBusy, setApproveBusy] = useState(false);

  // Reject modal
  const [rejectTarget, setRejectTarget] = useState<TransferRequest | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectBusy, setRejectBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [tokenRes, requestsRes] = await Promise.all([
        api.get(`/tokens/${id}`),
        api.get('/transfers', { params: { token_id: id }, headers }),
      ]);
      setToken(tokenRes.data?.data ?? null);
      const data = requestsRes.data?.data ?? requestsRes.data ?? [];
      setRequests(Array.isArray(data) ? data : []);
    } catch {
      toast.error('Failed to load transfer approvals');
    } finally {
      setLoading(false);
    }
  }, [id, user?.id]);

  useEffect(() => { load(); }, [load]);

  const handleApprove = async () => {
    if (!approveTarget) return;
    setApproveBusy(true);
    try {
      await api.post(`/transfers/${approveTarget.id}/approve`, { notes: approveNotes || undefined }, { headers });
      toast.success('Transfer approved — investor can now execute on-chain');
      setApproveTarget(null);
      setApproveNotes('');
      load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to approve';
      toast.error(msg);
    } finally {
      setApproveBusy(false);
    }
  };

  const handleReject = async () => {
    if (!rejectTarget || !rejectReason.trim()) { toast.error('Rejection reason is required'); return; }
    setRejectBusy(true);
    try {
      await api.post(`/transfers/${rejectTarget.id}/reject`, { notes: rejectReason }, { headers });
      toast.success('Transfer rejected');
      setRejectTarget(null);
      setRejectReason('');
      load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to reject';
      toast.error(msg);
    } finally {
      setRejectBusy(false);
    }
  };

  const visible = filter === 'all' ? requests : requests.filter(r => r.status === filter);

  const counts = {
    pending:  requests.filter(r => r.status === 'pending').length,
    approved: requests.filter(r => r.status === 'approved').length,
    rejected: requests.filter(r => r.status === 'rejected').length,
    total:    requests.length,
  };

  return (
    <>
      {/* Approve Modal */}
      {approveTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="card w-full max-w-md p-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <h2 className="text-lg font-semibold text-ink">Approve Transfer</h2>
              <button
                onClick={() => setApproveTarget(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-ink transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4 pt-4">
              <div className="rounded-xl border border-slate-800 bg-slate-800/60 p-3.5 text-sm space-y-1.5">
                <p><span className="text-slate-400">From:</span> <span className="font-mono text-ink ml-1">{approveTarget.fromAddress}</span></p>
                <p><span className="text-slate-400">To:</span> <span className="font-mono text-ink ml-1">{approveTarget.toAddress}</span></p>
                <p><span className="text-slate-400">Amount:</span> <strong className="text-emerald-400 ml-1">{parseFloat(approveTarget.amount).toLocaleString()} {token?.symbol}</strong></p>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Notes (optional)
                </label>
                <textarea
                  className="w-full rounded-xl border border-slate-700 bg-slate-800/80 px-3.5 py-2.5 text-sm text-ink placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 min-h-[70px]"
                  placeholder="Add any notes for the investor…"
                  value={approveNotes}
                  onChange={e => setApproveNotes(e.target.value)}
                />
              </div>
              <p className="text-xs text-slate-400">
                After approving, the investor will be notified and can execute the on-chain transfer.
              </p>
              <div className="flex justify-end gap-3 border-t border-slate-800 pt-4">
                <button
                  onClick={() => setApproveTarget(null)}
                  className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleApprove}
                  disabled={approveBusy}
                  className="inline-flex items-center gap-2 rounded-xl bg-success px-5 py-2 text-sm font-semibold text-slate-950 shadow-lg disabled:opacity-40 transition-all"
                >
                  {approveBusy ? <><Loader2 className="h-4 w-4 animate-spin" /> Approving…</> : <><CheckCircle2 className="h-4 w-4" /> Approve</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {rejectTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="card w-full max-w-md p-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <h2 className="text-lg font-semibold text-ink">Reject Transfer</h2>
              <button
                onClick={() => setRejectTarget(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-ink transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4 pt-4">
              <div className="rounded-xl border border-slate-800 bg-slate-800/60 p-3.5 text-sm space-y-1.5">
                <p><span className="text-slate-400">From:</span> <span className="font-mono text-ink ml-1">{rejectTarget.fromAddress}</span></p>
                <p><span className="text-slate-400">To:</span> <span className="font-mono text-ink ml-1">{rejectTarget.toAddress}</span></p>
                <p><span className="text-slate-400">Amount:</span> <strong className="text-rose-400 ml-1">{parseFloat(rejectTarget.amount).toLocaleString()} {token?.symbol}</strong></p>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Rejection Reason *
                </label>
                <textarea
                  className="w-full rounded-xl border border-slate-700 bg-slate-800/80 px-3.5 py-2.5 text-sm text-ink placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 min-h-[80px]"
                  placeholder="Explain why this transfer is being rejected…"
                  value={rejectReason}
                  onChange={e => setRejectReason(e.target.value)}
                  required
                />
              </div>
              <div className="flex justify-end gap-3 border-t border-slate-800 pt-4">
                <button
                  onClick={() => setRejectTarget(null)}
                  className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleReject}
                  disabled={rejectBusy || !rejectReason.trim()}
                  className="inline-flex items-center gap-2 rounded-xl bg-danger px-5 py-2 text-sm font-semibold text-btn-text shadow-lg disabled:opacity-40 transition-all"
                >
                  {rejectBusy ? <><Loader2 className="h-4 w-4 animate-spin" /> Rejecting…</> : <><XCircle className="h-4 w-4" /> Reject</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
              <h1 className="text-2xl font-bold text-ink">Transfer Approvals</h1>
              <p className="text-sm text-slate-400">{token?.name} ({token?.symbol}) · On-chain conditional transfers</p>
            </div>
          </div>
          <button
            onClick={load}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-ink transition-colors"
          >
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { label: 'Pending',  value: counts.pending,  color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20',     icon: Clock },
            { label: 'Approved', value: counts.approved, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20', icon: CheckCircle2 },
            { label: 'Rejected', value: counts.rejected, color: 'text-rose-400',   bg: 'bg-rose-500/10 border-rose-500/20',       icon: XCircle },
            { label: 'Total',    value: counts.total,    color: 'text-cyan-400', bg: 'bg-cyan-500/10 border-cyan-500/20',       icon: Users },
          ].map(({ label, value, color, bg, icon: Icon }) => (
            <div key={label} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</p>
                <div className={`rounded-lg border p-1.5 ${bg}`}>
                  <Icon className={`h-4 w-4 ${color}`} />
                </div>
              </div>
              <p className={`mt-2 text-2xl font-bold ${color}`}>{value}</p>
            </div>
          ))}
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1.5 rounded-xl border border-slate-800 bg-slate-900/60 p-1.5 w-fit">
          {FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
 filter === f.key
 ? 'bg-slate-800 text-cyan-400 font-semibold border border-cyan-500/30 shadow-sm' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50' }`}
            >
              {f.label}
              {f.key !== 'all' && (
                <span className="ml-1.5 rounded-full border border-slate-700 bg-slate-800 px-1.5 py-0.2 text-[10px] text-slate-300">
                  {requests.filter(r => r.status === f.key).length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-800 bg-slate-900/60 py-14 text-center">
            <CheckCircle2 className="h-12 w-12 text-slate-600" />
            <p className="mt-3 font-medium text-slate-300">
              {filter === 'all' ? 'No transfer requests yet' : `No ${filter} requests`}
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-800/40">
                    <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wide text-slate-400">From</th>
                    <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wide text-slate-400">To</th>
                    <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wide text-slate-400">Amount</th>
                    <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wide text-slate-400">Requested</th>
                    <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wide text-slate-400">Status</th>
                    <th className="px-4 py-3.5 text-right text-xs font-medium uppercase tracking-wide text-slate-400">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {visible.map(req => (
                    <tr key={req.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="px-4 py-3.5 font-mono text-slate-300">{truncate(req.fromAddress)}</td>
                      <td className="px-4 py-3.5 font-mono text-slate-300">{truncate(req.toAddress)}</td>
                      <td className="px-4 py-3.5 font-medium text-ink">
                        {parseFloat(req.amount).toLocaleString()} {token?.symbol}
                      </td>
                      <td className="px-4 py-3.5 text-slate-400">{fmtDate(req.requestedAt)}</td>
                      <td className="px-4 py-3.5">
                        <div className="space-y-1">
                          <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${STATUS_BADGE[req.status] ?? 'bg-slate-800 text-slate-400'}`}>
                            {req.status}
                          </span>
                          {req.status === 'approved' && (
                            <p className="text-xs text-slate-500">Awaiting execution</p>
                          )}
                          {req.approverNotes && req.status !== 'pending' && (
                            <p className="text-xs text-slate-400 italic max-w-[200px] truncate" title={req.approverNotes}>
                              {req.approverNotes}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        {req.status === 'pending' && (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => { setApproveTarget(req); setApproveNotes(''); }}
                              className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                            </button>
                            <button
                              onClick={() => { setRejectTarget(req); setRejectReason(''); }}
                              className="flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-400 hover:bg-rose-500/20 transition-colors"
                            >
                              <XCircle className="h-3.5 w-3.5" /> Reject
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
