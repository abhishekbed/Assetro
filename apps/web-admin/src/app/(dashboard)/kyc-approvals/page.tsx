'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Search,
  Eye,
  CheckCircle,
  XCircle,
  Loader2,
  Clock,
  X,
  RefreshCw,
  ShieldCheck,
  FileText,
  User,
  ExternalLink,
  Copy,
  Check,
  AlertCircle,
  Download,
  Building2,
  Wallet,
  Shield,
  FileCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { getMediaUrl } from '@/lib/media';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Document {
  id: string;
  documentType: string;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  mimeType: string;
  uploadedAt: string;
}

interface ExtraData {
  phone?: string;
  tax_id?: string;
  company_name?: string;
  company_registration?: string;
  company_country?: string;
}

interface Profile {
  /** Platform-admin KYC level, kept separate from each issuer's approval. */
  adminKycStatus?: 'pending' | 'approved' | 'rejected' | 'revoked' | 'expired' | null;
  id: string;
  userId?: string;
  fullName: string;
  dateOfBirth: string;
  nationality: string;
  country: string;
  addressLine1: string;
  addressLine2?: string | null;
  city: string;
  postalCode: string;
  investorType: string;
  accreditation: string;
  extraData?: ExtraData | null;
  submittedAt: string;
  documents?: Document[];
}

interface InvestorUser {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  phone?: string | null;
  walletAddress?: string | null;
  identityContractAddress?: string | null;
  createdAt?: string;
}

interface KycQualification {
  id: string;
  investorId: string;
  issuerId: string;
  profileId: string;
  status: 'pending' | 'under_review' | 'approved' | 'rejected' | 'expired' | 'revoked';
  reviewNotes?: string | null;
  rejectedReason?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  approvedAt?: string | null;
  expiresAt?: string | null;
  claimsVerified?: Record<string, string>;
  blockchainJobId?: string | null;
  blockchainStatus?: string | null;
  blockchainError?: string | null;
  blockchainCompletedAt?: string | null;
  createdAt: string;
  profile?: Profile;
  investor?: InvestorUser | null;
  documents?: Document[];
}

interface Stats {
  total: number;
  pending: number;
  under_review: number;
  approved: number;
  rejected: number;
  expired: number;
}

const STATUS_STYLES: Record<string, string> = {
  pending:      'border-amber-500/30 bg-amber-500/15 text-amber-400',
  under_review: 'border-blue-500/30 bg-blue-500/15 text-blue-400',
  approved:     'border-emerald-500/30 bg-emerald-500/15 text-emerald-400',
  rejected:     'border-red-500/30 bg-red-500/15 text-red-400',
  expired:      'border-slate-500/30 bg-slate-500/15 text-slate-400',
  revoked:      'border-orange-500/30 bg-orange-500/15 text-orange-400',
};

const STATUS_LABELS: Record<string, string> = {
  pending:      'Pending Review',
  under_review: 'Under Review',
  approved:     'Approved',
  rejected:     'Rejected',
  expired:      'Expired',
  revoked:      'Revoked',
};

const DOC_TYPE_LABELS: Record<string, string> = {
  passport:            'Passport',
  national_id:         'National ID / Identity Card',
  drivers_license:     "Driver's License",
  proof_of_address:    'Proof of Address',
  accreditation_proof: 'Accreditation Proof Document',
  selfie:              'Selfie Verification',
  other:               'Supporting Document',
};

function formatFileSize(bytes: number): string {
  if (!bytes) return 'Unknown size';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(d: string | null | undefined): string {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return d;
  }
}

function formatDateTime(d: string | null | undefined): string {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return d;
  }
}

function calculateAge(dobString: string | undefined): number | null {
  if (!dobString) return null;
  try {
    const dob = new Date(dobString);
    if (isNaN(dob.getTime())) return null;
    const diffMs = Date.now() - dob.getTime();
    const ageDate = new Date(diffMs);
    return Math.abs(ageDate.getUTCFullYear() - 1970);
  } catch {
    return null;
  }
}

function apiErrorMessage(err: unknown, fallback: string): string {
  const e = err as { response?: { data?: { message?: string | string[] } } };
  const msg = e.response?.data?.message;
  if (Array.isArray(msg)) return msg.join(', ');
  if (typeof msg === 'string') return msg;
  return fallback;
}

export default function KycApprovalsPage() {
  const [qualifications, setQualifications] = useState<KycQualification[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selected, setSelected] = useState<KycQualification | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [showApprove, setShowApprove] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [reviewNotes, setReviewNotes] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [retryingPipeline, setRetryingPipeline] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<KycQualification | null>(null);
  const [revokeReason, setRevokeReason] = useState('');
  const [revoking, setRevoking] = useState(false);

  const fetchQualifications = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (statusFilter && statusFilter !== 'all') params.status = statusFilter;
      if (search) params.search = search;

      const [listRes, statsRes] = await Promise.all([
        api.get('/admin/kyc', { params }),
        api.get('/admin/kyc/stats'),
      ]);

      setQualifications(listRes.data?.data ?? []);
      setStats(statsRes.data?.data ?? null);
    } catch (err) {
      console.error('Failed to fetch KYC submissions:', err);
      toast.error(apiErrorMessage(err, 'Failed to fetch KYC submissions'));
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search]);

  useEffect(() => {
    fetchQualifications();
  }, [fetchQualifications]);

  const copyToClipboard = (text: string, key: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    toast.success(`${label} copied to clipboard`);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const openDetail = async (item: KycQualification) => {
    setSelected(item);
    setReviewNotes(item.reviewNotes || '');
    setRejectionReason(item.rejectedReason || '');
    setShowDetail(true);

    try {
      const res = await api.get(`/admin/kyc/${item.id}`);
      if (res.data?.data) {
        setSelected(res.data.data);
        if (res.data.data.reviewNotes) setReviewNotes(res.data.data.reviewNotes);
        if (res.data.data.rejectedReason) setRejectionReason(res.data.data.rejectedReason);
      }
    } catch (err) {
      console.error('Failed to load qualification details:', err);
    }
  };

  const openApprove = (item: KycQualification) => {
    setSelected(item);
    setReviewNotes(item.reviewNotes || '');
    setShowDetail(false);
    setShowApprove(true);
  };

  const openReject = (item: KycQualification) => {
    setSelected(item);
    setRejectionReason('');
    setReviewNotes(item.reviewNotes || '');
    setShowDetail(false);
    setShowReject(true);
  };

  // Admin approval is the platform level only; once given, the issuer decides next.
  const needsAdminDecision = (q: KycQualification) =>
    (q.status === 'pending' || q.status === 'under_review') && q.profile?.adminKycStatus !== 'approved';

  const handleRevokeAdminKyc = (q: KycQualification) => {
    setRevokeReason('');
    setRevokeTarget(q);
  };

  const closeRevokeModal = () => {
    if (revoking) return;
    setRevokeTarget(null);
    setRevokeReason('');
  };

  const confirmRevokeAdminKyc = async () => {
    if (!revokeTarget || !revokeReason.trim()) return;
    setRevoking(true);
    try {
      await api.post(`/admin/kyc/investors/${revokeTarget.investorId}/revoke`, {
        reason: revokeReason.trim(),
      });
      toast.success('Platform KYC revoked');
      setRevokeTarget(null);
      setRevokeReason('');
      setShowDetail(false);
      setSelected(null);
      fetchQualifications();
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Failed to revoke KYC'));
    } finally {
      setRevoking(false);
    }
  };

  const handleApprove = async () => {
    if (!selected) return;
    setActionLoading(true);
    try {
      await api.post(`/admin/kyc/${selected.id}/approve`, {
        review_notes: reviewNotes || undefined,
      });
      toast.success(`Investor ${selected.profile?.fullName || selected.investor?.name || 'user'} approved successfully`);
      setShowApprove(false);
      setShowDetail(false);
      setSelected(null);
      fetchQualifications();
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Failed to approve KYC submission'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!selected) return;
    if (!rejectionReason.trim()) {
      toast.error('Please provide a reason for rejection');
      return;
    }
    setActionLoading(true);
    try {
      await api.post(`/admin/kyc/${selected.id}/reject`, {
        rejected_reason: rejectionReason,
        review_notes: reviewNotes || undefined,
      });
      toast.success(`Investor KYC rejected`);
      setShowReject(false);
      setShowDetail(false);
      setSelected(null);
      fetchQualifications();
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Failed to reject KYC submission'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleRetryPipeline = async (id: string) => {
    setRetryingPipeline(true);
    try {
      await api.post(`/admin/kyc/${id}/retry-pipeline`);
      toast.success('Blockchain onboarding re-queued successfully');
      if (selected && selected.id === id) {
        const res = await api.get(`/admin/kyc/${id}`);
        if (res.data?.data) setSelected(res.data.data);
      }
      fetchQualifications();
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Failed to retry blockchain pipeline'));
    } finally {
      setRetryingPipeline(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* ── Page Header ───────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">KYC Approvals</h1>
          <p className="text-sm text-muted">
            Review and approve investor identity verification requests
          </p>
        </div>
        <button
          onClick={fetchQualifications}
          disabled={loading}
          className="btn-secondary inline-flex items-center gap-2 self-start"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* ── Stats Row ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-line bg-surface p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted">Total Submissions</span>
            <span className="rounded-lg bg-surface-header p-2 text-muted">
              <User className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-bold text-ink">{stats?.total ?? 0}</p>
        </div>

        <div className="rounded-xl border border-amber-500/20 bg-surface p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-amber-400">Pending Review</span>
            <span className="rounded-lg bg-amber-500/10 p-2 text-amber-400">
              <Clock className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-bold text-amber-400">{stats?.pending ?? 0}</p>
        </div>

        <div className="rounded-xl border border-emerald-500/20 bg-surface p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-emerald-400">Approved</span>
            <span className="rounded-lg bg-emerald-500/10 p-2 text-emerald-400">
              <CheckCircle className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-bold text-emerald-400">{stats?.approved ?? 0}</p>
        </div>

        <div className="rounded-xl border border-red-500/20 bg-surface p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-red-400">Rejected</span>
            <span className="rounded-lg bg-red-500/10 p-2 text-red-400">
              <XCircle className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-bold text-red-400">{stats?.rejected ?? 0}</p>
        </div>
      </div>

      {/* ── Filters & Search ───────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1 rounded-lg border border-line bg-surface p-1">
          {[
            { value: 'all', label: 'All' },
            { value: 'pending', label: 'Pending' },
            { value: 'under_review', label: 'Under Review' },
            { value: 'approved', label: 'Approved' },
            { value: 'rejected', label: 'Rejected' },
          ].map((tab) => (
            <button
              key={tab.value}
              onClick={() => setStatusFilter(tab.value)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                statusFilter === tab.value
                  ? 'bg-accent text-btn-text'
                  : 'text-muted hover:text-ink'
              }`}
            >
              {tab.label}
              {tab.value === 'pending' && (stats?.pending ?? 0) > 0 && (
                <span className="ml-1.5 rounded-full bg-amber-500/20 px-1.5 py-0.2 text-[10px] font-bold text-amber-400">
                  {stats?.pending}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            type="text"
            placeholder="Search by name, email, wallet..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-field pl-9 text-xs"
          />
        </div>
      </div>

      {/* ── Table Card ────────────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-accent" />
          </div>
        ) : qualifications.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center gap-2 p-8 text-center">
            <Shield className="h-10 w-10 text-muted opacity-40" />
            <p className="text-base font-semibold text-ink">No KYC submissions found</p>
            <p className="text-xs text-muted max-w-md">
              {search || statusFilter !== 'all'
                ? 'Try adjusting your search or filters to see more results.'
                : 'Investor KYC submissions awaiting verification will appear here.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line bg-surface-header text-xs font-semibold text-muted">
                <tr>
                  <th className="px-4 py-3">Investor</th>
                  <th className="px-4 py-3">Submitted</th>
                  <th className="px-4 py-3">Country / Type</th>
                  <th className="px-4 py-3">Wallet</th>
                  <th className="px-4 py-3">Documents</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {qualifications.map((q) => {
                  const investorName = q.profile?.fullName || q.investor?.name || 'Unnamed Investor';
                  const email = q.investor?.email || '—';
                  const wallet = q.investor?.walletAddress;
                  const docCount = q.documents?.length || q.profile?.documents?.length || 0;

                  return (
                    <tr key={q.id} className="transition-colors hover:bg-surface-header/50">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-ink">{investorName}</div>
                        <div className="text-xs text-muted">{email}</div>
                      </td>

                      <td className="px-4 py-3 text-xs text-muted">
                        {formatDate(q.profile?.submittedAt || q.createdAt)}
                      </td>

                      <td className="px-4 py-3">
                        <div className="text-xs font-medium text-ink">
                          {q.profile?.country ? q.profile.country.toUpperCase() : '—'}
                        </div>
                        <div className="text-[11px] text-muted capitalize">
                          {q.profile?.investorType || 'individual'}
                        </div>
                      </td>

                      <td className="px-4 py-3 text-xs">
                        {wallet ? (
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-muted">
                              {wallet.slice(0, 6)}...{wallet.slice(-4)}
                            </span>
                            <button
                              onClick={() => copyToClipboard(wallet, `tbl-${q.id}`, 'Wallet')}
                              className="text-muted hover:text-ink"
                              title="Copy wallet address"
                            >
                              {copiedKey === `tbl-${q.id}` ? (
                                <Check className="h-3 w-3 text-emerald-400" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                            </button>
                          </div>
                        ) : (
                          <span className="text-muted italic text-[11px]">No wallet linked</span>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 rounded-full bg-surface-header px-2 py-0.5 text-xs text-muted">
                          <FileText className="h-3 w-3" />
                          {docCount} {docCount === 1 ? 'file' : 'files'}
                        </span>
                      </td>

                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                            STATUS_STYLES[q.status] || STATUS_STYLES.pending
                          }`}
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-current" />
                          {STATUS_LABELS[q.status] || q.status}
                        </span>
                      </td>

                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openDetail(q)}
                            className="btn-secondary px-2.5 py-1 text-xs"
                            title="View full details and documents"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            Review
                          </button>

                          {needsAdminDecision(q) ? (
                            <>
                              <button
                                onClick={() => openApprove(q)}
                                className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-400 transition-colors hover:bg-emerald-500/20"
                                title="Approve this investor"
                              >
                                Approve
                              </button>
                              <button
                                onClick={() => openReject(q)}
                                className="rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-xs font-semibold text-red-400 transition-colors hover:bg-red-500/20"
                                title="Reject this investor"
                              >
                                Reject
                              </button>
                            </>
                          ) : q.profile?.adminKycStatus === 'approved' ? (
                            <>
                              {(q.status === 'pending' || q.status === 'under_review') && (
                                <span className="text-xs text-blue-400">Admin approved · awaiting issuer</span>
                              )}
                              <button
                                onClick={() => handleRevokeAdminKyc(q)}
                                className="rounded-lg border border-orange-500/30 bg-orange-500/10 px-2.5 py-1 text-xs font-semibold text-orange-400 transition-colors hover:bg-orange-500/20"
                                title="Withdraw this investor's platform KYC"
                              >
                                Revoke KYC
                              </button>
                            </>
                          ) : null}
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

      {/* ── Detail Drawer Modal ────────────────────────────────────────────── */}
      {showDetail && selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="relative max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-line bg-surface p-6 shadow-2xl scrollbar-thin">
            <button
              onClick={() => {
                setShowDetail(false);
                setSelected(null);
              }}
              className="absolute right-4 top-4 rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-header hover:text-ink"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex items-start gap-3 border-b border-line pb-4">
              <div className="rounded-xl bg-accent-soft p-3 text-accent">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-bold text-ink">
                    {selected.profile?.fullName || selected.investor?.name || 'Investor KYC Details'}
                  </h2>
                  <span
                    className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                      STATUS_STYLES[selected.status] || STATUS_STYLES.pending
                    }`}
                  >
                    {STATUS_LABELS[selected.status] || selected.status}
                  </span>
                </div>
                <p className="text-xs text-muted mt-0.5">
                  Submitted: {formatDateTime(selected.profile?.submittedAt || selected.createdAt)}
                  {selected.approvedAt && ` • Approved: ${formatDateTime(selected.approvedAt)}`}
                  {selected.reviewedAt && ` • Reviewed: ${formatDateTime(selected.reviewedAt)}`}
                </p>
              </div>
            </div>

            <div className="mt-6 space-y-6">
              {/* Personal Information */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted mb-3">
                  Personal Information
                </h3>
                <div className="grid grid-cols-2 gap-4 rounded-xl border border-line bg-surface-header/40 p-4 sm:grid-cols-3 text-xs">
                  <div>
                    <span className="text-muted block">Full Name</span>
                    <span className="font-semibold text-ink">{selected.profile?.fullName || '—'}</span>
                  </div>
                  <div>
                    <span className="text-muted block">Email</span>
                    <span className="font-semibold text-ink">{selected.investor?.email || '—'}</span>
                  </div>
                  <div>
                    <span className="text-muted block">Phone</span>
                    <span className="font-semibold text-ink">
                      {selected.profile?.extraData?.phone || selected.investor?.phone || '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted block">Date of Birth</span>
                    <span className="font-semibold text-ink">
                      {formatDate(selected.profile?.dateOfBirth)}
                      {calculateAge(selected.profile?.dateOfBirth) && (
                        <span className="text-muted ml-1">
                          ({calculateAge(selected.profile?.dateOfBirth)} yrs)
                        </span>
                      )}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted block">Nationality</span>
                    <span className="font-semibold text-ink capitalize">
                      {selected.profile?.nationality || '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted block">Country of Residence</span>
                    <span className="font-semibold text-ink uppercase">
                      {selected.profile?.country || '—'}
                    </span>
                  </div>
                  <div className="sm:col-span-2">
                    <span className="text-muted block">Address</span>
                    <span className="font-semibold text-ink">
                      {selected.profile?.addressLine1}
                      {selected.profile?.addressLine2 ? `, ${selected.profile.addressLine2}` : ''}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted block">City & Postal Code</span>
                    <span className="font-semibold text-ink">
                      {selected.profile?.city}, {selected.profile?.postalCode}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted block">Tax ID / PAN / SSN</span>
                    <span className="font-semibold text-ink">
                      {selected.profile?.extraData?.tax_id || '—'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Classification */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted mb-3">
                  Investor Classification
                </h3>
                <div className="grid grid-cols-2 gap-4 rounded-xl border border-line bg-surface-header/40 p-4 sm:grid-cols-3 text-xs">
                  <div>
                    <span className="text-muted block">Investor Type</span>
                    <span className="font-semibold text-ink capitalize">
                      {selected.profile?.investorType || 'Individual'}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted block">Accreditation</span>
                    <span className="font-semibold text-ink capitalize">
                      {selected.profile?.accreditation || 'None'}
                    </span>
                  </div>
                  {selected.profile?.investorType === 'institutional' && (
                    <>
                      <div>
                        <span className="text-muted block">Company Name</span>
                        <span className="font-semibold text-ink">
                          {selected.profile?.extraData?.company_name || '—'}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted block">Registration No.</span>
                        <span className="font-semibold text-ink">
                          {selected.profile?.extraData?.company_registration || '—'}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted block">Company Country</span>
                        <span className="font-semibold text-ink uppercase">
                          {selected.profile?.extraData?.company_country || '—'}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Web3 & Identity */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted mb-3">
                  Blockchain & ONCHAINID Status
                </h3>
                <div className="space-y-3 rounded-xl border border-line bg-surface-header/40 p-4 text-xs">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-muted block">Linked Wallet</span>
                      <span className="font-mono font-medium text-ink">
                        {selected.investor?.walletAddress || 'No wallet linked yet'}
                      </span>
                    </div>
                    {selected.investor?.walletAddress && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => copyToClipboard(selected.investor?.walletAddress ?? '', 'modal-wallet', 'Wallet')}
                          className="btn-secondary px-2 py-1 text-xs"
                        >
                          <Copy className="h-3 w-3" />
                          Copy
                        </button>
                        <a
                          href={`https://sepolia.etherscan.io/address/${selected.investor?.walletAddress}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-secondary px-2 py-1 text-xs"
                        >
                          <ExternalLink className="h-3 w-3" />
                          Etherscan
                        </a>
                      </div>
                    )}
                  </div>

                  {selected.investor?.identityContractAddress && (
                    <div className="border-t border-line/60 pt-3 flex items-center justify-between">
                      <div>
                        <span className="text-muted block">ONCHAINID Contract</span>
                        <span className="font-mono font-medium text-ink">
                          {selected.investor.identityContractAddress}
                        </span>
                      </div>
                      <a
                        href={`https://sepolia.etherscan.io/address/${selected.investor.identityContractAddress}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-secondary px-2 py-1 text-xs"
                      >
                        <ExternalLink className="h-3 w-3" />
                        View Contract
                      </a>
                    </div>
                  )}

                  <div className="border-t border-line/60 pt-3 flex items-center justify-between">
                    <div>
                      <span className="text-muted block">Pipeline Stage</span>
                      <span className="font-medium text-ink capitalize">
                        {selected.blockchainStatus || 'Not started'}
                      </span>
                      {selected.blockchainError && (
                        <p className="text-red-400 text-[11px] mt-0.5">{selected.blockchainError}</p>
                      )}
                    </div>
                    {selected.status === 'approved' && selected.blockchainStatus !== 'completed' && (
                      <button
                        onClick={() => handleRetryPipeline(selected.id)}
                        disabled={retryingPipeline}
                        className="btn-secondary px-2 py-1 text-xs"
                      >
                        <RefreshCw className={`h-3 w-3 ${retryingPipeline ? 'animate-spin' : ''}`} />
                        Retry Pipeline
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Uploaded Documents */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted mb-3">
                  Submitted Documents
                </h3>
                {(!selected.documents || selected.documents.length === 0) &&
                (!selected.profile?.documents || selected.profile.documents.length === 0) ? (
                  <div className="rounded-xl border border-line bg-surface-header/30 p-4 text-center text-xs text-muted">
                    No documents uploaded with this submission.
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {(selected.documents || selected.profile?.documents || []).map((doc) => {
                      const fullMediaUrl = getMediaUrl(doc.fileUrl);
                      const label = DOC_TYPE_LABELS[doc.documentType] || doc.documentType;

                      return (
                        <div
                          key={doc.id}
                          className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-header/40 p-3 text-xs"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 font-semibold text-ink">
                              <FileCheck className="h-4 w-4 text-accent shrink-0" />
                              <span className="truncate">{label}</span>
                            </div>
                            <p className="text-[11px] text-muted truncate mt-0.5">
                              {doc.fileName} &bull; {formatFileSize(doc.fileSize)}
                            </p>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {fullMediaUrl && (
                              <a
                                href={fullMediaUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="btn-secondary px-2 py-1 text-xs"
                                title="Open document in new tab"
                              >
                                <ExternalLink className="h-3 w-3" />
                                View
                              </a>
                            )}
                            {fullMediaUrl && (
                              <a
                                href={fullMediaUrl}
                                download={doc.fileName}
                                className="btn-secondary px-2 py-1 text-xs"
                                title="Download document"
                              >
                                <Download className="h-3 w-3" />
                              </a>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Rejection / Review Notes */}
              {selected.rejectedReason && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-xs">
                  <span className="font-bold text-red-400 block mb-1">Rejection Reason</span>
                  <p className="text-red-300">{selected.rejectedReason}</p>
                </div>
              )}

              {selected.reviewNotes && (
                <div className="rounded-xl border border-line bg-surface-header/40 p-4 text-xs">
                  <span className="font-bold text-muted block mb-1">Review Notes</span>
                  <p className="text-ink">{selected.reviewNotes}</p>
                </div>
              )}
            </div>

            {/* Actions Footer */}
            <div className="mt-6 flex items-center justify-end gap-3 border-t border-line pt-4">
              <button
                onClick={() => {
                  setShowDetail(false);
                  setSelected(null);
                }}
                className="btn-secondary"
              >
                Close
              </button>

              {needsAdminDecision(selected) ? (
                <>
                  <button
                    onClick={() => openReject(selected)}
                    className="rounded-lg border border-red-500/30 bg-red-500/15 px-4 py-2 text-sm font-semibold text-red-400 transition-colors hover:bg-red-500/25"
                  >
                    Reject KYC
                  </button>
                  <button
                    onClick={() => {
                      setShowDetail(false);
                      setShowApprove(true);
                    }}
                    className="btn-primary"
                  >
                    Approve KYC
                  </button>
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* ── Approve Modal ─────────────────────────────────────────────────── */}
      {showApprove && selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-emerald-500/15 p-3 text-emerald-400">
                <CheckCircle className="h-6 w-6" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-ink">Approve Investor KYC</h3>
                <p className="text-xs text-muted mt-1">
                  Are you sure you want to approve{' '}
                  <strong className="text-ink">
                    {selected.profile?.fullName || selected.investor?.name || 'this investor'}
                  </strong>
                  ? Once approved, they will be qualified to purchase tokens.
                </p>
              </div>
            </div>

            <div className="mt-4">
              <label className="label text-xs font-semibold text-ink">Optional Review Notes</label>
              <textarea
                rows={3}
                placeholder="Add notes for internal records..."
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                className="input-field mt-1.5 w-full resize-none text-xs"
              />
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                onClick={() => {
                  setShowApprove(false);
                  setSelected(null);
                }}
                disabled={actionLoading}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleApprove}
                disabled={actionLoading}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition-all hover:bg-emerald-400 disabled:opacity-60"
              >
                {actionLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                Confirm Approval
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Reject Modal ──────────────────────────────────────────────────── */}
      {showReject && selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl border border-line bg-surface p-6 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-red-500/15 p-3 text-red-400">
                <XCircle className="h-6 w-6" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-ink">Reject Investor KYC</h3>
                <p className="text-xs text-muted mt-1">
                  Reject KYC verification for{' '}
                  <strong className="text-ink">
                    {selected.profile?.fullName || selected.investor?.name || 'this investor'}
                  </strong>
                  . Please specify the reason below.
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-4">
              <div>
                <div className="flex items-center justify-between">
                  <label className="label text-xs font-semibold text-ink">Rejection Reason *</label>
                  <span className="text-[11px] text-muted">Visible to the investor</span>
                </div>
                <textarea
                  rows={3}
                  placeholder="e.g. Identity document is expired or blurry..."
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  className="input-field mt-1.5 w-full resize-none text-xs"
                />

                <div className="mt-2.5 space-y-1">
                  <p className="text-[11px] font-medium text-muted">Quick reason presets:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      'Identity document is blurry or unreadable',
                      'Document has expired',
                      'Name on document does not match registration',
                      'Proof of address older than 3 months',
                      'Invalid or unsupported document type',
                    ].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setRejectionReason(preset)}
                        className="rounded-md border border-line bg-surface-header px-2 py-1 text-[11px] text-muted transition-colors hover:border-accent hover:text-ink text-left"
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <label className="label text-xs font-semibold text-ink">Internal Notes (Optional)</label>
                <input
                  type="text"
                  placeholder="Notes for compliance team..."
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  className="input-field mt-1.5 w-full text-xs"
                />
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                onClick={() => {
                  setShowReject(false);
                  setSelected(null);
                }}
                disabled={actionLoading}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={actionLoading || !rejectionReason.trim()}
                className="inline-flex items-center gap-2 rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-red-600 disabled:opacity-60"
              >
                {actionLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Revoke Platform KYC Modal ─────────────────────────────────────── */}
      {revokeTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl border border-line bg-surface p-6 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-orange-500/15 p-3 text-orange-400">
                <XCircle className="h-6 w-6" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-ink">Revoke Platform KYC</h3>
                <p className="mt-1 text-xs text-muted">
                  Withdraw platform KYC for{' '}
                  <strong className="text-ink">
                    {revokeTarget.profile?.fullName || revokeTarget.investor?.name || 'this investor'}
                  </strong>
                  . They will be blocked with every issuer until re-approved.
                </p>
              </div>
            </div>

            <div className="mt-4">
              <div className="flex items-center justify-between">
                <label className="label text-xs font-semibold text-ink">Reason for revocation *</label>
                <span className="text-[11px] text-muted">Recorded in the audit log</span>
              </div>
              <textarea
                rows={3}
                autoFocus
                placeholder="e.g. Documents found to be invalid after re-verification..."
                value={revokeReason}
                onChange={(e) => setRevokeReason(e.target.value)}
                className="input-field mt-1.5 w-full resize-none text-xs"
              />
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button onClick={closeRevokeModal} disabled={revoking} className="btn-secondary">
                Cancel
              </button>
              <button
                onClick={confirmRevokeAdminKyc}
                disabled={revoking || !revokeReason.trim()}
                className="inline-flex items-center gap-2 rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-red-600 disabled:opacity-60"
              >
                {revoking && <Loader2 className="h-4 w-4 animate-spin" />}
                Confirm Revoke
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
