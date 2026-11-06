'use client';

import Link from 'next/link';
import {
  ArrowLeft,
  ShieldCheck,
  Lock,
  Database,
  Eye,
  FileCheck,
  Server,
  UserCheck,
} from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { BrandMark } from '@/components/BrandMark';

export default function PrivacyPolicyPage() {
  const lastUpdated = 'October 30, 2026';

  return (
    <div className="min-h-screen bg-surface text-ink">
      {/* ── Top Navigation Bar ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 border-b border-line bg-surface/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-4">
            <Link
              href="/investor/register"
              aria-label="Back to sign up"
              className="group inline-flex items-center gap-1.5 text-xs font-semibold text-muted transition-colors hover:text-ink"
            >
              <ArrowLeft className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-1" />
              <span className="hidden sm:inline">Back to Sign Up</span>
            </Link>
            <div className="hidden h-4 w-px bg-line sm:block" />
            <Link href="/" className="flex items-center gap-2 text-ink">
              <BrandMark size={22} />
              <span className="font-bold tracking-tight text-base">Assetro</span>
              <span className="hidden rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-semibold text-accent sm:inline-flex">
                Privacy
              </span>
            </Link>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/terms"
              className="text-xs font-medium text-muted hover:text-ink transition-colors"
            >
              Terms of Service
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* ── Main Content Container ────────────────────────────────────────── */}
      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <div className="mb-10 text-center sm:text-left">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-accent/20 bg-accent-soft px-3 py-1 text-xs font-semibold text-accent mb-3">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>Data Protection &amp; Confidentiality</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
            Privacy Policy
          </h1>
          <p className="mt-2 text-sm text-muted">
            Last updated: <span className="font-semibold text-ink">{lastUpdated}</span> &middot; Your privacy and cryptographic security are foundational to Assetro.
          </p>
        </div>

        <div className="space-y-8">
          <section className="rounded-card border border-line bg-card p-6 sm:p-8">
            <div className="flex items-center gap-2.5 text-accent mb-3">
              <UserCheck className="h-5 w-5" />
              <h2 className="text-lg font-bold text-ink">1. Information We Collect</h2>
            </div>
            <p className="text-sm leading-relaxed text-muted">
              To deliver compliant tokenization services and fulfill mandatory regulatory requirements (such as AML and KYC laws), we collect the following categories of data:
            </p>
            <ul className="mt-3 list-disc pl-5 space-y-1.5 text-sm text-muted">
              <li><strong>Personal Identification Data:</strong> Full legal name, date of birth, nationality, country of tax residence, email address, and phone number.</li>
              <li><strong>Government Identity Documents:</strong> Valid passport, national ID card, proof of address, and investor qualification documentation.</li>
              <li><strong>Cryptographic &amp; Blockchain Data:</strong> Public cryptographic wallet addresses (e.g. MetaMask accounts), ONCHAINID contract identifiers, and on-chain transaction hashes.</li>
              <li><strong>Technical Data:</strong> IP address, device telemetry, browser type, and system logs to safeguard against fraud and cyber threats.</li>
            </ul>
          </section>

          <section className="rounded-card border border-line bg-card p-6 sm:p-8">
            <div className="flex items-center gap-2.5 text-accent mb-3">
              <Database className="h-5 w-5" />
              <h2 className="text-lg font-bold text-ink">2. How We Use Your Data</h2>
            </div>
            <p className="text-sm leading-relaxed text-muted">
              We process your personal information strictly for legitimate business and compliance purposes:
            </p>
            <ul className="mt-3 list-disc pl-5 space-y-1.5 text-sm text-muted">
              <li>Verifying your identity and checking sanctions and politically exposed persons (PEP) databases.</li>
              <li>Recording cryptographic verification claims within token Identity Registries via ONCHAINID smart contracts.</li>
              <li>Processing subscription payments and facilitating direct-to-wallet token minting and transfer checks.</li>
              <li>Providing customer support, security alerts, and system updates.</li>
            </ul>
          </section>

          <section className="rounded-card border border-line bg-card p-6 sm:p-8">
            <div className="flex items-center gap-2.5 text-accent mb-3">
              <Lock className="h-5 w-5" />
              <h2 className="text-lg font-bold text-ink">3. On-Chain Privacy &amp; Cryptography</h2>
            </div>
            <p className="text-sm leading-relaxed text-muted">
              Public blockchain networks (such as Ethereum and Sepolia) are immutable, distributed ledgers. In accordance with ERC-3643 architecture:
            </p>
            <div className="mt-3 rounded-xl border border-line bg-surface-alt p-4 text-xs text-muted space-y-2">
              <p className="font-semibold text-ink">Zero PII On-Chain:</p>
              <p>
                Your raw personal identifying information (such as your full legal name, document images, or home address) is <strong>NEVER stored on-chain</strong>.
              </p>
              <p>
                Only cryptographic hashed claims and qualification codes (e.g., country code 356 for India, accredited status flags) are recorded on smart contracts to verify transfer compliance without disclosing your identity to the public.
              </p>
            </div>
          </section>

          <section className="rounded-card border border-line bg-card p-6 sm:p-8">
            <div className="flex items-center gap-2.5 text-accent mb-3">
              <Server className="h-5 w-5" />
              <h2 className="text-lg font-bold text-ink">4. Data Security &amp; Storage</h2>
            </div>
            <p className="text-sm leading-relaxed text-muted">
              All off-chain data, including uploaded KYC documents, are stored with AES-256 encryption at rest and protected with TLS 1.3 encryption in transit. Access is strictly controlled via multi-tenant role-based access permissions.
            </p>
          </section>

          <section className="rounded-card border border-line bg-card p-6 sm:p-8">
            <div className="flex items-center gap-2.5 text-accent mb-3">
              <Eye className="h-5 w-5" />
              <h2 className="text-lg font-bold text-ink">5. Your Privacy Rights &amp; Contact</h2>
            </div>
            <p className="text-sm leading-relaxed text-muted">
              Subject to applicable data protection regulations (such as GDPR or relevant domestic privacy statutes), you have the right to request access to, correction of, or deletion of your personal data, provided such request does not conflict with mandatory financial record-keeping laws.
            </p>
            <p className="mt-3 text-xs text-muted">
              For any privacy inquiries or Data Protection Officer requests, please reach out to:{' '}
              <a href="mailto:privacy@assetro.com" className="font-semibold text-accent hover:underline">
                privacy@assetro.com
              </a>
            </p>
          </section>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-line pt-6">
            <Link
              href="/investor/register"
              className="btn-primary w-full sm:w-auto"
            >
              Return to Create Account
            </Link>
            <Link
              href="/terms"
              className="btn-secondary w-full sm:w-auto"
            >
              View Terms &amp; Conditions
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
