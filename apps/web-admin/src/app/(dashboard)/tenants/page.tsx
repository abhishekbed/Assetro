'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Plus, Search, Loader2, RefreshCw, Eye, CheckCircle, XCircle, X,
  Building2, Mail, Clock, Copy, Check,
} from 'lucide-react';
import api from '@/lib/api';

// ─── Tenant types ────────────────────────────────────────────
interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: string;
  plan: string;
  createdAt: string;
}

const statusBadge: Record<string, string> = {
  active: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
  suspended: 'bg-red-500/15 text-red-400 border border-red-500/30',
  pending: 'bg-amber-500/15 text-amber-400 border border-amber-500/30',
  deactivated: 'bg-slate-800 text-slate-400 border border-slate-700',
};
const planBadge: Record<string, string> = {
  free: 'bg-slate-800 text-slate-300 border border-slate-700',
  starter: 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30',
  professional: 'bg-blue-500/15 text-blue-400 border border-blue-500/30',
  enterprise: 'bg-purple-500/15 text-purple-400 border border-purple-500/30',
};

// ─── Lead types ──────────────────────────────────────────────
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
  reviewedAt: string | null;
  tenantId: string | null;
  createdAt: string;
}

interface LeadStats { total: number; pending: number; approved: number; rejected: number; }

const LEAD_BADGE: Record<string, string> = {
  pending: 'bg-amber-500/15 text-amber-400 border border-amber-500/30',
  approved: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
  rejected: 'bg-red-500/15 text-red-400 border border-red-500/30',
};

const PLANS = [
  { id: 'free', name: 'Free', price: '$0/mo', features: ['Up to 10 users', '1 token', 'Community support'] },
  { id: 'starter', name: 'Starter', price: '$99/mo', features: ['Up to 100 users', '2 tokens', 'Basic support'] },
  { id: 'professional', name: 'Professional', price: '$499/mo', features: ['Up to 1,000 users', '10 tokens', 'Priority support'] },
  { id: 'enterprise', name: 'Enterprise', price: 'Custom', features: ['Unlimited users', 'Unlimited tokens', 'Dedicated support'] },
];

function toSlug(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);
}

// ─── Main page ───────────────────────────────────────────────
export default function TenantsPage() {
  const [tab, setTab] = useState<'tenants' | 'applications'>('tenants');

  // ── Tenants state ─────────────────────────────────────────
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantsLoading, setTenantsLoading] = useState(true);
  const [tenantSearch, setTenantSearch] = useState('');

  // ── Leads state ───────────────────────────────────────────
  const [leads, setLeads] = useState<IssuerLead[]>([]);
  const [stats, setStats] = useState<LeadStats | null>(null);
  const [leadsLoading, setLeadsLoading] = useState(false);
  const [leadSearch, setLeadSearch] = useState('');
  const [leadStatusFilter, setLeadStatusFilter] = useState('');

  // ── Modal state ───────────────────────────────────────────
  const [selectedLead, setSelectedLead] = useState<IssuerLead | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [showApprove, setShowApprove] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [showCreds, setShowCreds] = useState(false);

  // Approve form state
  const [approveSlug, setApproveSlug] = useState('');
  const [approveSlugTouched, setApproveSlugTouched] = useState(false);
  const [approveDomain, setApproveDomain] = useState('');
  const [approvePlan, setApprovePlan] = useState('starter');
  const [rejectionReason, setRejectionReason] = useState('');

  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState('');
  const [credentials, setCredentials] = useState<{ email: string; temporaryPassword: string; loginUrl: string } | null>(null);
  const [copied, setCopied] = useState(false);

  // ── Fetch tenants ─────────────────────────────────────────
  useEffect(() => {
    api.get('/admin/tenants')
      .then((res) => setTenants(res.data.data ?? []))
      .catch(console.error)
      .finally(() => setTenantsLoading(false));
  }, []);

  // ── Fetch leads ───────────────────────────────────────────
  const fetchLeads = useCallback(async () => {
    setLeadsLoading(true);
    try {
      const params: Record<string, string> = {};
      if (leadStatusFilter) params.status = leadStatusFilter;
      if (leadSearch) params.search = leadSearch;
      const [leadsRes, statsRes] = await Promise.all([
        api.get('/admin/issuer-leads', { params }),
        api.get('/admin/issuer-leads/stats'),
      ]);
      setLeads(leadsRes.data?.data ?? []);
      setStats(statsRes.data?.data ?? null);
    } catch (err) { console.error(err); }
    finally { setLeadsLoading(false); }
  }, [leadStatusFilter, leadSearch]);

  useEffect(() => {
    if (tab === 'applications') fetchLeads();
  }, [tab, fetchLeads]);

  // ── Helpers ───────────────────────────────────────────────
  const openApprove = (lead: IssuerLead) => {
    setSelectedLead(lead);
    setApproveSlug(toSlug(lead.companyName));
    setApproveSlugTouched(false);
    setApproveDomain('');
    setApprovePlan('starter');
    setActionError('');
    setShowDetail(false);
    setShowApprove(true);
  };

  const openReject = (lead: IssuerLead) => {
    setSelectedLead(lead);
    setRejectionReason('');
    setActionError('');
    setShowDetail(false);
    setShowReject(true);
  };

  const handleApprove = async () => {
    if (!selectedLead) return;
    if (!approveSlug.trim()) { setActionError('Slug is required.'); return; }
    if (!/^[a-z0-9-]+$/.test(approveSlug)) { setActionError('Slug must be lowercase letters, numbers, and hyphens only.'); return; }
    setActionLoading(true);
    setActionError('');
    try {
      const res = await api.post(`/admin/issuer-leads/${selectedLead.id}/approve`, {
        plan: approvePlan,
        slug: approveSlug,
        customDomain: approveDomain.trim() || undefined,
      });
      setCredentials(res.data?.data?.credentials);
      setShowApprove(false);
      setShowCreds(true);
      await fetchLeads();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setActionError(e.response?.data?.message || 'Approval failed. Please try again.');
    } finally { setActionLoading(false); }
  };

  const handleReject = async () => {
    if (!selectedLead || !rejectionReason.trim()) return;
    setActionLoading(true);
    setActionError('');
    try {
      await api.post(`/admin/issuer-leads/${selectedLead.id}/reject`, { rejection_reason: rejectionReason });
      setShowReject(false);
      await fetchLeads();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setActionError(e.response?.data?.message || 'Rejection failed. Please try again.');
    } finally { setActionLoading(false); }
  };

  const filteredTenants = tenants.filter(
    (t) => t.name.toLowerCase().includes(tenantSearch.toLowerCase()) || t.slug.toLowerCase().includes(tenantSearch.toLowerCase()),
  );

  // ── Render ────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-ink">Tenants</h1>
          <p className="mt-1 text-sm text-slate-400">Manage tenants and issuer applications</p>
        </div>
        {tab === 'tenants' ? (
          <Link href="/tenants/create" className="btn-primary gap-2">
            <Plus className="h-4 w-4" />
            Add Tenant
          </Link>
        ) : (
          <button
            onClick={fetchLeads}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-700/80 bg-slate-800/60 px-4 py-2 text-sm font-semibold text-slate-200 transition-all duration-200 hover:border-slate-600 hover:bg-slate-800 hover:text-ink"
          >
            <RefreshCw className="h-4 w-4 text-cyan-400" />
            Refresh
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900/60 p-1 w-fit">
        {(['tenants', 'applications'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-lg px-4 py-2 text-sm font-semibold capitalize transition-all duration-200 ${
 tab === t
 ? 'border border-cyan-500/30 bg-accent-soft text-cyan-300 shadow-sm' : 'border border-transparent text-slate-400 hover:bg-slate-800/60 hover:text-slate-200' }`}
          >
            {t === 'tenants' ? 'Active Tenants' : 'Issuer Applications'}
            {t === 'applications' && stats?.pending ? (
              <span className="ml-2 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-amber-500 px-1.5 text-xs font-bold text-slate-950">
                {stats.pending}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {/* ─── TENANTS TAB ─────────────────────────────────────── */}
      {tab === 'tenants' && (
        <>
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-secondary-400" />
            <input
              type="text"
              placeholder="Search tenants..."
              value={tenantSearch}
              onChange={(e) => setTenantSearch(e.target.value)}
              className="input-field pl-10"
            />
          </div>

          <div className="card overflow-hidden">
            {tenantsLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
              </div>
            ) : (
              <div className="overflow-x-auto">
              <table className="w-full min-w-[640px]">
                <thead>
                  <tr className="border-b border-secondary-100 bg-secondary-50">
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase text-secondary-400">Tenant</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase text-secondary-400">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase text-secondary-400">Plan</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase text-secondary-400">Created</th>
                    <th className="px-6 py-3 text-right text-xs font-medium uppercase text-secondary-400">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-secondary-100">
                  {filteredTenants.map((tenant) => (
                    <tr key={tenant.id} className="hover:bg-secondary-50">
                      <td className="px-6 py-4">
                        <Link href={`/tenants/${tenant.id}`}>
                          <p className="text-sm font-medium text-secondary-900 hover:text-primary-600">{tenant.name}</p>
                          <p className="text-xs text-secondary-400">{tenant.slug}</p>
                        </Link>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${statusBadge[tenant.status] || 'bg-secondary-100 text-secondary-600'}`}>
                          {tenant.status}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${planBadge[tenant.plan] || 'bg-secondary-100 text-secondary-600'}`}>
                          {tenant.plan}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-secondary-600">
                        {new Date(tenant.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Link href={`/tenants/${tenant.id}`} className="text-sm text-primary-600 hover:underline">
                          Manage
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {filteredTenants.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center text-secondary-400">No tenants found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ─── APPLICATIONS TAB ────────────────────────────────── */}
      {tab === 'applications' && (
        <>
          {/* Stats */}
          {stats && (
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {[
                { label: 'Total', value: stats.total, color: 'text-ink', icon: Building2, bg: 'bg-cyan-500/10', border: 'border-cyan-500/20', textCol: 'text-cyan-400' },
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

          {/* Filters */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Search by name, email, company..."
                value={leadSearch}
                onChange={(e) => setLeadSearch(e.target.value)}
                className="w-full rounded-xl border border-slate-700/80 bg-slate-950/80 py-2 pl-10 pr-4 text-sm text-ink placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400 transition-colors"
              />
            </div>
            <div className="flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900/60 p-1">
              {(['', 'pending', 'approved', 'rejected'] as const).map((s) => {
                const isActive = leadStatusFilter === s;
                return (
                  <button
                    key={s}
                    onClick={() => setLeadStatusFilter(s)}
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

          {/* Leads table */}
          <div className="card overflow-hidden">
            {leadsLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px]">
                  <thead>
                    <tr className="border-b border-secondary-100 bg-secondary-50">
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase text-secondary-400">Company</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase text-secondary-400">Contact</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase text-secondary-400 hidden md:table-cell">Type</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase text-secondary-400">Status</th>
                      <th className="sticky right-0 bg-secondary-50 px-4 py-3 text-right text-xs font-medium uppercase text-secondary-400">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-secondary-100">
                    {leads.map((lead) => (
                      <tr key={lead.id} className="hover:bg-secondary-50 transition-colors">
                        <td className="px-4 py-3.5">
                          <p className="text-sm font-semibold text-secondary-900">{lead.companyName}</p>
                          <p className="text-xs text-secondary-400">{lead.country}</p>
                        </td>
                        <td className="px-4 py-3.5">
                          <p className="text-sm text-secondary-800">{lead.firstName} {lead.lastName}</p>
                          <p className="text-xs text-secondary-400 truncate max-w-[180px]">{lead.email}</p>
                        </td>
                        <td className="px-4 py-3.5 text-sm text-secondary-600 hidden md:table-cell">
                          {lead.companyType || '—'}
                        </td>
                        <td className="px-4 py-3.5">
                          <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize ${LEAD_BADGE[lead.status]}`}>
                            {lead.status}
                          </span>
                        </td>
                        <td className="sticky right-0 bg-slate-900/95 px-4 py-3.5 border-l border-slate-800/50">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => { setSelectedLead(lead); setActionError(''); setShowDetail(true); }}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-700/80 bg-slate-800/60 px-2.5 py-1.5 text-xs font-semibold text-slate-200 hover:border-slate-600 hover:bg-slate-800 hover:text-ink transition-colors"
                            >
                              <Eye className="h-3.5 w-3.5" />
                              View
                            </button>
                            {lead.status === 'pending' && (
                              <>
                                <button
                                  onClick={() => openApprove(lead)}
                                  className="inline-flex items-center gap-1 rounded-md bg-green-600 px-2.5 py-1.5 text-xs font-medium text-btn-text hover:bg-green-700 transition-colors"
                                >
                                  <CheckCircle className="h-3.5 w-3.5" />
                                  Approve
                                </button>
                                <button
                                  onClick={() => openReject(lead)}
                                  className="inline-flex items-center gap-1 rounded-md bg-red-600 px-2.5 py-1.5 text-xs font-medium text-btn-text hover:bg-red-700 transition-colors"
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
                        <td colSpan={5} className="px-6 py-16 text-center text-secondary-400">
                          No issuer applications found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ─── Detail Modal ────────────────────────────────────── */}
      {showDetail && selectedLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="card w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-secondary-100 px-6 py-4">
              <h3 className="text-lg font-semibold text-secondary-900">Issuer Application Details</h3>
              <button onClick={() => setShowDetail(false)} className="rounded-md p-1 hover:bg-secondary-100">
                <X className="h-5 w-5 text-secondary-500" />
              </button>
            </div>
            <div className="p-6 space-y-5">
              <div className="flex items-center justify-between">
                <span className={`inline-flex items-center rounded-full border px-3 py-1 text-sm font-medium capitalize ${LEAD_BADGE[selectedLead.status]}`}>
                  {selectedLead.status}
                </span>
                <span className="flex items-center gap-1 text-xs text-secondary-400">
                  <Clock className="h-3.5 w-3.5" />
                  {new Date(selectedLead.createdAt).toLocaleString()}
                </span>
              </div>
              <div className="rounded-xl bg-secondary-50 p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Building2 className="h-4 w-4 text-secondary-400" />
                  <span className="text-sm font-semibold text-secondary-700">Company</span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 text-sm">
                  <div><p className="text-secondary-400">Company Name</p><p className="font-medium text-secondary-900">{selectedLead.companyName}</p></div>
                  <div><p className="text-secondary-400">Company Type</p><p className="font-medium text-secondary-900">{selectedLead.companyType || '—'}</p></div>
                  <div><p className="text-secondary-400">Country</p><p className="font-medium text-secondary-900">{selectedLead.country}</p></div>
                  {selectedLead.website && <div><p className="text-secondary-400">Website</p><a href={selectedLead.website} target="_blank" rel="noopener noreferrer" className="font-medium text-primary-600 hover:underline truncate block">{selectedLead.website}</a></div>}
                </div>
              </div>
              <div className="rounded-xl bg-secondary-50 p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Mail className="h-4 w-4 text-secondary-400" />
                  <span className="text-sm font-semibold text-secondary-700">Contact Person</span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 text-sm">
                  <div><p className="text-secondary-400">Full Name</p><p className="font-medium text-secondary-900">{selectedLead.firstName} {selectedLead.lastName}</p></div>
                  {selectedLead.jobTitle && <div><p className="text-secondary-400">Job Title</p><p className="font-medium text-secondary-900">{selectedLead.jobTitle}</p></div>}
                  <div><p className="text-secondary-400">Email</p><p className="font-medium text-secondary-900">{selectedLead.email}</p></div>
                  {selectedLead.phoneNumber && <div><p className="text-secondary-400">Phone</p><p className="font-medium text-secondary-900">{selectedLead.phoneNumber}</p></div>}
                </div>
              </div>
              {selectedLead.comments && (
                <div>
                  <p className="mb-2 text-sm font-medium text-secondary-600">Use Case / Comments</p>
                  <p className="rounded-lg bg-secondary-50 p-4 text-sm text-secondary-700 leading-relaxed">{selectedLead.comments}</p>
                </div>
              )}
              {selectedLead.status === 'rejected' && selectedLead.rejectionReason && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                  <p className="mb-1 text-sm font-medium text-red-700">Rejection Reason</p>
                  <p className="text-sm text-red-600">{selectedLead.rejectionReason}</p>
                </div>
              )}
              {selectedLead.status === 'approved' && (
                <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm">
                  <p className="font-medium text-green-700 mb-1">Approved</p>
                  <p className="text-green-600">Tenant ID: <span className="font-mono">{selectedLead.tenantId}</span></p>
                  {selectedLead.reviewedAt && <p className="text-green-600">Reviewed: {new Date(selectedLead.reviewedAt).toLocaleString()}</p>}
                </div>
              )}
            </div>
            {selectedLead.status === 'pending' && (
              <div className="border-t border-secondary-100 px-6 py-4 flex gap-3 justify-end">
                <button onClick={() => openReject(selectedLead)} className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-btn-text hover:bg-red-700">
                  <XCircle className="h-4 w-4" />Reject
                </button>
                <button onClick={() => openApprove(selectedLead)} className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-btn-text hover:bg-green-700">
                  <CheckCircle className="h-4 w-4" />Approve
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── Approve Modal ───────────────────────────────────── */}
      {showApprove && selectedLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="card w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-secondary-100 px-6 py-4">
              <div>
                <h3 className="text-lg font-semibold text-secondary-900">Approve Issuer Application</h3>
                <p className="text-sm text-secondary-400">{selectedLead.companyName} · {selectedLead.email}</p>
              </div>
              <button onClick={() => setShowApprove(false)} className="rounded-md p-1 hover:bg-secondary-100">
                <X className="h-5 w-5 text-secondary-500" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Tenant config */}
              <div>
                <h4 className="mb-4 text-sm font-semibold text-secondary-700 uppercase tracking-wide">Tenant Configuration</h4>
                <div className="space-y-4">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-secondary-700">
                      Slug <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={approveSlug}
                      onChange={(e) => { setApproveSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')); setApproveSlugTouched(true); }}
                      placeholder="acme-corp"
                      className="w-full rounded-lg border border-secondary-300 px-3 py-2.5 text-sm font-mono placeholder:text-secondary-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                    />
                    <p className="mt-1 text-xs text-secondary-400">Used in URLs and API routing</p>
                    {approveSlugTouched && approveSlug && !/^[a-z0-9-]+$/.test(approveSlug) && (
                      <p className="mt-1 text-xs text-red-500">Lowercase letters, numbers, and hyphens only</p>
                    )}
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-secondary-700">Custom Domain (optional)</label>
                    <input
                      type="text"
                      value={approveDomain}
                      onChange={(e) => setApproveDomain(e.target.value)}
                      placeholder="tokens.acme.com"
                      className="w-full rounded-lg border border-secondary-300 px-3 py-2.5 text-sm placeholder:text-secondary-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                    />
                  </div>
                </div>
              </div>

              {/* Plan selection */}
              <div>
                <h4 className="mb-4 text-sm font-semibold text-secondary-700 uppercase tracking-wide">Plan Selection</h4>
                <div className="grid grid-cols-2 gap-3">
                  {PLANS.map((plan) => (
                    <label
                      key={plan.id}
                      className={`cursor-pointer rounded-xl border-2 p-3.5 transition-colors ${
 approvePlan === plan.id
 ? 'border-primary-500 bg-primary-50' : 'border-secondary-200 hover:border-secondary-300' }`}
                    >
                      <input type="radio" value={plan.id} checked={approvePlan === plan.id} onChange={() => setApprovePlan(plan.id)} className="sr-only" />
                      <p className="font-semibold text-sm text-secondary-900">{plan.name}</p>
                      <p className="text-xs text-primary-600 mt-0.5">{plan.price}</p>
                      <ul className="mt-2 space-y-0.5">
                        {plan.features.map((f) => <li key={f} className="text-xs text-secondary-500">{f}</li>)}
                      </ul>
                    </label>
                  ))}
                </div>
              </div>

              {/* What happens */}
              <div className="rounded-lg bg-green-50 border border-green-200 p-4 text-sm">
                <p className="font-medium text-green-800 mb-2">This will automatically:</p>
                <ul className="space-y-1 text-green-700 text-xs">
                  <li>• Create tenant workspace <strong>{approveSlug || '…'}</strong> for <strong>{selectedLead.companyName}</strong></li>
                  <li>• Generate a secure temporary password</li>
                  <li>• Create an issuer account for <strong>{selectedLead.email}</strong></li>
                </ul>
              </div>

              {actionError && (
                <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600">{actionError}</p>
              )}
            </div>

            <div className="border-t border-secondary-100 px-6 py-4 flex gap-3 justify-end">
              <button onClick={() => setShowApprove(false)} className="btn-secondary">Cancel</button>
              <button
                onClick={handleApprove}
                disabled={actionLoading || !approveSlug.trim()}
                className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-btn-text hover:bg-green-700 disabled:opacity-60"
              >
                {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                {actionLoading ? 'Approving…' : 'Confirm Approval'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Reject Modal ────────────────────────────────────── */}
      {showReject && selectedLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="card w-full max-w-md">
            <div className="flex items-center justify-between border-b border-secondary-100 px-6 py-4">
              <h3 className="text-lg font-semibold text-secondary-900">Reject Application</h3>
              <button onClick={() => setShowReject(false)} className="rounded-md p-1 hover:bg-secondary-100">
                <X className="h-5 w-5 text-secondary-500" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-secondary-600">
                Rejecting the application from <strong>{selectedLead.companyName}</strong> ({selectedLead.email}). Please provide a reason.
              </p>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-secondary-700">
                  Rejection Reason <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={4}
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="e.g., Incomplete documentation, unsupported jurisdiction..."
                  className="w-full rounded-lg border border-secondary-300 px-3 py-2.5 text-sm placeholder:text-secondary-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 resize-none"
                />
              </div>
              {actionError && <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600">{actionError}</p>}
            </div>
            <div className="border-t border-secondary-100 px-6 py-4 flex gap-3 justify-end">
              <button onClick={() => setShowReject(false)} className="btn-secondary">Cancel</button>
              <button
                onClick={handleReject}
                disabled={actionLoading || !rejectionReason.trim()}
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-btn-text hover:bg-red-700 disabled:opacity-60"
              >
                {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                {actionLoading ? 'Rejecting…' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Credentials Modal ───────────────────────────────── */}
      {showCreds && credentials && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="card w-full max-w-md">
            <div className="flex items-center justify-between border-b border-secondary-100 px-6 py-4">
              <h3 className="text-lg font-semibold text-secondary-900">Issuer Approved!</h3>
              <button onClick={() => setShowCreds(false)} className="rounded-md p-1 hover:bg-secondary-100">
                <X className="h-5 w-5 text-secondary-500" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-3 rounded-lg bg-green-50 border border-green-200 px-4 py-3">
                <CheckCircle className="h-5 w-5 text-green-600" />
                <p className="text-sm font-medium text-green-800">Issuer account created successfully.</p>
              </div>
              <p className="text-sm text-secondary-500">Share these credentials with the issuer. The temporary password expires in 7 days.</p>
              <div className="space-y-3 rounded-xl bg-secondary-50 p-5 text-sm">
                <div><p className="text-secondary-400 text-xs mb-1">Login URL</p><p className="font-mono text-secondary-800">{credentials.loginUrl}</p></div>
                <div><p className="text-secondary-400 text-xs mb-1">Email</p><p className="font-mono text-secondary-800">{credentials.email}</p></div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-secondary-400 text-xs">Temporary Password</p>
                    <button onClick={async () => { await navigator.clipboard.writeText(credentials.temporaryPassword); setCopied(true); setTimeout(() => setCopied(false), 2000); }} className="inline-flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700">
                      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      {copied ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                  <p className="font-mono text-lg font-bold text-secondary-900 tracking-widest">{credentials.temporaryPassword}</p>
                </div>
              </div>
            </div>
            <div className="border-t border-secondary-100 px-6 py-4 flex justify-end">
              <button onClick={() => setShowCreds(false)} className="btn-primary">Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
