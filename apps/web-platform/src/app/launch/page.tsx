'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  PieChart,
  ShieldCheck,
} from 'lucide-react';
import { useAuthStore, homeForRole, portalForRole } from '@/store/auth.store';
import { ThemeToggle } from '@/components/ThemeToggle';

const PORTALS = [
  {
    href: '/investor/login',
    icon: PieChart,
    name: 'Investor',
    tagline: 'Hold and manage tokenised real assets',
    points: [
      'Browse and subscribe to live offerings',
      'Track your portfolio and vesting',
      'One-time KYC, reusable on-chain identity',
    ],
  },
  {
    href: '/issuer/login',
    icon: Building2,
    name: 'Issuer',
    tagline: 'Issue and administer security tokens',
    points: [
      'Launch compliant ERC-3643 tokens',
      'Review investor KYC and whitelists',
      'Run cap table and corporate actions',
    ],
  },
];

export default function LaunchPage() {
  const router = useRouter();
  const { isAuthenticated, user } = useAuthStore();

  // Already signed in? Skip the chooser and go to the right dashboard.
  useEffect(() => {
    if (isAuthenticated && portalForRole(user?.role)) {
      router.replace(homeForRole(user?.role));
    }
  }, [isAuthenticated, user?.role, router]);

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <header className="flex items-center justify-between px-6 py-5">
        <Link
          href="/"
          className="group inline-flex items-center gap-1.5 text-xs font-medium text-muted transition-colors hover:text-accent"
        >
          <ArrowLeft className="h-3.5 w-3.5 transition-transform duration-200 group-hover:-translate-x-1" />
          <span>Back to Home</span>
        </Link>
        <ThemeToggle />
      </header>

      <main className="flex flex-1 items-center justify-center px-4 pb-16 sm:px-6">
        <div className="w-full max-w-4xl">
          <div className="text-center">
            <span className="pill">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>ERC-3643 Compliant &middot; ONCHAINID</span>
            </span>
            <h1 className="mt-5 text-ink">Launch Terminal</h1>
            <p className="mx-auto mt-3 max-w-lg text-sm text-muted">
              Choose how you want to sign in. Each portal has its own credentials and
              its own workspace.
            </p>
          </div>

          <div className="mt-10 grid gap-5 md:grid-cols-2">
            {PORTALS.map((portal) => {
              const Icon = portal.icon;
              return (
                <Link
                  key={portal.href}
                  href={portal.href}
                  className="card group flex flex-col p-6 transition-transform duration-200 hover:-translate-y-1 hover:border-accent"
                >
                  <div className="icon-chip">
                    <Icon className="h-5 w-5" />
                  </div>

                  <h2 className="mt-4 text-ink">{portal.name}</h2>
                  <p className="mt-1 text-sm text-muted">{portal.tagline}</p>

                  <div className="mt-5 flex-1 space-y-2.5 text-xs text-ink">
                    {portal.points.map((point) => (
                      <div key={point} className="flex items-start gap-2">
                        <CheckCircle2 className="mt-px h-4 w-4 flex-shrink-0 text-success" />
                        <span>{point}</span>
                      </div>
                    ))}
                  </div>

                  <span className="btn-primary mt-6 w-full">
                    Continue as {portal.name}
                    <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
                  </span>
                </Link>
              );
            })}
          </div>

          <p className="mt-8 text-center text-xs text-muted">
            New investor?{' '}
            <Link href="/register" className="font-semibold text-accent hover:underline">
              Create an account
            </Link>
            <span className="mx-2">·</span>
            Want to issue assets?{' '}
            <Link href="/issuer/register" className="font-semibold text-accent hover:underline">
              Apply as an Issuer
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
