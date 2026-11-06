'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Shield,
  Globe,
  Zap,
  BarChart3,
  Users,
  Lock,
  ArrowRight,
  CheckCircle,
  Coins,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
import { BrandMark } from '@/components/BrandMark';
import { HeroNetworkCanvas } from '@/components/issuer/landing/HeroNetworkCanvas';
import { StatCounter } from '@/components/issuer/landing/StatCounter';
import { SpotlightCard } from '@/components/issuer/landing/SpotlightCard';
import { InteractiveHeroIllustration } from '@/components/issuer/landing/InteractiveHeroIllustration';
import { OnChainMonitorCard } from '@/components/issuer/landing/OnChainMonitorCard';

const STATS = [
  { value: '500+', label: 'Issuers Onboarded' },
  { value: '$10B+', label: 'Assets Tokenized' },
  { value: '50+', label: 'Countries Served' },
  { value: '1M+', label: 'Investors Reached' },
];

const PRODUCTS = [
  {
    icon: Coins,
    title: 'Token Issuance Engine',
    desc: 'Launch compliant ERC-3643 security tokens for equity, real estate, bonds, and funds with a no-code wizard.',
  },
  {
    icon: Shield,
    title: 'Compliance Automation',
    desc: 'Built-in KYC/AML workflows, whitelisting, country restrictions, and transfer rule enforcement.',
  },
  {
    icon: Users,
    title: 'Investor Portal',
    desc: 'Give your investors a professional portal to manage holdings, complete KYC, and purchase tokens.',
  },
  {
    icon: Globe,
    title: 'Multi-Chain Support',
    desc: 'Deploy on Ethereum, Polygon, Bharat Blockchain, or any EVM-compatible network.',
  },
  {
    icon: BarChart3,
    title: 'Cap Table Management',
    desc: 'Real-time ownership tracking, CSV exports, and shareholder registry directly from the blockchain.',
  },
  {
    icon: Lock,
    title: 'Enterprise Security',
    desc: 'Role-based access control, audit trails, 2FA, and wallet-based authentication for every action.',
  },
];

const STEPS = [
  {
    step: '01',
    title: 'Submit Your Application',
    desc: 'Fill out our issuer contact form with your company information. Takes less than 5 minutes.',
  },
  {
    step: '02',
    title: 'Compliance Review',
    desc: 'Our team reviews your application and verifies your organization. Typically 1-2 business days.',
  },
  {
    step: '03',
    title: 'Receive Credentials',
    desc: 'Upon approval you receive login credentials and full access to the issuer dashboard.',
  },
  {
    step: '04',
    title: 'Issue Your First Token',
    desc: 'Use our wizard to configure, deploy, and manage your first security token in minutes.',
  },
];

const ASSET_TYPES = [
  'Equity & Shares',
  'Real Estate',
  'Corporate Bonds',
  'Investment Funds',
  'Commodities',
  'Infrastructure',
  'Art & Collectibles',
  'Utilities',
];

function useInView<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, inView };
}

function Reveal({
  children,
  className = '',
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const { ref, inView } = useInView<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ease-out ${inView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

export default function LandingPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();
  const [activeSection, setActiveSection] = useState<string>('');

  useEffect(() => {
    if (isAuthenticated) {
      router.replace('/issuer/dashboard');
    }
  }, [isAuthenticated, router]);

  // Smooth scroll handler with offset for fixed navbar
  const scrollToSection = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault();
    const element = document.getElementById(id);
    if (!element) return;

    const navHeight = 76;
    const elementPosition = element.getBoundingClientRect().top + window.pageYOffset;
    const targetPosition = elementPosition - navHeight;

    window.scrollTo({
      top: targetPosition,
      behavior: 'smooth',
    });

    window.history.pushState(null, '', `#${id}`);
    setActiveSection(id);
  };

  useEffect(() => {
    // If URL has a hash on initial load (e.g. #products, #solutions, #how-it-works)
    if (typeof window !== 'undefined' && window.location.hash) {
      const hashId = window.location.hash.replace('#', '');
      const el = document.getElementById(hashId);
      if (el) {
        setTimeout(() => {
          const navHeight = 76;
          const pos = el.getBoundingClientRect().top + window.pageYOffset - navHeight;
          window.scrollTo({ top: pos, behavior: 'smooth' });
          setActiveSection(hashId);
        }, 150);
      }
    }

    // Scroll spy to update active nav link on scroll
    const handleScroll = () => {
      const sections = ['products', 'solutions', 'how-it-works'];
      const scrollPos = window.pageYOffset + 140;

      for (const sectionId of sections) {
        const el = document.getElementById(sectionId);
        if (el) {
          const top = el.offsetTop;
          const height = el.offsetHeight;
          if (scrollPos >= top && scrollPos < top + height) {
            setActiveSection(sectionId);
            break;
          }
        }
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 font-sans selection:bg-cyan-500 selection:text-slate-950">
      {/* ── Navbar ── */}
      <nav className="fixed top-0 z-50 w-full border-b border-slate-800/80 bg-slate-950/85 transition-all duration-300">
        <div className="flex w-full items-center justify-between gap-2 px-4 py-4 sm:px-6 lg:px-10 xl:px-16">
          <div
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="flex items-center gap-2 group cursor-pointer"
          >
            <BrandMark size={36} className="transition-transform duration-300 group-hover:scale-105 group-hover:rotate-3" />
            <span className="text-xl font-bold tracking-tight text-ink transition-colors group-hover:text-cyan-300">
              Assetro
            </span>
          </div>
          <div className="hidden items-center gap-8 lg:flex">
            {[
              { id: 'products', label: 'Products' },
              { id: 'solutions', label: 'Solutions' },
              { id: 'how-it-works', label: 'How It Works' },
            ].map((link) => {
              const isActive = activeSection === link.id;
              return (
                <a
                  key={link.id}
                  href={`#${link.id}`}
                  onClick={(e) => scrollToSection(e, link.id)}
                  className={`group relative py-1 text-sm font-medium transition-colors ${
 isActive ? 'text-cyan-300' : 'text-slate-400 hover:text-ink' } after:absolute after:bottom-0 after:left-0 after:h-0.5 ${
 isActive
 ? 'after:w-full after:bg-gradient-to-r after:from-cyan-400 after:to-blue-500' : 'after:w-0 hover:after:w-full after:bg-gradient-to-r after:from-blue-400 after:to-cyan-400' } after:transition-all after:duration-300`}
                >
                  {link.label}
                </a>
              );
            })}
          </div>
          <div className="flex shrink-0 items-center gap-1 sm:gap-3">
            <Link
              href="/issuer/login"
              className="rounded-md px-2 py-2 text-xs font-medium text-slate-300 hover:text-ink transition-colors hover:bg-slate-900/60 sm:px-4 sm:text-sm"
            >
              Sign In
            </Link>
            <Link
              href="/issuer/register"
              className="relative group overflow-hidden rounded-md bg-accent px-3 py-2 text-xs font-semibold text-slate-950 shadow-lg transition-all duration-300 hover:-translate-y-0.5 sm:px-4 sm:text-sm"
            >
              <span className="relative z-10">Get Started</span>
              <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="relative overflow-hidden bg-surface pt-32 pb-20">
        {/* Interactive Constellation Network Canvas */}
        <HeroNetworkCanvas />

        {/* Background grid */}
        <div
          className="pointer-events-none absolute inset-0 opacity-10"
          style={{
            backgroundImage:
              'linear-gradient(rgba(59,130,246,0.3) 1px,transparent 1px),linear-gradient(90deg,rgba(59,130,246,0.3) 1px,transparent 1px)',
            backgroundSize: '60px 60px',
          }}
        />
        {/* Glow blobs */}
        <div className="pointer-events-none absolute -right-24 top-10 h-96 w-96 rounded-full bg-blue-500/20 blur-3xl [animation:driftA_10s_ease-in-out_infinite]" />
        <div className="pointer-events-none absolute -left-24 bottom-0 h-80 w-80 rounded-full bg-cyan-400/15 blur-3xl [animation:driftB_12s_ease-in-out_infinite]" />

        <div className="relative z-10 w-full px-4 sm:px-6 lg:px-10 xl:px-16">
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
            <div>
              <div
                className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-4 py-1.5 text-sm text-blue-300 opacity-0 [animation:fadeInUp_0.7s_ease-out_0.05s_forwards]"
              >
                <span className="relative flex h-2 w-2 mr-0.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
                <Zap className="h-3.5 w-3.5 text-cyan-400" />
                <span>ERC-3643 &middot; T-REX Standard &middot; Multi-Chain</span>
              </div>

              <h1
                className="max-w-xl text-4xl font-extrabold leading-tight tracking-tight text-ink opacity-0 sm:text-5xl lg:text-6xl [animation:fadeInUp_0.7s_ease-out_0.15s_forwards]"
              >
                The World&apos;s Leading{' '}
                <span className="text-accent [animation:textShimmer_6s_ease-in-out_infinite_alternate]">
                  Security Token
                </span>{' '}
                Issuance Platform
              </h1>

              <p
                className="mt-6 max-w-lg text-lg text-slate-300/90 leading-relaxed opacity-0 [animation:fadeInUp_0.7s_ease-out_0.25s_forwards]"
              >
                Issue, manage and transfer digital securities in full compliance with global
                regulations. Trusted by 500+ institutions worldwide.
              </p>

              <div
                className="mt-10 flex flex-col gap-4 opacity-0 sm:flex-row [animation:fadeInUp_0.7s_ease-out_0.35s_forwards]"
              >
                <Link
                  href="/issuer/register"
                  className="relative group overflow-hidden inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-8 py-4 text-base font-semibold text-slate-950 shadow-lg transition-all duration-300 hover:-translate-y-0.5"
                >
                  <span className="relative z-10 flex items-center gap-2">
                    Apply as Issuer
                    <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                  </span>
                  <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/35 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
                </Link>
                <a
                  href="#how-it-works"
                  onClick={(e) => scrollToSection(e, 'how-it-works')}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-800/60 px-8 py-4 text-base font-semibold text-slate-200 transition-all duration-300 hover:-translate-y-0.5 hover:border-slate-600 hover:bg-slate-800"
                >
                  See How It Works
                </a>
              </div>
            </div>

            {/* Interactive 3D Illustration Container */}
            <div
              className="relative flex items-center justify-center opacity-0 [animation:fadeInUp_0.9s_ease-out_0.3s_forwards]"
            >
              <InteractiveHeroIllustration />
            </div>
          </div>

          {/* Stats row with animated counter */}
          <Reveal className="mt-16 lg:mt-20">
            <div className="grid grid-cols-2 gap-4 rounded-2xl border border-slate-800/80 bg-slate-900/60 p-4 sm:p-6 sm:grid-cols-4 shadow-xl">
              {STATS.map((s) => (
                <StatCounter key={s.label} value={s.value} label={s.label} />
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Asset Types Banner with Hover Pause & Gradient Edge Fade ── */}
      <div className="relative overflow-hidden bg-accent bg-[length:200%_200%] [animation:gradientShift_12s_ease_infinite] py-3.5 shadow-inner">
        {/* Soft edge fade masks */}
        <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-24 bg-gradient-to-r from-slate-950 via-slate-950/60 to-transparent z-10" />
        <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-24 bg-gradient-to-l from-slate-950 via-slate-950/60 to-transparent z-10" />

        <div className="flex animate-[slide_30s_linear_infinite] items-center gap-8 whitespace-nowrap hover:[animation-play-state:paused]">
          {[...ASSET_TYPES, ...ASSET_TYPES].map((type, i) => (
            <span key={i} className="inline-flex items-center gap-3 text-sm font-semibold tracking-wide text-ink drop-shadow-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-200" />
              {type}
            </span>
          ))}
        </div>
      </div>

      {/* ── Products with Spotlight Cards ── */}
      <section id="products" className="scroll-mt-20 relative bg-slate-950 py-24 overflow-hidden">
        <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[600px] w-[600px] rounded-full bg-blue-500/5 blur-[120px]" />
        <div className="relative w-full px-4 sm:px-6 lg:px-10 xl:px-16">
          <Reveal className="text-center">
            <p className="text-sm font-semibold uppercase tracking-widest text-cyan-400">Platform</p>
            <h2 className="mt-2 text-4xl font-extrabold tracking-tight text-ink sm:text-5xl">
              Everything you need to tokenize
            </h2>
            <p className="mt-4 max-w-2xl mx-auto text-lg text-slate-400">
              An end-to-end platform for digital asset issuance — from creation to compliance to transfer.
            </p>
          </Reveal>

          <div className="mt-16 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {PRODUCTS.map((p, i) => {
              const Icon = p.icon;
              return (
                <Reveal key={p.title} delay={i * 80}>
                  <SpotlightCard className="h-full">
                    <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500/10 text-cyan-400 transition-all duration-300 group-hover:scale-110 group-hover:bg-gradient-to-br group-hover:from-blue-500 group-hover:to-cyan-400 group-hover:text-slate-950 group-hover:shadow-lg">
                      <Icon className="h-6 w-6 transition-transform duration-300 group-hover:rotate-6" />
                    </div>
                    <h3 className="text-lg font-semibold text-ink transition-colors duration-200 group-hover:text-cyan-300">
                      {p.title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-slate-400 transition-colors group-hover:text-slate-300">
                      {p.desc}
                    </p>
                  </SpotlightCard>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Solutions / Why Us ── */}
      <section id="solutions" className="scroll-mt-20 relative bg-slate-900/70 py-24 border-y border-slate-800/60">
        <div className="w-full px-4 sm:px-6 lg:px-10 xl:px-16">
          <div className="grid gap-16 lg:grid-cols-2 lg:items-center">
            <Reveal>
              <p className="text-sm font-semibold uppercase tracking-widest text-cyan-400">Why Assetro</p>
              <h2 className="mt-2 text-4xl font-extrabold tracking-tight text-ink sm:text-5xl">
                Built for regulated markets from day one
              </h2>
              <p className="mt-4 text-lg text-slate-400 leading-relaxed">
                We implement the ERC-3643 standard — the globally recognized framework for compliant
                security token issuance on public blockchains.
              </p>
              <ul className="mt-8 space-y-4">
                {[
                  'Full KYC/AML workflow with manual and automated verification',
                  'On-chain compliance — restrictions enforced at the smart contract level',
                  'Multi-jurisdictional support: SEBI, FATF, EU AML directives',
                  'Non-custodial wallet integration — you keep control of your assets',
                  'White-label ready — your brand, your investors',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3 group">
                    <div className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400 transition-transform duration-300 group-hover:scale-110">
                      <CheckCircle className="h-4 w-4" />
                    </div>
                    <span className="text-slate-300 transition-colors group-hover:text-ink">
                      {item}
                    </span>
                  </li>
                ))}
              </ul>
              <Link
                href="/issuer/register"
                className="group mt-8 inline-flex items-center gap-2 rounded-lg bg-accent px-6 py-3.5 text-sm font-semibold text-slate-950 shadow-lg transition-all duration-300 hover:-translate-y-0.5"
              >
                Start Your Application
                <ChevronRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
              </Link>
            </Reveal>

            {/* Live On-Chain Telemetry Monitor Card */}
            <Reveal delay={120}>
              <OnChainMonitorCard />
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── How It Works ── */}
      <section id="how-it-works" className="scroll-mt-20 relative bg-slate-950 py-24">
        <div className="w-full px-4 sm:px-6 lg:px-10 xl:px-16">
          <Reveal className="text-center">
            <p className="text-sm font-semibold uppercase tracking-widest text-cyan-400">Process</p>
            <h2 className="mt-2 text-4xl font-extrabold tracking-tight text-ink sm:text-5xl">
              Get started in 4 simple steps
            </h2>
          </Reveal>

          <div className="relative mt-20">
            {/* Animated vertical pulse line */}
            <div className="absolute left-1/2 hidden h-full w-px -translate-x-1/2 bg-slate-800 lg:block overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-36 bg-gradient-to-b from-transparent via-cyan-400 to-transparent [animation:timelinePulse_4s_ease-in-out_infinite]" />
            </div>

            <div className="space-y-12 lg:space-y-0">
              {STEPS.map((s, i) => (
                <Reveal key={s.step} delay={i * 100}>
                  <div
                    className={`relative flex flex-col gap-6 lg:flex-row lg:items-center ${i % 2 === 0 ? 'lg:flex-row' : 'lg:flex-row-reverse'}`}
                  >
                    <div className={`flex-1 ${i % 2 === 0 ? 'lg:text-right' : 'lg:text-left'}`}>
                      <div
                        className={`group inline-flex flex-col gap-2 rounded-2xl border border-slate-800 bg-slate-900/60 p-6 transition-all duration-300 hover:-translate-y-1 hover:border-cyan-500/40 hover:bg-slate-900/90 hover:shadow-xl ${i % 2 === 0 ? 'lg:ml-auto' : ''} max-w-sm`}
                      >
                        <span className="text-3xl font-black text-accent transition-transform duration-300 group-hover:scale-105">
                          {s.step}
                        </span>
                        <h3 className="text-lg font-semibold text-ink transition-colors group-hover:text-cyan-300">
                          {s.title}
                        </h3>
                        <p className="text-sm text-slate-400 group-hover:text-slate-300 transition-colors">
                          {s.desc}
                        </p>
                      </div>
                    </div>

                    {/* Step central badge with ping effect */}
                    <div className="relative z-10 mx-auto flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-slate-950 shadow-lg transition-transform duration-300 hover:scale-110 lg:mx-0">
                      <span className="pointer-events-none absolute -inset-1 rounded-full bg-cyan-400/25 animate-ping opacity-40" />
                      {i + 1}
                    </div>

                    <div className="flex-1" />
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="relative overflow-hidden bg-slate-950 py-24">
        <div className="w-full px-4 sm:px-6 lg:px-10 xl:px-16">
          <Reveal>
            <div className="cta-band relative overflow-hidden px-6 py-16 text-center sm:px-16">
              <div
                className="pointer-events-none absolute inset-0 opacity-10"
                style={{
                  backgroundImage:
                    'linear-gradient(rgba(255,255,255,0.5) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.5) 1px,transparent 1px)',
                  backgroundSize: '48px 48px',
                }}
              />
              <div className="pointer-events-none absolute -left-16 -top-16 h-64 w-64 rounded-full bg-white/10 blur-3xl [animation:driftA_10s_ease-in-out_infinite]" />
              <div className="pointer-events-none absolute -bottom-16 -right-16 h-64 w-64 rounded-full bg-cyan-300/20 blur-3xl [animation:driftB_12s_ease-in-out_infinite]" />

              <div className="relative z-10">
                <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/15 px-4 py-1.5 text-sm font-medium text-white">
                  <Sparkles className="h-3.5 w-3.5 animate-spin" style={{ animationDuration: '8s' }} />
                  Start onboarding today
                </div>
                <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-5xl">
                  Ready to tokenize your assets?
                </h2>
                <p className="cta-muted mx-auto mt-4 max-w-2xl text-lg leading-relaxed">
                  Join 500+ issuers who trust Assetro to manage their digital securities.
                  Apply today and get onboarded within 48 hours.
                </p>
                <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
                  <Link href="/issuer/register" className="cta-btn group text-base">
                    Apply as Issuer
                    <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                  </Link>
                  <Link href="/issuer/login" className="cta-btn-ghost text-base">
                    Already have an account? Sign In
                  </Link>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-slate-800/80 bg-slate-950 py-12">
        <div className="w-full px-4 sm:px-6 lg:px-10 xl:px-16">
          <div className="flex flex-col items-center justify-between gap-6 md:flex-row">
            <div className="flex items-center gap-2">
              <BrandMark size={32} />
              <span className="text-lg font-bold text-ink">Assetro</span>
            </div>
            <div className="flex items-center gap-6 text-sm text-slate-500">
              <Link href="/issuer/register" className="hover:text-ink transition-colors">
                Apply
              </Link>
              <Link href="/issuer/login" className="hover:text-ink transition-colors">
                Sign In
              </Link>
              <span>© {new Date().getFullYear()} Assetro Platform. All rights reserved.</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
