'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Users, Coins, ArrowLeftRight, Power, Ban,
  Loader2, UserPlus, X, CheckCircle, Copy, Check, Mail,
} from 'lucide-react';
import api from '@/lib/api';

interface Tenant {
  id: string;
  name: string;
  slug: string;
  domain: string | null;
  status: string;
  plan: string;
  logoUrl: string | null;
  primaryColor: string | null;
  settings: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

interface TenantStats {
  userCount: number;
  tokenCount: number;
  transactionCount: number;
}

interface Credentials {
  email: string;
  temporaryPassword: string;
  loginUrl: string;
}

const statusColors: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  suspended: 'bg-red-100 text-red-700',
  pending: 'bg-amber-100 text-amber-700',
  deactivated: 'bg-secondary-100 text-secondary-600',
};

export default function TenantDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [stats, setStats] = useState<TenantStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmAction, setConfirmAction] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Add issuer modal
  const [showAddIssuer, setShowAddIssuer] = useState(false);
  const [issuerName, setIssuerName] = useState('');
  const [issuerEmail, setIssuerEmail] = useState('');
  const [issuerLoading, setIssuerLoading] = useState(false);
  const [issuerError, setIssuerError] = useState('');
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [showCreds, setShowCreds] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function fetchTenant() {
      try {
        const [tenantRes, statsRes] = await Promise.all([
          api.get(`/admin/tenants/${id}`),
          api.get(`/admin/tenants/${id}/stats`),
        ]);
        setTenant(tenantRes.data);
        setStats(statsRes.data);
      } catch (err) {
        console.error('Failed to fetch tenant:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchTenant();
  }, [id]);

  const handleStatusAction = async (action: string) => {
    if (!tenant) return;
    setActionLoading(true);
    try {
      const newStatus = action === 'suspend' ? 'suspended' : 'active';
      const res = await api.patch(`/admin/tenants/${tenant.id}/status`, { status: newStatus });
      setTenant(res.data);
      setConfirmAction(null);
    } catch (err) {
      console.error(`Failed to ${action} tenant:`, err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddIssuer = async () => {
    if (!issuerName.trim() || !issuerEmail.trim()) {
      setIssuerError('Name and email are required.');
      return;
    }
    setIssuerLoading(true);
    setIssuerError('');
    try {
      const res = await api.post(`/admin/tenants/${id}/issuer`, {
        name: issuerName.trim(),
        email: issuerEmail.trim(),
      });
      setCredentials(res.data?.data?.credentials);
      setShowAddIssuer(false);
      setShowCreds(true);
      // Refresh stats
      const statsRes = await api.get(`/admin/tenants/${id}/stats`);
      setStats(statsRes.data);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setIssuerError(e.response?.data?.message || 'Failed to create issuer account.');
    } finally {
      setIssuerLoading(false);
    }
  };

  const openAddIssuer = () => {
    setIssuerName('');
    setIssuerEmail('');
    setIssuerError('');
    setShowAddIssuer(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
      </div>
    );
  }

  if (!tenant) {
    return <div className="py-20 text-center text-secondary-400">Tenant not found.</div>;
  }

  return (
    <div className="space-y-6">
      <Link href="/tenants" className="inline-flex items-center gap-1 text-sm text-secondary-500 hover:text-secondary-700">
        <ArrowLeft className="h-4 w-4" />
        Back to Tenants
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-secondary-900">{tenant.name}</h1>
            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${statusColors[tenant.status] || 'bg-secondary-100 text-secondary-600'}`}>
              {tenant.status}
            </span>
            <span className="inline-flex rounded-full bg-secondary-100 px-2 py-0.5 text-xs font-medium capitalize text-secondary-600">
              {tenant.plan}
            </span>
          </div>
          <p className="mt-1 text-sm text-secondary-400">
            {tenant.slug}{tenant.domain ? ` · ${tenant.domain}` : ''}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={openAddIssuer}
            className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-btn-text hover:bg-primary-700 transition-colors"
          >
            <UserPlus className="h-4 w-4" />
            Add Issuer User
          </button>
          {tenant.status === 'active' ? (
            <button
              onClick={() => setConfirmAction('suspend')}
              className="inline-flex items-center gap-2 rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
            >
              <Ban className="h-4 w-4" />
              Suspend
            </button>
          ) : (
            <button
              onClick={() => setConfirmAction('activate')}
              className="inline-flex items-center gap-2 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-btn-text hover:bg-green-700"
            >
              <Power className="h-4 w-4" />
              Activate
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="card p-6">
          <div className="flex items-center justify-between">
            <p className="text-sm text-secondary-500">Users</p>
            <Users className="h-5 w-5 text-blue-500" />
          </div>
          <p className="mt-2 text-2xl font-bold text-secondary-900">{stats?.userCount ?? 0}</p>
        </div>
        <div className="card p-6">
          <div className="flex items-center justify-between">
            <p className="text-sm text-secondary-500">Tokens</p>
            <Coins className="h-5 w-5 text-green-500" />
          </div>
          <p className="mt-2 text-2xl font-bold text-secondary-900">{stats?.tokenCount ?? 0}</p>
        </div>
        <div className="card p-6">
          <div className="flex items-center justify-between">
            <p className="text-sm text-secondary-500">Transactions</p>
            <ArrowLeftRight className="h-5 w-5 text-purple-500" />
          </div>
          <p className="mt-2 text-2xl font-bold text-secondary-900">{(stats?.transactionCount ?? 0).toLocaleString()}</p>
        </div>
      </div>

      {/* Config + Settings */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="card p-6">
          <h3 className="mb-4 text-lg font-semibold text-secondary-900">Configuration</h3>
          <dl className="space-y-3">
            {[
              { label: 'Plan', value: tenant.plan },
              { label: 'Slug', value: tenant.slug },
              { label: 'Domain', value: tenant.domain || 'Not set' },
              { label: 'Created', value: new Date(tenant.createdAt).toLocaleDateString() },
              { label: 'Last Updated', value: new Date(tenant.updatedAt).toLocaleDateString() },
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between text-sm">
                <dt className="text-secondary-500">{label}</dt>
                <dd className="font-medium capitalize text-secondary-900">{value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="card p-6">
          <h3 className="mb-4 text-lg font-semibold text-secondary-900">Settings</h3>
          <pre className="overflow-auto rounded-lg bg-secondary-50 p-4 text-xs text-secondary-700">
            {JSON.stringify(tenant.settings, null, 2)}
          </pre>
        </div>
      </div>

      {/* ─── Add Issuer Modal ─── */}
      {showAddIssuer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="card w-full max-w-md">
            <div className="flex items-center justify-between border-b border-secondary-100 px-6 py-4">
              <div>
                <h3 className="text-lg font-semibold text-secondary-900">Add Issuer User</h3>
                <p className="text-sm text-secondary-400">{tenant.name}</p>
              </div>
              <button onClick={() => setShowAddIssuer(false)} className="rounded-md p-1 hover:bg-secondary-100">
                <X className="h-5 w-5 text-secondary-500" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-sm text-secondary-500">
                Create an issuer account for this tenant. A temporary password will be generated and displayed once.
              </p>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-secondary-700">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={issuerName}
                  onChange={(e) => setIssuerName(e.target.value)}
                  placeholder="John Doe"
                  className="w-full rounded-lg border border-secondary-300 px-3 py-2.5 text-sm placeholder:text-secondary-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-secondary-700">
                  Email Address <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-secondary-400" />
                  <input
                    type="email"
                    value={issuerEmail}
                    onChange={(e) => setIssuerEmail(e.target.value)}
                    placeholder="issuer@company.com"
                    className="w-full rounded-lg border border-secondary-300 pl-10 pr-3 py-2.5 text-sm placeholder:text-secondary-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                  />
                </div>
              </div>

              {issuerError && (
                <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600">
                  {issuerError}
                </p>
              )}
            </div>

            <div className="border-t border-secondary-100 px-6 py-4 flex gap-3 justify-end">
              <button onClick={() => setShowAddIssuer(false)} className="btn-secondary">Cancel</button>
              <button
                onClick={handleAddIssuer}
                disabled={issuerLoading || !issuerName.trim() || !issuerEmail.trim()}
                className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-btn-text hover:bg-primary-700 disabled:opacity-60"
              >
                {issuerLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                {issuerLoading ? 'Creating…' : 'Create Issuer Account'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Credentials Modal ─── */}
      {showCreds && credentials && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="card w-full max-w-md">
            <div className="flex items-center justify-between border-b border-secondary-100 px-6 py-4">
              <h3 className="text-lg font-semibold text-secondary-900">Issuer Account Created</h3>
              <button onClick={() => setShowCreds(false)} className="rounded-md p-1 hover:bg-secondary-100">
                <X className="h-5 w-5 text-secondary-500" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-3 rounded-lg bg-green-50 border border-green-200 px-4 py-3">
                <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
                <p className="text-sm font-medium text-green-800">Account created. Share these credentials with the issuer.</p>
              </div>
              <p className="text-xs text-secondary-400">The temporary password expires in 7 days. The issuer should reset it on first login.</p>
              <div className="space-y-3 rounded-xl bg-secondary-50 p-5 text-sm">
                <div>
                  <p className="text-secondary-400 text-xs mb-1">Login URL</p>
                  <p className="font-mono text-secondary-800">{credentials.loginUrl}</p>
                </div>
                <div>
                  <p className="text-secondary-400 text-xs mb-1">Email</p>
                  <p className="font-mono text-secondary-800">{credentials.email}</p>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-secondary-400 text-xs">Temporary Password</p>
                    <button
                      onClick={async () => { await navigator.clipboard.writeText(credentials.temporaryPassword); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                      className="inline-flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700"
                    >
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

      {/* ─── Suspend/Activate Confirm ─── */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="card w-full max-w-sm p-6">
            <h3 className="text-lg font-semibold text-secondary-900">
              Confirm {confirmAction === 'suspend' ? 'Suspension' : 'Activation'}
            </h3>
            <p className="mt-2 text-sm text-secondary-500">
              Are you sure you want to {confirmAction} tenant &quot;{tenant.name}&quot;?
              {confirmAction === 'suspend' && ' This will disable all access for their users.'}
            </p>
            <div className="mt-4 flex gap-3 justify-end">
              <button onClick={() => setConfirmAction(null)} className="btn-secondary">Cancel</button>
              <button
                onClick={() => handleStatusAction(confirmAction)}
                disabled={actionLoading}
                className={confirmAction === 'suspend'
                  ? 'inline-flex items-center gap-2 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-btn-text hover:bg-red-700'
                  : 'inline-flex items-center gap-2 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-btn-text hover:bg-green-700'
                }
              >
                {actionLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                {confirmAction === 'suspend' ? 'Suspend' : 'Activate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
