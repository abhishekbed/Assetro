'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  Search,
  Grid3X3,
  List,
  Globe,
  Shield,
  ShieldCheck,
  SearchX,
  ArrowUpDown,
  ArrowRight,
} from 'lucide-react';
import api from '@/lib/api';
import { TokenMedia } from '@/components/TokenMedia';
import { assetClassLabel, assetClassIcon } from '@/lib/asset-classes';
import { chainLabel } from '@/lib/chains';

interface Token {
  id: string;
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: number;
  assetType: string;
  description: string;
  status: string;
  chainId: string;
  price?: number;
  availableSupply?: number;
  minInvestment?: number;
  compliance?: string[];
  chain?: string;
  createdAt?: string;
  metadata?: {
    offering?: {
      initial_price?: number;
      min_investment?: number;
      max_investment?: number;
    };
    compliance?: {
      kyc_required?: boolean;
      accredited_only?: boolean;
    };
    logo?: string;
  };
}

type SortOption = 'newest' | 'price_asc' | 'price_desc' | 'asset_type';
type ComplianceFilter = 'all' | 'kyc' | 'accredited';

function SoldProgressBar({ pct }: { pct: number }) {
  return (
    <div className="meter">
      <span style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  );
}

export default function TokensPage() {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [search, setSearch] = useState('');
  const [filterAssetType, setFilterAssetType] = useState('all');
  const [filterCompliance, setFilterCompliance] = useState<ComplianceFilter>('all');
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [tokens, setTokens] = useState<Token[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchTokens = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await api.get('/tokens');
        const data = response.data;
        if (data.success && Array.isArray(data.data)) {
          setTokens(data.data.filter((t: Token) => t.status === 'active' || t.status === 'draft'));
        } else {
          setTokens([]);
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load tokens');
        setTokens([]);
      } finally {
        setLoading(false);
      }
    };
    fetchTokens();
  }, []);

  // Derived helpers
  const getPrice = (t: Token) =>
    t.price ?? t.metadata?.offering?.initial_price ?? null;

  const getMinInvestment = (t: Token) =>
    t.minInvestment ?? t.metadata?.offering?.min_investment ?? null;

  const getSoldPct = (t: Token): number => {
    const supply = Number(t.totalSupply || 0);
    if (supply === 0) return 0;
    const available = t.availableSupply !== undefined ? Number(t.availableSupply) : null;
    if (available === null) return 0;
    return Math.min(((supply - available) / supply) * 100, 100);
  };

  const isKycRequired = (t: Token) =>
    t.metadata?.compliance?.kyc_required !== false; // default: KYC required

  const isAccreditedOnly = (t: Token) =>
    t.metadata?.compliance?.accredited_only === true;

  const assetTypes = useMemo(
    () => ['all', ...Array.from(new Set(tokens.map(t => t.assetType).filter(Boolean)))],
    [tokens],
  );

  const filteredAndSorted = useMemo(() => {
    let list = tokens.filter(t => {
      const matchSearch =
        t.name.toLowerCase().includes(search.toLowerCase()) ||
        t.symbol.toLowerCase().includes(search.toLowerCase());
      const matchType = filterAssetType === 'all' || t.assetType === filterAssetType;
      const matchCompliance =
        filterCompliance === 'all' ||
        (filterCompliance === 'kyc' && isKycRequired(t) && !isAccreditedOnly(t)) ||
        (filterCompliance === 'accredited' && isAccreditedOnly(t));
      return matchSearch && matchType && matchCompliance;
    });

    switch (sortBy) {
      case 'price_asc':
        list = [...list].sort((a, b) => (getPrice(a) ?? 0) - (getPrice(b) ?? 0));
        break;
      case 'price_desc':
        list = [...list].sort((a, b) => (getPrice(b) ?? 0) - (getPrice(a) ?? 0));
        break;
      case 'asset_type':
        list = [...list].sort((a, b) => (a.assetType || '').localeCompare(b.assetType || ''));
        break;
      case 'newest':
      default:
        list = [...list].sort((a, b) =>
          new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime()
        );
    }
    return list;
  }, [tokens, search, filterAssetType, filterCompliance, sortBy]);

  const hasFilters = search !== '' || filterAssetType !== 'all' || filterCompliance !== 'all';

  const clearFilters = () => {
    setSearch('');
    setFilterAssetType('all');
    setFilterCompliance('all');
  };

  const header = (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="kicker">Primary Market</p>
        <h1 className="page-title mt-1">Available Tokens</h1>
        <p className="mt-1 text-muted">Browse and invest in tokenized real-world assets</p>
      </div>
      {!loading && !error && (
        <p className="text-sm text-muted">
          <span className="font-semibold text-ink">{filteredAndSorted.length}</span>
          {filteredAndSorted.length === tokens.length
            ? ` offering${tokens.length === 1 ? '' : 's'}`
            : ` of ${tokens.length} offerings`}
        </p>
      )}
    </div>
  );

  if (loading) {
    return (
      <div className="space-y-6 pb-10">
        {header}
        <div className="h-[68px] animate-pulse rounded-card bg-surface-header" />
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="card overflow-hidden">
              <div className="h-40 animate-pulse bg-surface-header" />
              <div className="space-y-3 p-5">
                <div className="h-5 w-2/3 animate-pulse rounded bg-surface-header" />
                <div className="h-4 w-1/3 animate-pulse rounded bg-surface-header" />
                <div className="h-12 animate-pulse rounded bg-surface-header" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6 pb-10">
        {header}
        <div className="card flex flex-col items-center justify-center px-6 py-14 text-center">
          <div className="icon-chip h-12 w-12 bg-danger-100 text-danger">
            <SearchX className="h-6 w-6" />
          </div>
          <p className="mt-3 text-base font-bold text-ink">Could not load offerings</p>
          <p className="mt-1 max-w-sm text-sm text-muted">{error}</p>
          <button onClick={() => window.location.reload()} className="btn-primary mt-4">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-10">
      {header}

      {/* ── Filters ─────────────────────────────────────────────────────── */}
      <div className="panel flex flex-col gap-3 p-3 lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1 lg:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            type="text"
            placeholder="Search by name or symbol…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input-field pl-10"
            aria-label="Search tokens"
          />
        </div>

        <div className="flex flex-1 flex-wrap items-center gap-2">
          <select
            value={filterAssetType}
            onChange={e => setFilterAssetType(e.target.value)}
            className="input-field w-auto"
            aria-label="Filter by asset class"
          >
            {assetTypes.map(t => (
              <option key={t} value={t}>{t === 'all' ? 'All Types' : assetClassLabel(t)}</option>
            ))}
          </select>

          <select
            value={filterCompliance}
            onChange={e => setFilterCompliance(e.target.value as ComplianceFilter)}
            className="input-field w-auto"
            aria-label="Filter by investor requirement"
          >
            <option value="all">All Requirements</option>
            <option value="kyc">KYC Only</option>
            <option value="accredited">Accredited Only</option>
          </select>

          <div className="flex items-center gap-1.5">
            <ArrowUpDown className="h-3.5 w-3.5 shrink-0 text-muted" />
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as SortOption)}
              className="input-field w-auto"
              aria-label="Sort offerings"
            >
              <option value="newest">Newest</option>
              <option value="price_asc">Price: Low → High</option>
              <option value="price_desc">Price: High → Low</option>
              <option value="asset_type">Asset Type</option>
            </select>
          </div>

          {hasFilters && (
            <button onClick={clearFilters} className="btn-ghost px-2 py-1 text-xs">
              Clear
            </button>
          )}
        </div>

        <div className="flex items-center gap-1 self-start rounded-[10px] border border-line bg-surface-header p-1 lg:self-auto">
          <button
            onClick={() => setViewMode('grid')}
            className={`rounded-md p-1.5 transition-colors ${
              viewMode === 'grid' ? 'bg-card text-accent shadow-sm' : 'text-muted hover:text-ink'
            }`}
            aria-label="Grid view"
            aria-pressed={viewMode === 'grid'}
          >
            <Grid3X3 className="h-4 w-4" />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`rounded-md p-1.5 transition-colors ${
              viewMode === 'list' ? 'bg-card text-accent shadow-sm' : 'text-muted hover:text-ink'
            }`}
            aria-label="List view"
            aria-pressed={viewMode === 'list'}
          >
            <List className="h-4 w-4" />
          </button>
        </div>
      </div>

      {filteredAndSorted.length === 0 ? (
        <div className="card flex flex-col items-center justify-center px-6 py-16 text-center">
          <div className="icon-chip h-12 w-12">
            <SearchX className="h-6 w-6" />
          </div>
          <p className="mt-3 text-base font-bold text-ink">
            {tokens.length === 0 ? 'No offerings available yet' : 'No tokens match your filters'}
          </p>
          <p className="mt-1 max-w-sm text-sm text-muted">
            {tokens.length === 0
              ? 'New tokenized assets appear here as issuers bring them to market.'
              : 'Try a different search term, asset class, or investor requirement.'}
          </p>
          {hasFilters && (
            <button onClick={clearFilters} className="btn-secondary mt-4">
              Clear filters
            </button>
          )}
        </div>
      ) : viewMode === 'grid' ? (
        /* ── Grid ──────────────────────────────────────────────────────── */
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {filteredAndSorted.map((token) => {
            const price = getPrice(token);
            const minInv = getMinInvestment(token);
            const soldPct = getSoldPct(token);
            const accredited = isAccreditedOnly(token);
            const classLabel = assetClassLabel(token.assetType);
            const ClassIcon = assetClassIcon(token.assetType);
            const chain = chainLabel(token.chain ?? token.chainId);

            return (
              <Link
                key={token.id}
                href={`/tokens/${token.id}`}
                className="card group flex flex-col transition-all hover:-translate-y-0.5 hover:border-accent"
              >
                {/* Cover: the asset itself, given the card's best real estate */}
                <div className="relative">
                  <TokenMedia
                    src={token.metadata?.logo}
                    alt={token.name}
                    assetType={token.assetType}
                    className="h-44 w-full"
                  />

                  {/* Scrim keeps the overlaid chips legible on any photograph */}
                  <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/55 to-transparent" />

                  <div className="absolute inset-x-3 top-3 flex items-start justify-between gap-2">
                    {classLabel && (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur-sm">
                        <ClassIcon className="h-3 w-3" />
                        {classLabel}
                      </span>
                    )}
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold backdrop-blur-sm ${
                        token.status === 'active'
                          ? 'bg-success/90 text-surface'
                          : 'bg-warning/90 text-surface'
                      }`}
                    >
                      <span className="capitalize">{token.status}</span>
                    </span>
                  </div>
                </div>

                <div className="flex flex-1 flex-col p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate" title={token.name}>{token.name}</h3>
                      <p className="font-mono text-xs text-muted">{token.symbol}</p>
                    </div>
                    {chain && (
                      <span className="badge-neutral shrink-0">
                        <Globe className="h-3 w-3" />
                        {chain}
                      </span>
                    )}
                  </div>

                  {/* Terms: labelled figures, aligned across every card */}
                  <dl className="mt-4 grid grid-cols-2 gap-3">
                    <div className="tile">
                      <dt className="stat-label">Price</dt>
                      <dd className="mt-0.5 text-base font-bold text-ink">
                        {price !== null ? `$${price.toFixed(2)}` : '—'}
                        {price !== null && <span className="text-xs font-normal text-muted"> / token</span>}
                      </dd>
                    </div>
                    <div className="tile">
                      <dt className="stat-label">Minimum</dt>
                      <dd className="mt-0.5 text-base font-bold text-ink">
                        {minInv !== null ? `${minInv.toLocaleString('en-US')}` : '—'}
                        {minInv !== null && <span className="text-xs font-normal text-muted"> tokens</span>}
                      </dd>
                    </div>
                  </dl>

                  {(accredited || isKycRequired(token)) && (
                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      {isKycRequired(token) && (
                        <span className="badge-neutral">
                          <ShieldCheck className="h-3 w-3" />
                          KYC required
                        </span>
                      )}
                      {accredited && (
                        <span className="badge-warning">
                          <Shield className="h-3 w-3" />
                          Accredited only
                        </span>
                      )}
                    </div>
                  )}

                  {/* Footer pinned to the bottom so every card ends in line */}
                  <div className="mt-auto space-y-2 border-t border-line pt-4">
                    <div className="flex items-baseline justify-between gap-2 text-xs">
                      <span className="text-muted">
                        Supply <span className="font-semibold text-ink">{token.totalSupply?.toLocaleString('en-US')}</span>
                      </span>
                      {soldPct > 0 && <span className="font-semibold text-accent">{soldPct.toFixed(1)}% sold</span>}
                    </div>
                    {soldPct > 0 && <SoldProgressBar pct={soldPct} />}
                    <span className="flex items-center gap-1 pt-1 text-xs font-bold text-accent">
                      View offering
                      <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        /* ── List ──────────────────────────────────────────────────────── */
        <div className="card overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Token</th>
                <th>Asset Class</th>
                <th>Network</th>
                <th className="!text-right">Price</th>
                <th className="!text-right">Minimum</th>
                <th className="!text-right">Supply</th>
                <th className="min-w-[8rem]">Sold</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredAndSorted.map((token) => {
                const price = getPrice(token);
                const minInv = getMinInvestment(token);
                const soldPct = getSoldPct(token);
                const chain = chainLabel(token.chain ?? token.chainId);

                return (
                  <tr key={token.id} className="transition-colors hover:bg-surface-header">
                    <td>
                      <Link href={`/tokens/${token.id}`} className="group flex items-center gap-3">
                        <TokenMedia
                          src={token.metadata?.logo}
                          alt={token.name}
                          assetType={token.assetType}
                          className="h-10 w-10 shrink-0 rounded-[10px]"
                        />
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-ink group-hover:text-accent">{token.name}</p>
                          <p className="font-mono text-xs text-muted">{token.symbol}</p>
                        </div>
                      </Link>
                    </td>
                    <td className="whitespace-nowrap text-muted">{assetClassLabel(token.assetType) || '—'}</td>
                    <td className="whitespace-nowrap text-muted">{chain || '—'}</td>
                    <td className="whitespace-nowrap text-right font-semibold text-ink">
                      {price !== null ? `$${price.toFixed(2)}` : '—'}
                    </td>
                    <td className="whitespace-nowrap text-right text-muted">
                      {minInv !== null ? `${minInv.toLocaleString('en-US')} tokens` : '—'}
                    </td>
                    <td className="whitespace-nowrap text-right text-ink">
                      {token.totalSupply?.toLocaleString('en-US') ?? '—'}
                    </td>
                    <td>
                      {soldPct > 0 ? (
                        <div className="space-y-1">
                          <SoldProgressBar pct={soldPct} />
                          <p className="text-xs text-muted">{soldPct.toFixed(1)}%</p>
                        </div>
                      ) : (
                        <span className="text-xs text-muted">—</span>
                      )}
                    </td>
                    <td>
                      <span className={token.status === 'active' ? 'badge-success' : 'badge-warning'}>
                        <span className="capitalize">{token.status}</span>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
