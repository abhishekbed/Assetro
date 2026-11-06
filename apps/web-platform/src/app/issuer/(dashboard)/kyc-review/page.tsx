'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search, Loader2, AlertCircle, Users, Clock, CheckCircle, XCircle } from 'lucide-react';
import clsx from 'clsx';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';

interface Profile {
  fullName: string;
  country: string;
  investorType: string;
}

interface Qualification {
  id: string;
  investorId: string;
  status: string;
  reviewNotes?: string;
  createdAt: string;
  approvedAt?: string;
  profile?: Profile;
}

interface Stats {
  total: number;
  pending: number;
  under_review: number;
  approved: number;
  rejected: number;
  expired: number;
}

const statusBadge: Record<string, string> = {
  pending:      'bg-amber-500/10 text-amber-400',
  under_review: 'bg-blue-500/10 text-blue-400',
  approved:     'bg-emerald-500/10 text-emerald-400',
  rejected:     'bg-red-500/10 text-red-400',
  expired:      'bg-slate-700/50 text-slate-400',
  revoked:      'bg-orange-500/10 text-orange-400',
};

const statusTabs = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'under_review', label: 'Under Review' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'expired', label: 'Expired' },
  { value: 'revoked', label: 'Revoked' },
];

export default function KycReviewPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [filterStatus, setFilterStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [qualifications, setQualifications] = useState<Qualification[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const headers = user?.id ? { 'x-user-id': user.id } : {};

  const fetchData = useCallback(async () => {
    if (!user?.id) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const [qualsRes, statsRes] = await Promise.all([
        api.get('/kyc/qualifications', { headers }),
        api.get('/kyc/qualifications/stats', { headers }),
      ]);
      setQualifications(qualsRes.data.data || []);
      setStats(statsRes.data.data || null);
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to load qualification requests');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = qualifications.filter((q) => {
    if (filterStatus !== 'all' && q.status !== filterStatus) return false;
    if (search && !q.profile?.fullName?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const formatDate = (d: string) => {
    try { return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }); }
    catch { return d; }
  };

  if (loading) {
    return <div className="flex min-h-[400px] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-blue-400" /></div>;
  }

  if (error) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center gap-4">
        <AlertCircle className="h-12 w-12 text-red-400" />
        <p className="text-slate-400">{error}</p>
        <button
          onClick={fetchData}
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-slate-950 shadow-lg transition-all hover:-translate-y-0.5"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">KYC Review</h1>
        <p className="text-slate-400">{stats?.pending ?? 0} investor qualification requests pending</p>
      </div>

      {stats && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="rounded-lg bg-blue-500/10 p-2"><Users className="h-5 w-5 text-blue-400" /></div>
            <div><p className="text-2xl font-bold text-ink">{stats.total}</p><p className="text-xs text-slate-400">Total</p></div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="rounded-lg bg-amber-500/10 p-2"><Clock className="h-5 w-5 text-amber-400" /></div>
            <div><p className="text-2xl font-bold text-ink">{stats.pending}</p><p className="text-xs text-slate-400">Pending</p></div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="rounded-lg bg-emerald-500/10 p-2"><CheckCircle className="h-5 w-5 text-emerald-400" /></div>
            <div><p className="text-2xl font-bold text-ink">{stats.approved}</p><p className="text-xs text-slate-400">Approved</p></div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="rounded-lg bg-red-500/10 p-2"><XCircle className="h-5 w-5 text-red-400" /></div>
            <div><p className="text-2xl font-bold text-ink">{stats.rejected}</p><p className="text-xs text-slate-400">Rejected</p></div>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Search by investor name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-800/60 py-2 pl-10 pr-4 text-sm text-ink placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </div>
        <div className="flex max-w-full items-center gap-1 overflow-x-auto rounded-lg border border-slate-800 bg-slate-900/60 p-1">
          {statusTabs.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setFilterStatus(tab.value)}
              className={clsx(
                'whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                filterStatus === tab.value
                  ? 'bg-accent text-slate-950'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/60">
        <table className="w-full min-w-[720px]">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-800/40">
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Investor</th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Country</th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Investor Type</th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Requested</th>
              <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wide text-slate-500">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/70">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-sm text-slate-500">
                  No qualification requests found.
                </td>
              </tr>
            ) : (
              filtered.map((qual) => (
                <tr
                  key={qual.id}
                  className="cursor-pointer hover:bg-slate-800/40"
                  onClick={() => router.push(`/issuer/kyc-review/${qual.id}`)}
                >
                  <td className="px-6 py-4">
                    <p className="text-sm font-medium text-ink">{qual.profile?.fullName || '—'}</p>
                    <p className="text-xs text-slate-500">{qual.investorId.slice(0, 8)}…</p>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-400">{qual.profile?.country || '—'}</td>
                  <td className="px-6 py-4 text-sm capitalize text-slate-400">{qual.profile?.investorType || '—'}</td>
                  <td className="px-6 py-4">
                    <span className={clsx('inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize', statusBadge[qual.status] || 'bg-slate-700/50 text-slate-400')}>
                      {qual.status.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-400">{formatDate(qual.createdAt)}</td>
                  <td className="px-6 py-4 text-right">
                    <Link
                      href={`/issuer/kyc-review/${qual.id}`}
                      className="text-sm font-medium text-blue-400 hover:text-blue-300"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Review
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
