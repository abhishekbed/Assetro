'use client';

import { useMemo, useEffect, useState } from 'react';
import {
  Wallet,
  ArrowLeftRight,
  ShieldCheck,
  ShieldAlert,
  AlertCircle,
  XCircle,
  Check,
  Clock,
  Loader2,
  ShoppingCart,
  PieChart as PieChartIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useTheme } from 'next-themes';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { useAuthStore } from '@/store/auth.store';
import api from '@/lib/api';
import { getAccount } from 'wagmi/actions';
import { wagmiConfig } from '@/lib/wagmi-config';
import { InvestorPosition } from '@/lib/investor-positions';
import { seriesFor, otherFor, chartTooltipStyle } from '@/lib/chart-colors';

/** Allocation slices beyond this fold into a single neutral "Other". */
const MAX_SLICES = 6;

interface Payment {
  id: string;
  tokenId: string;
  tokenAmount: string;
  fiatAmount: string;
  currency: string;
  status: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

interface Token {
  id: string;
  name: string;
  symbol: string;
  totalSupply: number;
  assetType: string;
  status: string;
}

interface Qualification {
  id: string;
  status: string;
  rejectedReason?: string | null;
  reviewNotes?: string | null;
}

interface ChainClaim {
  topic: number;
  exists_on_chain: boolean;
  signature_valid: boolean;
  issuer_trusted: boolean;
}

interface ChainTokenStatus {
  token_id: string;
  is_verified: boolean;
}

interface ChainVerification {
  wallet_address: string;
  fully_verified: boolean;
  identity_address: string | null;
  contract_deployed: boolean;
  claims: ChainClaim[];
  token_whitelist_status: ChainTokenStatus[];
}

const usd = (n: number, decimals = 2) =>
  `$${n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;

/** A long wallet-derived display name should not run the header off the page. */
const shortenName = (name?: string | null) => {
  if (!name) return 'Investor';
  const match = name.match(/^(0x[0-9a-fA-F]{4})[0-9a-fA-F]+([0-9a-fA-F]{4})$/);
  return match ? `${match[1]}…${match[2]}` : name;
};

export default function DashboardPage() {
  const { user, setUser, kycRefreshTick } = useAuthStore();
  const { resolvedTheme } = useTheme();
  const address = getAccount(wagmiConfig).address;
  const [tokens, setTokens] = useState<Token[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [positions, setPositions] = useState<InvestorPosition[]>([]);
  const [tokensLoading, setTokensLoading] = useState(true);
  const [paymentsLoading, setPaymentsLoading] = useState(true);
  const [positionsLoading, setPositionsLoading] = useState(true);
  const [kycStatus, setKycStatus] = useState<string | null>(null);
  const [kycRejectionReason, setKycRejectionReason] = useState<string | null>(null);
  const [kycLoading, setKycLoading] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);
  const [chainVerification, setChainVerification] = useState<ChainVerification | null>(null);
  const [chainLoading, setChainLoading] = useState(false);

  useEffect(() => {
    const fetchTokens = async () => {
      try {
        const response = await api.get('/tokens');
        const data = response.data;
        if (data.success && Array.isArray(data.data)) {
          setTokens(data.data);
        }
      } catch {
        // Silently fail
      } finally {
        setTokensLoading(false);
      }
    };

    const fetchPayments = async () => {
      if (!user?.id) {
        setPaymentsLoading(false);
        return;
      }
      try {
        const response = await api.get('/payments/history', {
          headers: { 'x-user-id': user.id },
        });
        const data = response.data?.data || response.data || [];
        setPayments(Array.isArray(data) ? data : []);
      } catch {
        setPayments([]);
      } finally {
        setPaymentsLoading(false);
      }
    };

    const fetchPositions = async () => {
      if (!user?.id) {
        setPositionsLoading(false);
        return;
      }

      try {
        const response = await api.get('/tokens/portfolio/me', {
          headers: { 'x-user-id': user.id },
          params: address ? { wallet_address: address } : undefined,
        });
        const data = response.data?.data || [];
        setPositions(Array.isArray(data) ? data : []);
      } catch {
        setPositions([]);
      } finally {
        setPositionsLoading(false);
      }
    };

    const fetchKycStatus = async () => {
      if (!user?.id) {
        setKycLoading(false);
        return;
      }
      try {
        const headers: Record<string, string> = { 'x-user-id': user.id };
        const [qualsRes, profileRes] = await Promise.allSettled([
          api.get('/kyc/my-qualifications', { headers }),
          api.get('/kyc/profile'),
        ]);
        const list: Qualification[] =
          qualsRes.status === 'fulfilled'
            ? Array.isArray(qualsRes.value.data?.data)
              ? qualsRes.value.data.data
              : Array.isArray(qualsRes.value.data)
              ? qualsRes.value.data
              : []
            : [];
        const profile = profileRes.status === 'fulfilled' ? profileRes.value.data?.data : null;

        let derived: string | null = null;
        let rejectReason: string | null = null;

        if (profile?.adminKycStatus === 'rejected') {
          derived = 'rejected';
          rejectReason = profile.adminReason || null;
        } else if (list.some((q) => q.status === 'approved')) {
          derived = 'approved';
        } else if (list.some((q) => q.status === 'pending' || q.status === 'under_review')) {
          derived = 'pending';
        } else if (list.length > 0 && list.every((q) => q.status === 'rejected')) {
          derived = 'rejected';
          rejectReason = list.find((q) => q.rejectedReason)?.rejectedReason || list.find((q) => q.reviewNotes)?.reviewNotes || null;
        }

        if (!rejectReason && derived === 'rejected') {
          rejectReason = profile?.adminReason || list.find((q) => q.rejectedReason)?.rejectedReason || list.find((q) => q.reviewNotes)?.reviewNotes || null;
        }

        setKycStatus(derived);
        setKycRejectionReason(rejectReason);
        setUser({ ...user, kycStatus: (derived ?? 'none') as 'none' | 'pending' | 'approved' | 'rejected' });
      } catch {
        setKycStatus(null);
        setKycRejectionReason(null);
      } finally {
        setKycLoading(false);
      }
    };

    fetchTokens();
    fetchPayments();
    fetchPositions();
    fetchKycStatus();
  }, [address, user?.id, refreshTick, kycRefreshTick]);

  // Re-fetch on-chain verification whenever approval status or wallet changes
  useEffect(() => {
    const wallet = user?.walletAddress;
    if (kycStatus !== 'approved' || !wallet || !wallet.match(/^0x[0-9a-fA-F]{40}$/)) {
      setChainVerification(null);
      setChainLoading(false);
      return;
    }
    setChainVerification((prev) => { if (!prev) setChainLoading(true); return prev; });
    api.get(`/blockchain/verify/${wallet}`)
      .then(r => setChainVerification(r.data?.data || null))
      .catch(() => setChainVerification(null))
      .finally(() => setChainLoading(false));
  }, [kycStatus, user?.walletAddress]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') setRefreshTick((t) => t + 1);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  const effectiveKycStatus = kycStatus ?? (user?.kycStatus !== 'none' ? user?.kycStatus : null) ?? null;

  useEffect(() => {
    const shouldPoll =
      !!user?.id &&
      (effectiveKycStatus === 'pending' ||
        effectiveKycStatus === 'under_review' ||
        (effectiveKycStatus === 'approved' && !chainVerification?.fully_verified));

    if (!shouldPoll) return;

    const interval = window.setInterval(() => {
      setRefreshTick((t) => t + 1);
    }, 10_000);

    return () => window.clearInterval(interval);
  }, [chainVerification?.fully_verified, effectiveKycStatus, user?.id]);

  const series = seriesFor(resolvedTheme);
  const otherColor = otherFor(resolvedTheme);

  // Holdings from investor positions backed by cap-table or completed payments.
  // Colour follows the position, in a fixed order; the tail folds into "Other"
  // rather than cycling the palette back to slot 1.
  const holdingsData = useMemo(() => {
    if (positions.length === 0) return [];
    const ranked = [...positions]
      .map((p) => ({
        name: p.name,
        symbol: p.symbol,
        value: Number(p.investedAmount || 0),
        quantity: Number(p.quantity || 0),
      }))
      .filter((h) => h.value > 0)
      .sort((a, b) => b.value - a.value);

    if (ranked.length <= MAX_SLICES) {
      return ranked.map((h, i) => ({ ...h, color: series[i] }));
    }
    const head = ranked.slice(0, MAX_SLICES - 1).map((h, i) => ({ ...h, color: series[i] }));
    const tail = ranked.slice(MAX_SLICES - 1);
    return [
      ...head,
      {
        name: `Other (${tail.length})`,
        symbol: '',
        value: tail.reduce((sum, h) => sum + h.value, 0),
        quantity: tail.reduce((sum, h) => sum + h.quantity, 0),
        color: otherColor,
      },
    ];
  }, [positions, series, otherColor]);

  const totalValue = useMemo(
    () => holdingsData.reduce((sum, h) => sum + h.value, 0),
    [holdingsData]
  );

  const totalOrders = payments.length;
  const pendingOrders = payments.filter((p) => p.status === 'pending').length;
  const activeTokens = tokens.filter((t) => t.status === 'active').length;

  // Recent orders (last 5)
  const recentOrders = useMemo(() => {
    return payments.slice(0, 5).map((p) => {
      const token = tokens.find((t) => t.id === p.tokenId);
      return {
        id: p.id,
        token: token?.symbol || p.tokenId.slice(0, 8),
        name: token?.name || '',
        amount: p.tokenAmount,
        value: usd(parseFloat(p.fiatAmount) || 0),
        date: new Date(p.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        status: p.status,
      };
    });
  }, [payments, tokens]);

  const showKycRejected = !kycLoading && !chainVerification?.fully_verified && effectiveKycStatus === 'rejected';
  const showKycNotSubmitted = !kycLoading && !chainVerification?.fully_verified && (!effectiveKycStatus || effectiveKycStatus === 'none');
  const showKycPending = !kycLoading && (effectiveKycStatus === 'pending' || effectiveKycStatus === 'under_review');

  const isLoading = tokensLoading || paymentsLoading || positionsLoading;

  // KYC reads as a state, not a measurement — a word plus a tone, never a
  // bare "None" set in the same 30px type as a dollar figure.
  const kycPresentation =
    effectiveKycStatus === 'approved'
      ? { word: 'Verified', tone: 'text-success', chip: 'bg-success-100 text-success', hint: 'Eligible to invest' }
      : effectiveKycStatus === 'pending' || effectiveKycStatus === 'under_review'
        ? { word: 'In review', tone: 'text-warning', chip: 'bg-warning-100 text-warning', hint: 'Usually within 1–2 days' }
        : effectiveKycStatus === 'rejected'
          ? { word: 'Rejected', tone: 'text-danger', chip: 'bg-danger-100 text-danger', hint: 'Resubmit your documents' }
          : { word: 'Not started', tone: 'text-ink', chip: 'bg-warning-100 text-warning', hint: 'Required before investing' };

  const skeleton = <span className="inline-block h-7 w-24 animate-pulse rounded-lg bg-surface-header align-middle" />;

  return (
    <div className="space-y-6 pb-10">
      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="kicker">Investor Overview</p>
          <h1 className="page-title mt-1">Dashboard</h1>
          <p className="mt-1 text-muted">
            Welcome back, <span className="font-semibold text-ink">{shortenName(user?.name)}</span>
          </p>
        </div>
        <Link href="/tokens" className="btn-primary">
          <ArrowLeftRight className="h-4 w-4" />
          Browse Tokens
        </Link>
      </div>

      {/* ── Compliance notices ──────────────────────────────────────────── */}
      {showKycRejected && (
        <div className="card flex flex-wrap items-center gap-4 border-l-4 border-danger bg-danger-500/10 p-4">
          <div className="icon-chip bg-danger-100 text-danger">
            <XCircle className="h-5 w-5" />
          </div>
          <div className="min-w-[14rem] flex-1">
            <p className="text-sm font-semibold text-danger">KYC Verification Rejected</p>
            <p className="text-sm text-muted">
              {kycRejectionReason ? (
                <span>
                  Reason: <strong className="text-ink font-medium">{kycRejectionReason}</strong>. Please update your profile to resolve this.
                </span>
              ) : (
                'Your KYC verification was rejected by the compliance team. Please review and update your profile.'
              )}
            </p>
          </div>
          <Link href="/kyc" className="btn-primary bg-danger text-white hover:bg-danger/90 ml-auto whitespace-nowrap">
            View Reason & Update
          </Link>
        </div>
      )}

      {showKycNotSubmitted && (
        <div className="card flex flex-wrap items-center gap-4 p-4">
          <div className="icon-chip bg-warning-100 text-warning">
            <AlertCircle className="h-5 w-5" />
          </div>
          <div className="min-w-[14rem] flex-1">
            <p className="text-sm font-semibold text-ink">KYC Verification Required</p>
            <p className="text-sm text-muted">
              Complete your identity verification to start investing in tokenized assets.
            </p>
          </div>
          <Link href="/kyc" className="btn-primary ml-auto whitespace-nowrap">
            Verify Now
          </Link>
        </div>
      )}

      {showKycPending && (
        <div className="card flex flex-wrap items-center gap-4 p-4">
          <div className="icon-chip bg-warning-100 text-warning">
            <Clock className="h-5 w-5" />
          </div>
          <div className="min-w-[14rem] flex-1">
            <p className="text-sm font-semibold text-ink">KYC Verification Pending</p>
            <p className="text-sm text-muted">
              Your identity verification is under review. Token purchases are disabled until it is approved.
            </p>
          </div>
          <Link href="/kyc" className="btn-secondary ml-auto whitespace-nowrap">
            View Status
          </Link>
        </div>
      )}

      {/* ── KPI row ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="card p-5">
          <div className="flex items-start justify-between gap-3">
            <p className="label">Portfolio Value</p>
            <div className="icon-chip">
              <Wallet className="h-5 w-5" />
            </div>
          </div>
          <p className="stat-value mt-3">{isLoading ? skeleton : usd(totalValue)}</p>
          <p className="stat-label mt-1">
            {holdingsData.length > 0
              ? `Across ${holdingsData.length} holding${holdingsData.length === 1 ? '' : 's'}`
              : 'From your purchases'}
          </p>
        </div>

        <div className="card p-5">
          <div className="flex items-start justify-between gap-3">
            <p className="label">My Orders</p>
            <div className="icon-chip bg-success-100 text-success">
              <ShoppingCart className="h-5 w-5" />
            </div>
          </div>
          <p className="stat-value mt-3">{paymentsLoading ? skeleton : totalOrders}</p>
          <p className="stat-label mt-1">
            {totalOrders === 0 ? 'No orders yet' : pendingOrders > 0 ? `${pendingOrders} pending` : 'All completed'}
          </p>
        </div>

        <div className="card p-5">
          <div className="flex items-start justify-between gap-3">
            <p className="label">Available Tokens</p>
            <div className="icon-chip">
              <ArrowLeftRight className="h-5 w-5" />
            </div>
          </div>
          <p className="stat-value mt-3">{tokensLoading ? skeleton : activeTokens}</p>
          <p className="stat-label mt-1">Active on platform</p>
        </div>

        <div className="card p-5">
          <div className="flex items-start justify-between gap-3">
            <p className="label">Verification</p>
            <div className={`icon-chip ${kycPresentation.chip}`}>
              {effectiveKycStatus === 'approved' ? (
                <ShieldCheck className="h-5 w-5" />
              ) : (
                <ShieldAlert className="h-5 w-5" />
              )}
            </div>
          </div>
          {kycLoading ? (
            <p className="stat-value mt-3">{skeleton}</p>
          ) : (
            <p className={`mt-3 text-2xl font-extrabold tracking-tight ${kycPresentation.tone}`}>
              {kycPresentation.word}
            </p>
          )}
          <p className="stat-label mt-1">{kycPresentation.hint}</p>
        </div>
      </div>

      {/* ── On-chain identity ───────────────────────────────────────────── */}
      {(chainLoading || (chainVerification && chainVerification.contract_deployed)) && (
        <div className="card p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-accent" />
              <h3>On-Chain Identity</h3>
            </div>
            {chainVerification?.wallet_address && (
              <span className="font-mono text-xs text-muted">
                {chainVerification.wallet_address.slice(0, 6)}…{chainVerification.wallet_address.slice(-4)}
              </span>
            )}
          </div>
          {chainLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted">
              <Loader2 className="h-4 w-4 animate-spin" />
              Verifying on-chain identity…
            </div>
          ) : chainVerification && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {([
                {
                  label: 'ONCHAINID Created',
                  ok: chainVerification.contract_deployed,
                  sub: chainVerification.identity_address
                    ? `${chainVerification.identity_address.slice(0, 6)}…${chainVerification.identity_address.slice(-4)}`
                    : 'Contract deployed',
                },
                {
                  label: 'Verified On-Chain',
                  ok: chainVerification.claims.length > 0 && chainVerification.claims.every(c => c.exists_on_chain && c.signature_valid && c.issuer_trusted),
                  sub: `${chainVerification.claims.filter(c => c.exists_on_chain).length}/${chainVerification.claims.length} claims`,
                },
                {
                  label: 'Whitelisted',
                  ok: chainVerification.token_whitelist_status.some(t => t.is_verified),
                  sub: `${chainVerification.token_whitelist_status.filter(t => t.is_verified).length}/${chainVerification.token_whitelist_status.length} tokens`,
                },
                {
                  label: 'Eligible to Buy',
                  ok: chainVerification.fully_verified,
                  sub: chainVerification.fully_verified ? 'Ready to invest' : 'Pending verification',
                },
              ] as { label: string; ok: boolean; sub: string }[]).map(({ label, ok, sub }) => (
                <div key={label} className={`tile ${ok ? 'bg-success-100' : ''}`}>
                  {/* Icon + label, so state never rests on colour alone. */}
                  <div className="flex items-center gap-2">
                    <span
                      className={`grid h-4 w-4 shrink-0 place-items-center rounded-full ${
                        ok ? 'bg-success text-surface' : 'border border-line text-muted'
                      }`}
                    >
                      {ok ? <Check className="h-2.5 w-2.5" strokeWidth={3} /> : <Clock className="h-2.5 w-2.5" />}
                    </span>
                    <span className={`text-xs font-semibold ${ok ? 'text-success' : 'text-ink'}`}>{label}</span>
                  </div>
                  <p className={`mt-1 pl-6 text-xs ${ok ? 'text-success' : 'text-muted'}`}>{sub}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Orders + allocation ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Recent orders — the denser content leads */}
        <div className="card lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-6 py-5">
            <div>
              <h3>Recent Orders</h3>
              <p className="stat-label mt-0.5">Your latest token purchases</p>
            </div>
            {recentOrders.length > 0 && (
              <Link href="/transactions" className="btn-ghost h-auto gap-1 px-2 py-1 text-xs">
                View all
              </Link>
            )}
          </div>

          {paymentsLoading ? (
            <div className="space-y-3 p-6">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-10 animate-pulse rounded-lg bg-surface-header" />
              ))}
            </div>
          ) : recentOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
              <div className="icon-chip h-12 w-12">
                <ShoppingCart className="h-6 w-6" />
              </div>
              <p className="mt-3 text-base font-bold text-ink">No orders yet</p>
              <p className="mt-1 max-w-sm text-sm text-muted">
                Browse the available offerings to make your first investment in a tokenized asset.
              </p>
              <Link href="/tokens" className="btn-primary mt-4">
                <ArrowLeftRight className="h-4 w-4" />
                Browse Tokens
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Token</th>
                    <th className="!text-right">Amount</th>
                    <th className="!text-right">Value</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentOrders.map((order) => (
                    <tr key={order.id} className="transition-colors hover:bg-surface-header">
                      <td className="whitespace-nowrap text-muted">{order.date}</td>
                      <td>
                        <p className="font-semibold text-ink">{order.token}</p>
                        {order.name && <p className="truncate text-xs text-muted">{order.name}</p>}
                      </td>
                      <td className="whitespace-nowrap text-right text-muted">
                        {parseFloat(order.amount).toLocaleString('en-US')}
                      </td>
                      <td className="whitespace-nowrap text-right font-semibold text-ink">{order.value}</td>
                      <td>
                        <span className={order.status === 'completed' ? 'badge-success' : 'badge-warning'}>
                          <span className="capitalize">{order.status}</span>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Portfolio allocation */}
        <div className="card p-6">
          <h3>Portfolio Allocation</h3>
          <p className="stat-label mt-0.5">Invested capital by asset</p>

          {isLoading ? (
            <div className="mt-6 space-y-3">
              <div className="mx-auto h-36 w-36 animate-pulse rounded-full bg-surface-header" />
              <div className="h-4 animate-pulse rounded bg-surface-header" />
              <div className="h-4 animate-pulse rounded bg-surface-header" />
            </div>
          ) : holdingsData.length === 0 ? (
            <div className="mt-5 flex flex-col items-center justify-center rounded-xl border border-dashed border-line py-10 text-center">
              <div className="icon-chip">
                <PieChartIcon className="h-5 w-5" />
              </div>
              <p className="mt-2 text-sm font-semibold text-ink">No holdings yet</p>
              <p className="stat-label mt-0.5">Your allocation appears after your first purchase</p>
              <Link href="/tokens" className="btn-secondary mt-4 px-3 py-1.5 text-xs">
                Browse tokens
              </Link>
            </div>
          ) : (
            <>
              <div className="relative mx-auto mt-4 h-40 w-40">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={holdingsData}
                      cx="50%"
                      cy="50%"
                      innerRadius={52}
                      outerRadius={76}
                      paddingAngle={2}
                      dataKey="value"
                      stroke="rgb(var(--card))"
                      strokeWidth={2}
                    >
                      {holdingsData.map((holding) => (
                        <Cell key={holding.name} fill={holding.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={chartTooltipStyle}
                      itemStyle={{ color: 'rgb(var(--text-main))' }}
                      formatter={(value: number) => usd(value)}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <p className="text-lg font-extrabold tracking-tight text-ink">{usd(totalValue, 0)}</p>
                  <p className="stat-label">invested</p>
                </div>
              </div>

              {/* Legend doubles as the table view — every slice carries its own
                  label and figure, so identity never rests on colour alone. */}
              <ul className="mt-5 space-y-2 border-t border-line pt-4">
                {holdingsData.map((holding) => (
                  <li key={holding.name} className="flex items-center justify-between gap-3 text-sm">
                    <span className="flex min-w-0 items-center gap-2 text-muted">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: holding.color }}
                      />
                      <span className="truncate">{holding.symbol || holding.name}</span>
                    </span>
                    <span className="shrink-0 font-semibold text-ink">
                      {usd(holding.value, 0)}
                      <span className="ml-1.5 font-normal text-muted">
                        {totalValue > 0 ? Math.round((holding.value / totalValue) * 100) : 0}%
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
