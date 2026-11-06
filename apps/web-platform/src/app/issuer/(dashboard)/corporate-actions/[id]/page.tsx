'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Play,
  Loader2,
  CheckCircle2,
  XCircle,
  Download,
  Users,
  Vote,
  GitMerge,
  Coins,
  ArrowDownCircle,
  Megaphone,
} from 'lucide-react';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';

interface CorporateAction {
  id: string;
  type: string;
  title: string;
  description: string | null;
  tokenId: string;
  status: string;
  recordDate: string;
  paymentDate: string | null;
  parameters: Record<string, unknown> | null;
  executedAt: string | null;
  executedBy: string | null;
  executionResult: Record<string, unknown> | null;
  createdAt: string;
}

interface SellRequest {
  id: string;
  investorId: string | null;
  investorAddress: string | null;
  tokenAmount: string;
  sellStatus: 'pending' | 'accepted' | 'rejected';
  createdAt: string;
}

interface VotingResult {
  totalVoters: number;
  totalWeight: string;
  results: { option: string; votes: number; weight: string; pct: number }[];
}

function fmtDate(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-600',
    active: 'bg-green-100 text-green-700',
    executing: 'bg-amber-100 text-amber-700',
    completed: 'bg-blue-100 text-blue-700',
    cancelled: 'bg-red-100 text-red-700',
  };
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${map[status] ?? 'bg-gray-100'}`}>
      {status}
    </span>
  );
}

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div className="relative h-2.5 w-full rounded-full bg-slate-800 overflow-hidden">
      <div
        className="h-2.5 rounded-full bg-accent transition-all duration-300"
        style={{ width: `${Math.min(100, pct)}%` }}
      />
    </div>
  );
}

export default function CorporateActionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuthStore();
  const headers = user?.id ? { 'x-user-id': user.id } : {};

  const [action, setAction] = useState<CorporateAction | null>(null);
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState(false);
  const [sellRequests, setSellRequests] = useState<SellRequest[]>([]);
  const [votingResults, setVotingResults] = useState<VotingResult | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/corporate-actions/${id}`);
      const data: CorporateAction = res.data?.data;
      setAction(data);

      if (data.type === 'buyback') {
        const r = await api.get(`/corporate-actions/${id}/sell-requests`, { headers });
        setSellRequests(r.data?.data ?? []);
      }
      if (data.type === 'voting' && data.status !== 'draft') {
        const r = await api.get(`/corporate-actions/${id}/voting-results`, { headers });
        setVotingResults(r.data?.data ?? null);
      }
    } catch {
      toast.error('Failed to load action');
    } finally {
      setLoading(false);
    }
  }, [id, user?.id]);

  useEffect(() => { load(); }, [load]);

  const handleExecute = async () => {
    if (!action) return;
    if (!confirm(`Execute "${action.title}"?`)) return;
    setExecuting(true);
    try {
      const res = await api.post(`/corporate-actions/${id}/execute`, {}, { headers });
      const result = res.data?.data;
      if (action.type === 'dividend' && result?.exportReady) {
        toast.success('Dividend calculated — exporting CSV');
        window.open(`${process.env.NEXT_PUBLIC_API_URL}/corporate-actions/${id}/export-csv`, '_blank');
      } else {
        toast.success(`Executed! ${result?.txHash ? `Tx: ${String(result.txHash).slice(0, 12)}…` : ''}`);
      }
      load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Execution failed';
      toast.error(msg);
    } finally {
      setExecuting(false);
    }
  };

  const handleActivate = async () => {
    try {
      await api.post(`/corporate-actions/${id}/activate`, {}, { headers });
      toast.success('Activated');
      load();
    } catch { toast.error('Failed to activate'); }
  };

  const handleSellRequest = async (reqId: string, accept: boolean) => {
    try {
      await api.post(`/corporate-actions/${id}/sell-requests/${reqId}/${accept ? 'accept' : 'reject'}`, {}, { headers });
      toast.success(accept ? 'Request accepted' : 'Request rejected');
      load();
    } catch { toast.error('Failed to update request'); }
  };

  if (loading) return (
    <div className="flex items-center justify-center p-12">
      <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
    </div>
  );

  if (!action) return (
    <div className="p-8 text-center text-slate-400">Action not found</div>
  );

  const params = action.parameters ?? {};
  const result = action.executionResult ?? {};

  const TYPE_ICON: Record<string, React.ElementType> = {
    dividend: Coins, stock_split: GitMerge, voting: Vote, buyback: ArrowDownCircle, announcement: Megaphone,
  };
  const Icon = TYPE_ICON[action.type] ?? Coins;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/issuer/corporate-actions"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-800 bg-slate-900/60 text-slate-400 hover:text-ink transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <Icon className="h-5 w-5 text-cyan-400" />
              <h1 className="text-2xl font-bold text-ink">{action.title}</h1>
              <StatusBadge status={action.status} />
            </div>
            <p className="text-sm text-slate-400 capitalize mt-1">
              {action.type.replace('_', ' ')} · Record date: {fmtDate(action.recordDate)}
            </p>
          </div>
        </div>
        <div className="flex gap-2.5 flex-wrap">
          {action.status === 'draft' && (
            <button
              onClick={handleActivate}
              className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-700 transition-colors"
            >
              Activate
            </button>
          )}
          {action.status === 'active' && (
            <button
              onClick={handleExecute}
              disabled={executing}
              className="inline-flex items-center gap-2 rounded-xl bg-success px-5 py-2 text-sm font-semibold text-slate-950 shadow-lg disabled:opacity-50 transition-all"
            >
              {executing ? <><Loader2 className="h-4 w-4 animate-spin" /> Executing…</> : <><Play className="h-4 w-4" /> Execute</>}
            </button>
          )}
          {action.status === 'completed' && action.type === 'dividend' && (
            <a
              href={`${process.env.NEXT_PUBLIC_API_URL}/corporate-actions/${id}/export-csv`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-semibold text-cyan-400 hover:bg-slate-700 transition-colors"
            >
              <Download className="h-4 w-4" /> Export CSV
            </a>
          )}
        </div>
      </div>

      {/* Description */}
      {action.description && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-300">
          {action.description}
        </div>
      )}

      {/* Parameters */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl">
        <h2 className="mb-4 text-base font-semibold text-ink">Parameters</h2>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 text-sm">
          {action.type === 'dividend' && (
            <>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">Amount per Token</dt>
                <dd className="font-medium text-ink mt-1">${Number(params.amount_per_token ?? 0).toFixed(4)} USD</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">Payout Type</dt>
                <dd className="font-medium capitalize text-ink mt-1">{String(params.payout_type ?? 'fiat')}</dd>
              </div>
            </>
          )}
          {action.type === 'stock_split' && (
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">Split Ratio</dt>
              <dd className="font-medium text-ink mt-1">{String(params.ratio_numerator ?? 2)}:{String(params.ratio_denominator ?? 1)}</dd>
            </div>
          )}
          {action.type === 'voting' && (
            <>
              <div className="col-span-2">
                <dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">Resolution</dt>
                <dd className="font-medium text-ink mt-1">{String(params.resolution_text ?? '—')}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">Options</dt>
                <dd className="font-medium text-ink mt-1">{(params.options as string[] | undefined)?.join(', ') ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">Deadline</dt>
                <dd className="font-medium text-ink mt-1">{fmtDate(params.deadline as string | null)}</dd>
              </div>
            </>
          )}
          {action.type === 'buyback' && (
            <>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">Price per Token</dt>
                <dd className="font-medium text-ink mt-1">${Number(params.price_per_token ?? 0).toFixed(2)} USD</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">Max Tokens</dt>
                <dd className="font-medium text-ink mt-1">{params.max_tokens ? Number(params.max_tokens).toLocaleString() : 'Unlimited'}</dd>
              </div>
            </>
          )}
          {action.paymentDate && (
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">Payment Date</dt>
              <dd className="font-medium text-ink mt-1">{fmtDate(action.paymentDate)}</dd>
            </div>
          )}
        </dl>
      </div>

      {/* Execution result */}
      {action.status === 'completed' && Object.keys(result).length > 0 && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-400" />
            <h2 className="text-base font-semibold text-ink">Execution Result</h2>
            <span className="text-xs text-slate-400">· {fmtDate(action.executedAt)}</span>
          </div>
          {action.type === 'dividend' && result.type === 'fiat' && (
            <div className="space-y-2 text-sm text-slate-300">
              <p>Total payout: <strong className="text-ink">${Number(result.totalPayout ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} USD</strong> across <strong className="text-ink">{(result.payouts as unknown[])?.length ?? 0}</strong> holders</p>
              <p className="text-slate-400">CSV exported for manual wire processing.</p>
              <a
                href={`${process.env.NEXT_PUBLIC_API_URL}/corporate-actions/${id}/export-csv`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-cyan-400 hover:text-cyan-300 font-medium text-sm mt-1"
              >
                <Download className="h-4 w-4" /> Download CSV
              </a>
            </div>
          )}
          {((action.type === 'dividend' && result.type === 'token') || action.type === 'stock_split') && (
            <div className="text-sm space-y-1.5 text-slate-300">
              {result.txHash != null && <p>Transaction: <span className="font-mono text-xs text-cyan-300">{String(result.txHash)}</span></p>}
              <p>Recipients: <strong className="text-ink">{String(result.count ?? 0)}</strong></p>
            </div>
          )}
          {action.type === 'voting' && (
            <div className="text-sm text-slate-300">
              <p>Total voters: <strong className="text-ink">{String(result.totalVoters ?? 0)}</strong></p>
              {Array.isArray(result.results) && result.results.map((r: Record<string, unknown>, i: number) => (
                <div key={i} className="mt-3">
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-ink font-medium">{String(r.option)}</span>
                    <span className="text-slate-400">{String(r.votes)} votes · {Number(r.pct ?? 0).toFixed(1)}%</span>
                  </div>
                  <ProgressBar pct={Number(r.pct ?? 0)} />
                </div>
              ))}
            </div>
          )}
          {action.type === 'buyback' && (
            <div className="text-sm space-y-1.5 text-slate-300">
              <p>Accepted requests: <strong className="text-ink">{String(result.acceptedRequests ?? 0)}</strong></p>
              <p>Total tokens bought back: <strong className="text-ink">{Number(result.totalTokensBoughtBack ?? 0).toLocaleString()}</strong></p>
              <p>Total fiat owed: <strong className="text-emerald-400">${String(result.totalFiatOwed ?? '0')} USD</strong></p>
            </div>
          )}
        </div>
      )}

      {/* Live voting results */}
      {action.type === 'voting' && votingResults && action.status !== 'draft' && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl">
          <div className="flex items-center gap-2 mb-4">
            <Vote className="h-5 w-5 text-violet-400" />
            <h2 className="text-base font-semibold text-ink">Live Voting Results</h2>
            <span className="text-xs text-slate-400">· {votingResults.totalVoters} voters</span>
          </div>
          <div className="space-y-4">
            {votingResults.results.map((r, i) => (
              <div key={i}>
                <div className="flex justify-between text-sm mb-1.5">
                  <span className="font-medium text-ink">{r.option}</span>
                  <span className="text-slate-400">{r.votes} votes · {r.pct.toFixed(1)}%</span>
                </div>
                <ProgressBar pct={r.pct} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Buyback sell requests */}
      {action.type === 'buyback' && (
        <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60">
          <div className="flex items-center gap-2 border-b border-slate-800 bg-slate-800/40 px-5 py-4">
            <Users className="h-5 w-5 text-amber-400" />
            <h2 className="font-semibold text-ink">Sell Requests</h2>
            <span className="ml-1 rounded-full border border-slate-700 bg-slate-800 px-2 py-0.5 text-xs text-slate-300">
              {sellRequests.length}
            </span>
          </div>
          {sellRequests.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-400">No sell requests yet</div>
          ) : (
            <div className="divide-y divide-slate-800/70">
              {sellRequests.map(req => (
                <div key={req.id} className="flex items-center justify-between px-5 py-3.5 text-sm hover:bg-slate-800/40 transition-colors">
                  <div>
                    <p className="font-mono text-ink text-sm">
                      {req.investorAddress ? `${req.investorAddress.slice(0, 10)}…` : req.investorId?.slice(0, 8) ?? '—'}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">{fmtDate(req.createdAt)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-cyan-400">
                      {parseFloat(req.tokenAmount).toLocaleString()} tokens
                    </span>
                    <span className="text-xs text-slate-400">
                      = ${(parseFloat(req.tokenAmount) * Number(params.price_per_token ?? 0)).toFixed(2)}
                    </span>
                    {req.sellStatus === 'pending' && action.status === 'active' ? (
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => handleSellRequest(req.id, true)}
                          className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                        >
                          <CheckCircle2 className="h-3 w-3" /> Accept
                        </button>
                        <button
                          onClick={() => handleSellRequest(req.id, false)}
                          className="inline-flex items-center gap-1 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 text-xs font-semibold text-rose-400 hover:bg-rose-500/20 transition-colors"
                        >
                          <XCircle className="h-3 w-3" /> Reject
                        </button>
                      </div>
                    ) : (
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium border ${
 req.sellStatus === 'accepted' ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400' :
 req.sellStatus === 'rejected' ? 'border-rose-500/20 bg-rose-500/10 text-rose-400' :
 'border-slate-700 bg-slate-800 text-slate-400' }`}>
                        {req.sellStatus}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
