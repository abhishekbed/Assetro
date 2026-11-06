'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  ShieldCheck,
  ShieldX,
  ShieldAlert,
  Loader2,
  ExternalLink,
  CheckCircle2,
  Clock,
  Copy,
  Check,
  Coins,
} from 'lucide-react';
import clsx from 'clsx';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { chainLabel, explorerUrl } from '@/lib/chains';

// Claim topic names matching the platform standard (topics 1-4)
const CLAIM_TOPICS: Record<string, { label: string; description: string }> = {
  '1': { label: 'KYC Approved',              description: 'Identity verification passed' },
  '2': { label: 'Country of Residence',      description: 'ISO 3166-1 numeric country code on-chain' },
  '3': { label: 'Investor Classification',   description: 'Retail / Accredited / Institutional' },
  '4': { label: 'Accredited Status',         description: 'Accreditation verified by platform' },
};

const TOTAL_TOPICS = Object.keys(CLAIM_TOPICS).length;

type IdentityStatus = 'not_created' | 'no_wallet' | 'deploying' | 'active';

interface OnchainIdentity {
  id: string;
  userId: string;
  identityContractAddress: string;
  chainId: number;
  claimTopicsIssued: Record<string, string>; // topic => txHash
  registeredTokenIds: string[];
  deployedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface TokenSummary {
  id: string;
  name: string;
  symbol: string;
}

function statusLabel(status: IdentityStatus): string {
  switch (status) {
    case 'not_created': return 'Not Created';
    case 'no_wallet':   return 'Wallet Required';
    case 'deploying':   return 'Deploying';
    case 'active':      return 'Active';
  }
}

function statusBadge(status: IdentityStatus): string {
  switch (status) {
    case 'active':    return 'badge-success';
    case 'deploying': return 'badge-warning';
    default:          return 'badge-neutral';
  }
}

function truncateAddress(addr: string): string {
  return addr.slice(0, 10) + '…' + addr.slice(-8);
}

export default function IdentityPage() {
  const { user } = useAuthStore();
  const [identity, setIdentity] = useState<OnchainIdentity | null>(null);
  const [tokens, setTokens] = useState<TokenSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const fetchIdentity = useCallback(async () => {
    try {
      setLoading(true);
      const [identityRes, tokensRes] = await Promise.allSettled([
        api.get('/identity/me'),
        api.get('/tokens'),
      ]);

      if (identityRes.status === 'fulfilled') {
        const res = identityRes.value;
        setIdentity(res.data?.identity ?? res.data?.data?.identity ?? null);
      } else {
        setIdentity(null);
      }

      // Registered tokens come back as bare ids; names make the list readable.
      if (tokensRes.status === 'fulfilled') {
        const data = tokensRes.value.data?.data ?? tokensRes.value.data ?? [];
        setTokens(Array.isArray(data) ? data : []);
      }
    } catch {
      setIdentity(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchIdentity();
  }, [fetchIdentity]);

  const copyAddress = async () => {
    if (!identity?.identityContractAddress) return;
    try {
      await navigator.clipboard.writeText(identity.identityContractAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable (insecure origin / denied); the address stays
      // selectable, so there is nothing to recover from.
    }
  };

  // Derive status
  const status: IdentityStatus = (() => {
    if (!identity) return user?.walletAddress ? 'not_created' : 'no_wallet';
    const claimsCount = Object.keys(identity.claimTopicsIssued).length;
    if (claimsCount > 0) return 'active';
    return 'deploying';
  })();

  const claimsIssued = identity?.claimTopicsIssued ?? {};
  const issuedCount = Object.keys(claimsIssued).filter((t) => t in CLAIM_TOPICS).length;
  const claimsPct = (issuedCount / TOTAL_TOPICS) * 100;
  const addressLink = identity
    ? explorerUrl(identity.chainId, 'address', identity.identityContractAddress)
    : null;

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 pb-10">
        <div className="space-y-2">
          <div className="h-3 w-24 animate-pulse rounded bg-surface-header" />
          <div className="h-8 w-72 animate-pulse rounded bg-surface-header" />
        </div>
        <div className="h-52 animate-pulse rounded-card bg-surface-header" />
        <div className="h-72 animate-pulse rounded-card bg-surface-header" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-10">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div>
        <p className="kicker">Identity</p>
        <h1 className="page-title mt-1">ONCHAINID</h1>
        <p className="mt-1 text-muted">
          Your blockchain identity (ERC-734/735) is required to hold and transfer security tokens.
        </p>
      </div>

      {/* ── Status ──────────────────────────────────────────────────────── */}
      <div className="card p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span
              className={clsx(
                'icon-chip h-11 w-11',
                status === 'active'
                  ? 'bg-success-100 text-success'
                  : status === 'deploying'
                    ? 'bg-warning-100 text-warning'
                    : '',
              )}
            >
              {status === 'active' ? (
                <ShieldCheck className="h-6 w-6" />
              ) : status === 'deploying' ? (
                <Clock className="h-6 w-6" />
              ) : (
                <ShieldX className="h-6 w-6" />
              )}
            </span>
            <div>
              <p className="label">Identity Status</p>
              <p className="mt-0.5 text-lg font-extrabold tracking-tight text-ink">
                {statusLabel(status)}
              </p>
            </div>
          </div>
          <span className={statusBadge(status)}>{statusLabel(status)}</span>
        </div>

        {/* Claim progress — the one number that says "am I ready?" */}
        {identity && (
          <div className="mt-5">
            <div className="flex items-baseline justify-between gap-2">
              <p className="label">Claims issued</p>
              <p className="text-xs font-semibold text-ink">
                {issuedCount} of {TOTAL_TOPICS}
              </p>
            </div>
            <div className="meter mt-2">
              <span style={{ width: `${claimsPct}%` }} />
            </div>
          </div>
        )}

        {/* ONCHAINID address */}
        {identity && (
          <dl className="tile mt-5">
            <dt className="stat-label">ONCHAINID contract</dt>
            <dd className="mt-1 flex items-center gap-2">
              <span className="min-w-0 flex-1 break-all font-mono text-sm text-ink">
                {identity.identityContractAddress}
              </span>
              <button
                onClick={copyAddress}
                className="btn-ghost shrink-0 p-1.5"
                aria-label="Copy ONCHAINID address"
                title="Copy address"
              >
                {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
              </button>
              {addressLink && (
                <a
                  href={addressLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-ghost shrink-0 p-1.5"
                  aria-label="View on block explorer"
                  title="View on block explorer"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}
            </dd>
            <dd className="mt-1.5 text-xs text-muted">
              {chainLabel(identity.chainId)}
              {identity.deployedAt &&
                ` · Deployed ${new Date(identity.deployedAt).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}`}
            </dd>
          </dl>
        )}

        {/* No wallet */}
        {status === 'no_wallet' && (
          <div className="mt-5 flex items-start gap-3 rounded-[10px] border border-warning bg-warning-100 p-4">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
            <div>
              <p className="text-sm font-bold text-warning">Wallet required</p>
              <p className="mt-1 text-xs text-warning">
                Link a wallet before your identity can be deployed.
              </p>
              <Link href="/settings" className="btn-secondary mt-3 px-3 py-1.5 text-xs">
                Go to Settings
              </Link>
            </div>
          </div>
        )}

        {/* Platform-managed deployment */}
        {status === 'not_created' && (
          <div className="mt-5 rounded-[10px] border border-line bg-surface-header p-4">
            <p className="text-sm font-bold text-ink">Platform-managed identity</p>
            <p className="mt-1 text-xs text-muted">
              Your ONCHAINID is created automatically once an issuer approves your KYC. No wallet
              transaction is required from you.
            </p>
            <Link href="/kyc" className="btn-primary mt-3 px-3 py-1.5 text-xs">
              View KYC Status
            </Link>
          </div>
        )}

        {status === 'deploying' && (
          <div className="mt-5 flex items-start gap-3 rounded-[10px] border border-line bg-surface-header p-4">
            <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-accent" />
            <div>
              <p className="text-sm font-bold text-ink">Deployment in progress</p>
              <p className="mt-1 text-xs text-muted">
                Your contract is live and the platform is issuing your claims on-chain. Nothing is
                required from you.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── Claims ──────────────────────────────────────────────────────── */}
      <div className="card p-6">
        <h3>KYC Claims</h3>
        <p className="mt-1 text-sm text-muted">
          Claims are cryptographic attestations signed by the platform and stored on your ONCHAINID
          contract. They are required for compliance checks before a transfer is allowed.
        </p>

        <ul className="mt-5 space-y-2">
          {Object.entries(CLAIM_TOPICS).map(([topic, { label, description }]) => {
            const txHash = claimsIssued[topic];
            const issued = !!txHash;
            const txLink = issued && identity ? explorerUrl(identity.chainId, 'tx', txHash) : null;
            return (
              <li
                key={topic}
                className={clsx(
                  'flex items-center justify-between gap-3 rounded-[10px] border p-4',
                  issued ? 'border-success bg-success-100' : 'border-line bg-surface-header',
                )}
              >
                <div className="flex min-w-0 items-center gap-3">
                  {issued ? (
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
                  ) : (
                    <Clock className="h-5 w-5 shrink-0 text-muted" />
                  )}
                  <div className="min-w-0">
                    <p className={clsx('text-sm font-semibold', issued ? 'text-success' : 'text-ink')}>
                      {label}
                      <span className="ml-1.5 font-mono text-xs font-normal text-muted">
                        topic {topic}
                      </span>
                    </p>
                    <p className="text-xs text-muted">{description}</p>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <span className={issued ? 'badge-success' : 'badge-neutral'}>
                    {issued ? 'Issued' : 'Pending'}
                  </span>
                  {txLink && (
                    <a
                      href={txLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted transition-colors hover:text-accent"
                      aria-label={`View the transaction that issued topic ${topic}`}
                      title="View transaction"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        {status === 'not_created' && (
          <p className="mt-4 text-center text-sm text-muted">
            Claims are issued automatically after KYC approval.
          </p>
        )}
      </div>

      {/* ── Registered tokens ───────────────────────────────────────────── */}
      {identity && identity.registeredTokenIds.length > 0 && (
        <div className="card p-6">
          <h3>Registered Tokens</h3>
          <p className="mt-1 text-sm text-muted">
            Your identity is registered in the Identity Registry of these tokens, so you are allowed
            to hold and transfer them.
          </p>

          <ul className="mt-5 space-y-2">
            {identity.registeredTokenIds.map((tokenId) => {
              const match = tokens.find((t) => t.id === tokenId);
              return (
                <li
                  key={tokenId}
                  className="flex items-center justify-between gap-3 rounded-[10px] border border-line px-4 py-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="icon-chip h-9 w-9">
                      <Coins className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink">
                        {match ? match.name : truncateAddress(tokenId)}
                      </p>
                      {match && <p className="font-mono text-xs text-muted">{match.symbol}</p>}
                    </div>
                  </div>
                  <Link href={`/tokens/${tokenId}`} className="btn-secondary shrink-0 px-3 py-1.5 text-xs">
                    View token
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
