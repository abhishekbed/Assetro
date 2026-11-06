'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useState, useEffect } from 'react';
import Link from 'next/link';
import { Building2, Copy, Clock, ArrowLeft, CheckCircle, Loader2 } from 'lucide-react';
import { useAccount } from 'wagmi';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';

// Default bank details — overridden by token metadata if configured
const DEFAULT_BANK_DETAILS = {
  bankName: 'Assetro Escrow Bank',
  accountName: 'Assetro Tokenization Platform Escrow',
  accountNumber: '1234567890',
  routingNumber: '021000021',
  swiftCode: 'AATMUS33',
  bankAddress: '100 Financial District, New York, NY 10004',
};

interface WirePaymentResult {
  paymentId: string;
  reference: string;
  fiatAmount: string;
  currency: string;
}

interface TokenInfo {
  name: string;
  symbol: string;
  metadata?: {
    wire_details?: {
      bankName?: string;
      accountName?: string;
      accountNumber?: string;
      routingNumber?: string;
      swiftCode?: string;
      bankAddress?: string;
    };
  };
}

function WirePaymentContent() {
  const searchParams = useSearchParams();
  const tokenId   = searchParams.get('token_id') || '';
  const amount    = searchParams.get('amount') || '';
  const currency  = searchParams.get('currency') || 'USD';
  const paramWallet = searchParams.get('wallet_address') || '';
  const { user }  = useAuthStore();
  const { address: connectedAddress } = useAccount();
  const effectiveWallet = connectedAddress || paramWallet || user?.walletAddress || '';

  const [wirePayment, setWirePayment] = useState<WirePaymentResult | null>(null);
  const [tokenInfo, setTokenInfo]     = useState<TokenInfo | null>(null);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [copied, setCopied]           = useState<string | null>(null);

  useEffect(() => {
    if (!tokenId || !amount || !user?.id) {
      setError('Missing required parameters. Please go back and try again.');
      setLoading(false);
      return;
    }

    const init = async () => {
      try {
        // Load token info for bank details from metadata
        const tokenRes = await api.get(`/tokens/${tokenId}`);
        const tokenData = tokenRes.data?.data ?? tokenRes.data ?? null;
        setTokenInfo(tokenData);

        const offering = tokenData?.metadata?.offering;
        const minInv = tokenData?.minInvestment ?? offering?.min_investment;
        const maxInv = tokenData?.maxInvestment ?? offering?.max_investment;
        const numAmount = parseFloat(amount);

        if (minInv != null && numAmount < Number(minInv)) {
          const msg = `Minimum investment is ${minInv} tokens. You requested ${numAmount} tokens.`;
          setError(msg);
          alert(msg);
          return;
        }

        if (maxInv != null && numAmount > Number(maxInv)) {
          const msg = `Maximum investment is ${maxInv} tokens. You requested ${numAmount} tokens.`;
          setError(msg);
          alert(msg);
          return;
        }

        // Sync connected wallet if available
        if (connectedAddress) {
          try {
            await api.patch('/kyc/wallet', { wallet_address: connectedAddress });
          } catch {
            // best effort
          }
        }

        // Create a pending wire payment in DB → get reference number
        const wireRes = await api.post('/payments/wire', {
          token_id: tokenId,
          token_amount: amount,
          currency,
          ...(effectiveWallet ? { wallet_address: effectiveWallet } : {}),
        });
        setWirePayment(wireRes.data);
      } catch (err: unknown) {
        const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
          ?? (err as Error).message
          ?? 'Failed to create wire payment';
        setError(msg);
        alert(msg);
      } finally {
        setLoading(false);
      }
    };

    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokenId, amount, user?.id, connectedAddress]);

  const copyToClipboard = (value: string, key: string) => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  // Use bank details from token metadata if configured, else default
  const meta = tokenInfo?.metadata?.wire_details;
  const bank = {
    bankName:      meta?.bankName      ?? DEFAULT_BANK_DETAILS.bankName,
    accountName:   meta?.accountName   ?? DEFAULT_BANK_DETAILS.accountName,
    accountNumber: meta?.accountNumber ?? DEFAULT_BANK_DETAILS.accountNumber,
    routingNumber: meta?.routingNumber ?? DEFAULT_BANK_DETAILS.routingNumber,
    swiftCode:     meta?.swiftCode     ?? DEFAULT_BANK_DETAILS.swiftCode,
    bankAddress:   meta?.bankAddress   ?? DEFAULT_BANK_DETAILS.bankAddress,
  };

  const CopyableField = ({ label, value, fieldKey }: { label: string; value: string; fieldKey: string }) => (
    <div className="flex items-center justify-between py-3 border-b border-line last:border-0">
      <div>
        <p className="text-xs text-muted">{label}</p>
        <p className="text-sm font-medium text-ink mt-0.5">{value}</p>
      </div>
      <button
        onClick={() => copyToClipboard(value, fieldKey)}
        className="ml-3 flex shrink-0 items-center gap-1 rounded-md border border-line px-2 py-1 text-xs text-muted hover:bg-surface-header"
      >
        {copied === fieldKey
          ? <><CheckCircle className="h-3 w-3 text-success" /> Copied</>
          : <><Copy className="h-3 w-3" /> Copy</>}
      </button>
    </div>
  );

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <Loader2 className="mx-auto h-10 w-10 animate-spin text-accent" />
          <p className="mt-3 text-sm text-muted">Preparing wire transfer instructions…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-lg space-y-4 py-10">
        <div className="rounded-lg border border-danger bg-danger-100 p-4 text-sm text-danger">{error}</div>
        <Link href={tokenId ? `/tokens/${tokenId}` : '/tokens'} className="btn-primary inline-block">
          Back to Token
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <Link href={tokenId ? `/tokens/${tokenId}` : '/tokens'}
        className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Token
      </Link>

      <div className="card p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-soft">
            <Building2 className="h-5 w-5 text-accent" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-ink">Wire Transfer Instructions</h1>
            <p className="text-sm text-muted">Complete your investment via bank wire</p>
          </div>
        </div>

        {/* Status banner */}
        <div className="rounded-lg border border-warning bg-warning-100 p-4 mb-6">
          <div className="flex gap-2">
            <Clock className="h-4 w-4 text-warning mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-warning">Pending Bank Confirmation</p>
              <p className="text-xs text-warning mt-1">
                Your investment order is reserved. Send the wire transfer within 3 business days.
                The issuer will confirm receipt and mint your tokens.
              </p>
            </div>
          </div>
        </div>

        {/* Order summary */}
        <div className="mb-6 rounded-lg bg-accent-soft p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-accent font-medium">Token</span>
            <span className="font-bold text-accent">
              {tokenInfo?.name ?? tokenId} ({tokenInfo?.symbol})
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-accent">Quantity</span>
            <span className="font-medium text-accent">
              {parseFloat(amount).toLocaleString('en-US')} tokens
            </span>
          </div>
          {wirePayment?.fiatAmount && (
            <div className="flex justify-between text-sm border-t border-accent pt-2 mt-2">
              <span className="text-accent font-semibold">Total Due</span>
              <span className="font-bold text-accent">
                {wirePayment.currency} {parseFloat(wirePayment.fiatAmount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </span>
            </div>
          )}
        </div>

        {/* Recipient Wallet */}
        <div className="mb-6 rounded-lg border border-line bg-surface-header p-4">
          <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-1">Minting Destination (Investor Wallet)</p>
          <p className="font-mono text-xs font-bold text-emerald-400 break-all">
            {effectiveWallet || 'Not connected - please connect MetaMask'}
          </p>
          <p className="text-xs text-muted mt-1.5">
            When the issuer confirms this payment, tokens will be minted directly to your connected wallet.
          </p>
        </div>

        {/* Bank account details */}
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-ink mb-3">Bank Account Details</h2>
          <div className="rounded-lg border border-line p-4">
            <CopyableField label="Bank Name"           value={bank.bankName}      fieldKey="bank" />
            <CopyableField label="Account Name"        value={bank.accountName}   fieldKey="name" />
            <CopyableField label="Account Number"      value={bank.accountNumber} fieldKey="account" />
            <CopyableField label="Routing Number (ABA)" value={bank.routingNumber} fieldKey="routing" />
            <CopyableField label="SWIFT / BIC Code"    value={bank.swiftCode}     fieldKey="swift" />
            <CopyableField label="Bank Address"        value={bank.bankAddress}   fieldKey="address" />
          </div>
        </div>

        {/* Reference number — MUST be included in wire memo */}
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-ink mb-3">Payment Reference</h2>
          <div className="rounded-lg border-2 border-dashed border-accent bg-accent-soft p-4">
            <p className="text-xs text-accent mb-1">
              Include this reference in your wire transfer memo field
            </p>
            <div className="flex items-center justify-between">
              <p className="text-xl font-bold font-mono text-accent">
                {wirePayment?.reference ?? 'PAY-PENDING'}
              </p>
              <button
                onClick={() => copyToClipboard(wirePayment?.reference ?? '', 'ref')}
                className="flex items-center gap-1 rounded-md bg-primary-600 px-3 py-1.5 text-xs text-btn-text hover:bg-primary-700"
              >
                {copied === 'ref'
                  ? <><CheckCircle className="h-3 w-3" /> Copied!</>
                  : <><Copy className="h-3 w-3" /> Copy</>}
              </button>
            </div>
          </div>
        </div>

        {/* Instructions */}
        <div className="rounded-lg bg-card p-4 text-xs text-muted space-y-1">
          <p>• Wire transfers typically take 1–3 business days to process.</p>
          <p>• The issuer will verify receipt and mint your tokens within 24 hours of confirmation.</p>
          <p>• You will receive a notification once your tokens are minted.</p>
          <p>• Reference your payment ID <strong>{wirePayment?.reference}</strong> in any support queries.</p>
        </div>
      </div>

      <Link
        href="/portfolio"
        className="block w-full rounded-lg border border-line px-4 py-2.5 text-center text-sm font-medium text-ink hover:bg-surface-header"
      >
        View Portfolio
      </Link>
    </div>
  );
}

export default function WirePaymentPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary-400" />
      </div>
    }>
      <WirePaymentContent />
    </Suspense>
  );
}
