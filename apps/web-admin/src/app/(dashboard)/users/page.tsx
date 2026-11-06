'use client';

import { useEffect, useState, useCallback } from 'react';
import { Search, Loader2, UserCheck, UserX, Shield, ChevronLeft, ChevronRight, Users as UsersIcon } from 'lucide-react';
import api from '@/lib/api';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  kycStatus?: string;
  isEmailVerified: boolean;
  createdAt: string;
  lastLoginAt?: string;
}

const roleBadge: Record<string, string> = {
  investor: 'bg-blue-500/15 text-blue-400 border border-blue-500/30',
  issuer: 'bg-purple-500/15 text-purple-400 border border-purple-500/30',
  admin: 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30',
  compliance_officer: 'bg-amber-500/15 text-amber-400 border border-amber-500/30',
  transfer_agent: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
};

const statusBadge: Record<string, string> = {
  active: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
  suspended: 'bg-red-500/15 text-red-400 border border-red-500/30',
  pending_verification: 'bg-amber-500/15 text-amber-400 border border-amber-500/30',
  inactive: 'bg-slate-800 text-slate-400 border border-slate-700',
};

const kycBadge: Record<string, string> = {
  approved: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
  pending: 'bg-amber-500/15 text-amber-400 border border-amber-500/30',
  rejected: 'bg-red-500/15 text-red-400 border border-red-500/30',
  none: 'bg-slate-800 text-slate-400 border border-slate-700',
};

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 20;

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [confirmUser, setConfirmUser] = useState<{ id: string; name: string; action: string } | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page, limit };
      if (search) params.search = search;
      if (roleFilter) params.role = roleFilter;
      if (statusFilter) params.status = statusFilter;

      const res = await api.get('/admin/users', { params });
      setUsers(res.data.data ?? []);
      setTotal(res.data.total ?? 0);
    } catch (err) {
      console.error('Failed to fetch users:', err);
    } finally {
      setLoading(false);
    }
  }, [page, search, roleFilter, statusFilter]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [search, roleFilter, statusFilter]);

  const handleStatusChange = async (userId: string, newStatus: string) => {
    setActionLoading(userId);
    try {
      await api.patch(`/admin/users/${userId}/status`, { status: newStatus });
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, status: newStatus } : u));
    } catch (err) {
      console.error('Failed to update user status:', err);
    } finally {
      setActionLoading(null);
      setConfirmUser(null);
    }
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-6">
      {/* ─── Page Title Header ─── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-ink">Platform Users</h1>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-0.5 text-xs font-semibold text-cyan-300">
              <UsersIcon className="h-3.5 w-3.5 text-cyan-400" />
              Unified Accounts
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-400">
            {total.toLocaleString()} cross-tenant accounts &amp; role-based access management
          </p>
        </div>
      </div>

      {/* ─── Filters Bar ─── */}
      <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-4 shadow-xl">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Search by name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-slate-700/80 bg-slate-950/80 py-2 pl-10 pr-4 text-sm text-ink placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400 transition-colors"
            />
          </div>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="rounded-xl border border-slate-700/80 bg-slate-950/80 px-3.5 py-2 text-sm text-ink focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400 transition-colors"
          >
            <option value="" className="bg-slate-950 text-ink">All Roles</option>
            <option value="investor" className="bg-slate-950 text-ink">Investor</option>
            <option value="issuer" className="bg-slate-950 text-ink">Issuer</option>
            <option value="admin" className="bg-slate-950 text-ink">Admin</option>
            <option value="compliance_officer" className="bg-slate-950 text-ink">Compliance Officer</option>
            <option value="transfer_agent" className="bg-slate-950 text-ink">Transfer Agent</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-xl border border-slate-700/80 bg-slate-950/80 px-3.5 py-2 text-sm text-ink focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400 transition-colors"
          >
            <option value="" className="bg-slate-950 text-ink">All Statuses</option>
            <option value="active" className="bg-slate-950 text-ink">Active</option>
            <option value="suspended" className="bg-slate-950 text-ink">Suspended</option>
            <option value="pending_verification" className="bg-slate-950 text-ink">Pending Verification</option>
            <option value="inactive" className="bg-slate-950 text-ink">Inactive</option>
          </select>
        </div>
      </div>

      {/* ─── Table ─── */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 space-y-3">
          <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
          <p className="text-sm font-medium text-slate-400">Loading user accounts...</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-900/60 shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-850/60">
                  <th className="px-3 sm:px-6 py-3.5 text-xs font-bold uppercase tracking-wider text-slate-400">User</th>
                  <th className="px-3 sm:px-6 py-3.5 text-xs font-bold uppercase tracking-wider text-slate-400">Role</th>
                  <th className="px-3 sm:px-6 py-3.5 text-xs font-bold uppercase tracking-wider text-slate-400">Status</th>
                  <th className="hidden md:table-cell px-3 sm:px-6 py-3.5 text-xs font-bold uppercase tracking-wider text-slate-400">KYC</th>
                  <th className="hidden lg:table-cell px-3 sm:px-6 py-3.5 text-xs font-bold uppercase tracking-wider text-slate-400">Joined</th>
                  <th className="hidden xl:table-cell px-3 sm:px-6 py-3.5 text-xs font-bold uppercase tracking-wider text-slate-400">Last Login</th>
                  <th className="px-3 sm:px-6 py-3.5 text-right text-xs font-bold uppercase tracking-wider text-slate-400">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {users.map((user) => (
                  <tr key={user.id} className="group transition-colors duration-150 hover:bg-slate-800/40">
                    <td className="px-3 sm:px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-accent text-xs font-bold text-slate-950 shadow-sm">
                          {user.name?.charAt(0)?.toUpperCase() || '?'}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-ink">{user.name}</p>
                          <p className="text-xs font-mono text-cyan-400/80">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 sm:px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize ${roleBadge[user.role] ?? 'bg-slate-800 text-slate-400 border-slate-700'}`}>
                        <Shield className="h-3 w-3" />
                        {user.role.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-3 sm:px-6 py-4">
                      <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize ${statusBadge[user.status] ?? 'bg-slate-800 text-slate-400 border-slate-700'}`}>
                        {user.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="hidden md:table-cell px-3 sm:px-6 py-4">
                      <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize ${kycBadge[user.kycStatus ?? 'none'] ?? 'bg-slate-800 text-slate-400 border-slate-700'}`}>
                        {user.kycStatus ?? 'none'}
                      </span>
                    </td>
                    <td className="hidden lg:table-cell px-3 sm:px-6 py-4 text-xs font-mono text-slate-400">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </td>
                    <td className="hidden xl:table-cell px-3 sm:px-6 py-4 text-xs font-mono text-slate-400">
                      {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-3 sm:px-6 py-4 text-right">
                      {user.status === 'active' ? (
                        <button
                          onClick={() => setConfirmUser({ id: user.id, name: user.name, action: 'suspended' })}
                          disabled={actionLoading === user.id}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 text-xs font-semibold text-red-400 hover:bg-red-500/20 disabled:opacity-50 transition-colors"
                        >
                          <UserX className="h-3.5 w-3.5" />
                          <span>Suspend</span>
                        </button>
                      ) : (
                        <button
                          onClick={() => setConfirmUser({ id: user.id, name: user.name, action: 'active' })}
                          disabled={actionLoading === user.id}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-50 transition-colors"
                        >
                          <UserCheck className="h-3.5 w-3.5" />
                          <span>Activate</span>
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-16 text-center text-slate-400">
                      No users match your filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-slate-800/80 bg-slate-950/50 px-6 py-4">
              <p className="text-xs text-slate-400">
                Showing <span className="font-semibold text-ink">{(page - 1) * limit + 1}</span>–
                <span className="font-semibold text-ink">{Math.min(page * limit, total)}</span> of{' '}
                <span className="font-semibold text-ink">{total.toLocaleString()}</span> users
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
      )}

      {/* Confirm Modal */}
      {confirmUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="card w-full max-w-sm p-6">
            <h3 className="text-lg font-bold text-ink">
              {confirmUser.action === 'suspended' ? 'Suspend User Access' : 'Activate User Account'}
            </h3>
            <p className="mt-2 text-xs text-slate-400 leading-relaxed">
              Are you sure you want to {confirmUser.action === 'suspended' ? 'suspend' : 'activate'}{' '}
              <strong className="text-ink">{confirmUser.name}</strong>?
              {confirmUser.action === 'suspended' && ' They will immediately lose platform authentication.'}
            </p>
            <div className="mt-6 flex gap-3 justify-end">
              <button
                onClick={() => setConfirmUser(null)}
                className="rounded-xl border border-slate-700/80 bg-slate-800/60 px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={() => handleStatusChange(confirmUser.id, confirmUser.action)}
                disabled={actionLoading === confirmUser.id}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold text-btn-text ${
 confirmUser.action === 'suspended' ? 'bg-red-600 hover:bg-red-500 shadow-md' : 'bg-emerald-600 hover:bg-emerald-500 shadow-md' } disabled:opacity-50 transition-colors`}
              >
                {actionLoading === confirmUser.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
