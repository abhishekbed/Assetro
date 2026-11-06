'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Search,
  Eye,
  CheckCircle,
  XCircle,
  Loader2,
  Building2,
  Mail,
  Clock,
  X,
  RefreshCw,
  Copy,
  Check,
  UserCheck,
  ShieldAlert,
  MapPin,
  FileText,
  ExternalLink,
  Phone,
  ShieldCheck,
} from 'lucide-react';
import api from '@/lib/api';
import { getMediaUrl } from '@/lib/media';

interface IssuerLead {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  companyName: string;
  jobTitle: string | null;
  companyType: string | null;
  phoneNumber: string | null;
  website: string | null;
  country: string;
  comments: string | null;
  status: 'pending' | 'approved' | 'rejected';
  rejectionReason: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  tenantId: string | null;
  issuerUserId: string | null;
  createdAt: string;

  // Expanded fields
  registeredAddress?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  stateProvince?: string | null;
  postalCode?: string | null;
  isOperatingAddressSame?: boolean;
  operatingAddress?: string | null;
  authorizedRepresentativeName?: string | null;
  nationality?: string | null;
  identityDocumentType?: string | null;
  identityDocumentNumber?: string | null;
  proofOfIdentityUrl?: string | null;
  proofOfIdentityName?: string | null;
  authorizationLetterUrl?: string | null;
  authorizationLetterName?: string | null;
}

interface Stats {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
}

interface ApprovedCredentials {
  email: string;
  temporaryPassword: string;
  loginUrl: string;
}

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-amber-500/15 text-amber-400 border border-amber-500/30',
  approved: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
  rejected: 'bg-red-500/15 text-red-400 border border-red-500/30',
};

function getDocumentUrl(url: string | null | undefined): string {
  return getMediaUrl(url);
}

export default function IssuerLeadsPage() {
  const [leads, setLeads] = useState<IssuerLead[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [selectedLead, setSelectedLead] = useState<IssuerLead | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState('');
  const [credentials, setCredentials] = useState<ApprovedCredentials | null>(null);
  const [showCredentialsModal, setShowCredentialsModal] = useState(false);
  const [copied, setCopied] = useState(false);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (statusFilter) params.status = statusFilter;
      if (search) params.search = search;

      const [leadsRes, statsRes] = await Promise.all([
        api.get('/admin/issuer-leads', { params }),
        api.get('/admin/issuer-leads/stats'),
      ]);

      setLeads(leadsRes.data?.data ?? []);
      setStats(statsRes.data?.data ?? null);
    } catch (err) {
      console.error('Failed to fetch issuer leads:', err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  const openDetail = async (lead: IssuerLead) => {
    setSelectedLead(lead);
    setActionError('');
    setShowDetailModal(true);
    try {
      const res = await api.get(`/admin/issuer-leads/${lead.id}`);
      if (res.data?.data) {
        setSelectedLead(res.data.data);
      }
    } catch (err) {
      // Keep existing lead state
    }
  };

  const openApprove = (lead: IssuerLead) => {
    setSelectedLead(lead);
    setActionError('');
    setShowDetailModal(false);
    setShowApproveModal(true);
  };

  const openReject = (lead: IssuerLead) => {
    setSelectedLead(lead);
    setRejectionReason('');
    setActionError('');
    setShowDetailModal(false);
    setShowRejectModal(true);
  };

  const handleApprove = async () => {
    if (!selectedLead) return;
    setActionLoading(true);
    setActionError('');
    try {
      const res = await api.post(`/admin/issuer-leads/${selectedLead.id}/approve`, {});
      const creds = res.data?.data?.credentials as ApprovedCredentials;
      setCredentials(creds);
      setShowApproveModal(false);
      setShowCredentialsModal(true);
      await fetchLeads();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setActionError(e.response?.data?.message || 'Approval failed. Please try again.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!selectedLead || !rejectionReason.trim()) return;
    setActionLoading(true);
    setActionError('');
    try {
      await api.post(`/admin/issuer-leads/${selectedLead.id}/reject`, {
        rejection_reason: rejectionReason,
      });
      setShowRejectModal(false);
      await fetchLeads();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setActionError(e.response?.data?.message || 'Rejection failed. Please try again.');
    } finally {
      setActionLoading(false);
    }
  };

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* ─── Header ─── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-ink">
              Issuer Applications
            </h1>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-0.5 text-xs font-semibold text-cyan-300">
              <UserCheck className="h-3.5 w-3.5 text-cyan-400" />
              Onboarding Queue
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-400">
            Review and manage institutional issuer onboarding requests &amp; tenant provisioning
          </p>
        </div>

        <button
          onClick={fetchLeads}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-700/80 bg-slate-800/60 px-4 py-2 text-sm font-semibold text-slate-200 transition-all duration-200 hover:border-slate-600 hover:bg-slate-800 hover:text-ink disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 text-cyan-400 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* ─── Stats Cards ─── */}
      {stats && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            { label: 'Total Applications', value: stats.total, color: 'text-ink', icon: Building2, bg: 'bg-cyan-500/10', border: 'border-cyan-500/20', textCol: 'text-cyan-400' },
            { label: 'Pending Review', value: stats.pending, color: 'text-amber-400', icon: Clock, bg: 'bg-amber-500/10', border: 'border-amber-500/20', textCol: 'text-amber-400' },
            { label: 'Approved', value: stats.approved, color: 'text-emerald-400', icon: CheckCircle, bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', textCol: 'text-emerald-400' },
            { label: 'Rejected', value: stats.rejected, color: 'text-red-400', icon: XCircle, bg: 'bg-red-500/10', border: 'border-red-500/20', textCol: 'text-red-400' },
          ].map((s) => (
            <div
              key={s.label}
              className="group relative overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-900/60 p-5 shadow-xl transition-all duration-200 hover:border-slate-700 hover:scale-[1.01]"
            >
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">{s.label}</p>
                <div className={`rounded-xl p-2 ${s.bg} ${s.textCol} border ${s.border}`}>
                  <s.icon className="h-4 w-4" />
                </div>
              </div>
              <p className={`mt-2 text-3xl font-black ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* ─── Filters & Search ─── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Search by name, email, company..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-slate-700/80 bg-slate-950/80 py-2 pl-10 pr-4 text-sm text-ink placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400 transition-colors"
          />
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900/60 p-1">
          {['', 'pending', 'approved', 'rejected'].map((s) => {
            const isActive = statusFilter === s;
            return (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`rounded-lg px-3.5 py-1.5 text-xs sm:text-sm font-semibold capitalize transition-all duration-200 ${
 isActive
 ? 'border border-cyan-500/30 bg-accent-soft text-cyan-300 shadow-sm' : 'border border-transparent text-slate-400 hover:bg-slate-800/60 hover:text-slate-200' }`}
              >
                {s || 'All'}
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── Table ─── */}
      <div className="overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-900/60 shadow-2xl">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 space-y-3">
            <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
            <p className="text-sm font-medium text-slate-400">Loading applications...</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-850/60">
                  <th className="px-5 py-3.5 text-xs font-bold uppercase tracking-wider text-slate-400">Company</th>
                  <th className="px-5 py-3.5 text-xs font-bold uppercase tracking-wider text-slate-400">Contact</th>
                  <th className="px-5 py-3.5 text-xs font-bold uppercase tracking-wider text-slate-400 hidden md:table-cell">Type</th>
                  <th className="px-5 py-3.5 text-xs font-bold uppercase tracking-wider text-slate-400 hidden lg:table-cell">Submitted</th>
                  <th className="px-5 py-3.5 text-xs font-bold uppercase tracking-wider text-slate-400">Status</th>
                  <th className="sticky right-0 bg-slate-900/95 px-5 py-3.5 text-right text-xs font-bold uppercase tracking-wider text-slate-400 border-l border-slate-800/50">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {leads.map((lead) => (
                  <tr key={lead.id} className="group transition-colors duration-150 hover:bg-slate-800/40">
                    <td className="px-5 py-4">
                      <p className="text-sm font-bold text-ink">{lead.companyName}</p>
                      <p className="text-xs text-slate-400">{lead.country}</p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="text-sm font-medium text-slate-200">{lead.authorizedRepresentativeName || `${lead.firstName} ${lead.lastName}`}</p>
                      <p className="text-xs font-mono text-cyan-400/80 truncate max-w-[180px]">{lead.email}</p>
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-300 hidden md:table-cell">
                      {lead.companyType || '—'}
                    </td>
                    <td className="px-5 py-4 text-xs font-mono text-slate-400 hidden lg:table-cell">
                      {new Date(lead.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize ${STATUS_BADGE[lead.status]}`}>
                        {lead.status}
                      </span>
                    </td>
                    <td className="sticky right-0 bg-slate-900/95 px-5 py-4 border-l border-slate-800/50">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openDetail(lead)}
                          title="View details"
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-700/80 bg-slate-800/60 px-2.5 py-1.5 text-xs font-semibold text-slate-200 hover:border-slate-600 hover:bg-slate-800 hover:text-ink transition-colors"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          View
                        </button>
                        {lead.status === 'pending' && (
                          <>
                            <button
                              onClick={() => openApprove(lead)}
                              title="Approve application"
                              className="inline-flex items-center gap-1 rounded-lg bg-emerald-600/90 hover:bg-emerald-500 px-2.5 py-1.5 text-xs font-semibold text-btn-text shadow-sm transition-colors"
                            >
                              <CheckCircle className="h-3.5 w-3.5" />
                              Approve
                            </button>
                            <button
                              onClick={() => openReject(lead)}
                              title="Reject application"
                              className="inline-flex items-center gap-1 rounded-lg bg-red-600/90 hover:bg-red-500 px-2.5 py-1.5 text-xs font-semibold text-btn-text shadow-sm transition-colors"
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
                {leads.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-16 text-center text-slate-400">
                      <div className="flex flex-col items-center justify-center">
                        <UserCheck className="h-10 w-10 text-slate-600 mb-2" />
                        <p className="text-base font-semibold text-ink">No Issuer Applications Found</p>
                        <p className="text-xs text-slate-500 mt-0.5">Applications submitted by prospective issuers will appear here</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ─── Detail Modal ─── */}
      {showDetailModal && selectedLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="card w-full max-w-3xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4 sticky top-0 bg-slate-900/95 backdrop-blur z-10">
              <div>
                <h3 className="text-lg font-bold text-ink">Issuer Application Details</h3>
                <p className="text-xs font-mono text-slate-500">ID: {selectedLead.id}</p>
              </div>
              <button
                onClick={() => setShowDetailModal(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-ink transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Status Header */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800/80 bg-slate-950/60 p-4">
                <div className="flex items-center gap-3">
                  <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wider ${STATUS_BADGE[selectedLead.status]}`}>
                    {selectedLead.status}
                  </span>
                  <span className="text-xs text-slate-400">
                    Lead Onboarding Request
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-400">
                  <Clock className="h-3.5 w-3.5 text-cyan-400" />
                  <span>Submitted: {new Date(selectedLead.createdAt).toLocaleString()}</span>
                </div>
              </div>

              {/* 1. Company Information */}
              <div className="rounded-xl border border-slate-800/80 bg-surface-header p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Building2 className="h-4 w-4 text-cyan-400" />
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-300">1. Company Information</span>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 text-sm">
                  <div>
                    <p className="text-xs text-slate-500">Company Legal Name</p>
                    <p className="font-semibold text-ink">{selectedLead.companyName}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Company Type</p>
                    <p className="font-semibold text-ink">{selectedLead.companyType || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Jurisdiction / Country</p>
                    <p className="font-semibold text-ink">{selectedLead.country}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Company Website</p>
                    {selectedLead.website ? (
                      <a
                        href={selectedLead.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-semibold text-cyan-400 hover:underline truncate max-w-full"
                      >
                        <span className="truncate">{selectedLead.website}</span>
                        <ExternalLink className="h-3.5 w-3.5 flex-shrink-0" />
                      </a>
                    ) : (
                      <p className="text-slate-400 font-medium">—</p>
                    )}
                  </div>
                </div>
              </div>

              {/* 2. Registered Office & Operating Address */}
              <div className="rounded-xl border border-slate-800/80 bg-surface-header p-5">
                <div className="flex items-center gap-2 mb-4">
                  <MapPin className="h-4 w-4 text-cyan-400" />
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-300">2. Registered Office &amp; Operating Address</span>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 text-sm">
                  <div className="sm:col-span-2">
                    <p className="text-xs text-slate-500">Registered Office Address</p>
                    <p className="font-semibold text-ink">{selectedLead.registeredAddress || '—'}</p>
                  </div>
                  {selectedLead.addressLine2 && (
                    <div className="sm:col-span-2">
                      <p className="text-xs text-slate-500">Address Line 2</p>
                      <p className="font-semibold text-ink">{selectedLead.addressLine2}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs text-slate-500">City</p>
                    <p className="font-semibold text-ink">{selectedLead.city || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">State / Province</p>
                    <p className="font-semibold text-ink">{selectedLead.stateProvince || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Postal Code</p>
                    <p className="font-semibold text-ink">{selectedLead.postalCode || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Country</p>
                    <p className="font-semibold text-ink">{selectedLead.country}</p>
                  </div>

                  {/* Operating address comparison */}
                  <div className="sm:col-span-2 pt-3 border-t border-slate-800/80">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs text-slate-500 font-medium">Operating Address Status</p>
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        selectedLead.isOperatingAddressSame !== false
                          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                          : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                      }`}>
                        {selectedLead.isOperatingAddressSame !== false
                          ? 'Same as Registered Office'
                          : 'Different Operating Address'}
                      </span>
                    </div>
                    {selectedLead.isOperatingAddressSame === false && selectedLead.operatingAddress ? (
                      <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 mt-1">
                        <p className="text-xs text-slate-500 mb-1 font-medium">Business Operating Address:</p>
                        <p className="font-semibold text-ink text-sm whitespace-pre-wrap">{selectedLead.operatingAddress}</p>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400">
                        The business operating address is identical to the registered office address above.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* 3. Authorized Representative */}
              <div className="rounded-xl border border-slate-800/80 bg-surface-header p-5">
                <div className="flex items-center gap-2 mb-1">
                  <UserCheck className="h-4 w-4 text-emerald-400" />
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-300">3. Authorized Representative</span>
                </div>
                <p className="text-xs text-slate-400 mb-4">
                  Person authorized to represent the issuer on the platform.
                </p>

                <div className="grid gap-4 sm:grid-cols-2 text-sm">
                  <div>
                    <p className="text-xs text-slate-500">Full Name</p>
                    <p className="font-semibold text-ink">
                      {selectedLead.authorizedRepresentativeName || `${selectedLead.firstName} ${selectedLead.lastName}`}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Designation / Job Title</p>
                    <p className="font-semibold text-ink">{selectedLead.jobTitle || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Business Email</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Mail className="h-3.5 w-3.5 text-blue-400 flex-shrink-0" />
                      <a href={`mailto:${selectedLead.email}`} className="font-mono text-cyan-400 hover:underline">
                        {selectedLead.email}
                      </a>
                      <button
                        onClick={() => copyToClipboard(selectedLead.email)}
                        className="rounded p-1 text-slate-400 hover:text-ink transition-colors"
                        title="Copy email"
                      >
                        {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Phone Number</p>
                    {selectedLead.phoneNumber ? (
                      <div className="flex items-center gap-2 mt-0.5">
                        <Phone className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0" />
                        <a href={`tel:${selectedLead.phoneNumber}`} className="font-semibold text-ink hover:text-cyan-400">
                          {selectedLead.phoneNumber}
                        </a>
                      </div>
                    ) : (
                      <p className="font-semibold text-ink mt-0.5">—</p>
                    )}
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Nationality</p>
                    <p className="font-semibold text-ink">{selectedLead.nationality || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Identity Document Type</p>
                    <p className="font-semibold text-ink">{selectedLead.identityDocumentType || '—'}</p>
                  </div>
                  <div className="sm:col-span-2">
                    <p className="text-xs text-slate-500">Identity Document Number</p>
                    <p className="font-mono font-semibold text-ink">{selectedLead.identityDocumentNumber || '—'}</p>
                  </div>

                  {/* Document: Proof of Identity */}
                  <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Proof of Identity</p>
                    {selectedLead.proofOfIdentityUrl ? (
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 overflow-hidden">
                          <FileText className="h-4 w-4 text-cyan-400 flex-shrink-0" />
                          <span className="truncate text-xs font-medium text-slate-200">
                            {selectedLead.proofOfIdentityName || 'Proof_of_Identity'}
                          </span>
                        </div>
                        <a
                          href={getDocumentUrl(selectedLead.proofOfIdentityUrl)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1 text-xs font-semibold text-cyan-300 hover:bg-cyan-500/20 transition-colors flex-shrink-0"
                        >
                          <span>View Document</span>
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500 italic">No document uploaded</p>
                    )}
                  </div>

                  {/* Document: Authorization Letter / Board Resolution */}
                  <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Authorization Letter / Board Resolution</p>
                    {selectedLead.authorizationLetterUrl ? (
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 overflow-hidden">
                          <FileText className="h-4 w-4 text-emerald-400 flex-shrink-0" />
                          <span className="truncate text-xs font-medium text-slate-200">
                            {selectedLead.authorizationLetterName || 'Board_Resolution'}
                          </span>
                        </div>
                        <a
                          href={getDocumentUrl(selectedLead.authorizationLetterUrl)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20 transition-colors flex-shrink-0"
                        >
                          <span>View Document</span>
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500 italic">No document uploaded</p>
                    )}
                  </div>
                </div>
              </div>

              {/* 4. Comments & Use Case */}
              {selectedLead.comments && (
                <div className="rounded-xl border border-slate-800/80 bg-surface-header p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <ShieldCheck className="h-4 w-4 text-amber-400" />
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-300">4. Use Case &amp; Background</span>
                  </div>
                  <p className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">
                    {selectedLead.comments}
                  </p>
                </div>
              )}

              {/* Rejection reason */}
              {selectedLead.status === 'rejected' && selectedLead.rejectionReason && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4">
                  <p className="mb-1 text-xs font-bold uppercase tracking-wider text-red-400">Rejection Reason</p>
                  <p className="text-sm text-red-300">{selectedLead.rejectionReason}</p>
                </div>
              )}

              {/* Approved details */}
              {selectedLead.status === 'approved' && (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm">
                  <p className="font-bold text-emerald-400 mb-1">Approved &amp; Provisioned</p>
                  <p className="text-emerald-300 text-xs">Tenant ID: <span className="font-mono text-ink">{selectedLead.tenantId}</span></p>
                  <p className="text-emerald-300 text-xs mt-0.5">Issuer User ID: <span className="font-mono text-ink">{selectedLead.issuerUserId || '—'}</span></p>
                  <p className="text-emerald-300 text-xs mt-0.5">Reviewed: {selectedLead.reviewedAt ? new Date(selectedLead.reviewedAt).toLocaleString() : '—'}</p>
                </div>
              )}
            </div>

            <div className="border-t border-slate-800 px-6 py-4 flex gap-3 justify-end bg-slate-950 sticky bottom-0">
              <button
                onClick={() => setShowDetailModal(false)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700/80 bg-slate-800/60 px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-slate-800 hover:text-ink transition-colors"
              >
                Close
              </button>
              {selectedLead.status === 'pending' && (
                <>
                  <button
                    onClick={() => openReject(selectedLead)}
                    className="inline-flex items-center gap-2 rounded-xl bg-red-600/90 hover:bg-red-500 px-4 py-2 text-sm font-semibold text-btn-text transition-colors"
                  >
                    <XCircle className="h-4 w-4" />
                    Reject
                  </button>
                  <button
                    onClick={() => openApprove(selectedLead)}
                    className="inline-flex items-center gap-2 rounded-xl bg-success px-4 py-2 text-sm font-bold text-slate-950 shadow-md hover:brightness-110 transition-all"
                  >
                    <CheckCircle className="h-4 w-4" />
                    Approve Application
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── Approve Modal ─── */}
      {showApproveModal && selectedLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="card w-full max-w-md">
            <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
              <h3 className="text-lg font-bold text-ink">Approve Issuer</h3>
              <button
                onClick={() => setShowApproveModal(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-ink"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm">
                <p className="font-bold text-emerald-400 mb-2">Automated provisioning pipeline:</p>
                <ul className="space-y-1 text-emerald-300 text-xs">
                  <li>• Creates dedicated multi-tenant schema for <strong>{selectedLead.companyName}</strong></li>
                  <li>• Generates secure temporary password</li>
                  <li>• Creates issuer admin account for <strong>{selectedLead.email}</strong></li>
                  <li>• Emits webhook &amp; onboarding event</li>
                </ul>
              </div>

              <div className="rounded-xl border border-slate-800 bg-surface-header p-3 text-sm">
                <p className="text-xs text-slate-500">Applicant:</p>
                <p className="font-bold text-ink">{selectedLead.firstName} {selectedLead.lastName}</p>
                <p className="text-xs font-mono text-cyan-400">{selectedLead.email} · {selectedLead.companyName}</p>
              </div>

              {actionError && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400 flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 shrink-0" />
                  <span>{actionError}</span>
                </div>
              )}
            </div>

            <div className="border-t border-slate-800 px-6 py-4 flex gap-3 justify-end bg-slate-950">
              <button
                onClick={() => setShowApproveModal(false)}
                className="rounded-xl border border-slate-700/80 bg-slate-800/60 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={handleApprove}
                disabled={actionLoading}
                className="inline-flex items-center gap-2 rounded-xl bg-success px-5 py-2 text-sm font-bold text-slate-950 shadow-md hover:brightness-110 disabled:opacity-60 transition-all"
              >
                {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                {actionLoading ? 'Provisioning...' : 'Confirm Approval'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Reject Modal ─── */}
      {showRejectModal && selectedLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="card w-full max-w-md">
            <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
              <h3 className="text-lg font-bold text-ink">Reject Application</h3>
              <button
                onClick={() => setShowRejectModal(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-ink"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-xs text-slate-300">
                Rejecting application from <strong className="text-ink">{selectedLead.companyName}</strong> ({selectedLead.email}).
                Please provide a reason to communicate to the applicant.
              </p>

              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-400">
                  Rejection Reason <span className="text-red-400">*</span>
                </label>
                <textarea
                  rows={4}
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="e.g., Incomplete documentation, compliance requirements not met..."
                  className="w-full rounded-xl border border-slate-700/80 bg-slate-900 px-3.5 py-2.5 text-sm text-ink placeholder:text-slate-500 focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-400 resize-none"
                />
              </div>

              {actionError && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400 flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 shrink-0" />
                  <span>{actionError}</span>
                </div>
              )}
            </div>

            <div className="border-t border-slate-800 px-6 py-4 flex gap-3 justify-end bg-slate-950">
              <button
                onClick={() => setShowRejectModal(false)}
                className="rounded-xl border border-slate-700/80 bg-slate-800/60 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={actionLoading || !rejectionReason.trim()}
                className="inline-flex items-center gap-2 rounded-xl bg-red-600 hover:bg-red-500 px-5 py-2 text-sm font-bold text-btn-text shadow-md disabled:opacity-60 transition-colors"
              >
                {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                {actionLoading ? 'Rejecting...' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Credentials Modal (after approval) ─── */}
      {showCredentialsModal && credentials && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="card w-full max-w-md">
            <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
              <h3 className="text-lg font-bold text-ink">Issuer Approved!</h3>
              <button
                onClick={() => setShowCredentialsModal(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-ink"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
                <CheckCircle className="h-5 w-5 text-emerald-400 shrink-0" />
                <p className="text-xs font-semibold text-emerald-300">
                  Issuer tenant workspace created.
                </p>
              </div>

              <p className="text-xs text-slate-400">
                The issuer can now sign in with:
              </p>

              <div className="space-y-3 rounded-xl border border-slate-800/80 bg-surface-header p-4 text-xs">
                <div>
                  <p className="text-slate-500 mb-0.5">Login URL</p>
                  <p className="font-mono text-cyan-400">{credentials.loginUrl}</p>
                </div>
                <div>
                  <p className="text-slate-500 mb-0.5">Admin Email</p>
                  <p className="font-mono text-ink">{credentials.email}</p>
                </div>
              </div>

              <p className="text-[11px] text-slate-500">
                The issuer signs in with the password they chose at signup.
              </p>
            </div>

            <div className="border-t border-slate-800 px-6 py-4 flex justify-end bg-slate-950">
              <button
                onClick={() => setShowCredentialsModal(false)}
                className="btn-primary"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
