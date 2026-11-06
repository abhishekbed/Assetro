'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import clsx from 'clsx';
import {
  Users,
  Coins,
  ShieldCheck,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  ShoppingCart,
  Plus,
  TrendingUp,
  PieChart as PieChartIcon,
  Wallet,
} from 'lucide-react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { getMediaUrl } from '@/lib/media';
import { seriesFor, chartTooltipStyle } from '@/lib/chart-colors';
import { ASSET_CLASSES } from '@/lib/asset-classes';

interface Token {
  id: string;
  name: string;
  symbol: string;
  status: string;
  totalSupply: string;
  createdAt: string;
  assetType?: string;
  metadata?: { logo?: string } | null;
}

interface QualificationProfile {
  fullName?: string;
  country?: string;
  investorType?: string;
  accreditation?: string;
}

interface Qualification {
  id: string;
  investorId: string;
  status: string;
  createdAt: string;
  approvedAt?: string;
  reviewedAt?: string;
  profile?: QualificationProfile;
}

interface QualificationStats {
  total: number;
  pending: number;
  under_review: number;
  approved: number;
  rejected: number;
  expired: number;
}

interface Payment {
  id: string;
  tokenId: string;
  tokenAmount: string;
  fiatAmount: string;
  status: string;
  createdAt: string;
  userId: string;
}

const usd = (n: number, decimals = 0) =>
  `$${n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;

export default function IssuerDashboardPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { resolvedTheme } = useTheme();
  const [tokens, setTokens] = useState<Token[]>([]);
  const [qualifications, setQualifications] = useState<Qualification[]>([]);
  const [qualStats, setQualStats] = useState<QualificationStats | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);

  const headers = user?.id ? { 'x-user-id': user.id } : {};
  const series = seriesFor(resolvedTheme);
  const colorFor = (assetType?: string) => {
    const i = ASSET_CLASSES.findIndex((c) => c.key === assetType);
    return i === -1 ? 'rgb(var(--text-muted))' : series[i];
  };

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const [tokensRes, qualsRes, statsRes, paymentsRes] = await Promise.allSettled([
          api.get('/tokens'),
          api.get('/kyc/qualifications', { headers, params: { limit: 100 } }),
          api.get('/kyc/qualifications/stats', { headers }),
          api.get('/payments/all'),
        ]);

        if (tokensRes.status === 'fulfilled') {
          const data = tokensRes.value.data?.data || tokensRes.value.data || [];
          setTokens(Array.isArray(data) ? data : []);
        }
        if (qualsRes.status === 'fulfilled') {
          const data = qualsRes.value.data?.data || qualsRes.value.data || [];
          setQualifications(Array.isArray(data) ? data : []);
        }
        if (statsRes.status === 'fulfilled') {
          const data = statsRes.value.data?.data || statsRes.value.data || null;
          setQualStats(data);
        }
        if (paymentsRes.status === 'fulfilled') {
          const data = paymentsRes.value.data?.data || paymentsRes.value.data || [];
          setPayments(Array.isArray(data) ? data : []);
        }
      } catch {
        // fail silently
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [user?.id]);

  const settledPayments = payments.filter((p) => p.status === 'completed' || p.status === 'pending');
  const totalTokens = tokens.length;
  const activeTokens = tokens.filter((t) => t.status === 'active').length;
  const totalInvestors = qualStats?.total ?? qualifications.length;
  const pendingKyc =
    (qualStats ? qualStats.pending + qualStats.under_review : null) ??
    qualifications.filter((s) => s.status === 'pending' || s.status === 'under_review').length;
  const approvedKyc =
    qualStats?.approved ?? qualifications.filter((s) => s.status === 'approved').length;
  const totalRevenue = settledPayments.reduce((sum, p) => sum + (parseFloat(p.fiatAmount) || 0), 0);
  const avgDealSize = settledPayments.length > 0 ? totalRevenue / settledPayments.length : 0;

  // ── Revenue trend: 14 days, cumulative, one series ──────────────────────
  const dailyRevenue = Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (13 - i));
    const key = d.toISOString().slice(0, 10);
    const amount = settledPayments
      .filter((p) => new Date(p.createdAt).toISOString().slice(0, 10) === key)
      .reduce((sum, p) => sum + (parseFloat(p.fiatAmount) || 0), 0);
    return { date: d, amount };
  });
  let running = 0;
  const trendData = dailyRevenue.map(({ date, amount }) => {
    running += amount;
    return {
      label: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      value: running,
      daily: amount,
    };
  });
  const last7 = dailyRevenue.slice(7).reduce((a, b) => a + b.amount, 0);
  const prev7 = dailyRevenue.slice(0, 7).reduce((a, b) => a + b.amount, 0);
  const revenueChangePct = prev7 > 0 ? ((last7 - prev7) / prev7) * 100 : null;

  // ── Portfolio mix ───────────────────────────────────────────────────────
  const classified = tokens.filter((t) => ASSET_CLASSES.some((c) => c.key === t.assetType)).length;
  const mix = ASSET_CLASSES.map((cat, i) => ({
    key: cat.key,
    name: cat.label,
    value: tokens.filter((t) => t.assetType === cat.key).length,
    color: series[i],
  })).filter((d) => d.value > 0);

  // ── Recent activity, sorted on real timestamps ──────────────────────────
  const recentActivity = [
    ...qualifications.slice(0, 6).map((q) => ({
      id: `qual-${q.id}`,
      action:
        q.status === 'approved'
          ? 'KYC approved'
          : q.status === 'rejected'
          ? 'KYC rejected'
          : 'New qualification request',
      detail: q.profile?.fullName || q.investorId.slice(0, 8),
      at: new Date(q.reviewedAt || q.approvedAt || q.createdAt),
      type: 'kyc' as const,
    })),
    ...payments.slice(0, 6).map((p) => {
      const token = tokens.find((t) => t.id === p.tokenId);
      return {
        id: `pay-${p.id}`,
        action: `Purchase · ${parseFloat(p.tokenAmount).toLocaleString('en-US')} ${token?.symbol || '—'}`,
        detail: usd(parseFloat(p.fiatAmount) || 0, 2),
        at: new Date(p.createdAt),
        type: 'transaction' as const,
      };
    }),
    ...tokens
      .filter((t) => t.status === 'active')
      .slice(0, 4)
      .map((t) => ({
        id: `token-${t.id}`,
        action: `Token deployed · ${t.name}`,
        detail: t.symbol,
        at: new Date(t.createdAt),
        type: 'token' as const,
      })),
  ]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, 7);

  const kpis = [
    {
      label: 'Total Raised',
      value: usd(totalRevenue, 2),
      hint: `${settledPayments.length} settled order${settledPayments.length === 1 ? '' : 's'}`,
      icon: Wallet,
      tone: 'accent' as const,
      delta: revenueChangePct,
      onClick: () => router.push('/issuer/analytics'),
    },
    {
      label: 'Tokenized Assets',
      value: totalTokens.toLocaleString('en-US'),
      hint: `${activeTokens} active on-chain`,
      icon: Coins,
      tone: 'accent' as const,
      onClick: () => router.push('/issuer/tokens'),
    },
    {
      label: 'Investors',
      value: totalInvestors.toLocaleString('en-US'),
      hint: `${approvedKyc} KYC approved`,
      icon: Users,
      tone: 'success' as const,
      onClick: () => router.push('/issuer/investors'),
    },
    {
      label: 'Avg Deal Size',
      value: usd(avgDealSize),
      hint: 'Across settled orders',
      icon: ShoppingCart,
      tone: 'accent' as const,
      onClick: () => router.push('/issuer/analytics'),
    },
  ];

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-16 w-72 animate-pulse rounded-xl bg-surface-header" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded-card bg-surface-header" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="h-80 animate-pulse rounded-card bg-surface-header lg:col-span-2" />
          <div className="h-80 animate-pulse rounded-card bg-surface-header" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-10">
      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="kicker">Issuer Overview</p>
          <h1 className="page-title mt-1">Dashboard</h1>
          <p className="mt-1 text-muted">
            Welcome back{user?.name ? `, ${user.name.split(' ')[0]}` : ''}. Issue, manage and monitor compliant
            tokenized offerings from one place.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => router.push('/issuer/tokens')} className="btn-secondary">
            View Tokens
          </button>
          <button onClick={() => router.push('/issuer/tokens/create')} className="btn-primary">
            <Plus className="h-4 w-4" />
            Create Token
          </button>
        </div>
      </div>

      {/* ── Compliance notice ───────────────────────────────────────────── */}
      {pendingKyc > 0 && (
        <div className="card flex flex-wrap items-center gap-4 p-4">
          <div className="icon-chip bg-warning-100 text-warning">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="min-w-[14rem] flex-1">
            <p className="text-sm font-semibold text-ink">
              {pendingKyc} qualification request{pendingKyc > 1 ? 's' : ''} awaiting review
            </p>
            <p className="text-sm text-muted">
              Approve investor applications to deploy ONCHAINID and unlock primary issuance and secondary transfers.
            </p>
          </div>
          <button onClick={() => router.push('/issuer/kyc-review')} className="btn-primary ml-auto whitespace-nowrap">
            Review Now
          </button>
        </div>
      )}

      {/* ── KPI row ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <div
              key={kpi.label}
              onClick={kpi.onClick}
              className="card p-5 cursor-pointer transition-colors hover:border-accent"
            >
              <div className="flex items-start justify-between gap-3">
                <p className="label">{kpi.label}</p>
                <div className={`icon-chip ${kpi.tone === 'success' ? 'bg-success-100 text-success' : ''}`}>
                  <Icon className="h-5 w-5" />
                </div>
              </div>
              <p className="stat-value mt-3">{kpi.value}</p>
              <div className="mt-1 flex items-center gap-2">
                {kpi.delta !== undefined && kpi.delta !== null ? (
                  <span
                    className={kpi.delta >= 0 ? 'badge-success' : 'badge-danger'}
                    title="Last 7 days vs. the 7 days before"
                  >
                    {kpi.delta >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                    {Math.abs(kpi.delta).toFixed(1)}%
                  </span>
                ) : null}
                <p className="stat-label">{kpi.hint}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Revenue trend + portfolio mix ───────────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Cumulative capital raised */}
        <div className="card p-6 lg:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3>Capital Raised</h3>
              <p className="stat-label mt-0.5">Cumulative, last 14 days</p>
            </div>
            <button
              onClick={() => router.push('/issuer/analytics')}
              className="btn-ghost h-auto gap-1 px-2 py-1 text-xs"
            >
              Analytics
              <ArrowUpRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="mt-5 h-56 w-full">
            {totalRevenue === 0 ? (
              <div className="flex h-full flex-col items-center justify-center rounded-xl border border-dashed border-line text-center">
                <div className="icon-chip">
                  <TrendingUp className="h-5 w-5" />
                </div>
                <p className="mt-2 text-sm font-semibold text-ink">No settled orders yet</p>
                <p className="stat-label mt-0.5">Raised capital will chart here as orders settle</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="raisedFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="rgb(var(--accent))" stopOpacity={0.22} />
                      <stop offset="100%" stopColor="rgb(var(--accent))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border-line))" vertical={false} />
                  <XAxis
                    dataKey="label"
                    interval={2}
                    tickLine={false}
                    axisLine={{ stroke: 'rgb(var(--border-line))' }}
                    tick={{ fill: 'rgb(var(--text-muted))', fontSize: 11 }}
                  />
                  <YAxis
                    width={56}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: 'rgb(var(--text-muted))', fontSize: 11 }}
                    tickFormatter={(v: number) => (v >= 1000 ? `$${Math.round(v / 1000)}k` : `$${v}`)}
                  />
                  <Tooltip
                    contentStyle={chartTooltipStyle}
                    cursor={{ stroke: 'rgb(var(--text-muted))', strokeDasharray: '3 3' }}
                    formatter={(value: number) => [usd(value, 2), 'Cumulative']}
                    labelStyle={{ color: 'rgb(var(--text-muted))' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="rgb(var(--accent))"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 2, stroke: 'rgb(var(--card))' }}
                    fill="url(#raisedFill)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 border-t border-line pt-4 sm:grid-cols-3">
            <div className="tile">
              <p className="stat-label">Last 7 days</p>
              <p className="mt-0.5 text-base font-bold text-ink">{usd(last7, 2)}</p>
            </div>
            <div className="tile">
              <p className="stat-label">Previous 7 days</p>
              <p className="mt-0.5 text-base font-bold text-ink">{usd(prev7, 2)}</p>
            </div>
            <div className="tile">
              <p className="stat-label">Pending KYC</p>
              <p className="mt-0.5 text-base font-bold text-ink">{pendingKyc}</p>
            </div>
          </div>
        </div>

        {/* Portfolio mix */}
        <div className="card p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3>Portfolio Mix</h3>
              <p className="stat-label mt-0.5">Tokens by asset class</p>
            </div>
          </div>

          {mix.length === 0 ? (
            <div className="mt-6 flex flex-col items-center justify-center rounded-xl border border-dashed border-line py-10 text-center">
              <div className="icon-chip">
                <PieChartIcon className="h-5 w-5" />
              </div>
              <p className="mt-2 text-sm font-semibold text-ink">No assets allocated yet</p>
              <p className="stat-label mt-0.5">Diversification appears once tokens are classified</p>
            </div>
          ) : (
            <>
              <div className="relative mx-auto mt-4 h-40 w-40">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={mix}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={52}
                      outerRadius={76}
                      paddingAngle={2}
                      stroke="rgb(var(--card))"
                      strokeWidth={2}
                    >
                      {mix.map((entry) => (
                        <Cell key={entry.key} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={chartTooltipStyle}
                      formatter={(value: number, name: string) => [
                        `${value} token${value === 1 ? '' : 's'}`,
                        name,
                      ]}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <p className="text-2xl font-extrabold tracking-tight text-ink">{classified}</p>
                  <p className="stat-label">tokens</p>
                </div>
              </div>

              {/* Legend doubles as the table view — every slice is labelled,
                  so identity never rests on colour alone. */}
              <ul className="mt-5 space-y-2 border-t border-line pt-4">
                {mix.map((entry) => (
                  <li key={entry.key} className="flex items-center justify-between gap-3 text-sm">
                    <span className="flex min-w-0 items-center gap-2 text-muted">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: entry.color }}
                      />
                      <span className="truncate">{entry.name}</span>
                    </span>
                    <span className="shrink-0 font-semibold text-ink">
                      {entry.value}
                      <span className="ml-1.5 font-normal text-muted">
                        {Math.round((entry.value / classified) * 100)}%
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>

      {/* ── Offerings table + activity ──────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-6 py-5">
            <div>
              <h3>Your Offerings</h3>
              <p className="stat-label mt-0.5">Tokenized real-world assets you have issued</p>
            </div>
            <button onClick={() => router.push('/issuer/tokens')} className="btn-ghost h-auto gap-1 px-2 py-1 text-xs">
              View all
              <ArrowUpRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {tokens.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
              <div className="icon-chip h-12 w-12">
                <Coins className="h-6 w-6" />
              </div>
              <h4 className="mt-3 text-base font-bold text-ink">No token offerings yet</h4>
              <p className="mt-1 max-w-sm text-sm text-muted">
                Tokenize your first real-world asset with built-in ERC-3643 compliance and automated KYC rules.
              </p>
              <button onClick={() => router.push('/issuer/tokens/create')} className="btn-primary mt-4">
                <Plus className="h-4 w-4" />
                Create Your First Token
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Asset</th>
                    <th>Class</th>
                    <th>Status</th>
                    <th className="!text-right">Supply</th>
                    <th className="!text-right">Raised</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {tokens.slice(0, 6).map((t) => {
                    const cls = ASSET_CLASSES.find((c) => c.key === t.assetType);
                    const Icon = cls?.icon || Coins;
                    const raised = settledPayments
                      .filter((p) => p.tokenId === t.id)
                      .reduce((sum, p) => sum + (parseFloat(p.fiatAmount) || 0), 0);
                    const share = totalRevenue > 0 ? (raised / totalRevenue) * 100 : 0;
                    return (
                      <tr key={t.id} className="transition-colors hover:bg-surface-header">
                        <td>
                          <div className="flex items-center gap-3">
                            {t.metadata?.logo ? (
                              <img
                                src={getMediaUrl(t.metadata.logo)}
                                alt=""
                                className="h-9 w-9 shrink-0 rounded-[10px] object-cover"
                              />
                            ) : (
                              <span
                                className="icon-chip"
                                style={{ color: colorFor(t.assetType), backgroundColor: 'rgb(var(--header-bg))' }}
                              >
                                <Icon className="h-5 w-5" />
                              </span>
                            )}
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-ink">{t.name}</p>
                              <p className="font-mono text-xs text-muted">{t.symbol}</p>
                            </div>
                          </div>
                        </td>
                        <td className="whitespace-nowrap text-muted">{cls?.label || '—'}</td>
                        <td>
                          <span
                            className={
                              t.status === 'active'
                                ? 'badge-success'
                                : t.status === 'deploying'
                                  ? 'badge-neutral'
                                  : 'badge-warning'
                            }
                          >
                            <span className="capitalize">{t.status}</span>
                          </span>
                        </td>
                        <td className="whitespace-nowrap text-right font-semibold text-ink">
                          {(parseInt(t.totalSupply) || 0).toLocaleString('en-US')}
                        </td>
                        <td className="min-w-[8rem] text-right">
                          <p className="font-semibold text-ink">{usd(raised)}</p>
                          <div className="meter mt-1.5" title={`${share.toFixed(0)}% of total raised`}>
                            <span style={{ width: `${share}%` }} />
                          </div>
                        </td>
                        <td className="text-right">
                          <button
                            onClick={() => router.push(`/issuer/tokens/${t.id}`)}
                            className="btn-secondary whitespace-nowrap px-3 py-1.5 text-xs"
                          >
                            Manage
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Recent activity */}
        <div className="card p-6">
          <h3>Recent Activity</h3>
          <p className="stat-label mt-0.5">Orders, deployments and KYC events</p>

          {recentActivity.length === 0 ? (
            <div className="mt-6 flex flex-col items-center justify-center rounded-xl border border-dashed border-line py-10 text-center">
              <div className="icon-chip">
                <Clock className="h-5 w-5" />
              </div>
              <p className="mt-2 text-sm font-semibold text-ink">No activity yet</p>
              <p className="stat-label mt-0.5">Events appear here as they happen</p>
            </div>
          ) : (
            <ul className="mt-4 divide-y divide-line">
              {recentActivity.map((activity) => (
                <li key={activity.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <span
                    className={`icon-chip h-9 w-9 ${
                      activity.type === 'kyc'
                        ? 'bg-warning-100 text-warning'
                        : activity.type === 'transaction'
                          ? 'bg-success-100 text-success'
                          : ''
                    }`}
                  >
                    {activity.type === 'kyc' && <ShieldCheck className="h-4 w-4" />}
                    {activity.type === 'transaction' && <ArrowUpRight className="h-4 w-4" />}
                    {activity.type === 'token' && <Coins className="h-4 w-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">{activity.action}</p>
                    <p className="stat-label">
                      {activity.at.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </p>
                  </div>
                  <p className="shrink-0 text-sm font-semibold text-ink">{activity.detail}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* ── Asset classes ───────────────────────────────────────────────── */}
      <div>
        <div className="mb-4">
          <h3>Asset Classes</h3>
          <p className="stat-label mt-0.5">Explore tokenized opportunities across asset classes</p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {ASSET_CLASSES.map((cat, i) => {
            const Icon = cat.icon;
            const count = tokens.filter((t) => t.assetType === cat.key).length;
            return (
              <button
                key={cat.key}
                onClick={() => router.push('/issuer/tokens')}
                className="panel p-4 text-left transition-colors hover:border-accent"
              >
                <span className="icon-chip" style={{ color: series[i], backgroundColor: 'rgb(var(--header-bg))' }}>
                  <Icon className="h-5 w-5" />
                </span>
                <p className="mt-3 text-sm font-bold text-ink">{cat.label}</p>
                <p className="stat-label">
                  {count} {count === 1 ? 'token' : 'tokens'}
                </p>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
