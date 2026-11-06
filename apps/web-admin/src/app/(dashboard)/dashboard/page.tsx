'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AdminRwaVisual } from '@/components/common/AdminRwaVisual';
import { useRouter } from 'next/navigation';
import {
  Building2,
  Users,
  Coins,
  ArrowLeftRight,
  TrendingUp,
  Loader2,
  Clock,
  ShieldCheck,
  Sparkles,
  // Plus, // Restore with the Create Tenant button.
  ArrowUpRight,
  Activity,
  Layers,
  ChevronRight,
  UserCheck,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import api from '@/lib/api';

interface PlatformStats {
  totalTenants: number;
  activeTenants: number;
  totalUsers: number;
  totalTokens: number;
  totalTransactions: number;
  tenantsByPlan: Record<string, number>;
  tenantsByStatus: Record<string, number>;
}

interface AuditLog {
  id: string;
  action: string;
  actor_id: string;
  actor_role: string;
  resource_type: string;
  timestamp: string;
}

const PLAN_COLORS: Record<string, string> = {
  free: 'rgb(var(--text-muted))',
  starter: 'rgb(var(--accent2))',
  professional: '#818cf8',
  enterprise: '#c084fc',
};

const STATUS_COLORS: Record<string, string> = {
  active: 'rgb(var(--success))',
  suspended: '#ef4444',
  pending: '#f59e0b',
  deactivated: 'rgb(var(--text-muted))',
};

const ACTION_BADGES: Record<string, { bg: string; text: string; border: string }> = {
  'token.mint': { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/30' },
  'token.deploy': { bg: 'bg-cyan-500/10', text: 'text-cyan-400', border: 'border-cyan-500/30' },
  'kyc.approve': { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/30' },
  'kyc.reject': { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/30' },
  'tenant.create': { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/30' },
  'user.register': { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/30' },
};

export default function AdminDashboardPage() {
  const router = useRouter();
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [recentLogs, setRecentLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [statsRes, logsRes] = await Promise.all([
          api.get('/admin/analytics/dashboard'),
          api.get('/admin/audit-logs', { params: { limit: 6 } }),
        ]);
        setStats(statsRes.data);
        setRecentLogs(logsRes.data?.data ?? []);
      } catch (err) {
        console.error('Failed to fetch dashboard data:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const planChartData = stats
    ? Object.entries(stats.tenantsByPlan).map(([plan, count]) => ({ plan, count }))
    : [];

  const statusChartData = stats
    ? Object.entries(stats.tenantsByStatus).map(([status, count]) => ({ name: status, value: count }))
    : [];

  const statCards = [
    {
      label: 'Total Tenants',
      value: stats ? String(stats.totalTenants) : '--',
      sub: stats ? `${stats.activeTenants} active currently` : 'Multi-tenant schemas',
      percentage: stats && stats.totalTenants > 0 ? `${Math.round((stats.activeTenants / stats.totalTenants) * 100)}% active` : '100%',
      icon: Building2,
      color: 'text-cyan-400',
      bg: 'bg-cyan-500/10',
      border: 'border-cyan-500/20',
      glow: '',
      href: '/tenants',
    },
    {
      label: 'Platform Users',
      value: stats ? stats.totalUsers.toLocaleString() : '--',
      sub: 'Across all tenant domains',
      percentage: 'Unified Auth',
      icon: Users,
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-500/20',
      glow: '',
      href: '/users',
    },
    {
      label: 'Tokens Issued',
      value: stats ? String(stats.totalTokens) : '--',
      sub: 'ERC-3643 & RWA tokens',
      percentage: 'Live on-chain',
      icon: Coins,
      color: 'text-violet-400',
      bg: 'bg-violet-500/10',
      border: 'border-violet-500/20',
      glow: '',
      href: '/tenants',
    },
    {
      label: 'Transactions',
      value: stats ? stats.totalTransactions.toLocaleString() : '--',
      sub: 'Audited state transitions',
      percentage: 'Consensus log',
      icon: ArrowLeftRight,
      color: 'text-amber-400',
      bg: 'bg-amber-500/10',
      border: 'border-amber-500/20',
      glow: '',
      href: '/audit-logs',
    },
  ];

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 space-y-4">
        <Loader2 className="h-10 w-10 animate-spin text-cyan-400" />
        <p className="text-sm font-medium text-slate-400">Loading platform metrics...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* ─── Hero Overview Card ─── */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-surface-alt p-6 sm:p-8 shadow-2xl">
        {/* Glow Halos */}
        <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-blue-500/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-10 h-64 w-64 rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-80 w-80 rounded-full bg-cyan-500/5 blur-3xl" />

        <div className="relative grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-center">
          {/* Left: Info & Actions */}
          <div className="lg:col-span-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3.5 py-1.5 text-xs font-semibold text-cyan-300 shadow-sm">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-500" />
              </span>
              <Sparkles className="h-3.5 w-3.5 text-cyan-400" />
              Multi-Tenant Network &middot; Operations
            </div>

            <h1 className="mt-4 text-3xl font-black leading-tight tracking-tight text-ink sm:text-4xl">
              Platform Governance &amp;{' '}
              <span className="text-accent">
                Infrastructure
              </span>
            </h1>

            <p className="mt-3 max-w-xl text-sm sm:text-base leading-relaxed text-slate-400">
              Multi-tenant architecture dashboard. Provision institutional tenants, monitor tokenized assets,
              manage operator privileges, and inspect real-time platform transactions.
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              {/* Restore when tenant creation is shown in the admin dashboard.
              <button
                onClick={() => router.push('/tenants/create')}
                className="group relative inline-flex items-center gap-2 overflow-hidden rounded-xl bg-accent px-5 py-2.5 text-sm font-bold text-slate-950 shadow-lg transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
              >
                <Plus className="h-4 w-4 transition-transform duration-300 group-hover:rotate-90" />
                <span>Create Tenant</span>
              </button>
              */}

              <button
                onClick={() => router.push('/issuer-leads')}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-700/80 bg-slate-800/60 px-4 py-2.5 text-sm font-semibold text-slate-200 transition-all duration-200 hover:border-slate-600 hover:bg-slate-800 hover:text-ink"
              >
                <UserCheck className="h-4 w-4 text-cyan-400" />
                <span>Issuer Applications</span>
              </button>

              <button
                onClick={() => router.push('/audit-logs')}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-700/80 bg-slate-800/60 px-4 py-2.5 text-sm font-semibold text-slate-200 transition-all duration-200 hover:border-slate-600 hover:bg-slate-800 hover:text-ink"
              >
                <Activity className="h-4 w-4 text-slate-400" />
                <span>Audit Logs</span>
                <ArrowUpRight className="h-3.5 w-3.5 text-slate-500" />
              </button>
            </div>
          </div>

          {/* Right visual: Admin RWA illustration on navy glass */}
          <div className="hidden lg:col-span-4 lg:flex lg:items-center lg:justify-center">
            <AdminRwaVisual className="w-full max-w-md" priority />
          </div>
        </div>
      </div>

      {/* ─── Metric Stat Cards ─── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((s) => {
          const Icon = s.icon;
          return (
            <Link
              key={s.label}
              href={s.href}
              className={`group relative overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-900/60 p-5 shadow-xl transition-all duration-300 hover:border-slate-700 hover:bg-slate-900/90 hover:scale-[1.01] hover:shadow-2xl ${s.glow}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  {s.label}
                </span>
                <div className={`rounded-xl p-2.5 ${s.bg} ${s.color} border ${s.border} transition-transform duration-300 group-hover:scale-110`}>
                  <Icon className="h-5 w-5" />
                </div>
              </div>

              <div className="mt-3 flex items-baseline justify-between">
                <p className="text-3xl font-black tracking-tight text-ink">
                  {s.value}
                </p>
                <span className="text-xs font-semibold text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded-md border border-slate-700/60">
                  {s.percentage}
                </span>
              </div>

              <div className="mt-3 flex items-center gap-1.5 text-xs text-slate-400 border-t border-slate-800/70 pt-2.5">
                <TrendingUp className="h-3.5 w-3.5 text-cyan-400" />
                <span className="truncate">{s.sub}</span>
              </div>
            </Link>
          );
        })}
      </div>

      {/* ─── Charts Section ─── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Tenants by Plan Bar Chart */}
        <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-6 lg:col-span-7 shadow-xl">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-ink tracking-tight">Tenants by Plan</h3>
              <p className="text-xs text-slate-400">Distribution across subscription tiers</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-slate-800 bg-slate-950/80 px-3 py-1 text-xs font-medium text-slate-300">
                {stats?.totalTenants ?? 0} Total Workspaces
              </span>
            </div>
          </div>

          {planChartData.length === 0 ? (
            <div className="flex h-[240px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-800 text-sm text-slate-500">
              <Layers className="h-8 w-8 text-slate-600 mb-2" />
              No tenant plan data yet
            </div>
          ) : (
            <>
              <div className="h-[240px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={planChartData} barSize={42}>
                    <defs>
                      <linearGradient id="barCyan" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="rgb(var(--accent2))" stopOpacity={0.9} />
                        <stop offset="100%" stopColor="rgb(var(--accent))" stopOpacity={0.5} />
                      </linearGradient>
                      <linearGradient id="barIndigo" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#818cf8" stopOpacity={0.9} />
                        <stop offset="100%" stopColor="#4f46e5" stopOpacity={0.5} />
                      </linearGradient>
                      <linearGradient id="barPurple" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#c084fc" stopOpacity={0.9} />
                        <stop offset="100%" stopColor="#7c3aed" stopOpacity={0.5} />
                      </linearGradient>
                      <linearGradient id="barSlate" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="rgb(var(--text-muted))" stopOpacity={0.9} />
                        <stop offset="100%" stopColor="#475569" stopOpacity={0.5} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border-line))" vertical={false} />
                    <XAxis
                      dataKey="plan"
                      stroke="rgb(var(--text-muted))"
                      fontSize={12}
                      tickLine={false}
                      axisLine={{ stroke: 'rgb(var(--border-line))' }}
                      tickFormatter={(v) => v.toUpperCase()}
                    />
                    <YAxis
                      stroke="rgb(var(--text-muted))"
                      fontSize={12}
                      allowDecimals={false}
                      tickLine={false}
                      axisLine={{ stroke: 'rgb(var(--border-line))' }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'rgb(var(--card))',
                        border: '1px solid rgb(var(--border-line))',
                        borderRadius: '12px',
                        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)',
                        color: 'rgb(var(--text-main))',
                        fontSize: '12px',
                      }}
                      itemStyle={{ color: 'rgb(var(--accent))' }}
                      formatter={(v) => [v, 'Tenants']}
                    />
                    <Bar dataKey="count" radius={[8, 8, 0, 0]}>
                      {planChartData.map((entry) => {
                        let fillUrl = 'url(#barCyan)';
                        if (entry.plan === 'enterprise') fillUrl = 'url(#barPurple)';
                        else if (entry.plan === 'professional') fillUrl = 'url(#barIndigo)';
                        else if (entry.plan === 'free') fillUrl = 'url(#barSlate)';
                        return <Cell key={entry.plan} fill={fillUrl} />;
                      })}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-center gap-4 border-t border-slate-800/80 pt-4 text-xs">
                {planChartData.map((entry) => (
                  <div key={entry.plan} className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: PLAN_COLORS[entry.plan] ?? 'rgb(var(--accent2))' }}
                    />
                    <span className="capitalize text-slate-300 font-medium">{entry.plan}</span>
                    <span className="font-mono text-slate-500">({entry.count})</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Tenant Status Donut */}
        <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-6 lg:col-span-5 shadow-xl flex flex-col justify-between">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-ink tracking-tight">Tenant Status</h3>
              <p className="text-xs text-slate-400">Lifecycle operational state</p>
            </div>
            <Link
              href="/tenants"
              className="text-xs font-semibold text-cyan-400 hover:text-cyan-300 transition-colors inline-flex items-center gap-1"
            >
              <span>Manage</span>
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {statusChartData.length === 0 ? (
            <div className="flex h-[240px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-800 text-sm text-slate-500">
              <Activity className="h-8 w-8 text-slate-600 mb-2" />
              No status data available
            </div>
          ) : (
            <div className="flex-1 flex flex-col justify-center">
              <div className="relative h-44 w-full flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={75}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {statusChartData.map((entry) => (
                        <Cell
                          key={entry.name}
                          fill={STATUS_COLORS[entry.name] ?? 'rgb(var(--text-muted))'}
                          stroke="rgb(var(--background))"
                          strokeWidth={2}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'rgb(var(--card))',
                        border: '1px solid rgb(var(--border-line))',
                        borderRadius: '12px',
                        color: 'rgb(var(--text-main))',
                        fontSize: '12px',
                      }}
                      formatter={(v, n) => [v, n]}
                    />
                  </PieChart>
                </ResponsiveContainer>
                {/* Center Badge */}
                <div className="pointer-events-none absolute flex flex-col items-center justify-center text-center">
                  <span className="text-2xl font-black text-ink">
                    {stats?.totalTenants ?? 0}
                  </span>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    Tenants
                  </span>
                </div>
              </div>

              <div className="mt-4 space-y-2 border-t border-slate-800/80 pt-4">
                {statusChartData.map((entry) => {
                  const total = stats?.totalTenants || 1;
                  const pct = Math.round((entry.value / total) * 100);
                  const color = STATUS_COLORS[entry.name] ?? 'rgb(var(--text-muted))';
                  return (
                    <div
                      key={entry.name}
                      className="flex items-center justify-between rounded-lg bg-slate-950/40 px-3 py-2 text-xs border border-slate-800/50"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2 w-2 rounded-full shadow-sm"
                          style={{ backgroundColor: color }}
                        />
                        <span className="capitalize font-medium text-slate-200">
                          {entry.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-slate-400">{pct}%</span>
                        <span className="font-mono font-bold text-ink">
                          {entry.value}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ─── Recent Activity / Audit Stream ─── */}
      <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-6 shadow-xl">
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/10 text-cyan-400 border border-cyan-500/20">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-ink tracking-tight">Recent Platform Activity</h3>
              <p className="text-xs text-slate-400">Verifiable audit trail and security event logs</p>
            </div>
          </div>
          <Link
            href="/audit-logs"
            className="group inline-flex items-center gap-1.5 rounded-xl border border-slate-700/80 bg-slate-800/60 px-3.5 py-1.5 text-xs font-semibold text-cyan-400 hover:border-cyan-500/30 hover:bg-slate-800 hover:text-cyan-300 transition-all"
          >
            <span>Audit Explorer</span>
            <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </Link>
        </div>

        {recentLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center rounded-xl border border-dashed border-slate-800">
            <Clock className="h-8 w-8 text-slate-600 mb-2" />
            <p className="text-sm font-semibold text-slate-300">No Recent Audit Logs</p>
            <p className="text-xs text-slate-500 mt-0.5">Platform events and ledger updates will appear here</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {recentLogs.map((log) => {
              const badge = ACTION_BADGES[log.action] ?? {
                bg: 'bg-slate-800',
                text: 'text-slate-300',
                border: 'border-slate-700',
              };

              return (
                <div
                  key={log.id}
                  className="group relative flex flex-col justify-between rounded-xl border border-slate-800/80 bg-slate-950/50 p-4 transition-all duration-200 hover:border-slate-700 hover:bg-slate-950/80 hover:shadow-lg"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span
                        className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-wide ${badge.bg} ${badge.text} ${badge.border}`}
                      >
                        {log.action}
                      </span>
                      <span className="font-mono text-[10px] text-slate-500 uppercase">
                        {log.actor_role}
                      </span>
                    </div>

                    <p className="text-xs font-medium text-slate-300 truncate">
                      Resource: <span className="font-mono text-cyan-400">{log.resource_type}</span>
                    </p>
                  </div>

                  <div className="mt-3 flex items-center justify-between border-t border-slate-800/70 pt-2 text-[11px] text-slate-500">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span>
                      {new Date(log.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── Quick Admin Navigation Ribbons ─── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Link
          href="/tenants"
          className="group flex items-center justify-between rounded-2xl border border-slate-800/80 bg-slate-900/60 p-4 transition-all duration-200 hover:border-cyan-500/40 hover:bg-slate-900 hover:scale-[1.01]"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 group-hover:scale-105 transition-transform">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-ink group-hover:text-cyan-300 transition-colors">
                Tenants Directory
              </p>
              <p className="text-xs text-slate-400">View schemas, limits &amp; plans</p>
            </div>
          </div>
          <ChevronRight className="h-5 w-5 text-slate-600 group-hover:text-cyan-400 group-hover:translate-x-0.5 transition-all" />
        </Link>

        <Link
          href="/issuer-leads"
          className="group flex items-center justify-between rounded-2xl border border-slate-800/80 bg-slate-900/60 p-4 transition-all duration-200 hover:border-emerald-500/40 hover:bg-slate-900 hover:scale-[1.01]"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 group-hover:scale-105 transition-transform">
              <UserCheck className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-ink group-hover:text-emerald-300 transition-colors">
                Issuer Applications
              </p>
              <p className="text-xs text-slate-400">Onboarding &amp; workspace setup</p>
            </div>
          </div>
          <ChevronRight className="h-5 w-5 text-slate-600 group-hover:text-emerald-400 group-hover:translate-x-0.5 transition-all" />
        </Link>

        <Link
          href="/users"
          className="group flex items-center justify-between rounded-2xl border border-slate-800/80 bg-slate-900/60 p-4 transition-all duration-200 hover:border-violet-500/40 hover:bg-slate-900 hover:scale-[1.01]"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/10 text-violet-400 border border-violet-500/20 group-hover:scale-105 transition-transform">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-ink group-hover:text-violet-300 transition-colors">
                Platform Users
              </p>
              <p className="text-xs text-slate-400">Operator roles &amp; permissions</p>
            </div>
          </div>
          <ChevronRight className="h-5 w-5 text-slate-600 group-hover:text-violet-400 group-hover:translate-x-0.5 transition-all" />
        </Link>
      </div>
    </div>
  );
}
