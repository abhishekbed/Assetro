'use client';

/**
 * Landing page — a faithful port of the Assetro RWA reference design.
 * Structure, copy, imagery and motion all mirror the reference; colours come
 * from the shared design tokens so it themes with the rest of the portal.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Banknote,
  FileCheck2,
  Link2,
  ShieldCheck,
} from 'lucide-react';
import { useAuthStore, homeForRole } from '@/store/auth.store';
import { ThemeToggle } from '@/components/ThemeToggle';
import { BrandMark } from '@/components/BrandMark';

/* ───────────────────────────── assets ───────────────────────────── */

const IMG = {
  logistics: '/images/landing/ref/logistics-park.jpg',
  lobby: '/images/landing/ref/tenant-lobby.jpg',
  bkcNight: '/images/landing/ref/mumbai-bkc-night.jpg',
  worli: '/images/landing/ref/worli-seaface-tower.jpg',
  bkcTowers: '/images/landing/ref/bkc-glass-towers.jpg',
  bengaluru: '/images/landing/ref/bengaluru-techpark.jpg',
} as const;

/* ───────────────────────────── content ───────────────────────────── */

const NAV = [
  { href: '#why', label: 'Missing Middle' },
  { href: '#how', label: 'How it works' },
  { href: '#offerings', label: 'Offerings' },
  { href: '#calc', label: 'Calculator' },
  { href: '#compare', label: 'Compare' },
  { href: '#trust', label: 'Regulatory' },
];

const TICKER = [
  <><b>One BKC Sovereign Tower</b> · 9.25% net yield</>,
  <><b>EcoWorld Campus</b> · 8.90% net yield</>,
  <><b>Imperial Worli Bay Suites</b> · 10.15% net yield</>,
  <>Registered under the <b>Indian Trusts Act, 1882</b></>,
  <>Rent credited on the <b>5th</b> of every month</>,
  <>Escrow with <b>Axis Bank</b></>,
  <>Minimum entry <b>₹10,000</b></>,
];

const COMPARE_ROUTES = [
  { kicker: 'Traditional route', title: 'Direct Physical Purchase', figure: '₹5 Cr – ₹50 Cr+', muted: true,
    body: 'High entry barrier, single asset risk, heavy paperwork and illiquid exits.' },
  { kicker: 'Assetro advantage', title: 'Assetro Statutory Trust', figure: 'From ₹10,000', muted: false,
    body: 'Direct beneficial interest in institutional property, with asset-level deeds and monthly rental credits.' },
  { kicker: 'Public equities', title: 'Listed Public REITs', figure: '₹300 – ₹400', muted: true,
    body: 'Liquid, but market-linked pricing, with no title to any specific building.' },
];

const PILLARS = [
  { Icon: FileCheck2, title: 'Direct Title Ownership', body: 'Beneficial interest recorded in a registered Trust Deed, not a promissory paper.' },
  { Icon: Link2, title: 'Polygon Immutable Rail', body: 'Smart-contract cap tables reflect real-time trust beneficiaries with C-KYC whitelisting.' },
  { Icon: ShieldCheck, title: 'Bankruptcy Remoteness', body: 'The property is locked in an independent trust, shielded from sponsor insolvency.' },
  { Icon: Banknote, title: 'Automated IMPS Payouts', body: 'Escrow tenant rent is auto-routed to your registered bank on the 5th of every month.' },
];

const STEPS = [
  { n: '01', title: 'Register & C-KYC', body: 'Instant paperless verification via DigiLocker and Aadhaar. No manual documents.' },
  { n: '02', title: 'Inspect Property', body: 'Review legal due diligence, CBRE valuation, tenant leases and Grade-A reports.' },
  { n: '03', title: 'Pay & Mint Deed', body: 'Fund via UPI/NetBanking into an Axis Bank escrow; beneficial interest is recorded.' },
  { n: '04', title: 'Earn Monthly Yield', body: 'Rental dividends credited directly to your designated bank account on the 5th.' },
];

const GALLERY = [
  { img: IMG.bkcNight, alt: 'Mumbai financial district at night', title: 'Mumbai · BKC Financial District', sub: 'Fortune 500 tenants · 9-year lock-in' },
  { img: IMG.worli, alt: 'Worli sea-face tower', title: 'Worli Sea-Face', sub: 'Premium offices' },
  { img: IMG.bengaluru, alt: 'Technology campus', title: 'Bengaluru ORR', sub: 'Tech campus' },
  { img: IMG.lobby, alt: 'Tenant lobby', title: 'Tenant Lobby', sub: 'Pinnacle Tower, Mumbai' },
  { img: IMG.logistics, alt: 'Logistics park', title: 'Logistics Parks', sub: 'Grade-A warehousing' },
];

const OFFERINGS = [
  { cat: 'mum', img: IMG.bkcTowers, alt: 'BKC glass towers', tag: 'FUNDED 87.4%', place: 'Mumbai · BKC',
    title: 'One BKC Sovereign Tower', tenant: 'Tenant: Global Fortune 500 Co.',
    yield: '9.25%', irr: '16.8%', min: '₹10K', pct: 87.4 },
  { cat: 'blr', img: IMG.bengaluru, alt: 'Technology campus', tag: 'FUNDED 62.7%', place: 'Bengaluru · ORR',
    title: 'EcoWorld Campus Technopark', tenant: 'Tenant: Tier-1 US Software Major',
    yield: '8.90%', irr: '15.9%', min: '₹25K', pct: 62.7 },
  { cat: 'mum', img: IMG.worli, alt: 'Worli sea-face tower', tag: 'NEW', place: 'Mumbai · Worli',
    title: 'The Imperial Worli Bay Suites', tenant: 'Tenant: Tier-1 Private Bank',
    yield: '10.15%', irr: '17.2%', min: '₹50K', pct: 14 },
];

const TABS = [
  { id: 'all', label: 'All Assets (3)' },
  { id: 'mum', label: 'Mumbai (2)' },
  { id: 'blr', label: 'Bengaluru (1)' },
];

const COMPARE_ROWS: [string, string, string, string, string][] = [
  ['Minimum investment', '₹10,000', '₹300–₹400', '₹5 Cr–₹50 Cr', '₹10 Lakh–₹1 Cr'],
  ['Specific asset identified', 'Yes (named asset)', 'No, blind pool', 'Yes', 'Partial'],
  ['Statutory legal framework', 'Indian Trusts Act, 1882', 'SEBI REIT Regulations', 'Transfer of Property Act', 'Companies Act 2013'],
  ['Net rental yield', '8.9%–10.2% p.a.', '6.0%–7.2%', '7.5%–8.5%', '7.0%–8.5%'],
  ['Secondary liquidity', 'Peer-to-peer orderbook', 'Stock exchange', 'Illiquid (6–18 months)', 'Notice period'],
  ['Insolvency protection', '100% bankruptcy remote', 'Regulated trust', 'Self-owned', 'High legal risk'],
];

const STATS = [
  { value: '₹145+ Cr', label: 'Syndicated volume' },
  { value: '4,280+', label: 'Verified C-KYC holders' },
  { value: '100%', label: 'On-time rent payouts' },
  { value: '0', label: 'Default / missed claims' },
];

const PARTNERS = ['HDFC Trustee', 'CBRE India', 'JLL Advisory', 'Axis Bank Escrow', 'Polygon PoS', 'Certik Audit'];

const FOOTER_COLS = [
  { h: 'Asset architecture', items: ['Commercial Grade-A', 'Trust Deed Mechanics', 'Secondary Orderbook'] },
  { h: 'Institutional gateways', items: ['SPV Structuring', 'Accredited Investors', 'Custody Trust Framework'] },
  { h: 'Audits & ecosystem', items: ['ICICI Prudential Trustees', 'Axis Bank Escrow', 'Polygon Network'] },
];

const rupee = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');

/* ───────────────────────────── page ───────────────────────────── */

export default function LandingPage() {
  const { isAuthenticated, user } = useAuthStore();
  // Signed in → straight to that role's dashboard; otherwise pick a portal first.
  const terminalHref = isAuthenticated ? homeForRole(user?.role) : '/launch';

  const headerRef = useRef<HTMLElement | null>(null);
  const heroBgRef = useRef<HTMLDivElement | null>(null);
  const stepsRef = useRef<HTMLDivElement | null>(null);

  const [activeNav, setActiveNav] = useState<string>('');
  const [tab, setTab] = useState('all');
  const [barsOn, setBarsOn] = useState(false);
  const [stepProgress, setStepProgress] = useState(0);
  // The step cards carry a scroll-driven `act` class, so React re-renders them
  // constantly. Their reveal has to live in state — an imperatively added class
  // would be wiped by the next render.
  const [stepsRevealed, setStepsRevealed] = useState(false);

  // calculator
  const [amount, setAmount] = useState(100000);
  const [rate, setRate] = useState(9.25);
  const annual = (amount * rate) / 100;

  /* progress bars animate in shortly after mount, as in the reference */
  useEffect(() => {
    const t = setTimeout(() => setBarsOn(true), 200);
    return () => clearTimeout(t);
  }, []);

  /* sticky header state + hero parallax + step tracker progress */
  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      headerRef.current?.classList.toggle('sc', y > 20);
      if (heroBgRef.current && y < 900) {
        heroBgRef.current.style.transform = `translateY(${y * 0.18}px) scale(1.08)`;
      }
      const el = stepsRef.current;
      if (el) {
        const r = el.getBoundingClientRect();
        const p = Math.max(0, Math.min(1, (window.innerHeight * 0.78 - r.top) / (window.innerHeight * 0.45)));
        setStepProgress(p);
      }
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  /* reveal-on-scroll for anything marked .rv / .mv */
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const all = Array.from(document.querySelectorAll<HTMLElement>('.lp .rv, .lp .mv'));

    // Never leave content stuck invisible when motion is off or IO is missing.
    if (reduced || typeof IntersectionObserver === 'undefined') {
      all.forEach((el) => {
        el.style.transitionDelay = '0ms';
        el.classList.add(el.classList.contains('mv') ? 'mv-in' : 'in');
      });
      setStepsRevealed(true);
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          const t = e.target as HTMLElement;
          t.classList.add(t.classList.contains('mv') ? 'mv-in' : 'in');
          window.setTimeout(() => { t.style.transitionDelay = '0ms'; }, 1600);
          io.unobserve(t);
        });
      },
      { threshold: 0.12 },
    );
    // Step cards are revealed through React state instead (see stepsRevealed).
    all.filter((el) => !el.dataset.reactReveal).forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  /* steps section reveal — React-owned so scroll re-renders can't clobber it */
  useEffect(() => {
    const el = stepsRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setStepsRevealed(true);
          io.disconnect();
        }
      },
      { threshold: 0.12 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  /* scroll-spy for the pill nav */
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) setActiveNav('#' + e.target.id); }),
      { rootMargin: '-40% 0px -55% 0px' },
    );
    NAV.forEach(({ href }) => {
      const el = document.querySelector(href);
      if (el) io.observe(el);
    });
    return () => io.disconnect();
  }, []);

  const visibleOfferings = OFFERINGS.filter((o) => tab === 'all' || o.cat === tab);

  return (
    <div className="lp min-h-screen overflow-x-hidden bg-surface text-ink">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <header ref={headerRef} className="fixed inset-x-0 top-0 z-50 pt-3">
        <div className="w">
          <nav className="nv">
            <Link href="/" aria-label="Assetro home" className="flex shrink-0 items-center gap-2 text-[16px] font-extrabold sm:text-[18px]">
              <BrandMark size={30} />
              <span className="leading-none">Assetro</span>
            </Link>

            <div className="links">
              {NAV.map((n) => (
                <a key={n.href} href={n.href} className={activeNav === n.href ? 'on' : undefined}>
                  {n.label}
                </a>
              ))}
            </div>

            <span className="sp" />
            <ThemeToggle />
            <Link href={terminalHref} className="btn-primary shrink-0 rounded-full px-3 py-2 text-xs sm:px-4 sm:text-sm">
              <span className="sm:hidden">Launch</span><span className="hidden sm:inline">Launch Terminal</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </nav>
        </div>
      </header>

      <main id="top">
        {/* ── Hero ─────────────────────────────────────────────────── */}
        <div className="herowrap">
          <div ref={heroBgRef} className="hbg" style={{ ['--hero-img' as string]: `url(${IMG.worli})` }} />
          <div className="w hero relative z-10">
            <div>
              <span className="pill">ACT 1882 CERTIFIED · INDIAN TRUSTS ACT</span>
              <h1>
                Own Real Commercial Property. <i>Digitally.</i>
              </h1>
              <p>
                Invest in institutional-grade, pre-leased Grade-A commercial towers via direct
                beneficial ownership under the Indian Trusts Act, 1882. Tokenised on Polygon, rental
                dividends credited directly to your Demat, UPI and bank account.
              </p>
              <div className="row">
                <a className="btn-primary" href="#offerings">Explore Deeded Offerings →</a>
                <a className="btn-secondary" href="#how">How Trust Structure Works</a>
              </div>
              <div className="mini">
                <div><small>Governing law</small><b>Act 1882 Section 3</b></div>
                <div><small>Asset held</small><b>Zero Debt Loaded</b></div>
                <div><small>Minimum entry</small><b>₹10,000</b></div>
              </div>
            </div>

            <div className="lcard">
              <div
                className="pic"
                role="img"
                aria-label="BKC glass towers"
                style={{ backgroundImage: `url(${IMG.bkcTowers})` }}
              >
                <span className="tag">LIVE · OPEN FOR ALLOCATION</span>
                <span className="tag r">RERA PRE-LEASED</span>
              </div>
              <div className="cb">
                <small className="k">Bandra Kurla Complex, Mumbai</small>
                <h3>One BKC Sovereign Tower</h3>
                <div className="m3">
                  <div><small>Net yield</small><b>9.25%</b></div>
                  <div><small>Target IRR</small><b>16.8%</b></div>
                  <div><small>Min ticket</small><b>₹10,000</b></div>
                </div>
                <div className="mu text-xs">Syndicate progress · 87.4% subscribed</div>
                <div className="bar"><i style={{ width: barsOn ? '87.4%' : 0 }} /></div>
                <a className="btn-primary w-full" href="#offerings">View Due Diligence &amp; Invest</a>
              </div>
            </div>
          </div>
        </div>

        {/* ── Ticker ───────────────────────────────────────────────── */}
        <div className="tick">
          <div>
            {[...TICKER, ...TICKER].map((item, i) => (
              <span key={i}>{item}</span>
            ))}
          </div>
        </div>

        {/* ── Missing middle ───────────────────────────────────────── */}
        <section className="alt" id="why">
          <div className="w">
            <div className="c">
              <span className="k mv" data-a="u">Structural paradigm</span>
              <h2 className="mv" data-a="u">The Missing Middle of Indian <i>Commercial Real Estate</i></h2>
              <p className="mu mv" data-a="u">
                High-yield Indian commercial real estate was reserved for institutions and sovereign
                funds. Public REITs created liquidity, but removed direct asset title. Assetro bridges
                the gap.
              </p>
            </div>

            <div className="g3">
              {COMPARE_ROUTES.map((r, i) => (
                <div
                  key={r.title}
                  className={`box mv${r.muted ? '' : ' hl'}`}
                  data-a={['l', 'z', 'r'][i]}
                  style={{ transitionDelay: `${i * 120}ms` }}
                >
                  <span className={`k${r.muted ? ' mu' : ''}`}>{r.kicker}</span>
                  <h3>{r.title}</h3>
                  <div className="big" style={r.muted ? { color: 'rgb(var(--text-muted))' } : undefined}>
                    {r.figure}
                  </div>
                  <p>{r.body}</p>
                </div>
              ))}
            </div>

            <div className="g4">
              {PILLARS.map(({ Icon, title, body }, i) => (
                <div key={title} className="box mv" data-a="f" style={{ transitionDelay: `${i * 110}ms` }}>
                  <div className="ic"><Icon className="h-[18px] w-[18px]" /></div>
                  <h3>{title}</h3>
                  <p>{body}</p>
                </div>
              ))}
            </div>

            <div className="note mv" data-a="u">
              <div>
                <b>Why Registered Trust Deeds over private limited SPVs?</b>
                <br />
                Under Section 3 of the Indian Trusts Act, 1882, beneficiaries hold enforceable rights
                in the trust property — without the shareholder caps and compliance burden of a
                Private Limited Company.
              </div>
              <span className="btn-secondary whitespace-nowrap">Zero-Gap Title Friction</span>
            </div>
          </div>
        </section>

        {/* ── How it works ─────────────────────────────────────────── */}
        <section id="how">
          <div className="w">
            <div className="c">
              <span className="k mv" data-a="u">Seamless protocol</span>
              <h2 className="mv" data-a="u">Invest in Commercial Deeds in <i>4 Simple Steps</i></h2>
              <p className="mu mv" data-a="u">From C-KYC to monthly rent in under 5 minutes of effort.</p>
            </div>

            <div className="trk">
              <i className="fill" style={{ width: `${stepProgress * 75}%` }} />
              {STEPS.map((s, i) => (
                <b key={s.n} className={stepProgress > 0.02 && stepProgress >= i / 3 - 0.001 ? 'on' : undefined} />
              ))}
            </div>

            <div className="g4" ref={stepsRef}>
              {STEPS.map((s, i) => {
                const active = stepProgress > 0.02 && stepProgress >= i / 3 - 0.001;
                return (
                  <div
                    key={s.n}
                    className={`box mv${stepsRevealed ? ' mv-in' : ''}${active ? ' act' : ''}`}
                    data-a="u"
                    data-react-reveal="1"
                    style={{ transitionDelay: stepsRevealed ? '0ms' : `${i * 130}ms` }}
                  >
                    <div className="num">{s.n}</div>
                    <h3>{s.title}</h3>
                    <p>{s.body}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ── Gallery ──────────────────────────────────────────────── */}
        <section className="alt">
          <div className="w">
            <div className="c">
              <span className="k">Inside the portfolio</span>
              <h2>Grade-A Assets, <i>Verified Tenants</i></h2>
              <p className="mu">
                Every building is inspected, valued and leased to blue-chip corporates before it
                reaches you.
              </p>
            </div>
            <div className="gal">
              {GALLERY.map((g) => (
                <div key={g.title} className="lcard rv">
                  <div className="pic" role="img" aria-label={g.alt} style={{ backgroundImage: `url(${g.img})` }} />
                  <div className="cap">
                    <b>{g.title}</b>
                    <small>{g.sub}</small>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Offerings ────────────────────────────────────────────── */}
        <section id="offerings">
          <div className="w">
            <div className="c">
              <span className="k">Institutional-grade</span>
              <h2>Vetted <i>Offerings Catalog</i></h2>
              <p className="mu">
                Grade-A properties with verified AAA corporate tenants on 5–9 year lock-in leases.
              </p>
            </div>

            <div className="tabs">
              {TABS.map((t) => (
                <button key={t.id} className={tab === t.id ? 'on' : undefined} onClick={() => setTab(t.id)}>
                  {t.label}
                </button>
              ))}
            </div>

            <div className="g3">
              {visibleOfferings.map((o) => (
                <div key={o.title} className="lcard">
                  <div className="pic" role="img" aria-label={o.alt} style={{ backgroundImage: `url(${o.img})` }}>
                    <span className="tag">{o.tag}</span>
                  </div>
                  <div className="cb">
                    <small className="k">{o.place}</small>
                    <h3>{o.title}</h3>
                    <p className="mu">{o.tenant}</p>
                    <div className="m3">
                      <div><small>Net yield</small><b>{o.yield}</b></div>
                      <div><small>Target IRR</small><b>{o.irr}</b></div>
                      <div><small>Min</small><b>{o.min}</b></div>
                    </div>
                    <div className="bar"><i style={{ width: barsOn ? `${o.pct}%` : 0 }} /></div>
                    <Link className="btn-primary w-full" href={terminalHref}>Allocate Capital →</Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Calculator ───────────────────────────────────────────── */}
        <section id="calc">
          <div className="w">
            <div className="calc rv" style={{ ['--hero-img' as string]: `url(${IMG.worli})` }}>
              <div>
                <span className="k">Yield calculator</span>
                <h2>See what your <i>rent</i> could look like</h2>
                <p className="mu">
                  Illustrative projection at each offering&apos;s target net yield. Targets are not
                  guaranteed.
                </p>

                <div className="cl">
                  <span>Investment amount</span>
                  <b>{rupee(amount)}</b>
                </div>
                <input
                  type="range"
                  min={10000}
                  max={1000000}
                  step={10000}
                  value={amount}
                  onChange={(e) => setAmount(+e.target.value)}
                  aria-label="Investment amount"
                  className="w-full accent-accent"
                />

                <div className="seg">
                  {[8.9, 9.25, 10.15].map((y) => (
                    <button key={y} className={rate === y ? 'on' : undefined} onClick={() => setRate(y)}>
                      {y.toFixed(2)}%
                    </button>
                  ))}
                </div>
              </div>

              <div className="res">
                <div><small>Monthly rent</small><b>{rupee(annual / 12)}</b></div>
                <div><small>Yearly rent</small><b>{rupee(annual)}</b></div>
                <div><small>5-year rent</small><b>{rupee(annual * 5)}</b></div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Comparison ───────────────────────────────────────────── */}
        <section className="alt" id="compare">
          <div className="w">
            <div className="c">
              <span className="k">Strict structural comparison</span>
              <h2>Not All Real Estate Investment <i>Is Equal</i></h2>
              <p className="mu">
                See how registered trust deeds under the 1882 Act outperform traditional listed SPVs
                and public listed REITs.
              </p>
            </div>
            <div className="tw rv">
              <table>
                <thead>
                  <tr>
                    <th>Parameter</th>
                    <th>Assetro Trust Token</th>
                    <th>Public listed REITs</th>
                    <th>Direct commercial</th>
                    <th>Unregulated SPV / LLP</th>
                  </tr>
                </thead>
                <tbody>
                  {COMPARE_ROWS.map((row) => (
                    <tr key={row[0]}>
                      {row.map((cell, i) => <td key={i}>{cell}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* ── Trust / provenance ───────────────────────────────────── */}
        <section id="trust">
          <div className="w">
            <div className="c">
              <span className="k">Institutional provenance</span>
              <h2>Built on 140 Years of <i>Settled Indian Jurisprudence</i></h2>
              <p className="mu">
                Assetro does not issue speculative crypto-tokens. Every asset is backed by a
                registered trust deed, independent trustee and audited rental flows.
              </p>
            </div>

            <div className="st mt-10">
              {STATS.map((s) => (
                <div key={s.label} className="rv">
                  <b>{s.value}</b>
                  <span>{s.label}</span>
                </div>
              ))}
            </div>

            <div className="pt">
              {PARTNERS.map((p) => <span key={p} className="rv">{p}</span>)}
            </div>
          </div>
        </section>

        {/* ── CTA ──────────────────────────────────────────────────── */}
        <section className="pt-0">
          <div className="w">
            <div className="cta" style={{ ['--cta-img' as string]: `url(${IMG.bkcNight})` }}>
              <span className="k" style={{ color: 'rgb(var(--accent2))' }}>C-KYC verification active</span>
              <h2>Step Into Institutional Real Estate. <i>From ₹10,000.</i></h2>
              <p>
                Gain title-backed, monthly cashflow-yielding commercial properties protected by 140
                years of Indian Trust Act precedent. Complete C-KYC in under 90 seconds.
              </p>
              <div className="row justify-center">
                <a className="btn-primary" href="#offerings">
                  Explore Active Offerings →
                </a>
                <Link className="btn" href={terminalHref} style={{ background: 'transparent', color: '#fff', borderColor: '#ffffff40' }}>
                  Schedule Private Briefing
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* ── Footer ─────────────────────────────────────────────────── */}
      <footer>
        <div className="w">
          <div className="g4">
            <div>
              <div className="flex items-center gap-2 text-[18px] font-extrabold text-ink">
                <BrandMark size={30} />
                Assetro
              </div>
              <p className="mt-2.5">
                Sovereign-grade fractional real estate protocol for prime commercial and mixed-use
                residential assets across India.
              </p>
            </div>
            {FOOTER_COLS.map((col) => (
              <div key={col.h}>
                <h4>{col.h}</h4>
                <ul>{col.items.map((i) => <li key={i}>{i}</li>)}</ul>
              </div>
            ))}
          </div>
          <div className="disc">
            © {new Date().getFullYear()} Assetro
          </div>
        </div>
      </footer>
    </div>
  );
}
