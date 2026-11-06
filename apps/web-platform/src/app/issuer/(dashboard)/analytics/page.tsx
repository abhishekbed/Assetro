'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  BarChart3,
  TrendingUp,
  Users,
  Coins,
  DollarSign,
  Globe,
  Loader2,
  RefreshCw,
  CreditCard,
  Layers,
} from 'lucide-react';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';

interface DailyPoint {
  date: string;
  value: number;
}
interface TokenRevenue {
  tokenId: string;
  name: string;
  symbol: string;
  revenue: number;
  payments: number;
}
interface InvestorBreakdown {
  individual: number;
  institutional: number;
  accredited: number;
}
interface CountryBreakdown {
  country: string;
  count: number;
}
interface OverviewStats {
  totalTokens: number;
  activeTokens: number;
  totalHolders: number;
  totalRevenue: number;
  totalTokensIssued: number;
  recentPayments: number;
}

const CHART_COLORS = ['rgb(var(--accent))', 'rgb(var(--accent2))', '#f59e0b', '#818cf8', '#ec4899', '#06b6d4', '#f97316'];

const PIE_COLORS: Record<string, string> = {
  individual: 'rgb(var(--accent))',
  accredited: 'rgb(var(--accent2))',
  institutional: '#818cf8',
};

function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function fmtUSD(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  iconBg,
  iconColor,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
}) {
  const valStr = String(value);
  // Dynamically adapt font size based on text length so long values (e.g. 10,000,000) fit cleanly without clipping
  const valueFontSize =
    valStr.length > 13
      ? 'text-base sm:text-lg'
      : valStr.length > 10
      ? 'text-lg sm:text-xl'
      : valStr.length > 7
      ? 'text-xl sm:text-2xl'
      : 'text-2xl sm:text-3xl';

  return (
    <div className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-900/60 p-3.5 sm:p-4 shadow-xl transition-all duration-300 hover:-translate-y-1 hover:border-slate-700 hover:bg-slate-900/90">
      <div className="flex items-center justify-between gap-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 group-hover:text-slate-300 transition-colors leading-tight">
          {label}
        </p>
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${iconBg} ${iconColor} transition-transform duration-300 group-hover:scale-110`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="mt-3">
        <p
          className={`${valueFontSize} font-extrabold tracking-tight text-ink leading-none whitespace-nowrap`}
          title={valStr}
        >
          {value}
        </p>
        {sub ? (
          <p className="mt-1.5 text-[11px] font-medium text-slate-500 group-hover:text-slate-400 transition-colors leading-none">
            {sub}
          </p>
        ) : (
          <div className="h-3.5" />
        )}
      </div>
    </div>
  );
}

function ChartShell({
  title,
  subtitle,
  children,
  loading,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  loading: boolean;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl transition-all duration-300 hover:border-slate-700/80">
      <div className="mb-6 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between border-b border-slate-800/80 pb-4">
        <div>
          <h3 className="text-base font-bold text-ink tracking-tight">{title}</h3>
          {subtitle && <p className="text-xs text-slate-400">{subtitle}</p>}
        </div>
      </div>
      {loading ? (
        <div className="flex h-52 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-cyan-400" />
        </div>
      ) : (
        children
      )}
    </div>
  );
}

const RANGE_OPTIONS = [
  { label: '7 Days', days: 7 },
  { label: '30 Days', days: 30 },
  { label: '90 Days', days: 90 },
];

export default function AnalyticsPage() {
  const { user } = useAuthStore();
  const headers = user?.id ? { 'x-user-id': user.id } : {};

  const [overview, setOverview] = useState<OverviewStats | null>(null);
  const [revenueByDay, setRevenueByDay] = useState<DailyPoint[]>([]);
  const [holdersByDay, setHoldersByDay] = useState<DailyPoint[]>([]);
  const [volumeByDay, setVolumeByDay] = useState<DailyPoint[]>([]);
  const [revenueByToken, setRevenueByToken] = useState<TokenRevenue[]>([]);
  const [investorBreakdown, setInvestorBreakdown] = useState<InvestorBreakdown | null>(null);
  const [countryBreakdown, setCountryBreakdown] = useState<CountryBreakdown[]>([]);
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [loadingCharts, setLoadingCharts] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [days, setDays] = useState(30);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const loadOverview = useCallback(async () => {
    setLoadingOverview(true);
    try {
      const res = await api.get('/analytics/overview', { headers });
      setOverview(res.data?.data ?? null);
    } catch {
      setOverview(null);
    } finally {
      setLoadingOverview(false);
    }
  }, [user?.id]);

  const loadCharts = useCallback(async () => {
    setLoadingCharts(true);
    try {
      const [rev, holders, vol, byToken, breakdown, countries] = await Promise.all([
        api.get(`/analytics/revenue-by-day?days=${days}`, { headers }),
        api.get(`/analytics/holders-by-day?days=${days}`, { headers }),
        api.get(`/analytics/payment-volume-by-day?days=${days}`, { headers }),
        api.get('/analytics/revenue-by-token', { headers }),
        api.get('/analytics/investor-breakdown', { headers }),
        api.get('/analytics/country-breakdown', { headers }),
      ]);
      setRevenueByDay(rev.data?.data ?? []);
      setHoldersByDay(holders.data?.data ?? []);
      setVolumeByDay(vol.data?.data ?? []);
      setRevenueByToken(byToken.data?.data ?? []);
      setInvestorBreakdown(breakdown.data?.data ?? null);
      setCountryBreakdown(countries.data?.data ?? []);
      setLastUpdated(new Date());
    } catch {
      // Leave previous data
    } finally {
      setLoadingCharts(false);
    }
  }, [user?.id, days]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    loadCharts();
  }, [loadCharts]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([loadOverview(), loadCharts()]);
    setIsRefreshing(false);
  };

  const pieData = investorBreakdown
    ? [
        { name: 'Individual', value: investorBreakdown.individual },
        { name: 'Accredited', value: investorBreakdown.accredited },
        { name: 'Institutional', value: investorBreakdown.institutional },
      ].filter((d) => d.value > 0)
    : [];

  const totalInvestors = pieData.reduce((s, d) => s + d.value, 0);

  // Slim the x-axis labels for 30/90d ranges
  const tickInterval = days <= 7 ? 0 : days <= 30 ? 4 : 14;

  const customTooltipStyle = {
    backgroundColor: 'rgb(var(--card))',
    borderColor: 'rgb(var(--border-line))',
    borderRadius: '12px',
    color: 'rgb(var(--text-main))',
    fontSize: '12px',
    boxShadow: 'var(--shadow-card)',
  };

  return (
    <div className="w-full min-w-0 space-y-6 pb-12 selection:bg-cyan-500 selection:text-slate-950">
      {/* ── Header ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-extrabold tracking-tight text-ink">
              Platform Analytics
            </h1>
            <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-0.5 text-xs font-semibold text-cyan-300">
              Live Metrics
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-400">
            Real-time telemetry and compliance metrics across your digital securities.
            {lastUpdated && (
              <span className="ml-2 inline-flex items-center gap-1.5 font-mono text-xs text-slate-500">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
                Updated {lastUpdated.toLocaleTimeString()}
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Time range selector */}
          <div className="inline-flex rounded-xl border border-slate-800 bg-slate-900/80 p-1">
            {RANGE_OPTIONS.map((o) => (
              <button
                key={o.days}
                onClick={() => setDays(o.days)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-200 ${
 days === o.days
 ? 'bg-accent text-slate-950 shadow-md' : 'text-slate-400 hover:text-btn-text' }`}
              >
                {o.label}
              </button>
            ))}
          </div>

          {/* Refresh Button */}
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/80 px-4 py-2 text-xs font-semibold text-slate-200 transition-all hover:border-slate-700 hover:bg-slate-800 hover:text-ink disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 text-cyan-400 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* ── Summary Stats Cards (6 metrics) ── */}
      {loadingOverview ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-28 rounded-2xl border border-slate-800 bg-slate-900/40 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          <StatCard
            label="Total Tokens"
            value={overview?.totalTokens ?? 0}
            icon={Coins}
            iconBg="bg-blue-500/10"
            iconColor="text-blue-400"
          />
          <StatCard
            label="Active Tokens"
            value={overview?.activeTokens ?? 0}
            icon={TrendingUp}
            iconBg="bg-emerald-500/10"
            iconColor="text-emerald-400"
          />
          <StatCard
            label="Total Holders"
            value={(overview?.totalHolders ?? 0).toLocaleString()}
            icon={Users}
            iconBg="bg-purple-500/10"
            iconColor="text-purple-400"
          />
          <StatCard
            label="Total Revenue"
            value={fmtUSD(overview?.totalRevenue ?? 0)}
            sub="cumulative"
            icon={DollarSign}
            iconBg="bg-amber-500/10"
            iconColor="text-amber-400"
          />
          <StatCard
            label="Tokens Issued"
            value={(overview?.totalTokensIssued ?? 0).toLocaleString()}
            icon={BarChart3}
            iconBg="bg-indigo-500/10"
            iconColor="text-indigo-400"
          />
          <StatCard
            label="Payments"
            value={(overview?.recentPayments ?? 0).toLocaleString()}
            sub="completed"
            icon={CreditCard}
            iconBg="bg-teal-500/10"
            iconColor="text-teal-400"
          />
        </div>
      )}

      {/* ── Revenue Over Time Chart ── */}
      <ChartShell
        title="Revenue Over Time (USD)"
        subtitle="Gross investment and subscription volume across all issued tokens"
        loading={loadingCharts}
      >
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={revenueByDay} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border-line))" />
            <XAxis
              dataKey="date"
              tickFormatter={fmtDate}
              stroke="rgb(var(--text-muted))"
              tick={{ fill: 'rgb(var(--text-muted))', fontSize: 11 }}
              interval={tickInterval}
            />
            <YAxis
              tickFormatter={(v) => fmtUSD(v)}
              stroke="rgb(var(--text-muted))"
              tick={{ fill: 'rgb(var(--text-muted))', fontSize: 11 }}
              width={65}
            />
            <Tooltip
              contentStyle={customTooltipStyle}
              formatter={(v: number) => [fmtUSD(v), 'Revenue']}
              labelFormatter={fmtDate}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke="rgb(var(--accent))"
              strokeWidth={2.5}
              dot={{ r: 3, fill: 'rgb(var(--accent))', strokeWidth: 0 }}
              activeDot={{ r: 6, fill: 'rgb(var(--accent2))', stroke: 'rgb(var(--card))', strokeWidth: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </ChartShell>

      {/* ── Two-Column: Holders Over Time & Transaction Volume ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartShell
          title="Holder Count Growth"
          subtitle="Net verified KYC wallet addresses holding security tokens"
          loading={loadingCharts}
        >
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={holdersByDay} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border-line))" />
              <XAxis
                dataKey="date"
                tickFormatter={fmtDate}
                stroke="rgb(var(--text-muted))"
                tick={{ fill: 'rgb(var(--text-muted))', fontSize: 11 }}
                interval={tickInterval}
              />
              <YAxis stroke="rgb(var(--text-muted))" tick={{ fill: 'rgb(var(--text-muted))', fontSize: 11 }} width={40} />
              <Tooltip
                contentStyle={customTooltipStyle}
                labelFormatter={fmtDate}
                formatter={(v: number) => [v.toLocaleString(), 'Holders']}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke="rgb(var(--accent2))"
                strokeWidth={2.5}
                dot={{ r: 3, fill: 'rgb(var(--accent2))', strokeWidth: 0 }}
                activeDot={{ r: 6, fill: '#34d399', stroke: 'rgb(var(--card))', strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartShell>

        <ChartShell
          title="Daily Transaction Volume"
          subtitle="Total secondary transfers and primary settlement transactions"
          loading={loadingCharts}
        >
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={volumeByDay} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border-line))" />
              <XAxis
                dataKey="date"
                tickFormatter={fmtDate}
                stroke="rgb(var(--text-muted))"
                tick={{ fill: 'rgb(var(--text-muted))', fontSize: 11 }}
                interval={tickInterval}
              />
              <YAxis stroke="rgb(var(--text-muted))" tick={{ fill: 'rgb(var(--text-muted))', fontSize: 11 }} width={40} />
              <Tooltip
                contentStyle={customTooltipStyle}
                labelFormatter={fmtDate}
                formatter={(v: number) => [v.toLocaleString(), 'Transactions']}
              />
              <Bar dataKey="value" fill="#f59e0b" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartShell>
      </div>

      {/* ── Revenue by Token ── */}
      <ChartShell
        title="Revenue by Security Token"
        subtitle="Distribution of incoming capital grouped by active token smart contract"
        loading={loadingCharts}
      >
        {revenueByToken.length === 0 ? (
          <div className="flex h-36 flex-col items-center justify-center text-center text-sm text-slate-500">
            <Layers className="h-8 w-8 text-slate-600 mb-2" />
            <p>No token revenue records recorded yet for this time window</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(200, revenueByToken.length * 48)}>
            <BarChart
              data={revenueByToken}
              layout="vertical"
              margin={{ top: 10, right: 40, left: 20, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border-line))" horizontal={false} />
              <XAxis
                type="number"
                tickFormatter={(v) => fmtUSD(v)}
                stroke="rgb(var(--text-muted))"
                tick={{ fill: 'rgb(var(--text-muted))', fontSize: 11 }}
              />
              <YAxis
                type="category"
                dataKey="symbol"
                stroke="rgb(var(--text-muted))"
                tick={{ fill: 'rgb(var(--text-main))', fontSize: 12, fontWeight: 600 }}
                width={70}
              />
              <Tooltip
                contentStyle={customTooltipStyle}
                formatter={(v: number) => [fmtUSD(v), 'Revenue']}
              />
              <Bar dataKey="revenue" radius={[0, 4, 4, 0]}>
                {revenueByToken.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartShell>

      {/* ── Two-Column: Investor Type Breakdown & Country Distribution ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Investor Breakdown */}
        <ChartShell
          title="Investor Classification Breakdown"
          subtitle="Share of accredited, institutional, and retail investor participants"
          loading={loadingCharts}
        >
          {pieData.length === 0 ? (
            <div className="flex h-48 flex-col items-center justify-center text-center text-sm text-slate-500">
              <Users className="h-8 w-8 text-slate-600 mb-2" />
              <p>No verified investor profiles logged yet</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-6 sm:flex-row">
              <ResponsiveContainer width="100%" height={190} className="sm:w-1/2">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    dataKey="value"
                    paddingAngle={4}
                  >
                    {pieData.map((entry, i) => (
                      <Cell key={i} fill={PIE_COLORS[entry.name.toLowerCase()] ?? CHART_COLORS[i]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={customTooltipStyle}
                    formatter={(v: number) => [
                      `${v} investors (${totalInvestors ? ((v / totalInvestors) * 100).toFixed(1) : 0}%)`,
                      '',
                    ]}
                  />
                </PieChart>
              </ResponsiveContainer>

              <div className="w-full flex-1 space-y-2.5">
                {pieData.map((entry, i) => {
                  const color = PIE_COLORS[entry.name.toLowerCase()] ?? CHART_COLORS[i];
                  const percentage = totalInvestors ? ((entry.value / totalInvestors) * 100).toFixed(0) : 0;
                  return (
                    <div
                      key={i}
                      className="flex items-center justify-between rounded-xl border border-slate-800/80 bg-slate-950/40 p-2.5 text-xs transition-colors hover:border-slate-700/80"
                    >
                      <div className="flex items-center gap-2">
                        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: color }} />
                        <span className="font-medium text-slate-300">{entry.name}</span>
                      </div>
                      <div className="text-right font-mono">
                        <span className="font-bold text-ink">{entry.value}</span>
                        <span className="ml-1 text-slate-500">({percentage}%)</span>
                      </div>
                    </div>
                  );
                })}
                <div className="flex items-center justify-between border-t border-slate-800/80 pt-2 text-xs font-semibold text-slate-400">
                  <span>Total Capital Allocators</span>
                  <span className="font-mono text-cyan-400">{totalInvestors}</span>
                </div>
              </div>
            </div>
          )}
        </ChartShell>

        {/* Country distribution */}
        <ChartShell
          title="Investor Geographic Distribution"
          subtitle="Top jurisdictional domiciles for onboarded security token holders"
          loading={loadingCharts}
        >
          {countryBreakdown.length === 0 ? (
            <div className="flex h-48 flex-col items-center justify-center text-center text-sm text-slate-500">
              <Globe className="h-8 w-8 text-slate-600 mb-2" />
              <p>No jurisdictional data reported yet</p>
            </div>
          ) : (
            <div className="space-y-3 overflow-y-auto max-h-56 pr-2">
              {countryBreakdown.map((c, i) => {
                const maxCount = countryBreakdown[0].count;
                const pct = (c.count / maxCount) * 100;
                return (
                  <div key={i} className="flex items-center gap-3 text-xs">
                    <span className="w-12 shrink-0 text-right font-mono font-bold uppercase text-cyan-300">
                      {c.country}
                    </span>
                    <div className="flex-1 h-3.5 rounded-full bg-slate-800/80 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-accent transition-all duration-500"
                        style={{ width: `${Math.max(pct, 6)}%` }}
                      />
                    </div>
                    <span className="w-10 shrink-0 text-right font-mono font-medium text-slate-300">
                      {c.count}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </ChartShell>
      </div>
    </div>
  );
}
