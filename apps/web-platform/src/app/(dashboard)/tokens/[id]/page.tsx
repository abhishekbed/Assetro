'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Globe,
  Shield,
  ShieldCheck,
  ExternalLink,
  ShoppingCart,
  Loader2,
  Clock,
  Building2,
  FileText,
  Check,
  Copy,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { TokenMedia } from '@/components/TokenMedia';
import { assetClassLabel } from '@/lib/asset-classes';
import { chainLabel, explorerUrl } from '@/lib/chains';
import { useAuthStore } from '@/store/auth.store';
import { useAccount } from 'wagmi';
import { getPublicClient } from 'wagmi/actions';
import { wagmiConfig } from '@/lib/wagmi-config';
import { formatUnits, type Address } from 'viem';
import { tokenAbi } from '@/lib/contracts/artifacts';
import { InvestorPosition } from '@/lib/investor-positions';

interface TokenDetail {
  id: string;
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: number;
  assetType: string;
  description: string;
  status: string;
  chainId: string;
  chain?: string;
  tokenAddress?: string;
  contractAddress?: string;
  availableSupply?: number;
  price?: number;
  minInvestment?: number;
  maxInvestment?: number;
  compliance?: string[];
  documents?: { name: string; url: string }[];
  deploymentTxHash?: string;
  metadata?: {
    offering?: { initial_price?: number; min_investment?: number; max_investment?: number };
    logo?: string;
    deployment_tx_hash?: string;
    tx_hash?: string;
  };
  stats?: {
    holders?: number;
    totalValue?: string;
    yield?: string;
    launchDate?: string;
  };
}

interface Payment {
  id: string;
  tokenId: string;
  tokenAmount: string;
  fiatAmount: string;
  currency: string;
  status: string;
  createdAt: string;
}

interface EligibilityResult {
  eligible: boolean;
  reason?: string;
  reasons?: string[];
  issuerStatus: string | null;
  missingClaims: number[];
  isOnChainVerified?: boolean;
  isWhitelisted?: boolean;
  identityAddress: string | null;
  /** Platform-admin KYC level: pending | approved | rejected | revoked | expired */
  adminStatus?: string | null;
  /** The token's issuer — who a qualification request is addressed to. */
  issuerId?: string | null;
  rejectedReason?: string | null;
}

export default function TokenDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const { user, kycRefreshTick } = useAuthStore();
  const { address, isConnected } = useAccount();
  const [token, setToken] = useState<TokenDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(true);
  const [eligibilityResult, setEligibilityResult] = useState<EligibilityResult | null>(null);
  const [eligibilityLoading, setEligibilityLoading] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);
  const [buyAmount, setBuyAmount] = useState('');
  const [buyLoading, setBuyLoading] = useState(false);
  const [requestingIssuer, setRequestingIssuer] = useState(false);
  const [buyError, setBuyError] = useState<string | null>(null);
  const [position, setPosition] = useState<InvestorPosition | null>(null);
  const [onchainSupply, setOnchainSupply] = useState<string | null>(null);
  const [onchainPaused, setOnchainPaused] = useState<boolean | null>(null);
  const [tokenDocs, setTokenDocs] = useState<{ name: string; type?: string; url: string; size?: string }[]>([]);
  const [complianceRules, setComplianceRules] = useState<{ id: string; ruleType: string; parameters: Record<string, unknown>; isActive: boolean }[]>([]);
  const [copied, setCopied] = useState(false);
  const publicClient = getPublicClient(wagmiConfig, {
    chainId: token?.chainId ? Number(token.chainId) as 1 | 11155111 | 5042002 : undefined,
  });

  useEffect(() => {
    const fetchToken = async () => {
      try {
        setError(null);
        const response = await api.get('/tokens/' + id);
        const data = response.data;
        if (data.success && data.data) {
          setToken(data.data);
        } else {
          setError('Token not found');
        }
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : 'Failed to load token details';
        setError(message);
      } finally {
        setLoading(false);
      }
    };

    const fetchPayments = async () => {
      if (!user?.id) {
        setPaymentsLoading(false);
        return;
      }
      try {
        const response = await api.get('/payments/history', {
          headers: { 'x-user-id': user.id },
        });
        const all: Payment[] = response.data?.data || response.data || [];
        setPayments(Array.isArray(all) ? all.filter((p) => p.tokenId === id) : []);
      } catch {
        setPayments([]);
      } finally {
        setPaymentsLoading(false);
      }
    };

    const fetchKycStatus = async () => {
      if (!user?.id) {
        setEligibilityLoading(false);
        return;
      }
      try {
        if (!eligibilityResult) {
          setEligibilityLoading(true);
        }
        const response = await api.get(`/kyc/eligibility/${id}`);
        const result = response.data?.data || response.data || null;
        setEligibilityResult(result);
      } catch {
        // Never assume eligibility when the check fails: both the admin and the
        // issuer approval are enforced by the API, so show the neutral state.
        setEligibilityResult(null);
      } finally {
        setEligibilityLoading(false);
      }
    };

    const fetchPosition = async () => {
      if (!user?.id) {
        setPosition(null);
        return;
      }

      try {
        const response = await api.get('/tokens/' + id + '/position', {
          headers: { 'x-user-id': user.id },
          params: address ? { wallet_address: address } : undefined,
        });
        setPosition(response.data?.data || null);
      } catch {
        setPosition(null);
      }
    };

    const fetchDocs = async () => {
      try {
        const res = await api.get(`/tokens/${id}/documents`);
        setTokenDocs(res.data?.data ?? []);
      } catch {
        setTokenDocs([]);
      }
    };

    const fetchComplianceRules = async () => {
      try {
        const res = await api.get(`/compliance/rules?token_id=${id}&active_only=true`);
        setComplianceRules(res.data?.data ?? []);
      } catch {
        setComplianceRules([]);
      }
    };

    if (id) {
      fetchToken();
      fetchPayments();
      fetchKycStatus();
      fetchPosition();
      fetchDocs();
      fetchComplianceRules();
    }
  }, [address, id, user?.id, refreshTick, kycRefreshTick]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') setRefreshTick((t) => t + 1);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  useEffect(() => {
    const status = eligibilityResult?.issuerStatus;
    const chainVerified =
      eligibilityResult?.isOnChainVerified ?? eligibilityResult?.isWhitelisted ?? false;
    const shouldPoll =
      !!user?.id &&
      !!id &&
      !eligibilityResult?.eligible &&
      (status === 'pending' || status === 'under_review' || status === 'approved' || user?.kycStatus === 'approved') &&
      !chainVerified;

    if (!shouldPoll) return;

    const interval = window.setInterval(() => {
      setRefreshTick((t) => t + 1);
    }, 10_000);

    return () => window.clearInterval(interval);
  }, [
    eligibilityResult?.eligible,
    eligibilityResult?.isOnChainVerified,
    eligibilityResult?.isWhitelisted,
    eligibilityResult?.issuerStatus,
    id,
    user?.id,
    user?.kycStatus,
  ]);

  useEffect(() => {
    const readOnchainState = async () => {
      if (!token?.tokenAddress || !token?.chainId || !publicClient) {
        setOnchainSupply(null);
        setOnchainPaused(null);
        return;
      }

      try {
        const [paused, totalSupply] = await Promise.all([
          publicClient.readContract({
            address: token.tokenAddress as Address,
            abi: tokenAbi,
            functionName: 'paused',
          }),
          publicClient.readContract({
            address: token.tokenAddress as Address,
            abi: tokenAbi,
            functionName: 'totalSupply',
          }),
        ]);

        setOnchainPaused(Boolean(paused));
        setOnchainSupply(formatUnits(totalSupply as bigint, token.decimals ?? 18));
      } catch {
        setOnchainSupply(null);
        setOnchainPaused(null);
      }
    };

    readOnchainState();
  }, [publicClient, token]);

  // Copy feedback for the contract address
  const copyAddress = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable (insecure origin / denied). The address stays
      // selectable, so there is nothing to recover from.
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 pb-10">
        <div className="h-5 w-36 animate-pulse rounded bg-surface-header" />
        <div className="card overflow-hidden">
          <div className="grid lg:grid-cols-5">
            <div className="h-56 animate-pulse bg-surface-header lg:col-span-2 lg:h-full" />
            <div className="space-y-3 p-6 lg:col-span-3">
              <div className="h-4 w-40 animate-pulse rounded bg-surface-header" />
              <div className="h-8 w-2/3 animate-pulse rounded bg-surface-header" />
              <div className="h-16 animate-pulse rounded bg-surface-header" />
            </div>
          </div>
        </div>
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="h-64 animate-pulse rounded-card bg-surface-header lg:col-span-2" />
          <div className="h-64 animate-pulse rounded-card bg-surface-header" />
        </div>
      </div>
    );
  }

  if (error || !token) {
    return (
      <div className="space-y-6 pb-10">
        <Link
          href="/tokens"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted transition-colors hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to offerings
        </Link>
        <div className="card flex flex-col items-center justify-center px-6 py-16 text-center">
          <div className="icon-chip h-12 w-12 bg-danger-100 text-danger">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <p className="mt-3 text-base font-bold text-ink">
            {error ? 'Could not load this offering' : 'Offering not found'}
          </p>
          <p className="mt-1 max-w-sm text-sm text-muted">
            {error || 'This token may have been withdrawn, or the link is out of date.'}
          </p>
          <Link href="/tokens" className="btn-primary mt-4">
            Back to offerings
          </Link>
        </div>
      </div>
    );
  }

  const tokenPrice = token.price ?? token.metadata?.offering?.initial_price ?? 1.00;
  const estimatedCost = buyAmount
    ? (parseFloat(buyAmount) * tokenPrice).toFixed(2)
    : '0.00';
  const minInvestment = token.minInvestment ?? token.metadata?.offering?.min_investment ?? 1;
  const maxInvestment = token.maxInvestment ?? token.metadata?.offering?.max_investment ?? null;

  const parsedBuyAmount = buyAmount !== '' ? parseFloat(buyAmount) : NaN;
  const isBelowMin = !isNaN(parsedBuyAmount) && parsedBuyAmount < minInvestment;
  const isAboveMax = maxInvestment != null && !isNaN(parsedBuyAmount) && parsedBuyAmount > maxInvestment;
  const hasAmountError = isBelowMin || isAboveMax;

  const handleRequestIssuerApproval = async () => {
    const issuerId = eligibilityResult?.issuerId;
    if (!issuerId) return;
    setRequestingIssuer(true);
    try {
      await api.post(`/kyc/qualify/${issuerId}`);
      toast.success('Request sent to the issuer. You can buy once they approve.');
      const response = await api.get(`/kyc/eligibility/${id}`);
      setEligibilityResult(response.data?.data || response.data || null);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } }; message?: string };
      toast.error(e.response?.data?.message || e.message || 'Could not send the request.');
    } finally {
      setRequestingIssuer(false);
    }
  };

  const handleBuy = async () => {
    if (!buyAmount || buyAmount.trim() === '') {
      const msg = `Please enter the number of tokens to purchase (minimum ${minInvestment} tokens).`;
      setBuyError(msg);
      toast.error(msg);
      return;
    }

    const numAmount = parseFloat(buyAmount);
    if (isNaN(numAmount) || numAmount <= 0) {
      const msg = 'Please enter a valid token amount greater than 0.';
      setBuyError(msg);
      toast.error(msg);
      return;
    }

    if (numAmount < minInvestment) {
      const msg = `Minimum investment is ${minInvestment} tokens. You entered ${numAmount} tokens.`;
      setBuyError(msg);
      toast.error(msg);
      return;
    }

    if (maxInvestment != null && numAmount > maxInvestment) {
      const msg = `Maximum investment is ${maxInvestment} tokens. You entered ${numAmount} tokens.`;
      setBuyError(msg);
      toast.error(msg);
      return;
    }

    if (!user?.id) {
      const msg = 'Please log in to make a purchase.';
      setBuyError(msg);
      toast.error(msg);
      return;
    }

    if (!isConnected || !address) {
      const msg = 'Please connect your MetaMask wallet before purchasing tokens.';
      setBuyError(msg);
      toast.error(msg);
      return;
    }

    setBuyLoading(true);
    setBuyError(null);
    try {
      try {
        await api.patch('/kyc/wallet', { wallet_address: address });
      } catch {
        // Non-blocking sync
      }

      const response = await api.post('/payments/checkout', {
        token_id: id,
        token_amount: buyAmount,
        currency: 'USD',
        wallet_address: address,
      }, {
        headers: {
          'x-user-id': user.id,
        },
      });
      const data = response.data?.data || response.data;
      const sessionUrl = data?.sessionUrl || data?.checkoutUrl || data?.url;
      const checkoutUrl = sessionUrl ? new URL(sessionUrl) : null;
      if (!checkoutUrl || checkoutUrl.protocol !== 'https:' || checkoutUrl.hostname !== 'checkout.stripe.com') {
        throw new Error('Stripe Checkout did not return a secure payment page. No purchase was completed.');
      }
      window.location.assign(checkoutUrl.toString());
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } }; message?: string };
      const message = axiosErr.response?.data?.message || axiosErr.message || 'Payment service not available yet. Please try again later.';
      setBuyError(message);
      toast.error(message);
    } finally {
      setBuyLoading(false);
    }
  };

  const chain = chainLabel(token.chain ?? token.chainId);
  const classLabel = assetClassLabel(token.assetType);
  const contractAddress = token.tokenAddress || token.contractAddress || null;
  const addressLink = contractAddress ? explorerUrl(token.chainId, 'token', contractAddress) : null;
  const creationTxHash =
    token.deploymentTxHash ||
    token.metadata?.deployment_tx_hash ||
    token.metadata?.tx_hash ||
    null;
  const creationTxLink = creationTxHash ? explorerUrl(token.chainId, 'tx', creationTxHash) : null;
  const isPaused = onchainPaused === true;

  const displaySupply =
    (onchainSupply
      ? Number(onchainSupply).toLocaleString('en-US')
      : typeof token.totalSupply === 'string'
      ? parseInt(token.totalSupply).toLocaleString('en-US')
      : token.totalSupply?.toLocaleString('en-US')) ?? 'N/A';

  // The two compliance sources — the token's own list and the rules engine —
  // describe the same thing to an investor, so they render as one section.
  const RULE_LABELS: Record<string, string> = {
    country_restriction: 'Country Restriction',
    investor_limit: 'Maximum Investors',
    transfer_restriction: 'Transfer Restriction',
    time_window: 'Transfer Window',
    kyc_required: 'KYC Verification Required',
    accredited_only: 'Accredited Investors Only',
    max_balance: 'Maximum Token Balance',
  };
  const complianceItems = [
    ...(token.compliance ?? []).map((req) => ({
      key: `req-${req}`,
      label: req,
      detail: null as string | null,
    })),
    ...complianceRules
      .filter((rule) => rule.ruleType !== 'transfer_restriction')
      .map((rule) => ({
        key: rule.id,
        label: RULE_LABELS[rule.ruleType] ?? rule.ruleType.replace(/_/g, ' '),
        detail:
          rule.parameters && Object.keys(rule.parameters).length > 0
            ? Object.entries(rule.parameters)
                .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`)
                .join(' · ')
            : null,
      })),
  ];

  const terms = [
    { label: 'Price per token', value: tokenPrice > 0 ? `$${tokenPrice.toFixed(2)}` : 'N/A' },
    { label: 'Minimum', value: `${minInvestment.toLocaleString('en-US')} tokens` },
    ...(maxInvestment ? [{ label: 'Maximum', value: `${maxInvestment.toLocaleString('en-US')} tokens` }] : []),
    { label: 'Total supply', value: displaySupply },
    { label: 'Decimals', value: String(token.decimals ?? '—') },
    ...(token.stats?.holders !== undefined
      ? [{ label: 'Holders', value: token.stats.holders.toLocaleString('en-US') }]
      : []),
    ...(token.stats?.yield ? [{ label: 'Annual yield', value: token.stats.yield }] : []),
  ];

  return (
    <div className="space-y-6 pb-10">
      <Link
        href="/tokens"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted transition-colors hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to offerings
      </Link>

      {/* ── Hero: the asset itself, then its identity ───────────────────── */}
      <div className="card overflow-hidden">
        <div className="grid lg:grid-cols-5">
          <TokenMedia
            src={token.metadata?.logo}
            alt={token.name}
            assetType={token.assetType}
            className="h-56 w-full lg:col-span-2 lg:h-full lg:min-h-[272px]"
          />

          <div className="p-6 lg:col-span-3">
            <div className="flex flex-wrap items-center gap-2">
              {classLabel && (
                <span className="pill">
                  <Building2 className="h-3 w-3" />
                  {classLabel}
                </span>
              )}
              {chain && (
                <span className="badge-neutral">
                  <Globe className="h-3 w-3" />
                  {chain}
                </span>
              )}
              {isPaused ? (
                <span className="badge-danger">
                  <AlertTriangle className="h-3 w-3" />
                  Paused
                </span>
              ) : (
                <span className={token.status === 'active' ? 'badge-success' : 'badge-warning'}>
                  <span className="capitalize">{token.status}</span>
                </span>
              )}
            </div>

            <h1 className="page-title mt-3">{token.name}</h1>
            <p className="font-mono text-sm text-muted">{token.symbol}</p>

            <p className="mt-3 text-sm leading-relaxed text-muted">
              {token.description || 'No description has been provided for this offering.'}
            </p>

            <dl className={`mt-5 grid grid-cols-2 gap-3 ${maxInvestment ? 'sm:grid-cols-4' : 'sm:grid-cols-3'}`}>
              <div className="tile">
                <dt className="stat-label">Price per token</dt>
                <dd className="mt-0.5 text-lg font-extrabold tracking-tight text-ink">
                  {tokenPrice > 0 ? `$${tokenPrice.toFixed(2)}` : 'N/A'}
                </dd>
              </div>
              <div className="tile">
                <dt className="stat-label">Minimum</dt>
                <dd className="mt-0.5 text-lg font-extrabold tracking-tight text-ink">
                  {minInvestment.toLocaleString('en-US')}
                  <span className="text-xs font-normal text-muted"> tokens</span>
                </dd>
              </div>
              {maxInvestment ? (
                <div className="tile">
                  <dt className="stat-label">Maximum</dt>
                  <dd className="mt-0.5 text-lg font-extrabold tracking-tight text-ink">
                    {maxInvestment.toLocaleString('en-US')}
                    <span className="text-xs font-normal text-muted"> tokens</span>
                  </dd>
                </div>
              ) : null}
              <div className={`tile ${maxInvestment ? '' : 'col-span-2 sm:col-span-1'}`}>
                <dt className="stat-label">Total supply</dt>
                <dd className="mt-0.5 text-lg font-extrabold tracking-tight text-ink">{displaySupply}</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* ── Offering details ──────────────────────────────────────── */}
          <div className="card p-6">
            <h3>Offering Details</h3>
            <p className="stat-label mt-0.5">Terms and on-chain parameters</p>
            <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {terms.map((term) => (
                <div key={term.label} className="tile">
                  <dt className="stat-label">{term.label}</dt>
                  <dd className="mt-0.5 text-base font-bold text-ink">{term.value}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* ── Contract ──────────────────────────────────────────────── */}
          {contractAddress && (
            <div className="card p-6">
              <h3>Contract</h3>
              <p className="stat-label mt-0.5">Verify this offering on-chain</p>

              <dl className="mt-4 space-y-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <dt className="text-muted">Token address</dt>
                  <dd className="flex min-w-0 items-center gap-1.5">
                    <code className="truncate rounded-md bg-surface-header px-2 py-1 font-mono text-xs text-ink">
                      {contractAddress}
                    </code>
                    <button
                      onClick={() => copyAddress(contractAddress)}
                      className="btn-ghost shrink-0 p-1.5"
                      aria-label="Copy token address"
                      title="Copy address"
                    >
                      {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
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
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </dd>
                </div>

                {creationTxHash && (
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
                    <dt className="text-muted">Creation Tx</dt>
                    <dd className="flex min-w-0 items-center gap-1.5">
                      <code className="truncate rounded-md bg-surface-header px-2 py-1 font-mono text-xs text-ink" title={creationTxHash}>
                        {creationTxHash.slice(0, 10)}...{creationTxHash.slice(-8)}
                      </code>
                      <button
                        onClick={() => copyAddress(creationTxHash)}
                        className="btn-ghost shrink-0 p-1.5"
                        aria-label="Copy token creation tx hash"
                        title="Copy tx hash"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                      {creationTxLink && (
                        <a
                          href={creationTxLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-ghost shrink-0 p-1.5 text-primary hover:text-primary-hover"
                          aria-label="View token creation on Etherscan"
                          title="View on Sepolia Etherscan"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </dd>
                  </div>
                )}

                <div className="flex items-center justify-between gap-2 border-t border-line pt-3">
                  <dt className="text-muted">Network</dt>
                  <dd className="font-semibold text-ink">{chain || `Chain ${token.chainId}`}</dd>
                </div>

                <div className="flex items-center justify-between gap-2 border-t border-line pt-3">
                  <dt className="text-muted">Standard</dt>
                  <dd className="font-semibold text-ink">ERC-3643</dd>
                </div>

                {position && (
                  <div className="flex items-center justify-between gap-2 border-t border-line pt-3">
                    <dt className="text-muted">Your holdings</dt>
                    <dd className="font-semibold text-ink">
                      {Number(position.quantity || 0).toLocaleString('en-US')} {token.symbol}
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          )}

          {/* ── Compliance ────────────────────────────────────────────── */}
          {complianceItems.length > 0 && (
            <div className="card p-6">
              <h3>Compliance Requirements</h3>
              <p className="stat-label mt-0.5">Rules enforced on every transfer of this token</p>
              <ul className="mt-4 space-y-2">
                {complianceItems.map((item) => (
                  <li key={item.key} className="flex items-start gap-3 rounded-[10px] bg-surface-header p-3">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold capitalize text-ink">{item.label}</p>
                      {item.detail && <p className="mt-0.5 text-xs text-muted">{item.detail}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* ── Documents ─────────────────────────────────────────────── */}
          <div className="card p-6">
            <h3>Documents</h3>
            <p className="stat-label mt-0.5">Offering memoranda, reports and legal filings</p>
            {tokenDocs.length === 0 ? (
              <div className="mt-4 flex flex-col items-center justify-center rounded-xl border border-dashed border-line py-10 text-center">
                <div className="icon-chip">
                  <FileText className="h-5 w-5" />
                </div>
                <p className="mt-2 text-sm font-semibold text-ink">No documents yet</p>
                <p className="stat-label mt-0.5">The issuer has not published any files for this token</p>
              </div>
            ) : (
              <div className="mt-4 space-y-2">
                {tokenDocs.map((doc, i) => (
                  <a
                    key={`${doc.name}-${i}`}
                    href={doc.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex items-center justify-between gap-3 rounded-[10px] border border-line p-3 transition-colors hover:border-accent hover:bg-surface-header"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="icon-chip h-9 w-9">
                        <FileText className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-ink">{doc.name}</p>
                        {doc.type && (
                          <p className="text-xs capitalize text-muted">{doc.type.replace(/_/g, ' ')}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2 text-xs text-muted">
                      {doc.size && <span>{doc.size}</span>}
                      <ExternalLink className="h-3.5 w-3.5 text-accent" />
                    </div>
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* ── History ───────────────────────────────────────────────── */}
          <div className="card">
            <div className="border-b border-line px-6 py-5">
              <h3>Your Transaction History</h3>
              <p className="stat-label mt-0.5">Your orders for this offering</p>
            </div>

            {paymentsLoading ? (
              <div className="space-y-3 p-6">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-10 animate-pulse rounded-lg bg-surface-header" />
                ))}
              </div>
            ) : payments.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
                <div className="icon-chip h-12 w-12">
                  <ShoppingCart className="h-6 w-6" />
                </div>
                <p className="mt-3 text-base font-bold text-ink">No transactions yet</p>
                <p className="mt-1 max-w-sm text-sm text-muted">
                  Your orders for this token will be listed here once you invest.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Type</th>
                      <th className="!text-right">Tokens</th>
                      <th className="!text-right">Value</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((tx) => (
                      <tr key={tx.id} className="transition-colors hover:bg-surface-header">
                        <td className="whitespace-nowrap text-muted">
                          {new Date(tx.createdAt).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </td>
                        <td className="font-semibold text-ink">Purchase</td>
                        <td className="whitespace-nowrap text-right text-ink">
                          {parseFloat(tx.tokenAmount).toLocaleString('en-US')}
                        </td>
                        <td className="whitespace-nowrap text-right font-semibold text-ink">
                          ${parseFloat(tx.fiatAmount).toLocaleString('en-US', { minimumFractionDigits: 2 })} {tx.currency}
                        </td>
                        <td>
                          <span
                            className={
                              tx.status === 'completed'
                                ? 'badge-success'
                                : tx.status === 'pending'
                                ? 'badge-warning'
                                : 'badge-danger'
                            }
                          >
                            <span className="capitalize">{tx.status}</span>
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* ── Invest panel ────────────────────────────────────────────── */}
        <div className="lg:col-span-1">
          <div className="card sticky top-6 p-6">
            <h3>Invest</h3>
            <p className="stat-label mt-0.5">
              {tokenPrice > 0 ? `$${tokenPrice.toFixed(2)} per ${token.symbol}` : 'Pricing unavailable'}
            </p>

            {/* Token Creation Tx / Etherscan verification link for investor */}
            {creationTxLink ? (
              <a
                href={creationTxLink}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-primary transition-colors hover:bg-primary/10"
                title="View token creation transaction on Sepolia Etherscan"
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
                  <span className="truncate">Creation Tx: <span className="font-mono">{creationTxHash?.slice(0, 8)}...{creationTxHash?.slice(-6)}</span></span>
                </div>
                <span className="flex items-center gap-1 shrink-0 font-medium">
                  Etherscan <ExternalLink className="h-3 w-3" />
                </span>
              </a>
            ) : addressLink ? (
              <a
                href={addressLink}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-line bg-surface-header px-3 py-2 text-xs text-muted transition-colors hover:text-ink"
                title="View token contract on Sepolia Etherscan"
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
                  <span className="truncate">Verified Contract</span>
                </div>
                <span className="flex items-center gap-1 shrink-0 font-medium">
                  Etherscan <ExternalLink className="h-3 w-3" />
                </span>
              </a>
            ) : null}

            {position && Number(position.quantity || 0) > 0 && (
              <div className="mt-4 rounded-[10px] border border-accent bg-accent-soft p-4">
                <p className="label">Your position</p>
                <p className="mt-1 text-lg font-extrabold tracking-tight text-ink">
                  {Number(position.quantity || 0).toLocaleString('en-US')} {token.symbol}
                </p>
                <p className="mt-0.5 text-sm text-muted">
                  Invested ${Number(position.investedAmount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </p>
              </div>
            )}

            <div className="mt-4">
              {isPaused ? (
                <div className="flex items-start gap-3 rounded-[10px] border border-danger bg-danger-100 p-4">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
                  <div>
                    <p className="text-sm font-bold text-danger">Transfers paused</p>
                    <p className="mt-1 text-xs text-danger">
                      The issuer has paused this token. Purchases are unavailable until it resumes.
                    </p>
                  </div>
                </div>
              ) : ((eligibilityResult?.eligible || eligibilityResult?.issuerStatus === 'approved') && eligibilityResult?.issuerStatus !== 'pending' && eligibilityResult?.issuerStatus !== 'under_review' && eligibilityResult?.issuerStatus !== 'rejected') ? (
                <div className="space-y-4">
                  {eligibilityResult && !eligibilityResult.isOnChainVerified && (
                    <div className="flex items-center gap-2 rounded-[10px] border border-line bg-surface-header px-3 py-2 text-xs text-muted">
                      <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                      <span>KYC verified &bull; On-chain identity syncing</span>
                    </div>
                  )}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label htmlFor="buy-amount" className="label mb-0">
                        Amount (tokens)
                      </label>
                      <span className="text-xs text-muted font-medium">
                        Min: <strong className="text-ink">{minInvestment}</strong>
                        {maxInvestment ? <> &middot; Max: <strong className="text-ink">{maxInvestment}</strong></> : null}
                      </span>
                    </div>
                    <input
                      id="buy-amount"
                      type="number"
                      min={minInvestment}
                      max={maxInvestment ?? undefined}
                      placeholder={maxInvestment ? `Min. ${minInvestment} - Max. ${maxInvestment}` : `Min. ${minInvestment}`}
                      value={buyAmount}
                      onChange={(e) => {
                        setBuyAmount(e.target.value);
                        if (buyError) setBuyError(null);
                      }}
                      className={`input-field ${hasAmountError ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20 bg-red-500/5' : ''}`}
                    />
                  </div>

                  {/* Immediate Visual Alerts for Min/Max Investment */}
                  {isBelowMin && (
                    <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-400 flex items-start gap-2.5 shadow-sm">
                      <AlertTriangle className="h-4 w-4 shrink-0 text-red-400 mt-0.5" />
                      <div>
                        <p className="font-bold text-red-300">Amount below minimum investment</p>
                        <p className="mt-0.5 text-slate-300">
                          The minimum investment is <strong>{minInvestment} tokens</strong>. You entered <strong>{parsedBuyAmount} tokens</strong>.
                        </p>
                      </div>
                    </div>
                  )}

                  {isAboveMax && (
                    <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-400 flex items-start gap-2.5 shadow-sm">
                      <AlertTriangle className="h-4 w-4 shrink-0 text-red-400 mt-0.5" />
                      <div>
                        <p className="font-bold text-red-300">Amount exceeds maximum investment</p>
                        <p className="mt-0.5 text-slate-300">
                          The maximum investment is <strong>{maxInvestment} tokens</strong>. You entered <strong>{parsedBuyAmount} tokens</strong>.
                        </p>
                      </div>
                    </div>
                  )}

                  <dl className="tile space-y-2">
                    <div className="flex justify-between text-sm">
                      <dt className="text-muted">Price per token</dt>
                      <dd className="text-ink">{tokenPrice > 0 ? `$${tokenPrice.toFixed(2)}` : 'N/A'}</dd>
                    </div>
                    <div className="flex justify-between text-sm">
                      <dt className="text-muted">Quantity</dt>
                      <dd className="text-ink">{buyAmount || 0}</dd>
                    </div>
                    <div className="flex justify-between border-t border-line pt-2 text-sm font-bold">
                      <dt className="text-ink">Estimated total</dt>
                      <dd className="text-ink">${estimatedCost}</dd>
                    </div>
                  </dl>

                  {buyError && (
                    <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 flex items-start gap-2 text-xs font-medium text-red-400">
                      <AlertTriangle className="h-4 w-4 shrink-0 text-red-400 mt-0.5" />
                      <span>{buyError}</span>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleBuy}
                    disabled={buyLoading}
                    className={`btn-primary w-full transition-all ${
                      hasAmountError ? 'border border-red-500/50 bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-500/20' : ''
                    }`}
                  >
                    {buyLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Processing…
                      </>
                    ) : (
                      <>
                        <ShoppingCart className="h-4 w-4" />
                        Buy {token.symbol}
                      </>
                    )}
                  </button>

                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-line" />
                    </div>
                    <div className="relative flex justify-center text-xs">
                      <span className="bg-card px-2 text-muted">or</span>
                    </div>
                  </div>

                  <Link
                    href={
                      !hasAmountError && buyAmount && buyAmount.trim() !== ''
                        ? `/payment/wire?token_id=${id}&amount=${buyAmount}&currency=USD${address ? `&wallet_address=${address}` : ''}`
                        : '#'
                    }
                    onClick={(e) => {
                      if (!isConnected || !address) {
                        e.preventDefault();
                        const msg = 'Please connect your MetaMask wallet before proceeding to payment.';
                        setBuyError(msg);
                        toast.error(msg);
                        return;
                      }
                      if (!buyAmount || buyAmount.trim() === '') {
                        e.preventDefault();
                        const msg = `Please enter the number of tokens to purchase (minimum ${minInvestment} tokens).`;
                        setBuyError(msg);
                        toast.error(msg);
                        return;
                      }
                      if (isBelowMin) {
                        e.preventDefault();
                        const msg = `Minimum investment is ${minInvestment} tokens. You entered ${parsedBuyAmount} tokens.`;
                        setBuyError(msg);
                        toast.error(msg);
                        return;
                      }
                      if (isAboveMax) {
                        e.preventDefault();
                        const msg = `Maximum investment is ${maxInvestment} tokens. You entered ${parsedBuyAmount} tokens.`;
                        setBuyError(msg);
                        toast.error(msg);
                        return;
                      }
                    }}
                    className={`btn-secondary w-full ${
                      hasAmountError ? 'border-red-500/40 text-red-300' : ''
                    }`}
                  >
                    <Building2 className="h-4 w-4" />
                    Pay by Wire Transfer
                  </Link>
                </div>
              ) : eligibilityResult?.adminStatus === 'pending' ? (
                <div className="space-y-3">
                  <div className="flex items-start gap-3 rounded-[10px] border border-warning bg-warning-100 p-4">
                    <Clock className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
                    <div>
                      <p className="text-sm font-bold text-warning">KYC awaiting admin approval</p>
                      <p className="mt-1 text-xs text-warning">
                        Step 1 of 2: the platform admin must approve your KYC. You can then request approval from this token&apos;s issuer.
                      </p>
                    </div>
                  </div>
                  <Link href={`/kyc?token_id=${id}`} className="btn-secondary w-full">
                    View KYC Status
                  </Link>
                </div>
              ) : eligibilityResult?.adminStatus &&
                eligibilityResult.adminStatus !== 'approved' ? (
                <div className="space-y-3">
                  <div className="flex items-start gap-3 rounded-[10px] border border-danger bg-danger-100 p-4">
                    <Shield className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
                    <div>
                      <p className="text-sm font-bold text-danger">Platform KYC {eligibilityResult.adminStatus}</p>
                      <p className="mt-1 text-xs text-danger">
                        {eligibilityResult.rejectedReason ? (
                          <>Reason: <strong className="font-medium text-ink">{eligibilityResult.rejectedReason}</strong>. Please update your details and resubmit to continue.</>
                        ) : (
                          `Your KYC was ${eligibilityResult.adminStatus} by the platform admin. Update your details and resubmit to continue.`
                        )}
                      </p>
                    </div>
                  </div>
                  <Link href={`/kyc?token_id=${id}`} className="btn-danger w-full">
                    Resubmit KYC
                  </Link>
                </div>
              ) : eligibilityResult?.adminStatus === 'approved' &&
                (eligibilityResult.issuerStatus === 'pending' ||
                  eligibilityResult.issuerStatus === 'under_review') ? (
                <div className="space-y-3">
                  <div className="flex items-start gap-3 rounded-[10px] border border-warning bg-warning-100 p-4">
                    <Clock className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
                    <div>
                      <p className="text-sm font-bold text-warning">Awaiting issuer KYC approval</p>
                      <p className="mt-1 text-xs text-warning">
                        Step 2 of 2: your request is with the issuer. You can buy this issuer&apos;s tokens as soon as they approve it, and you will not be asked again.
                      </p>
                    </div>
                  </div>
                </div>
              ) : eligibilityResult?.adminStatus === 'approved' &&
                eligibilityResult.issuerId &&
                eligibilityResult.issuerStatus !== 'approved' ? (
                <div className="space-y-3">
                  <div className="flex items-start gap-3 rounded-[10px] border border-warning bg-warning-100 p-4">
                    <Shield className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
                    <div>
                      <p className="text-sm font-bold text-warning">
                        {eligibilityResult.issuerStatus
                          ? `Issuer KYC approval ${eligibilityResult.issuerStatus}`
                          : 'Issuer KYC approval needed'}
                      </p>
                      <p className="mt-1 text-xs text-warning">
                        Your KYC is approved by the platform. This issuer must also approve you before your first purchase.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={handleRequestIssuerApproval}
                    disabled={requestingIssuer}
                    className="btn-primary w-full"
                  >
                    {requestingIssuer ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Shield className="h-4 w-4" />
                    )}
                    Request Issuer KYC Approval
                  </button>
                </div>
              ) : eligibilityResult?.issuerStatus === 'pending' ||
                eligibilityResult?.issuerStatus === 'under_review' ? (
                <div className="space-y-3">
                  <div className="flex items-start gap-3 rounded-[10px] border border-warning bg-warning-100 p-4">
                    <Clock className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
                    <div>
                      <p className="text-sm font-bold text-warning">KYC awaiting admin approval</p>
                      <p className="mt-1 text-xs text-warning">
                        Your identity verification has been submitted and is currently awaiting administrator approval. You will be able to buy tokens once an admin approves your KYC.
                      </p>
                    </div>
                  </div>
                  <Link href={`/kyc?token_id=${id}`} className="btn-secondary w-full">
                    View KYC Status
                  </Link>
                </div>
              ) : eligibilityResult?.issuerStatus === 'rejected' ? (
                <div className="space-y-3">
                  <div className="flex items-start gap-3 rounded-[10px] border border-danger bg-danger-100 p-4">
                    <Shield className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
                    <div>
                      <p className="text-sm font-bold text-danger">KYC rejected</p>
                      <p className="mt-1 text-xs text-danger">
                        {eligibilityResult.rejectedReason ? (
                          <>Reason: <strong className="font-medium text-ink">{eligibilityResult.rejectedReason}</strong>. Please update your details and resubmit.</>
                        ) : (
                          'Your KYC submission was rejected by administrator. Please update your details and resubmit.'
                        )}
                      </p>
                    </div>
                  </div>
                  <Link href={`/kyc?token_id=${id}`} className="btn-danger w-full">
                    Resubmit KYC
                  </Link>
                </div>
              ) : eligibilityLoading && !eligibilityResult ? (
                <div className="space-y-3">
                  <div className="h-10 animate-pulse rounded-lg bg-surface-header" />
                  <div className="h-20 animate-pulse rounded-lg bg-surface-header" />
                  <div className="h-10 animate-pulse rounded-lg bg-surface-header" />
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-start gap-3 rounded-[10px] border border-warning bg-warning-100 p-4">
                    <Shield className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
                    <div>
                      <p className="text-sm font-bold text-warning">KYC required</p>
                      <p className="mt-1 text-xs text-warning">
                        Complete identity verification and get approved by an administrator before purchasing this token.
                      </p>
                    </div>
                  </div>
                  <Link href={`/kyc?token_id=${id}`} className="btn-primary w-full">
                    Submit KYC for This Token
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
