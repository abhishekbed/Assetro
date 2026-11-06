'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Search,
  Eye,
  CheckCircle,
  XCircle,
  Loader2,
  Coins,
  Clock,
  X,
  RefreshCw,
  ShieldCheck,
  Layers,
  FileText,
} from 'lucide-react';
import api from '@/lib/api';
import { getMediaUrl } from '@/lib/media';

type TokenStatus =
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'draft'
  | 'deploying'
  | 'active'
  | 'paused'
  | 'retired';

interface TokenRow {
  id: string;
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: string;
  assetType: string;
  description: string | null;
  status: TokenStatus;
  chainId: number;
  tokenAddress: string | null;
  documentUri: string | null;
  metadata: Record<string, unknown> | null;
  createdBy: string;
  tenantId: string | null;
  rejectionReason: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

interface TokenDetails {
  token: TokenRow & {
    identityRegistryAddress: string | null;
    complianceAddress: string | null;
    claimTopicsAddress: string | null;
    trustedIssuersAddress: string | null;
    deployedAt: string | null;
    updatedAt: string;
  };
  issuer: { id: string; name: string; email: string } | null;
  tenant: { id: string; name: string; slug: string } | null;
  documents: {
    id: string;
    name: string;
    type: string;
    originalName: string;
    mimeType: string;
    fileSize: string;
    fileUrl: string | null;
    createdAt: string;
  }[];
  complianceRules: {
    id: string;
    ruleType: string;
    parameters: Record<string, unknown>;
    isActive: boolean;
    description: string | null;
  }[];
}

interface Stats {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
}

const STATUS_STYLES: Record<string, string> = {
  pending_approval: 'border-amber-500/30 bg-amber-500/15 text-amber-400',
  approved: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-400',
  rejected: 'border-red-500/30 bg-red-500/15 text-red-400',
  draft: 'border-slate-500/30 bg-slate-500/15 text-slate-400',
  deploying: 'border-blue-500/30 bg-blue-500/15 text-blue-400',
  active: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-400',
  paused: 'border-orange-500/30 bg-orange-500/15 text-orange-400',
  retired: 'border-slate-500/30 bg-slate-500/15 text-slate-400',
};

const STATUS_LABELS: Record<string, string> = {
  pending_approval: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  draft: 'Draft',
  deploying: 'Deploying',
  active: 'Live',
  paused: 'Paused',
  retired: 'Retired',
};

/** total_supply is stored as a plain integer string; group it for readability. */
function formatSupply(value: string): string {
  if (!value) return '—';
  try {
    return BigInt(value).toLocaleString('en-US');
  } catch {
    return value;
  }
}

function apiMessage(err: unknown, fallback: string): string {
  const e = err as { response?: { data?: { message?: string | string[] } } };
  const msg = e.response?.data?.message;
  if (Array.isArray(msg)) return msg[0];
  if (typeof msg === 'string') return msg;
  return fallback;
}

export default function TokenApprovalsPage() {
  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [selected, setSelected] = useState<TokenRow | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [showApprove, setShowApprove] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState('');
  const [details, setDetails] = useState<TokenDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  const fetchTokens = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (statusFilter) params.status = statusFilter;
      if (search) params.search = search;

      const [listRes, statsRes] = await Promise.all([
        api.get('/admin/tokens', { params }),
        api.get('/admin/tokens/stats'),
      ]);

      setTokens(listRes.data?.data?.data ?? []);
      setStats(statsRes.data?.data ?? null);
    } catch (err) {
      console.error('Failed to fetch tokens:', err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search]);

  useEffect(() => {
    fetchTokens();
  }, [fetchTokens]);

  const openDetail = (token: TokenRow) => {
    setSelected(token);
    setActionError('');
    setDetails(null);
    setDetailsLoading(true);
    setShowDetail(true);
    api
      .get(`/admin/tokens/${token.id}/details`)
      .then((res) => setDetails(res.data?.data ?? null))
      .catch((err) => console.error('Failed to load token details:', err))
      .finally(() => setDetailsLoading(false));
  };

  const openApprove = (token: TokenRow) => {
    setSelected(token);
    setActionError('');
    setShowDetail(false);
    setShowApprove(true);
  };

  const openReject = (token: TokenRow) => {
    setSelected(token);
    setRejectionReason('');
    setActionError('');
    setShowDetail(false);
    setShowReject(true);
  };

  const handleApprove = async () => {
    if (!selected) return;
    setActionLoading(true);
    setActionError('');
    try {
      await api.post(`/admin/tokens/${selected.id}/approve`, {});
      setShowApprove(false);
      await fetchTokens();
    } catch (err: unknown) {
      setActionError(apiMessage(err, 'Failed to approve this token.'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!selected) return;
    if (!rejectionReason.trim()) {
      setActionError('Please give the issuer a reason.');
      return;
    }
    setActionLoading(true);
    setActionError('');
    try {
      await api.post(`/admin/tokens/${selected.id}/reject`, {
        rejection_reason: rejectionReason.trim(),
      });
      setShowReject(false);
      await fetchTokens();
    } catch (err: unknown) {
      setActionError(apiMessage(err, 'Failed to reject this token.'));
    } finally {
      setActionLoading(false);
    }
  };

  const statCards = [
    { label: 'Total Tokens', value: stats?.total ?? 0, icon: Layers, tone: 'text-ink' },
    { label: 'Pending Review', value: stats?.pending ?? 0, icon: Clock, tone: 'text-amber-400' },
    { label: 'Approved', value: stats?.approved ?? 0, icon: CheckCircle, tone: 'text-emerald-400' },
    { label: 'Rejected', value: stats?.rejected ?? 0, icon: XCircle, tone: 'text-red-400' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-ink">Token Approvals</h1>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/15 px-3 py-1 text-xs font-semibold text-amber-400">
              <ShieldCheck className="h-3.5 w-3.5" />
              Deployment Gate
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-400">
            Review tokens issuers want to create. Approval lets them deploy on-chain.
          </p>
        </div>
        <button
          onClick={fetchTokens}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-surface-header px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-slate-800"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map(({ label, value, icon: Icon, tone }) => (
          <div
            key={label}
            className="rounded-xl border border-slate-800/80 bg-surface-header p-5"
          >
            <div className="flex items-start justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                {label}
              </p>
              <Icon className={`h-4 w-4 ${tone}`} />
            </div>
            <p className={`mt-3 text-3xl font-bold ${tone}`}>{value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by token name or symbol..."
            className="w-full rounded-xl border border-slate-700 bg-surface-header py-2.5 pl-10 pr-3 text-sm text-ink placeholder:text-slate-500 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
          />
        </div>
        <div className="flex gap-1 rounded-xl border border-slate-700 bg-surface-header p-1">
          {[
            { key: '', label: 'All' },
            { key: 'pending_approval', label: 'Pending' },
            { key: 'approved', label: 'Approved' },
            { key: 'rejected', label: 'Rejected' },
          ].map(({ key, label }) => (
            <button
              key={key || 'all'}
              onClick={() => setStatusFilter(key)}
              className={`rounded-lg px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                statusFilter === key
                  ? 'bg-amber-500 text-slate-950'
                  : 'text-slate-400 hover:text-ink'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-800/80 bg-surface-header">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
          </div>
        ) : tokens.length === 0 ? (
          <div className="py-20 text-center">
            <Coins className="mx-auto h-10 w-10 text-slate-600" />
            <p className="mt-4 font-semibold text-ink">No tokens to review</p>
            <p className="mt-1 text-sm text-slate-400">
              Tokens created by issuers will appear here for approval.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                  <th className="px-5 py-3.5">Token</th>
                  <th className="px-5 py-3.5">Asset Type</th>
                  <th className="px-5 py-3.5">Total Supply</th>
                  <th className="px-5 py-3.5">Submitted</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {tokens.map((token) => (
                  <tr
                    key={token.id}
                    className="border-b border-slate-800/60 last:border-0 hover:bg-slate-800/30"
                  >
                    <td className="px-5 py-4">
                      <p className="font-semibold text-ink">{token.name}</p>
                      <p className="font-mono text-xs text-amber-400/80">{token.symbol}</p>
                    </td>
                    <td className="px-5 py-4 capitalize text-slate-300">
                      {token.assetType?.replace(/_/g, ' ') ?? '—'}
                    </td>
                    <td className="px-5 py-4 font-mono text-xs text-slate-300">
                      {formatSupply(token.totalSupply)}
                    </td>
                    <td className="px-5 py-4 text-slate-400">
                      {new Date(token.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${
                          STATUS_STYLES[token.status] ?? STATUS_STYLES.draft
                        }`}
                      >
                        {STATUS_LABELS[token.status] ?? token.status}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => openDetail(token)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 transition-colors hover:bg-slate-800 hover:text-ink"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          View
                        </button>
                        {token.status === 'pending_approval' && (
                          <>
                            <button
                              onClick={() => openApprove(token)}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/90 px-3 py-1.5 text-xs font-bold text-slate-950 transition-colors hover:bg-emerald-400"
                            >
                              <CheckCircle className="h-3.5 w-3.5" />
                              Approve
                            </button>
                            <button
                              onClick={() => openReject(token)}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-red-500/90 px-3 py-1.5 text-xs font-bold text-slate-950 transition-colors hover:bg-red-400"
                            >
                              <XCircle className="h-3.5 w-3.5" />
                              Reject
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Detail ───────────────────────────────────────────── */}
      {showDetail && selected && (
        <Modal title="Token Details" onClose={() => setShowDetail(false)} wide>
          <TokenDetailBody token={selected} details={details} loading={detailsLoading} />
          {selected.status === 'pending_approval' && (
            <div className="mt-5 flex justify-end gap-2 border-t border-slate-800 pt-4">
              <button
                onClick={() => openReject(selected)}
                className="rounded-xl bg-red-500/90 px-4 py-2 text-sm font-bold text-slate-950 hover:bg-red-400"
              >
                Reject
              </button>
              <button
                onClick={() => openApprove(selected)}
                className="rounded-xl bg-emerald-500/90 px-4 py-2 text-sm font-bold text-slate-950 hover:bg-emerald-400"
              >
                Approve
              </button>
            </div>
          )}
        </Modal>
      )}

      {/* ── Approve ──────────────────────────────────────────── */}
      {showApprove && selected && (
        <Modal title="Approve Token" onClose={() => setShowApprove(false)}>
          <div className="space-y-4">
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
              <p className="text-sm font-semibold text-emerald-400">What approval does</p>
              <ul className="mt-2 space-y-1 text-xs leading-relaxed text-slate-300">
                <li>• Unlocks the Deploy button in the issuer&apos;s portal</li>
                <li>• The issuer signs the on-chain deployment from their own wallet</li>
                <li>• Nothing is deployed by this action</li>
              </ul>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <p className="text-xs text-slate-400">Token</p>
              <p className="font-semibold text-ink">
                {selected.name}{' '}
                <span className="font-mono text-amber-400">({selected.symbol})</span>
              </p>
              <p className="mt-1 font-mono text-xs text-slate-400">
                supply {formatSupply(selected.totalSupply)} · chain {selected.chainId}
              </p>
            </div>
            {actionError && <ErrorNote message={actionError} />}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowApprove(false)}
                className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={handleApprove}
                disabled={actionLoading}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-2 text-sm font-bold text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
              >
                {actionLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle className="h-4 w-4" />
                )}
                Confirm Approval
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Reject ───────────────────────────────────────────── */}
      {showReject && selected && (
        <Modal title="Reject Token" onClose={() => setShowReject(false)}>
          <div className="space-y-4">
            <p className="text-sm text-slate-400">
              The issuer sees this reason on their token page, so be specific about what
              needs to change.
            </p>
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <p className="font-semibold text-ink">
                {selected.name}{' '}
                <span className="font-mono text-amber-400">({selected.symbol})</span>
              </p>
            </div>
            <div>
              <label htmlFor="reason" className="mb-1.5 block text-sm font-medium text-slate-300">
                Reason for rejection <span className="text-red-400">*</span>
              </label>
              <textarea
                id="reason"
                rows={4}
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="e.g. Total supply exceeds the approved offering size. Please resubmit with 10,000,000 or attach an updated prospectus."
                className="w-full rounded-xl border border-slate-700 bg-surface-header px-3 py-2.5 text-sm text-ink placeholder:text-slate-500 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20"
              />
            </div>
            {actionError && <ErrorNote message={actionError} />}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowReject(false)}
                className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={actionLoading}
                className="inline-flex items-center gap-2 rounded-xl bg-red-500 px-5 py-2 text-sm font-bold text-slate-950 hover:bg-red-400 disabled:opacity-60"
              >
                {actionLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <XCircle className="h-4 w-4" />
                )}
                Confirm Rejection
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className={`max-h-[90vh] w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} overflow-y-auto rounded-2xl border border-slate-800 bg-surface p-6 shadow-2xl`}>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold text-ink">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </dt>
      <dd className="mt-1 break-words text-sm text-ink">{value || '—'}</dd>
    </div>
  );
}

function ErrorNote({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
      <XCircle className="h-4 w-4 flex-shrink-0" />
      <span>{message}</span>
    </div>
  );
}

type Meta = Record<string, unknown>;

const asRecord = (v: unknown): Meta =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Meta) : {};

function display(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (Array.isArray(v)) return v.length ? v.map(String).join(', ') : '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-amber-400">{title}</h3>
      {children}
    </section>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <dl className="grid grid-cols-2 gap-3 text-sm">{children}</dl>;
}

function Mono({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="col-span-2 rounded-lg border border-slate-800 bg-slate-900/60 p-3">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 break-all font-mono text-xs text-ink">{value || '—'}</dd>
    </div>
  );
}

function formatBytes(value: string): string {
  const n = Number(value);
  if (!n) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function TokenDetailBody({
  token,
  details,
  loading,
}: {
  token: TokenRow;
  details: TokenDetails | null;
  loading: boolean;
}) {
  const t = details?.token ?? token;
  const meta = asRecord(t.metadata);
  const offering = asRecord(meta.offering);
  const compliance = asRecord(meta.compliance);
  const logo = typeof meta.logo === 'string' ? meta.logo : null;
  const known = new Set(['offering', 'compliance', 'logo', 'deployer_address', 'owner_address']);
  const extra = Object.entries(meta).filter(([k]) => !known.has(k));

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-4 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        {logo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={getMediaUrl(logo)} alt="" className="h-14 w-14 rounded-lg border border-slate-800 object-cover" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-lg font-bold text-ink">{t.name}</p>
            <span
              className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                STATUS_STYLES[t.status] ?? STATUS_STYLES.draft
              }`}
            >
              {STATUS_LABELS[t.status] ?? t.status}
            </span>
          </div>
          <p className="font-mono text-sm text-amber-400">{t.symbol}</p>
          {t.description && (
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-400">
              {t.description}
            </p>
          )}
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading full details…
        </div>
      )}

      <Section title="Token">
        <Grid>
          <Field
            label="Asset Type"
            value={t.assetType?.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())}
          />
          <Field label="Decimals" value={String(t.decimals)} />
          <Field label="Total Supply" value={formatSupply(t.totalSupply)} />
          <Field label="Chain ID" value={String(t.chainId)} />
          <Field label="Blockchain" value={display(offering.blockchain)} />
          <Field label="Token Standard" value={display(offering.standard)} />
          <Field label="Submitted" value={new Date(t.createdAt).toLocaleString()} />
          <Field label="Token ID" value={t.id} />
        </Grid>
      </Section>

      {details && (
        <Section title="Issuer">
          <Grid>
            <Field label="Issuer Name" value={details.issuer?.name} />
            <Field label="Issuer Email" value={details.issuer?.email} />
            <Field label="Company / Tenant" value={details.tenant?.name} />
            <Field label="Tenant Slug" value={details.tenant?.slug} />
          </Grid>
        </Section>
      )}

      <Section title="Offering">
        <Grid>
          <Field label="Initial Price" value={display(offering.initial_price)} />
          <Field label="Distribution Method" value={display(offering.distribution_method)} />
          <Field label="Min Investment" value={display(offering.min_investment)} />
          <Field label="Max Investment" value={display(offering.max_investment)} />
        </Grid>
      </Section>

      <Section title="Compliance">
        <Grid>
          <Field label="KYC Required" value={display(compliance.kyc_required)} />
          <Field label="Accredited Only" value={display(compliance.accredited_only)} />
          <Field label="Geo Restrictions" value={display(compliance.geo_restrictions)} />
          <Field label="Max Holders" value={display(compliance.max_holders)} />
        </Grid>
        {details && details.complianceRules.length > 0 && (
          <div className="mt-3 space-y-2">
            {details.complianceRules
              .filter((r) => r.ruleType !== 'transfer_restriction')
              .map((r) => (
              <div key={r.id} className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-semibold capitalize text-ink">
                    {r.ruleType.replace(/_/g, ' ')}
                  </span>
                  <span className={r.isActive ? 'text-emerald-400' : 'text-slate-500'}>
                    {r.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
                {r.description && <p className="mt-1 text-slate-400">{r.description}</p>}
                <pre className="mt-1.5 overflow-x-auto font-mono text-[11px] text-slate-400">
                  {JSON.stringify(r.parameters, null, 2)}
                </pre>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Wallet & Contracts">
        <Grid>
          <Mono label="Deployer Address" value={display(meta.deployer_address)} />
          <Mono label="Owner Address" value={display(meta.owner_address)} />
          <Mono label="Token Address" value={t.tokenAddress} />
          {details && (
            <>
              <Mono label="Identity Registry" value={details.token.identityRegistryAddress} />
              <Mono label="Compliance Contract" value={details.token.complianceAddress} />
              <Mono label="Claim Topics Registry" value={details.token.claimTopicsAddress} />
              <Mono label="Trusted Issuers Registry" value={details.token.trustedIssuersAddress} />
            </>
          )}
        </Grid>
      </Section>

      <Section title="Documents">
        {t.documentUri && (
          <a
            href={t.documentUri}
            target="_blank"
            rel="noreferrer"
            className="mb-2 inline-flex items-center gap-2 text-sm font-semibold text-amber-400 hover:underline"
          >
            <FileText className="h-4 w-4" />
            Offering document
          </a>
        )}
        {details && details.documents.length > 0 ? (
          <ul className="space-y-2">
            {details.documents.map((d) => (
              <li
                key={d.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-xs"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold text-ink">{d.name || d.originalName}</p>
                  <p className="capitalize text-slate-500">
                    {d.type.replace(/_/g, ' ')} · {formatBytes(d.fileSize)} ·{' '}
                    {new Date(d.createdAt).toLocaleDateString()}
                  </p>
                </div>
                {d.fileUrl && (
                  <a
                    href={d.fileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-shrink-0 font-semibold text-amber-400 hover:underline"
                  >
                    Open
                  </a>
                )}
              </li>
            ))}
          </ul>
        ) : (
          !t.documentUri && <p className="text-sm text-slate-500">No documents uploaded.</p>
        )}
      </Section>

      {extra.length > 0 && (
        <Section title="Additional Information">
          <Grid>
            {extra.map(([k, v]) => (
              <Field key={k} label={k.replace(/_/g, ' ')} value={display(v)} />
            ))}
          </Grid>
        </Section>
      )}

      {(t.reviewedAt || t.rejectionReason) && (
        <Section title="Review">
          <Grid>
            <Field
              label="Reviewed At"
              value={t.reviewedAt ? new Date(t.reviewedAt).toLocaleString() : null}
            />
            <Field label="Reviewed By" value={t.reviewedBy} />
          </Grid>
          {t.rejectionReason && (
            <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-red-400">
                Rejection reason
              </p>
              <p className="mt-1.5 text-sm text-slate-300">{t.rejectionReason}</p>
            </div>
          )}
        </Section>
      )}
    </div>
  );
}
