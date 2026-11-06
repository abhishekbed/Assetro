'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import {
  Users,
  CheckCircle,
  Clock,
  Award,
  Search,
  Loader2,
  AlertCircle,
  Shield,
} from 'lucide-react';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';

interface Profile {
  fullName: string;
  country: string;
  investorType: string;
  accreditation: string;
  submittedAt: string;
}

interface Qualification {
  id: string;
  investorId: string;
  status: string;
  createdAt: string;
  approvedAt?: string;
  profile?: Profile;
}

const statusBadge: Record<string, string> = {
  pending:      'bg-amber-500/10 text-amber-400',
  under_review: 'bg-blue-500/10 text-blue-400',
  approved:     'bg-emerald-500/10 text-emerald-400',
  rejected:     'bg-red-500/10 text-red-400',
  expired:      'bg-slate-700/50 text-slate-400',
};

const statusFilters = ['All', 'Approved', 'Pending', 'Under Review', 'Rejected'] as const;

function formatDate(d: string | undefined): string {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return d;
  }
}

export default function InvestorsPage() {
  const router = useRouter();
  const { user } = useAuthStore();

  const [qualifications, setQualifications] = useState<Qualification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');

  const headers = user?.id ? { 'x-user-id': user.id } : {};

  const fetchData = useCallback(async () => {
    if (!user?.id) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      // Fetch all pages to show full list
      const res = await api.get('/kyc/qualifications', { headers, params: { limit: 200 } });
      const data = res.data.data || res.data;
      setQualifications(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to load investors');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = useMemo(() => {
    let result = qualifications;
    if (statusFilter !== 'All') {
      const filterValue = statusFilter.toLowerCase().replace(' ', '_');
      result = result.filter((q) => q.status === filterValue);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((qual) =>
        qual.profile?.fullName?.toLowerCase().includes(q) ||
        qual.profile?.country?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [qualifications, statusFilter, searchQuery]);

  const total       = qualifications.length;
  const approved    = qualifications.filter((q) => q.status === 'approved').length;
  const pending     = qualifications.filter((q) => q.status === 'pending' || q.status === 'under_review').length;
  const accredited  = qualifications.filter(
    (q) =>
      q.profile?.accreditation === 'accredited' ||
      q.profile?.accreditation === 'verified' ||
      q.profile?.accreditation === 'self_certified'
  ).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-ink">Investors</h1>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 text-center">
          <AlertCircle className="mx-auto mb-2 h-8 w-8 text-red-400" />
          <p className="text-red-400">{error}</p>
          <button
            onClick={fetchData}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-slate-950 shadow-lg transition-all hover:-translate-y-0.5"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">Investors</h1>
        <p className="text-slate-400">Investors who have requested qualification from you</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-400">Total</p>
            <div className="rounded-lg bg-blue-500/10 p-2">
              <Users className="h-5 w-5 text-blue-400" />
            </div>
          </div>
          <p className="mt-3 text-2xl font-bold text-ink">{total}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-400">Approved</p>
            <div className="rounded-lg bg-emerald-500/10 p-2">
              <CheckCircle className="h-5 w-5 text-emerald-400" />
            </div>
          </div>
          <p className="mt-3 text-2xl font-bold text-ink">{approved}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-400">Pending Review</p>
            <div className="rounded-lg bg-amber-500/10 p-2">
              <Clock className="h-5 w-5 text-amber-400" />
            </div>
          </div>
          <p className="mt-3 text-2xl font-bold text-ink">{pending}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-400">Accredited</p>
            <div className="rounded-lg bg-violet-500/10 p-2">
              <Award className="h-5 w-5 text-violet-400" />
            </div>
          </div>
          <p className="mt-3 text-2xl font-bold text-ink">{accredited}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {statusFilters.map((filter) => (
            <button
              key={filter}
              onClick={() => setStatusFilter(filter)}
              className={clsx(
                'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                statusFilter === filter
                  ? 'bg-blue-500/10 text-blue-300'
                  : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
              )}
            >
              {filter}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Search by name or country..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-800/60 py-2 pl-10 pr-4 text-sm text-ink placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:w-72"
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60">
        {filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Shield className="mx-auto mb-3 h-10 w-10 text-slate-600" />
            <p className="font-medium text-slate-300">
              {total === 0 ? 'No qualification requests yet' : 'No investors match your filters'}
            </p>
            {total === 0 && (
              <p className="mt-1 text-sm text-slate-500">
                Investors will appear here once they request qualification from you.
              </p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-800/40">
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Country</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Investor Type</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Accreditation</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Requested</th>
                  <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wide text-slate-500">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {filtered.map((qual) => (
                  <tr
                    key={qual.id}
                    onClick={() => router.push(`/issuer/kyc-review/${qual.id}`)}
                    className="cursor-pointer hover:bg-slate-800/40"
                  >
                    <td className="px-6 py-4 text-sm font-medium text-ink">
                      {qual.profile?.fullName || '—'}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-400">
                      {qual.profile?.country || '—'}
                    </td>
                    <td className="px-6 py-4 text-sm capitalize text-slate-400">
                      {qual.profile?.investorType?.replace(/_/g, ' ') || '—'}
                    </td>
                    <td className="px-6 py-4 text-sm capitalize text-slate-400">
                      {qual.profile?.accreditation?.replace(/_/g, ' ') || '—'}
                    </td>
                    <td className="px-6 py-4">
                      <span className={clsx(
                        'inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize',
                        statusBadge[qual.status] || 'bg-slate-700/50 text-slate-400'
                      )}>
                        {qual.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500">
                      {formatDate(qual.createdAt)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={(e) => { e.stopPropagation(); router.push(`/issuer/kyc-review/${qual.id}`); }}
                        className="text-sm font-medium text-blue-400 hover:text-blue-300"
                      >
                        {qual.status === 'pending' || qual.status === 'under_review' ? 'Review' : 'View'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
