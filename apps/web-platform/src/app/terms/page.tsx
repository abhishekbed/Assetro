'use client';

import Link from 'next/link';
import {
  ArrowLeft,
  ShieldCheck,
  FileText,
  Lock,
  Coins,
  Scale,
  AlertTriangle,
  Building2,
  CheckCircle2,
  HelpCircle,
} from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { BrandMark } from '@/components/BrandMark';

export default function TermsAndConditionsPage() {
  const lastUpdated = 'October 30, 2026';

  const sections = [
    { id: 'acceptance', title: '1. Acceptance of Terms', icon: Scale },
    { id: 'platform', title: '2. Platform Overview & Services', icon: Coins },
    { id: 'eligibility', title: '3. Eligibility & User Accounts', icon: ShieldCheck },
    { id: 'kyc-aml', title: '4. KYC/AML Compliance & ONCHAINID', icon: Lock },
    { id: 'investments', title: '5. Token Purchases & Minting', icon: Building2 },
    { id: 'blockchain', title: '6. Self-Custody & Blockchain Risks', icon: AlertTriangle },
    { id: 'conduct', title: '7. Permitted Use & Prohibited Conduct', icon: FileText },
    { id: 'disclaimer', title: '8. Disclaimers & Limitation of Liability', icon: HelpCircle },
    { id: 'governing-law', title: '9. Governing Law & Contact', icon: CheckCircle2 },
  ];

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
                Legal
              </span>
            </Link>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/privacy"
              className="text-xs font-medium text-muted hover:text-ink transition-colors"
            >
              Privacy Policy
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* ── Main Content Container ────────────────────────────────────────── */}
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        {/* Header Hero */}
        <div className="mb-10 text-center sm:text-left">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-accent/20 bg-accent-soft px-3 py-1 text-xs font-semibold text-accent mb-3">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>ERC-3643 Institutional Compliance Suite</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
            Terms &amp; Conditions
          </h1>
          <p className="mt-2 text-sm text-muted">
            Last updated: <span className="font-semibold text-ink">{lastUpdated}</span> &middot; Effective immediately for all platform participants.
          </p>
        </div>

        <div className="grid min-w-0 gap-8 lg:grid-cols-12">
          {/* ── Sidebar Navigation ──────────────────────────────────────────── */}
          <aside className="min-w-0 lg:col-span-4">
            <div className="sticky top-24 rounded-card border border-line bg-card p-5 shadow-sm">
              <h2 className="text-xs font-bold uppercase tracking-wider text-muted mb-3">
                Contents
              </h2>
              <nav className="space-y-1">
                {sections.map(({ id, title, icon: Icon }) => (
                  <a
                    key={id}
                    href={`#${id}`}
                    className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-muted transition-colors hover:bg-surface-header hover:text-ink"
                  >
                    <Icon className="h-3.5 w-3.5 flex-shrink-0 text-accent" />
                    <span className="truncate">{title}</span>
                  </a>
                ))}
              </nav>

              <div className="mt-6 border-t border-line pt-4 text-xs text-muted">
                <p>Have legal questions?</p>
                <a
                  href="mailto:legal@assetro.com"
                  className="mt-1 inline-block font-semibold text-accent hover:underline"
                >
                  legal@assetro.com
                </a>
              </div>
            </div>
          </aside>

          {/* ── Terms Content ───────────────────────────────────────────────── */}
          <div className="min-w-0 space-y-8 lg:col-span-8">
            {/* Section 1 */}
            <section id="acceptance" className="rounded-card border border-line bg-card p-6 sm:p-8">
              <div className="flex items-center gap-2.5 text-accent mb-3">
                <Scale className="h-5 w-5" />
                <h2 className="text-lg font-bold text-ink">1. Acceptance of Terms</h2>
              </div>
              <p className="text-sm leading-relaxed text-muted">
                These Terms and Conditions (&ldquo;Terms&rdquo;) constitute a legally binding agreement between you (&ldquo;User&rdquo;, &ldquo;Investor&rdquo;, or &ldquo;Issuer&rdquo;) and Assetro (&ldquo;Platform&rdquo;, &ldquo;we&rdquo;, &ldquo;our&rdquo;, or &ldquo;us&rdquo;). By accessing, registering an account, connecting a cryptographic wallet, or utilizing our tokenization infrastructure, you signify that you have read, understood, and agreed to be bound by these Terms and our Privacy Policy.
              </p>
              <p className="mt-3 text-sm leading-relaxed text-muted">
                If you do not agree to all provisions of these Terms, you must immediately cease accessing the Platform and refrain from initiating any transactions or signing cryptographic actions.
              </p>
            </section>

            {/* Section 2 */}
            <section id="platform" className="rounded-card border border-line bg-card p-6 sm:p-8">
              <div className="flex items-center gap-2.5 text-accent mb-3">
                <Coins className="h-5 w-5" />
                <h2 className="text-lg font-bold text-ink">2. Platform Overview &amp; Services</h2>
              </div>
              <p className="text-sm leading-relaxed text-muted">
                Assetro provides non-custodial decentralized infrastructure designed for the issuance, compliance management, and investment in permissioned digital securities and tokenized real-world assets (RWAs).
              </p>
              <ul className="mt-3 space-y-2 text-sm text-muted">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-success" />
                  <span><strong>ERC-3643 Standard:</strong> All tokenized instruments adhere strictly to the T-REX ERC-3643 token standard, enforcing on-chain transfer restrictions and identity eligibility.</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-success" />
                  <span><strong>Smart Contract Automation:</strong> Compliance rules (such as investor quotas, country restrictions, and accredited status) are verified autonomously at the smart-contract layer before any transfer or minting occurs.</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-success" />
                  <span><strong>Non-Custodial Architecture:</strong> Assetro does not take custody of private keys or native digital assets. Users maintain complete self-custody of their Web3 accounts.</span>
                </li>
              </ul>
            </section>

            {/* Section 3 */}
            <section id="eligibility" className="rounded-card border border-line bg-card p-6 sm:p-8">
              <div className="flex items-center gap-2.5 text-accent mb-3">
                <ShieldCheck className="h-5 w-5" />
                <h2 className="text-lg font-bold text-ink">3. Eligibility &amp; User Accounts</h2>
              </div>
              <p className="text-sm leading-relaxed text-muted">
                To access and interact with offerings on Assetro, you must:
              </p>
              <ul className="mt-3 list-disc pl-5 space-y-1.5 text-sm text-muted">
                <li>Be at least 18 years of age or the legal age of majority in your jurisdiction.</li>
                <li>Not reside in, or be a national of, any territory subject to comprehensive sanctions (including OFAC, EU, UN, or UK sanction regimes).</li>
                <li>Possess the legal capacity to enter into binding agreements and comply with financial regulations applicable to your residency.</li>
                <li>Maintain the confidentiality and security of your account credentials, passcodes, and connected cryptographic wallets.</li>
              </ul>
            </section>

            {/* Section 4 */}
            <section id="kyc-aml" className="rounded-card border border-line bg-card p-6 sm:p-8">
              <div className="flex items-center gap-2.5 text-accent mb-3">
                <Lock className="h-5 w-5" />
                <h2 className="text-lg font-bold text-ink">4. KYC/AML Compliance &amp; ONCHAINID</h2>
              </div>
              <p className="text-sm leading-relaxed text-muted">
                Regulatory compliance is mandatory for all security token transactions. Every investor must complete Identity Verification (KYC) and Anti-Money Laundering (AML) checks prior to subscribing to or acquiring tokens.
              </p>
              <div className="mt-4 rounded-xl border border-line bg-surface-alt p-4 text-xs text-muted space-y-2">
                <p className="font-semibold text-ink">On-Chain Identity Verification (ONCHAINID):</p>
                <p>
                  Upon approval of your identity documents by the token issuer or compliance agent, an ONCHAINID identity smart contract is created or linked to your verified wallet address. Cryptographic claims representing your eligibility (such as residency, investor classification, and sanctions screening) are recorded in the Token&apos;s Identity Registry.
                </p>
                <p>
                  You agree that any falsification of identification documents, impersonation, or misrepresentation of jurisdictional status constitutes a material breach of these Terms, resulting in immediate disqualification and token freezing.
                </p>
              </div>
            </section>

            {/* Section 5 */}
            <section id="investments" className="rounded-card border border-line bg-card p-6 sm:p-8">
              <div className="flex items-center gap-2.5 text-accent mb-3">
                <Building2 className="h-5 w-5" />
                <h2 className="text-lg font-bold text-ink">5. Token Purchases &amp; Minting</h2>
              </div>
              <p className="text-sm leading-relaxed text-muted">
                Tokens on Assetro may be purchased via bank wire transfer or platform checkout.
              </p>
              <ul className="mt-3 space-y-2 text-sm text-muted">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-success" />
                  <span><strong>Direct Wallet Minting:</strong> Once payment is confirmed by the Issuer or platform escrow, tokens are minted directly to your connected, verified cryptographic wallet address. Tokens are not held in intermediary platform pool contracts.</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-success" />
                  <span><strong>Issuer Discretion:</strong> All offering terms, subscription agreements, minimum investment thresholds, and maximum allocations are established directly by the respective asset Issuer.</span>
                </li>
              </ul>
            </section>

            {/* Section 6 */}
            <section id="blockchain" className="rounded-card border border-line bg-card p-6 sm:p-8">
              <div className="flex items-center gap-2.5 text-accent mb-3">
                <AlertTriangle className="h-5 w-5 text-warning" />
                <h2 className="text-lg font-bold text-ink">6. Self-Custody &amp; Blockchain Risks</h2>
              </div>
              <p className="text-sm leading-relaxed text-muted">
                Interacting with public blockchains entails inherent technical and financial risks:
              </p>
              <ul className="mt-3 list-disc pl-5 space-y-1.5 text-sm text-muted">
                <li><strong>Private Key Security:</strong> You are solely responsible for securing the seed phrases and private keys associated with your MetaMask or Web3 wallet. Assetro cannot recover lost or compromised wallet keys.</li>
                <li><strong>Irreversibility of Transactions:</strong> Blockchain transactions confirmed on the network cannot be altered, cancelled, or reversed by Assetro.</li>
                <li><strong>Regulatory Evolution:</strong> Blockchain and security token regulations vary across jurisdictions and may evolve over time.</li>
              </ul>
            </section>

            {/* Section 7 */}
            <section id="conduct" className="rounded-card border border-line bg-card p-6 sm:p-8">
              <div className="flex items-center gap-2.5 text-accent mb-3">
                <FileText className="h-5 w-5" />
                <h2 className="text-lg font-bold text-ink">7. Permitted Use &amp; Prohibited Conduct</h2>
              </div>
              <p className="text-sm leading-relaxed text-muted">
                You agree not to engage in any of the following restricted activities:
              </p>
              <ul className="mt-3 list-disc pl-5 space-y-1 text-sm text-muted">
                <li>Violating applicable securities laws, sanctions, anti-money laundering, or anti-terrorist financing regulations.</li>
                <li>Attempting to bypass smart contract transfer restrictions or unauthorized modification of identity registry claims.</li>
                <li>Introducing malicious code, viruses, or exploiting smart contracts or platform APIs.</li>
                <li>Engaging in market manipulation, wash trading, or unauthorized secondary transfers to unwhitelisted addresses.</li>
              </ul>
            </section>

            {/* Section 8 */}
            <section id="disclaimer" className="rounded-card border border-line bg-card p-6 sm:p-8">
              <div className="flex items-center gap-2.5 text-accent mb-3">
                <HelpCircle className="h-5 w-5" />
                <h2 className="text-lg font-bold text-ink">8. Disclaimers &amp; Limitation of Liability</h2>
              </div>
              <p className="text-sm leading-relaxed text-muted">
                Assetro operates strictly as a technology provider and infrastructure layer. The Platform does NOT provide investment advice, financial planning, tax guidance, or legal counsel. No content or offering listed on the Platform constitutes an endorsement, solicitation, or recommendation by Assetro.
              </p>
              <p className="mt-3 text-sm leading-relaxed text-muted">
                TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, THE PLATFORM IS PROVIDED ON AN &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE&rdquo; BASIS WITHOUT WARRANTIES OF ANY KIND. ASSETRO SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, OR CONSEQUENTIAL DAMAGES, INCLUDING LOSS OF PROFITS, DATA, OR DIGITAL ASSETS.
              </p>
            </section>

            {/* Section 9 */}
            <section id="governing-law" className="rounded-card border border-line bg-card p-6 sm:p-8">
              <div className="flex items-center gap-2.5 text-accent mb-3">
                <CheckCircle2 className="h-5 w-5" />
                <h2 className="text-lg font-bold text-ink">9. Governing Law &amp; Contact</h2>
              </div>
              <p className="text-sm leading-relaxed text-muted">
                These Terms shall be governed by and construed in accordance with the laws of the applicable jurisdiction, without regard to conflict of law principles. Any dispute arising out of or relating to these Terms shall be resolved through confidential binding arbitration.
              </p>
              <div className="mt-4 border-t border-line pt-4 text-xs text-muted">
                <p>For questions or formal inquiries regarding these Terms, contact our legal counsel:</p>
                <p className="mt-1 font-semibold text-ink">
                  Assetro Legal &amp; Compliance Team &middot; Email:{' '}
                  <a href="mailto:legal@assetro.com" className="text-accent hover:underline">
                    legal@assetro.com
                  </a>
                </p>
              </div>
            </section>

            {/* Bottom Actions */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-line pt-6">
              <Link
                href="/investor/register"
                className="btn-primary w-full sm:w-auto"
              >
                Return to Create Account
              </Link>
              <Link
                href="/privacy"
                className="btn-secondary w-full sm:w-auto"
              >
                View Privacy Policy
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
