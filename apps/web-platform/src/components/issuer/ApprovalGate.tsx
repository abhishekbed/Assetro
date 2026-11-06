'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { CheckCircle2, Clock, Loader2, XCircle, FileText } from 'lucide-react';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';

type LeadStatus = 'not_submitted' | 'pending' | 'approved' | 'rejected';

interface MyStatus {
  status: LeadStatus;
  companyName: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
}

/**
 * Shows the admin-approval status in place of the dashboard until the issuer's
 * application is approved and their tenant workspace exists.
 *
 * Issuers with a tenant pass straight through. Once an admin approves, the
 * signed-in session still carries no tenant, so the tokens are refreshed
 * (the API re-reads the user) and the dashboard unlocks without a re-login.
 */
export function ApprovalGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { user, refreshToken, login, setUser } = useAuthStore();
  const [info, setInfo] = useState<MyStatus | null>(null);
  const [error, setError] = useState('');
  const [activating, setActivating] = useState(false);

  const hasTenant = Boolean(user?.tenantId);

  const load = useCallback(async () => {
    try {
      const res = await api.get('/issuer-leads/me');
      setInfo(res.data.data);
      setError('');
    } catch {
      setError('Could not load your application status.');
    }
  }, []);

  useEffect(() => {
    if (hasTenant) return;
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [hasTenant, load]);

  // No application filed yet: send them to the form.
  useEffect(() => {
    if (!hasTenant && info?.status === 'not_submitted') {
      router.replace('/issuer/contact');
    }
  }, [hasTenant, info, router]);

  // Approved: pick up the newly attached tenant by refreshing the session.
  useEffect(() => {
    if (hasTenant || info?.status !== 'approved' || !refreshToken || !user || activating) return;
    setActivating(true);
    axios
      .post(`${api.defaults.baseURL}/auth/refresh`, { refreshToken })
      .then((res) => {
        const tokens = res.data.tokens ?? res.data;
        const payload = JSON.parse(atob(tokens.accessToken.split('.')[1]));
        login({ ...user, tenantId: payload.tenantId }, tokens.accessToken, tokens.refreshToken ?? refreshToken);
      })
      .catch(() => {
        setError('Your application is approved. Please sign out and sign in again.');
        setActivating(false);
      });
  }, [hasTenant, info, refreshToken, user, activating, login, setUser]);

  if (hasTenant) return <>{children}</>;

  const status = info?.status;
  const view =
    status === 'approved'
      ? { Icon: CheckCircle2, tone: 'text-success', title: 'Approved', text: 'Setting up your workspace…' }
      : status === 'rejected'
        ? {
            Icon: XCircle,
            tone: 'text-danger',
            title: 'Rejected',
            text: info?.rejectionReason
              ? `Reason: ${info.rejectionReason}`
              : 'Your application was not approved.',
          }
        : {
            Icon: Clock,
            tone: 'text-warning',
            title: 'Pending admin approval',
            text: 'Our compliance team is reviewing your application. This page updates automatically.',
          };

  return (
    <div className="mx-auto max-w-xl py-10">
      <div className="card p-8 text-center">
        {!info && !error ? (
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-muted" />
        ) : (
          <>
            <view.Icon className={`mx-auto h-12 w-12 ${view.tone}`} />
            <p className="label mt-4">Admin approval status</p>
            <h2 className="mt-1 text-ink">{error ? 'Unavailable' : view.title}</h2>
            <p className="mt-2 text-sm text-muted">{error || view.text}</p>
            {info?.companyName && (
              <div className="mt-5 flex items-center justify-center gap-2 text-xs text-muted">
                <FileText className="h-3.5 w-3.5" />
                {info.companyName}
                {info.submittedAt && <> · submitted {new Date(info.submittedAt).toLocaleDateString()}</>}
              </div>
            )}
            {status === 'rejected' && (
              <button className="btn-primary mt-6" onClick={() => router.push('/issuer/contact')}>
                Re-apply
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
