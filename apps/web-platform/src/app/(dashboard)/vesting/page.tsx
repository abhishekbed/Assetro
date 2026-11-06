'use client';

import { useState, useEffect } from 'react';
import { Loader2, Clock, CheckCircle, Coins, Calendar, TrendingUp } from 'lucide-react';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';

interface UpcomingRelease {
  date: string;
  amount: string;
}

interface VestingSchedule {
  id: string;
  tokenId: string;
  tokenName: string;
  tokenSymbol: string;
  tokenDecimals: number;
  totalAmount: string;
  releasedAmount: string;
  vestedAmount: string;
  claimableAmount: string;
  progressPercent: number;
  startDate: string;
  endDate: string;
  cliffDate: string | null;
  vestingIntervalDays: number;
  status: string;
  nextReleaseDate: string | null;
  upcomingReleases: UpcomingRelease[];
}

function fmt(weiStr: string, decimals: number): string {
  try {
    const n = parseFloat(weiStr) / Math.pow(10, decimals);
    return n.toLocaleString('en-US', { maximumFractionDigits: 4 });
  } catch {
    return '0';
  }
}

function fmtDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function ProgressBar({ percent }: { percent: number }) {
  return (
    <div className="h-2 w-full rounded-full bg-surface-header overflow-hidden">
      <div
        className="h-full rounded-full bg-primary-500 transition-all"
        style={{ width: `${Math.min(percent, 100)}%` }}
      />
    </div>
  );
}

function VestingCard({ schedule }: { schedule: VestingSchedule }) {
  const { tokenName, tokenSymbol, tokenDecimals } = schedule;
  const total     = fmt(schedule.totalAmount,     tokenDecimals);
  const released  = fmt(schedule.releasedAmount,  tokenDecimals);
  const vested    = fmt(schedule.vestedAmount,     tokenDecimals);
  const claimable = fmt(schedule.claimableAmount,  tokenDecimals);
  const pct       = schedule.progressPercent;

  const isCompleted = schedule.status === 'completed';

  return (
    <div className="card p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-soft">
            <Coins className="h-5 w-5 text-accent" />
          </div>
          <div>
            <h3 className="font-semibold text-ink">{tokenName}</h3>
            <p className="text-xs text-muted">{tokenSymbol}</p>
          </div>
        </div>
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
          isCompleted ? 'bg-success-100 text-success' : 'bg-accent-soft text-accent'
        }`}>
          {isCompleted ? <><CheckCircle className="h-3 w-3" /> Completed</> : <><Clock className="h-3 w-3" /> Active</>}
        </span>
      </div>

      {/* Progress */}
      <div>
        <div className="flex items-center justify-between text-sm mb-2">
          <span className="text-muted">Released</span>
          <span className="font-medium text-ink">
            {released} / {total} {tokenSymbol}
            <span className="ml-1 text-xs text-muted">({pct.toFixed(1)}%)</span>
          </span>
        </div>
        <ProgressBar percent={pct} />
        <div className="mt-1 flex justify-between text-xs text-muted">
          <span>Vested so far: {vested} {tokenSymbol}</span>
          {Number(schedule.claimableAmount) > 0 && (
            <span className="text-accent font-medium">Claimable: {claimable} {tokenSymbol}</span>
          )}
        </div>
      </div>

      {/* Dates */}
      <div className="grid grid-cols-2 gap-3 rounded-lg bg-card p-4 text-sm">
        <div>
          <p className="text-xs text-muted">Start</p>
          <p className="font-medium text-ink">{fmtDate(schedule.startDate)}</p>
        </div>
        <div>
          <p className="text-xs text-muted">End</p>
          <p className="font-medium text-ink">{fmtDate(schedule.endDate)}</p>
        </div>
        {schedule.cliffDate && (
          <div>
            <p className="text-xs text-muted">Cliff</p>
            <p className="font-medium text-ink">{fmtDate(schedule.cliffDate)}</p>
          </div>
        )}
        <div>
          <p className="text-xs text-muted">Interval</p>
          <p className="font-medium text-ink">Every {schedule.vestingIntervalDays} days</p>
        </div>
      </div>

      {/* Upcoming releases */}
      {schedule.upcomingReleases.length > 0 && (
        <div>
          <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-ink">
            <Calendar className="h-4 w-4" /> Upcoming Releases
          </p>
          <div className="space-y-2">
            {schedule.upcomingReleases.map((r, i) => (
              <div key={i} className="flex items-center justify-between rounded-md bg-card px-3 py-2 text-sm">
                <span className="text-ink">{fmtDate(r.date)}</span>
                <span className="font-medium text-ink">
                  +{fmt(r.amount, tokenDecimals)} {tokenSymbol}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Next release highlight */}
      {schedule.nextReleaseDate && !isCompleted && (
        <div className="rounded-lg border border-accent bg-accent-soft px-4 py-3 text-sm">
          <p className="text-xs text-accent mb-0.5">Next release</p>
          <p className="font-semibold text-accent">{fmtDate(schedule.nextReleaseDate)}</p>
        </div>
      )}

      {/* Claim button — shown when there are claimable tokens */}
      {Number(schedule.claimableAmount) > 0 && (
        <button
          className="btn-primary w-full gap-2"
          onClick={() => window.alert('Contact the issuer to claim vested tokens. Automated claiming coming soon.')}
        >
          <TrendingUp className="h-4 w-4" />
          Claim {claimable} {tokenSymbol}
        </button>
      )}
    </div>
  );
}

export default function VestingPage() {
  const { user } = useAuthStore();
  const [schedules, setSchedules] = useState<VestingSchedule[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) { setLoading(false); return; }
    api.get('/tokens/vesting/me', { headers: { 'x-user-id': user.id } })
      .then(r => setSchedules(r.data?.data ?? []))
      .catch(() => setSchedules([]))
      .finally(() => setLoading(false));
  }, [user?.id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-16">
        <Loader2 className="h-6 w-6 animate-spin text-accent" />
        <span className="ml-3 text-muted">Loading vesting schedules…</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">Vesting Schedules</h1>
        <p className="text-muted">Your token vesting timeline and upcoming releases</p>
      </div>

      {schedules.length === 0 ? (
        <div className="card p-12 text-center">
          <Clock className="mx-auto h-12 w-12 text-muted" />
          <p className="mt-3 text-muted">No active vesting schedules.</p>
          <p className="mt-1 text-sm text-muted">
            Vesting schedules are assigned by issuers when distributing tokens.
          </p>
        </div>
      ) : (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="card p-5">
              <p className="text-sm text-muted">Active Schedules</p>
              <p className="text-2xl font-bold text-ink">{schedules.length}</p>
            </div>
            <div className="card p-5">
              <p className="text-sm text-muted">Total Claimable Now</p>
              <p className="text-2xl font-bold text-accent">
                {schedules.reduce((s, x) => {
                  try { return s + parseFloat(x.claimableAmount) / Math.pow(10, x.tokenDecimals); } catch { return s; }
                }, 0).toLocaleString('en-US', { maximumFractionDigits: 2 })} tokens
              </p>
            </div>
            <div className="card p-5">
              <p className="text-sm text-muted">Next Release</p>
              <p className="text-xl font-bold text-ink">
                {fmtDate(
                  schedules
                    .map(s => s.nextReleaseDate)
                    .filter(Boolean)
                    .sort()[0] ?? null
                )}
              </p>
            </div>
          </div>

          {/* Vesting cards */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {schedules.map(s => <VestingCard key={s.id} schedule={s} />)}
          </div>
        </>
      )}
    </div>
  );
}
