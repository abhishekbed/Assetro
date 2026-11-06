'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import clsx from 'clsx';
import { toast } from 'sonner';
import {
  ArrowLeft,
  CheckCircle,
  XCircle,
  FileText,
  Download,
  User,
  MapPin,
  Calendar,
  Shield,
  Loader2,
  AlertCircle,
  Globe,
  ExternalLink,
  Mail,
  Phone,
  Building2,
  Hash,
  Copy,
  Check,
  Eye,
  RefreshCw,
  FileCheck,
  BadgeCheck,
  Wallet,
} from 'lucide-react';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { getMediaUrl } from '@/lib/media';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Document {
  id: string;
  documentType: string;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  mimeType: string;
  status: string;
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
  id: string;
  userId?: string;
  /** Platform-admin KYC level (the issuer can only approve once this is 'approved'). */
  adminKycStatus?: 'pending' | 'approved' | 'rejected' | 'revoked' | 'expired' | null;
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

interface Qualification {
  id: string;
  investorId: string;
  issuerId: string;
  status: 'pending' | 'under_review' | 'approved' | 'rejected' | 'expired' | 'revoked';
  revokedReason?: string | null;
  reviewNotes?: string | null;
  rejectedReason?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  approvedAt?: string | null;
  expiresAt?: string | null;
  additionalClaimsRequired?: number[];
  claimsVerified?: Record<string, string>;
  blockchainJobId?: string | null;
  blockchainStatus?: string | null;
  blockchainError?: string | null;
  blockchainCompletedAt?: string | null;
  createdAt: string;
  profile?: Profile;
  investor?: InvestorUser | null;
}

// ── Status Config ─────────────────────────────────────────────────────────────

const statusBadge: Record<string, string> = {
  pending:      'bg-amber-500/10 text-amber-400 border border-amber-500/30',
  under_review: 'bg-blue-500/10 text-blue-400 border border-blue-500/30',
  approved:     'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30',
  rejected:     'bg-rose-500/10 text-rose-400 border border-rose-500/30',
  expired:      'bg-slate-700/50 text-slate-400 border border-slate-700',
  revoked:      'bg-orange-500/10 text-orange-400 border border-orange-500/30',
};

const docTypeLabels: Record<string, string> = {
  passport:            'Passport',
  national_id:         'National ID / Identity Card',
  drivers_license:     "Driver's License",
  proof_of_address:    'Proof of Address (Utility / Bank)',
  accreditation_proof: 'Accreditation Proof Document',
  selfie:              'Selfie Verification',
  other:               'Supporting KYC Document',
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

function getExplorerAddressUrl(address: string): string {
  return `https://amoy.polygonscan.com/address/${address}`;
}

// ── Main Page Component ───────────────────────────────────────────────────────

export default function KycReviewDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuthStore();
  const id = params.id as string;

  const [qualification, setQualification] = useState<Qualification | null>(null);
  const [notes, setNotes] = useState('');
  const [rejectedReason, setRejectedReason] = useState('');
  const [processing, setProcessing] = useState(false);
  const [retryingPipeline, setRetryingPipeline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadingDocId, setDownloadingDocId] = useState<string | null>(null);
  const [viewLoadingDocId, setViewLoadingDocId] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [approvalResult, setApprovalResult] = useState<{
    identityAddress: string | null;
    blockchainStatus: string | null;
  } | null>(null);

  const headers = user?.id ? { 'x-user-id': user.id } : {};

  const fetchData = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.get(`/kyc/qualifications/${id}`, { headers });
      const qualData = res.data?.data || null;
      setQualification(qualData);
      if (qualData?.reviewNotes) setNotes(qualData.reviewNotes);
      if (qualData?.rejectedReason) setRejectedReason(qualData.rejectedReason);
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to load qualification');
    } finally {
      setLoading(false);
    }
  }, [id, user?.id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const copyToClipboard = (text: string, key: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    toast.success(`${label} copied to clipboard`);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleDownload = async (docId: string, fileName?: string) => {
    setDownloadingDocId(docId);
    try {
      const res = await api.get(`/kyc/documents/${docId}/download`, { headers });
      const rawUrl = res.data?.data?.url || res.data?.url || res.data;
      if (typeof rawUrl === 'string') {
        const url = getMediaUrl(rawUrl);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName || 'kyc-document';
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } else {
        toast.error('Download URL not returned');
      }
    } catch {
      toast.error('Failed to download document');
    } finally {
      setDownloadingDocId(null);
    }
  };

  const handleView = async (docId: string) => {
    setViewLoadingDocId(docId);
    try {
      const res = await api.get(`/kyc/documents/${docId}/download`, { headers });
      const rawUrl = res.data?.data?.url || res.data?.url || res.data;
      if (typeof rawUrl === 'string') {
        window.open(getMediaUrl(rawUrl), '_blank');
      } else {
        toast.error('Document URL not available');
      }
    } catch {
      toast.error('Failed to open document');
    } finally {
      setViewLoadingDocId(null);
    }
  };

  const handleRetryPipeline = async () => {
    setRetryingPipeline(true);
    try {
      await api.post(`/kyc/qualifications/${id}/retry-pipeline`, {}, { headers });
      toast.success('Blockchain deployment re-queued successfully');
      fetchData();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err?.message || 'Failed to retry blockchain pipeline');
    } finally {
      setRetryingPipeline(false);
    }
  };

  const handleRevoke = async () => {
    if (!qualification) return;
    const reason = window.prompt('Reason for revoking this investor\'s approval (they will need to request approval again):');
    if (!reason || !reason.trim()) return;
    setProcessing(true);
    try {
      await api.post(`/kyc/qualifications/${id}/revoke`, { reason: reason.trim() }, { headers });
      setQualification((prev) =>
        prev ? { ...prev, status: 'revoked', revokedReason: reason.trim(), expiresAt: null } : prev,
      );
      toast.success('Approval revoked');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } }; message?: string };
      toast.error(e.response?.data?.message || e.message || 'Could not revoke approval');
    } finally {
      setProcessing(false);
    }
  };

  const handleAction = async (action: 'approved' | 'rejected' | 'under_review') => {
    if (!qualification) return;
    setProcessing(true);
    try {
      const res = await api.patch(
        `/kyc/qualifications/${id}/review`,
        {
          status: action,
          review_notes: notes || undefined,
          rejected_reason: action === 'rejected' ? (rejectedReason || notes || undefined) : undefined,
        },
        { headers }
      );

      if (action === 'approved') {
        setApprovalResult({
          identityAddress: res.data?.data?.identity_address ?? null,
          blockchainStatus: res.data?.data?.blockchainStatus ?? null,
        });
        setQualification((prev) =>
          prev
            ? {
                ...prev,
                status: 'approved',
                reviewNotes: notes,
                approvedAt: new Date().toISOString(),
              }
            : prev
        );
        toast.success('Investor approved successfully');
      } else if (action === 'rejected') {
        setQualification((prev) =>
          prev
            ? {
                ...prev,
                status: 'rejected',
                reviewNotes: notes,
                rejectedReason: rejectedReason || notes,
                reviewedAt: new Date().toISOString(),
              }
            : prev
        );
        toast.success('Investor qualification rejected');
      } else {
        setQualification((prev) =>
          prev
            ? {
                ...prev,
                status: 'under_review',
                reviewNotes: notes,
              }
            : prev
        );
        toast.success('Status updated to Under Review');
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err?.message || `Failed to ${action} investor`);
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
        <p className="text-sm text-slate-400">Loading investor KYC profile &amp; qualification...</p>
      </div>
    );
  }

  if (error || !qualification) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center gap-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-8 text-center shadow-xl">
        <AlertCircle className="h-12 w-12 text-rose-400" />
        <p className="max-w-md text-slate-300">{error || 'Qualification record not found'}</p>
        <Link
          href="/issuer/kyc-review"
          className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-slate-950 shadow-lg transition-all hover:opacity-90"
        >
          Back to KYC Queue
        </Link>
      </div>
    );
  }

  const profile = qualification.profile;
  const investor = qualification.investor;
  const documents = profile?.documents ?? [];
  const age = calculateAge(profile?.dateOfBirth);
  const isReviewable = qualification.status === 'pending' || qualification.status === 'under_review';
  const isReviewed = qualification.status === 'approved' || qualification.status === 'rejected';

  const phoneValue = profile?.extraData?.phone || investor?.phone || null;
  const taxIdValue = profile?.extraData?.tax_id || null;
  const hasInstitutionalInfo =
    profile?.investorType === 'institutional' ||
    Boolean(profile?.extraData?.company_name) ||
    Boolean(profile?.extraData?.company_registration);

  const quickRejectReasons = [
    'Government ID document is blurry or unreadable',
    'Name on ID document does not match profile name',
    'Submitted identity document has expired',
    'Tax ID / PAN number is invalid or cannot be verified',
    'Proof of address older than 3 months or incomplete',
  ];

  return (
    <div className="space-y-6 pb-12">
      {/* Back button */}
      <Link
        href="/issuer/kyc-review"
        className="inline-flex items-center gap-2 text-sm font-medium text-slate-400 hover:text-ink transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to KYC Queue
      </Link>

      {/* Header Banner */}
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 text-xl font-bold">
            {profile?.fullName
              ? profile.fullName
                  .split(' ')
                  .map((n) => n[0])
                  .slice(0, 2)
                  .join('')
                  .toUpperCase()
              : 'ID'}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl font-bold text-ink">
                {profile?.fullName ?? investor?.name ?? 'Investor Qualification'}
              </h1>
              <span
                className={clsx(
                  'inline-flex items-center gap-1.5 rounded-full px-3 py-0.5 text-xs font-semibold capitalize',
                  statusBadge[qualification.status] || 'bg-slate-800 text-slate-400 border border-slate-700'
                )}
              >
                {qualification.status === 'approved' && <CheckCircle className="h-3.5 w-3.5" />}
                {qualification.status === 'rejected' && <XCircle className="h-3.5 w-3.5" />}
                {qualification.status.replace(/_/g, ' ')}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              {investor?.email && (
                <>
                  <span className="font-medium text-slate-300">{investor.email}</span> ·{' '}
                </>
              )}
              Profile submitted {formatDate(profile?.submittedAt)} · Requested {formatDate(qualification.createdAt)}
            </p>
          </div>
        </div>

        {/* Action quick badge */}
        <div className="flex flex-wrap items-center gap-2">
          {investor?.walletAddress ? (
            <div className="flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-400">
              <Wallet className="h-3.5 w-3.5" />
              <span>Wallet Connected</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-400">
              <AlertCircle className="h-3.5 w-3.5" />
              <span>No Wallet Linked</span>
            </div>
          )}
          {investor?.identityContractAddress && (
            <div className="flex items-center gap-1.5 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-xs text-cyan-300">
              <BadgeCheck className="h-3.5 w-3.5" />
              <span>ONCHAINID Active</span>
            </div>
          )}
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left Column (2 Cols) */}
        <div className="space-y-6 lg:col-span-2">

          {/* ── 1. Investor Account & Blockchain Identity ── */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between border-b border-slate-800/80 pb-3">
              <div className="flex items-center gap-2.5">
                <Wallet className="h-5 w-5 text-cyan-400" />
                <h3 className="text-base font-semibold text-ink">Investor Account &amp; Web3 Identity</h3>
              </div>
              <span className="text-xs text-slate-500">Polygon Amoy (80002)</span>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Email */}
              <div className="flex items-start gap-3 rounded-xl border border-slate-800/80 bg-slate-800/30 p-3.5">
                <Mail className="mt-0.5 h-4 w-4 text-cyan-400 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Registered Email</p>
                  <p className="truncate text-sm font-medium text-ink">{investor?.email ?? '—'}</p>
                  <p className="text-[11px] text-slate-500 capitalize mt-0.5">
                    Account Status: <span className="text-slate-300">{investor?.status ?? 'active'}</span>
                  </p>
                </div>
              </div>

              {/* User ID */}
              <div className="flex items-start gap-3 rounded-xl border border-slate-800/80 bg-slate-800/30 p-3.5">
                <User className="mt-0.5 h-4 w-4 text-cyan-400 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Investor User ID</p>
                  <p className="truncate font-mono text-xs text-slate-300">{qualification.investorId}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Joined: {formatDate(investor?.createdAt)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => copyToClipboard(qualification.investorId, 'investorId', 'Investor ID')}
                  className="text-slate-400 hover:text-cyan-400 p-1"
                  title="Copy User ID"
                >
                  {copiedKey === 'investorId' ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>

              {/* Wallet Address */}
              <div className="sm:col-span-2 rounded-xl border border-slate-800/80 bg-slate-800/30 p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <Wallet className="mt-0.5 h-4 w-4 text-cyan-400 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Web3 Wallet Address (MetaMask)</p>
                        {investor?.walletAddress ? (
                          <span className="rounded-full bg-emerald-500/10 px-2 py-0.2 text-[10px] font-semibold text-emerald-400 border border-emerald-500/20">
                            Linked
                          </span>
                        ) : (
                          <span className="rounded-full bg-amber-500/10 px-2 py-0.2 text-[10px] font-semibold text-amber-400 border border-amber-500/20">
                            Pending Wallet
                          </span>
                        )}
                      </div>
                      {investor?.walletAddress ? (
                        <p className="font-mono text-xs text-cyan-300 break-all mt-1">
                          {investor.walletAddress}
                        </p>
                      ) : (
                        <p className="text-xs text-amber-400/90 mt-1">
                          No MetaMask / Web3 wallet linked yet. Approving will queue qualification; ONCHAINID deployment will execute automatically once investor connects their wallet.
                        </p>
                      )}
                    </div>
                  </div>
                  {investor?.walletAddress && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => copyToClipboard(investor.walletAddress!, 'wallet', 'Wallet address')}
                        className="rounded-lg border border-slate-700 bg-slate-800 p-1.5 text-slate-300 hover:text-cyan-400 transition-colors"
                        title="Copy Wallet Address"
                      >
                        {copiedKey === 'wallet' ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                      </button>
                      <a
                        href={getExplorerAddressUrl(investor.walletAddress)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-lg border border-slate-700 bg-slate-800 p-1.5 text-slate-300 hover:text-cyan-400 transition-colors"
                        title="View on Polygonscan"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </div>
                  )}
                </div>
              </div>

              {/* ONCHAINID Identity Contract Address */}
              <div className="sm:col-span-2 rounded-xl border border-slate-800/80 bg-slate-800/30 p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <Shield className="mt-0.5 h-4 w-4 text-cyan-400 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">ONCHAINID Identity Contract</p>
                        {investor?.identityContractAddress ? (
                          <span className="rounded-full bg-emerald-500/10 px-2 py-0.2 text-[10px] font-semibold text-emerald-400 border border-emerald-500/20">
                            Deployed
                          </span>
                        ) : (
                          <span className="rounded-full bg-slate-700 px-2 py-0.2 text-[10px] font-semibold text-slate-400">
                            Not Deployed
                          </span>
                        )}
                      </div>
                      {investor?.identityContractAddress ? (
                        <p className="font-mono text-xs text-emerald-400 break-all mt-1">
                          {investor.identityContractAddress}
                        </p>
                      ) : (
                        <p className="text-xs text-slate-400 mt-1">
                          ONCHAINID contract will be deployed on-chain automatically when the investor qualification is approved.
                        </p>
                      )}
                    </div>
                  </div>
                  {investor?.identityContractAddress && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => copyToClipboard(investor.identityContractAddress!, 'onchainid', 'ONCHAINID contract')}
                        className="rounded-lg border border-slate-700 bg-slate-800 p-1.5 text-slate-300 hover:text-cyan-400 transition-colors"
                        title="Copy ONCHAINID Address"
                      >
                        {copiedKey === 'onchainid' ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                      </button>
                      <a
                        href={getExplorerAddressUrl(investor.identityContractAddress)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-lg border border-slate-700 bg-slate-800 p-1.5 text-slate-300 hover:text-cyan-400 transition-colors"
                        title="View on Polygonscan"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ── 2. Personal Information ── */}
          {profile && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl">
              <div className="mb-4 flex items-center justify-between border-b border-slate-800/80 pb-3">
                <div className="flex items-center gap-2.5">
                  <User className="h-5 w-5 text-cyan-400" />
                  <h3 className="text-base font-semibold text-ink">Personal Information</h3>
                </div>
                <span className="text-xs text-slate-500">Declared in KYC Profile</span>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {/* Full Legal Name */}
                <div className="flex items-start gap-3 rounded-xl border border-slate-800/80 bg-slate-800/30 p-3.5">
                  <User className="mt-0.5 h-4 w-4 text-cyan-400 shrink-0" />
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Full Legal Name</p>
                    <p className="text-sm font-semibold text-ink">{profile.fullName}</p>
                  </div>
                </div>

                {/* Date of Birth & Age */}
                <div className="flex items-start gap-3 rounded-xl border border-slate-800/80 bg-slate-800/30 p-3.5">
                  <Calendar className="mt-0.5 h-4 w-4 text-cyan-400 shrink-0" />
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Date of Birth</p>
                    <p className="text-sm font-semibold text-ink">
                      {formatDate(profile.dateOfBirth)}
                      {age !== null && (
                        <span className="ml-2 text-xs font-normal text-slate-400">({age} years old)</span>
                      )}
                    </p>
                  </div>
                </div>

                {/* Nationality */}
                <div className="flex items-start gap-3 rounded-xl border border-slate-800/80 bg-slate-800/30 p-3.5">
                  <Globe className="mt-0.5 h-4 w-4 text-cyan-400 shrink-0" />
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Nationality</p>
                    <p className="text-sm font-semibold capitalize text-ink">{profile.nationality}</p>
                  </div>
                </div>

                {/* Phone Number */}
                <div className="flex items-start gap-3 rounded-xl border border-slate-800/80 bg-slate-800/30 p-3.5">
                  <Phone className="mt-0.5 h-4 w-4 text-cyan-400 shrink-0" />
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Phone Number</p>
                    <p className="text-sm font-semibold text-ink">
                      {phoneValue || <span className="font-normal italic text-slate-500">Not provided</span>}
                    </p>
                  </div>
                </div>

                {/* Tax ID / PAN / SSN */}
                <div className="flex items-start gap-3 rounded-xl border border-slate-800/80 bg-slate-800/30 p-3.5">
                  <Hash className="mt-0.5 h-4 w-4 text-cyan-400 shrink-0" />
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Tax ID / PAN / SSN</p>
                    <p className="text-sm font-semibold text-ink font-mono">
                      {taxIdValue || <span className="font-sans font-normal italic text-slate-500">Not provided</span>}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">Used for regulatory &amp; tax compliance</p>
                  </div>
                </div>

                {/* Country of Residence */}
                <div className="flex items-start gap-3 rounded-xl border border-slate-800/80 bg-slate-800/30 p-3.5">
                  <MapPin className="mt-0.5 h-4 w-4 text-cyan-400 shrink-0" />
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Country of Residence</p>
                    <p className="text-sm font-semibold uppercase text-ink">{profile.country}</p>
                  </div>
                </div>

                {/* Investor Type */}
                <div className="flex items-start gap-3 rounded-xl border border-slate-800/80 bg-slate-800/30 p-3.5">
                  <Shield className="mt-0.5 h-4 w-4 text-cyan-400 shrink-0" />
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Investor Classification</p>
                    <div className="mt-0.5 flex items-center gap-2">
                      <span className="rounded-lg bg-cyan-500/10 px-2.5 py-0.5 text-xs font-semibold capitalize text-cyan-400 border border-cyan-500/20">
                        {profile.investorType}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Accreditation */}
                <div className="flex items-start gap-3 rounded-xl border border-slate-800/80 bg-slate-800/30 p-3.5">
                  <BadgeCheck className="mt-0.5 h-4 w-4 text-cyan-400 shrink-0" />
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Accreditation Status</p>
                    <div className="mt-0.5 flex items-center gap-2">
                      <span
                        className={clsx(
                          'rounded-lg px-2.5 py-0.5 text-xs font-semibold capitalize border',
                          profile.accreditation === 'none'
                            ? 'bg-slate-800 text-slate-400 border-slate-700'
                            : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                        )}
                      >
                        {profile.accreditation.replace(/_/g, ' ')}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── 3. Residential / Registered Address ── */}
          {profile && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl">
              <div className="mb-4 flex items-center justify-between border-b border-slate-800/80 pb-3">
                <div className="flex items-center gap-2.5">
                  <MapPin className="h-5 w-5 text-cyan-400" />
                  <h3 className="text-base font-semibold text-ink">Residential / Registered Address</h3>
                </div>
                <span className="text-xs text-slate-500">Address Verification</span>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2 rounded-xl border border-slate-800/80 bg-slate-800/30 p-3.5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Street Address</p>
                  <p className="text-sm font-medium text-ink">{profile.addressLine1}</p>
                  {profile.addressLine2 && (
                    <p className="text-sm text-slate-300 mt-0.5">{profile.addressLine2}</p>
                  )}
                </div>

                <div className="rounded-xl border border-slate-800/80 bg-slate-800/30 p-3.5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">City</p>
                  <p className="text-sm font-medium text-ink">{profile.city}</p>
                </div>

                <div className="rounded-xl border border-slate-800/80 bg-slate-800/30 p-3.5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Postal / ZIP Code</p>
                  <p className="text-sm font-medium text-ink font-mono">{profile.postalCode}</p>
                </div>

                <div className="sm:col-span-2 rounded-xl border border-slate-800/80 bg-slate-800/30 p-3.5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Country (ISO Code)</p>
                  <p className="text-sm font-medium text-ink uppercase">{profile.country}</p>
                </div>
              </div>
            </div>
          )}

          {/* ── 4. Institutional / Corporate Information (Conditional) ── */}
          {hasInstitutionalInfo && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl">
              <div className="mb-4 flex items-center justify-between border-b border-slate-800/80 pb-3">
                <div className="flex items-center gap-2.5">
                  <Building2 className="h-5 w-5 text-cyan-400" />
                  <h3 className="text-base font-semibold text-ink">Institutional / Corporate Information</h3>
                </div>
                <span className="rounded-full bg-cyan-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-cyan-400 border border-cyan-500/20">
                  Institutional Investor
                </span>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2 rounded-xl border border-slate-800/80 bg-slate-800/30 p-3.5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Company / Entity Name</p>
                  <p className="text-sm font-semibold text-ink">
                    {profile?.extraData?.company_name || 'Not provided'}
                  </p>
                </div>

                <div className="rounded-xl border border-slate-800/80 bg-slate-800/30 p-3.5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Registration / CIN Number</p>
                  <p className="text-sm font-medium font-mono text-ink">
                    {profile?.extraData?.company_registration || 'Not provided'}
                  </p>
                </div>

                <div className="rounded-xl border border-slate-800/80 bg-slate-800/30 p-3.5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Country of Incorporation</p>
                  <p className="text-sm font-medium uppercase text-ink">
                    {profile?.extraData?.company_country || profile?.country || 'Not provided'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ── 5. Submitted Documents ── */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between border-b border-slate-800/80 pb-3">
              <div className="flex items-center gap-2.5">
                <FileCheck className="h-5 w-5 text-cyan-400" />
                <h3 className="text-base font-semibold text-ink">Submitted KYC Documents</h3>
              </div>
              <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-xs font-medium text-slate-300">
                {documents.length} {documents.length === 1 ? 'file' : 'files'}
              </span>
            </div>

            {documents.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-800 bg-slate-800/20 py-8 text-center">
                <FileText className="h-10 w-10 text-slate-600 mb-2" />
                <p className="text-sm font-medium text-slate-300">No documents uploaded yet</p>
                <p className="text-xs text-slate-500 mt-1 max-w-sm">
                  The investor has not uploaded identity or proof of address documents for this submission.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {documents.map((doc) => {
                  const typeLabel = docTypeLabels[doc.documentType] || doc.documentType;

                  return (
                    <div
                      key={doc.id}
                      className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-800/40 p-4 transition-colors hover:bg-slate-800/60 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                          <FileText className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-sm font-semibold text-ink">{doc.fileName}</p>
                            <span className="rounded-md bg-slate-700/60 px-2 py-0.5 text-[10px] font-medium text-slate-300">
                              {typeLabel}
                            </span>
                          </div>
                          <p className="text-xs text-slate-400 mt-0.5">
                            {formatFileSize(doc.fileSize)} · Uploaded {formatDateTime(doc.uploadedAt)}
                          </p>
                        </div>
                      </div>

                      {/* Document Actions */}
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleView(doc.id)}
                          disabled={viewLoadingDocId === doc.id}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700 hover:text-cyan-400 transition-colors disabled:opacity-50"
                        >
                          {viewLoadingDocId === doc.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Eye className="h-3.5 w-3.5" />
                          )}
                          View
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDownload(doc.id, doc.fileName)}
                          disabled={downloadingDocId === doc.id}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30 px-3 py-1.5 text-xs font-semibold text-cyan-300 hover:bg-cyan-500/20 transition-colors disabled:opacity-50"
                        >
                          {downloadingDocId === doc.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Download className="h-3.5 w-3.5" />
                          )}
                          Download
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── 6. Review History & Notes ── */}
          {isReviewed && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl">
              <div className="mb-4 flex items-center justify-between border-b border-slate-800/80 pb-3">
                <div className="flex items-center gap-2.5">
                  <Shield className="h-5 w-5 text-cyan-400" />
                  <h3 className="text-base font-semibold text-ink">Review Decision History</h3>
                </div>
                <span className="text-xs text-slate-500">Audit Record</span>
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-2.5">
                  {qualification.status === 'approved' ? (
                    <CheckCircle className="h-5 w-5 text-emerald-400" />
                  ) : (
                    <XCircle className="h-5 w-5 text-rose-400" />
                  )}
                  <span
                    className={clsx(
                      'text-sm font-semibold capitalize',
                      qualification.status === 'approved' ? 'text-emerald-400' : 'text-rose-400'
                    )}
                  >
                    Qualification {qualification.status}
                  </span>
                  {(qualification.reviewedAt || qualification.approvedAt) && (
                    <span className="text-xs text-slate-400">
                      on {formatDateTime(qualification.reviewedAt || qualification.approvedAt)}
                    </span>
                  )}
                </div>

                {qualification.reviewNotes && (
                  <div className="rounded-xl border border-slate-800 bg-slate-800/40 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                      Issuer Review Notes
                    </p>
                    <p className="text-sm text-slate-200 whitespace-pre-wrap">{qualification.reviewNotes}</p>
                  </div>
                )}

                {qualification.rejectedReason && (
                  <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-rose-400 mb-1">
                      Rejection Reason
                    </p>
                    <p className="text-sm text-rose-300 whitespace-pre-wrap">{qualification.rejectedReason}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Right Column: Decision Panel (1 Col) ── */}
        <div className="lg:col-span-1">
          {approvalResult ? (
            <div className="sticky top-6 space-y-4 rounded-2xl border border-emerald-500/30 bg-slate-900/60 p-6 shadow-xl">
              <div className="flex items-center gap-2.5">
                <CheckCircle className="h-6 w-6 text-emerald-400" />
                <h3 className="text-lg font-semibold text-ink">Investor Approved</h3>
              </div>
              <p className="text-sm text-slate-300">
                The qualification has been approved. The blockchain identity pipeline has been triggered.
              </p>

              <div className="space-y-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-xs">
                <div>
                  <p className="font-semibold uppercase tracking-wider text-slate-400">Investor</p>
                  <p className="font-medium text-ink mt-0.5">{profile?.fullName ?? investor?.name}</p>
                </div>
                <div>
                  <p className="font-semibold uppercase tracking-wider text-slate-400">ONCHAINID Identity</p>
                  {approvalResult.identityAddress ? (
                    <p className="break-all font-mono text-cyan-300 mt-0.5">
                      {approvalResult.identityAddress}
                    </p>
                  ) : approvalResult.blockchainStatus === 'deferred:no_wallet' ? (
                    <p className="italic text-amber-300 mt-0.5">
                      Deferred — investor has not linked a Web3 wallet yet
                    </p>
                  ) : (
                    <p className="italic text-cyan-300 mt-0.5">
                      Deploying on-chain identity… (pipeline queued)
                    </p>
                  )}
                </div>
                <div>
                  <p className="font-semibold uppercase tracking-wider text-slate-400">Whitelist Status</p>
                  <p className="font-medium text-emerald-400 mt-0.5">
                    {approvalResult.identityAddress
                      ? 'Identity registered & Whitelisted for all your tokens'
                      : 'Will automatically register once wallet is connected'}
                  </p>
                </div>
              </div>

              <Link
                href="/issuer/kyc-review"
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-slate-950 shadow-lg transition-all hover:opacity-90"
              >
                <ExternalLink className="h-4 w-4" />
                Back to KYC Queue
              </Link>
            </div>
          ) : isReviewable ? (
            <div className="sticky top-6 space-y-5 rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl">
              <div>
                <h3 className="text-lg font-semibold text-ink">Review Decision</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Examine the investor identity details and submitted documents to make a determination.
                </p>
              </div>

              {qualification.profile?.adminKycStatus &&
                qualification.profile.adminKycStatus !== 'approved' && (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300">
                    The platform admin KYC for this investor is{' '}
                    <span className="font-semibold">{qualification.profile.adminKycStatus}</span>. You can approve
                    them only after the admin approves their KYC.
                  </div>
                )}

              {/* Review Notes */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Review Notes (Optional)
                </label>
                <textarea
                  className="w-full rounded-xl border border-slate-700 bg-slate-800/80 px-3.5 py-2.5 text-sm text-ink placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 min-h-[90px]"
                  placeholder="Internal audit notes or instructions for the investor..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>

              {/* Rejection Reason */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Rejection Reason (Required if Rejecting)
                </label>
                <textarea
                  className="w-full rounded-xl border border-slate-700 bg-slate-800/80 px-3.5 py-2.5 text-sm text-ink placeholder:text-slate-500 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500 min-h-[75px]"
                  placeholder="Specify why the qualification is being rejected..."
                  value={rejectedReason}
                  onChange={(e) => setRejectedReason(e.target.value)}
                />

                {/* Quick suggestions */}
                <div className="mt-2 space-y-1">
                  <p className="text-[11px] text-slate-500 font-medium">Quick reason presets:</p>
                  <div className="flex flex-wrap gap-1">
                    {quickRejectReasons.map((preset, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setRejectedReason(preset)}
                        className="rounded-md border border-slate-700 bg-slate-800/60 px-2 py-0.5 text-[10px] text-slate-300 hover:border-slate-500 hover:text-ink text-left"
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => handleAction('approved')}
                  disabled={processing}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 px-4 py-2.5 text-sm font-semibold text-slate-950 shadow-lg disabled:opacity-50 transition-all"
                >
                  {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                  Approve Investor
                </button>

                <button
                  type="button"
                  onClick={() => handleAction('under_review')}
                  disabled={processing}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-2.5 text-sm font-semibold text-blue-400 hover:bg-blue-500/20 disabled:opacity-50 transition-all"
                >
                  {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
                  Mark Under Review
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (!rejectedReason && !notes) {
                      toast.error('Please enter a rejection reason before rejecting.');
                      return;
                    }
                    handleAction('rejected');
                  }}
                  disabled={processing}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-sm font-semibold text-rose-400 hover:bg-rose-500/20 disabled:opacity-50 transition-all"
                >
                  {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                  Reject Investor
                </button>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-800/40 p-3 text-[11px] text-slate-400 leading-relaxed">
                Approval will deploy the investor&apos;s ONCHAINID identity, issue verified claims (Topic 1: KYC, Topic 2: Nationality, Topic 3: Resident Country), and register the identity in your token IdentityRegistry.
              </div>
            </div>
          ) : (
            /* Reviewed / Finished Status Panel */
            <div className="sticky top-6 space-y-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl">
              <div className="flex items-center gap-2.5">
                {qualification.status === 'approved' ? (
                  <CheckCircle className="h-6 w-6 text-emerald-400" />
                ) : qualification.status === 'rejected' ? (
                  <XCircle className="h-6 w-6 text-rose-400" />
                ) : (
                  <AlertCircle className="h-6 w-6 text-slate-400" />
                )}
                <div>
                  <h3 className="text-base font-semibold capitalize text-ink">
                    Qualification {qualification.status.replace(/_/g, ' ')}
                  </h3>
                  <p className="text-xs text-slate-400">
                    {qualification.status === 'approved'
                      ? 'Approved for token investment'
                      : 'Review concluded'}
                  </p>
                </div>
              </div>

              {/* Status details */}
              <div className="rounded-xl border border-slate-800 bg-slate-800/40 p-4 space-y-2.5 text-xs">
                {qualification.approvedAt && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Approved Date:</span>
                    <span className="font-medium text-ink">{formatDate(qualification.approvedAt)}</span>
                  </div>
                )}
                {qualification.expiresAt && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Expires:</span>
                    <span className="font-medium text-ink">{formatDate(qualification.expiresAt)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Pipeline:</span>
                  <span className="font-mono font-medium text-cyan-300">
                    {qualification.blockchainStatus || (qualification.status === 'approved' ? 'completed' : 'none')}
                  </span>
                </div>
                {qualification.blockchainError && (
                  <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2 text-rose-300 text-[11px] mt-2">
                    <p className="font-semibold">Pipeline Error:</p>
                    <p className="mt-0.5 break-words">{qualification.blockchainError}</p>
                  </div>
                )}
              </div>

              {qualification.status === 'revoked' && qualification.revokedReason && (
                <div className="rounded-lg border border-orange-500/30 bg-orange-500/10 p-3 text-xs text-orange-300">
                  <p className="font-semibold">Revoked</p>
                  <p className="mt-0.5 whitespace-pre-wrap">{qualification.revokedReason}</p>
                </div>
              )}
              {qualification.status === 'expired' && (
                <p className="text-xs text-slate-400">
                  This approval has expired. The investor must request approval again.
                </p>
              )}
              {qualification.status === 'approved' && (
                <button
                  onClick={handleRevoke}
                  disabled={processing}
                  className="w-full rounded-lg border border-orange-500/40 px-3 py-2 text-xs font-semibold text-orange-300 hover:bg-orange-500/10 disabled:opacity-50"
                >
                  Revoke approval
                </button>
              )}

              {/* Retry pipeline button if needed */}
              {qualification.status === 'approved' &&
                (qualification.blockchainStatus === 'failed' ||
                  qualification.blockchainStatus === 'deferred:no_wallet' ||
                  !investor?.identityContractAddress) && (
                  <button
                    type="button"
                    onClick={handleRetryPipeline}
                    disabled={retryingPipeline}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-xs font-semibold text-cyan-300 hover:bg-cyan-500/20 transition-all disabled:opacity-50"
                  >
                    {retryingPipeline ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5" />
                    )}
                    Retry Blockchain Deployment
                  </button>
                )}

              {/* Option to change decision back to Under Review */}
              <button
                type="button"
                onClick={() => handleAction('under_review')}
                disabled={processing}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700 transition-all disabled:opacity-50"
              >
                Re-open for Review
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
