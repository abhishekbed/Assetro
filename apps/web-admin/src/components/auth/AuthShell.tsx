'use client';

import { ThemeToggle } from '@/components/ThemeToggle';
import { BrandMark } from '@/components/BrandMark';
import { CheckCircle2, ShieldCheck } from 'lucide-react';

const HIGHLIGHTS = [
  'Multi-tenant isolated PostgreSQL schemas',
  'ERC-3643 smart contract deployment oversight',
  'Real-time immutable ledger audit trail',
  'Cross-tenant operator & role security controls',
];

/**
 * Two-column flat card used by the admin auth pages.
 * Left: branding + highlights (+ optional footer slot). Right: the form.
 */
export function AuthShell({
  title,
  subtitle,
  aside,
  children,
}: {
  title: string;
  subtitle: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-surface px-4 py-8 sm:px-6">
      <div className="absolute right-4 top-4 z-20">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-4xl">
        <div className="card">
          <div className="grid md:grid-cols-12">
            {/* ── Left: branding ── */}
            <div className="flex flex-col justify-between border-b border-line bg-surface-alt p-6 sm:p-8 md:col-span-5 md:border-b-0 md:border-r">
              <div>
                <div className="flex items-center gap-3">
                  <BrandMark size={40} />
                  <div>
                    <h1 className="text-ink">Assetro</h1>
                    <p className="text-xs font-medium text-muted">Platform Administration</p>
                  </div>
                </div>

                <div className="mt-4">
                  <span className="pill">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    <span>Root Governance &middot; Multi-Tenant</span>
                  </span>
                </div>

                <div className="mt-6 space-y-2.5 text-xs text-ink">
                  {HIGHLIGHTS.map((h) => (
                    <div key={h} className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-success" />
                      <span>{h}</span>
                    </div>
                  ))}
                </div>
              </div>

              {aside && <div className="mt-6">{aside}</div>}
            </div>

            {/* ── Right: form ── */}
            <div className="flex flex-col justify-center bg-card p-6 sm:p-8 md:col-span-7">
              <div className="mb-6">
                <h2 className="text-ink">{title}</h2>
                <p className="mt-1 text-xs text-muted">{subtitle}</p>
              </div>
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Input styling shared by the auth forms (icon on the left). */
export const authInputClass = 'input-field pl-10';

export const authLabelClass = 'label mb-1.5';

export function AuthError({ message }: { message: string }) {
  return (
    <div className="mb-4 flex items-center gap-2 rounded-card border border-line bg-danger-100 p-3 text-sm text-danger">
      <div className="h-2 w-2 flex-shrink-0 rounded-full bg-danger" />
      <span>{message}</span>
    </div>
  );
}

export function AuthSubmitButton({
  loading,
  children,
}: {
  loading: boolean;
  children: React.ReactNode;
}) {
  return (
    <button type="submit" disabled={loading} className="btn-primary group mt-2 w-full">
      <span className="flex items-center justify-center gap-2">
        {loading ? (
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-btn-text/40 border-t-btn-text" />
        ) : (
          children
        )}
      </span>
    </button>
  );
}
