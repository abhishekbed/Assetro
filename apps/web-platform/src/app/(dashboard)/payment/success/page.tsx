'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState, useRef, Suspense } from 'react';
import Link from 'next/link';
import { CheckCircle, XCircle, Loader2, ExternalLink, Wallet } from 'lucide-react';
import { useAccount } from 'wagmi';
import api from '@/lib/api';
import { chainLabel, explorerUrl as chainExplorerUrl } from '@/lib/chains';

interface PaymentRecord {
  id: string;
  tokenId: string;
  tokenAmount: string;
  fiatAmount: string;
  currency: string;
  status: string;
  failureReason?: string | null;
  metadata?: {
    token_name?: string;
    token_symbol?: string;
    mint_tx_hash?: string;
    mint_block?: number;
    wallet_address?: string;
    ready_for_mint?: boolean;
  };
  completedAt?: string;
}

function PaymentSuccessContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session_id') || '';

  const { address } = useAccount();

  const [payment, setPayment] = useState<PaymentRecord | null>(null);
  const [tokenAddress, setTokenAddress] = useState<string | null>(null);
  const [tokenDecimals, setTokenDecimals] = useState<number>(18);
  const [tokenChainId, setTokenChainId] = useState<number | null>(null);

  const [pollStatus, setPollStatus] = useState<'polling' | 'paid' | 'done' | 'failed'>('polling');
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const statusRef = useRef<'polling' | 'paid' | 'done' | 'failed'>('polling');

  useEffect(() => {
    if (!/^cs_(test|live)_/.test(sessionId)) {
      statusRef.current = 'failed';
      setPollStatus('failed');
      return;
    }
    statusRef.current = 'polling';
    setPollStatus('polling');

    const poll = async () => {
      try {
        const res = await api.get(`/payments/session/${sessionId}`);
        const record: PaymentRecord | null = res.data?.data ?? null;
        if (!record) return;
        if (statusRef.current === 'done' || statusRef.current === 'failed') return;

        setPayment(record);

        if (record.status === 'completed') {
          if (pollingRef.current) clearInterval(pollingRef.current);
          statusRef.current = 'done';
          setPollStatus('done');
        } else if (record.status === 'paid' || record.status === 'processing') {
          // Keep polling while the platform agent mints tokens on-chain
          statusRef.current = 'paid';
          setPollStatus('paid');
        } else if (record.status === 'failed' || record.status === 'cancelled') {
          if (pollingRef.current) clearInterval(pollingRef.current);
          statusRef.current = 'failed';
          setPollStatus('failed');
        }
      } catch {
        // network error — keep polling
      }
    };

    pollingRef.current = setInterval(poll, 2500);
    void poll();
    const timeout = setTimeout(() => {
      if (statusRef.current === 'polling') {
        if (pollingRef.current) clearInterval(pollingRef.current);
        statusRef.current = 'failed';
        setPollStatus('failed');
      }
    }, 2 * 60 * 1000);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
      clearTimeout(timeout);
    };
  }, [sessionId]);

  useEffect(() => {
    if (payment?.tokenId) {
      api.get(`/tokens/${payment.tokenId}`).then((res) => {
        const t = res.data?.data || res.data;
        if (t?.tokenAddress || t?.contractAddress) {
          setTokenAddress(t.tokenAddress || t.contractAddress);
        }
        if (t?.decimals != null) {
          setTokenDecimals(Number(t.decimals));
        }
        if (t?.chainId != null) {
          setTokenChainId(Number(t.chainId));
        }
      }).catch(() => {});
    }
  }, [payment?.tokenId]);

  useEffect(() => {
    if (pollStatus !== 'done' || !/^cs_(test|live)_/.test(sessionId)) return;
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage({ type: 'assetro:checkout-complete', sessionId }, window.location.origin);
      window.close();
    }
  }, [pollStatus, sessionId]);



  const addTokenToMetaMask = async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const eth = typeof window !== 'undefined' ? (window as any).ethereum : null;
    if (!eth || !tokenAddress) return;
    try {
      await eth.request({
        method: 'wallet_watchAsset',
        params: {
          type: 'ERC20',
          options: {
            address: tokenAddress,
            symbol: payment?.metadata?.token_symbol || 'TOKEN',
            decimals: tokenDecimals,
          },
        },
      });
    } catch (e) {
      console.error(e);
    }
  };

  const txHash = payment?.metadata?.mint_tx_hash;
  const activeChainId = tokenChainId || Number(process.env.NEXT_PUBLIC_DEFAULT_CHAIN_ID || '11155111');
  const activeChainLabel = chainLabel(activeChainId) || 'the network';
  const explorerUrl = txHash ? chainExplorerUrl(activeChainId, 'tx', txHash) : null;
  const recipientWallet = payment?.metadata?.wallet_address || address || 'Connected Wallet';

  if (pollStatus === 'polling') {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-4">
        <div className="text-center">
          <Loader2 className="mx-auto h-12 w-12 animate-spin text-accent" />
          <h2 className="mt-4 text-lg font-semibold text-ink">
            Verifying your payment with Stripe…
          </h2>
          <p className="mt-1 text-sm text-muted">
            Please wait while we confirm your transaction.
          </p>
        </div>
      </div>
    );
  }

  if (pollStatus === 'failed') {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-4">
        <div className="w-full max-w-md text-center">
          <div className="card p-8 shadow-xl">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-danger-100">
              <XCircle className="h-10 w-10 text-danger" />
            </div>
            <h1 className="mb-2 text-2xl font-bold text-ink">Something went wrong</h1>
            <p className="mb-2 text-muted">
              {payment?.status === 'failed'
                ? 'Your payment could not be processed. Please check your card or bank account.'
                : 'We could not confirm your payment status.'}
            </p>
            {payment?.id && (
              <p className="mb-6 text-xs text-muted">Reference: {payment.id}</p>
            )}
            <div className="space-y-3">
              <Link href="/transactions" className="btn-primary inline-block w-full">
                View My Orders
              </Link>
              <Link
                href="/tokens"
                className="inline-block w-full rounded-md border border-line px-4 py-2 text-sm font-medium text-ink hover:bg-surface-header"
              >
                Browse Tokens
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Payment paid, minting tokens on-chain
  if (pollStatus === 'paid') {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-4">
        <div className="w-full max-w-md text-center">
          <div className="card p-8 shadow-2xl border border-emerald-500/40 bg-slate-900/90">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
              <Loader2 className="h-10 w-10 animate-spin" />
            </div>

            <h1 className="mb-1 text-2xl font-bold text-white tracking-tight">Payment Successful!</h1>
            <p className="text-xs font-bold uppercase tracking-wider text-emerald-400 mb-3">
              {payment?.failureReason ? 'On-chain mint needs review' : 'Minting Tokens to Your Wallet…'}
            </p>

            <p className="mb-6 text-xs text-slate-300">
              Your Stripe payment of <strong>${payment?.fiatAmount}</strong> is complete. {payment?.failureReason
                ? 'Token minting needs review. Your order remains recorded.'
                : `Your tokens are now being minted on ${activeChainLabel} to your registered wallet.`}
            </p>

            <div className="mb-6 space-y-2.5 rounded-xl bg-slate-950/80 p-4 text-left text-xs font-mono border border-slate-800">
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Token</span>
                <span className="font-bold text-slate-200">
                  {payment?.metadata?.token_name || 'Token'} ({payment?.metadata?.token_symbol || 'TKN'})
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Tokens Being Minted</span>
                <span className="font-bold text-emerald-400 text-sm">
                  {payment?.tokenAmount} {payment?.metadata?.token_symbol}
                </span>
              </div>
              <div className="flex justify-between items-center border-t border-slate-800 pt-2">
                <span className="text-slate-400">Destination Wallet</span>
                <span className="text-slate-300 font-semibold truncate max-w-[200px]" title={recipientWallet}>
                  {recipientWallet.slice(0, 6)}...{recipientWallet.slice(-4)}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-center gap-2 py-3 px-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs">
              <Loader2 className="h-4 w-4 animate-spin shrink-0" />
              <span>{payment?.failureReason ? 'Your payment is confirmed. The mint is pending review.' : `Confirming on-chain minting on ${activeChainLabel}…`}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Done / Completed
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-4">
      <div className="w-full max-w-md text-center">
        <div className="card p-8 shadow-xl">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-success-100">
            <CheckCircle className="h-10 w-10 text-success" />
          </div>

          <h1 className="mb-2 text-2xl font-bold text-ink">Payment & Mint Complete!</h1>
          <p className="mb-6 text-muted">
            Your tokens have been minted on-chain directly to your wallet.
          </p>

          <div className="mb-6 space-y-3 rounded-lg bg-card p-4 text-left text-sm">
            {payment?.metadata?.token_name && (
              <div className="flex justify-between">
                <span className="text-muted">Token</span>
                <span className="font-medium text-ink">
                  {payment.metadata.token_name} ({payment.metadata.token_symbol})
                </span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted">Amount</span>
              <span className="font-medium text-ink">
                {payment?.tokenAmount} {payment?.metadata?.token_symbol ?? 'tokens'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Paid</span>
              <span className="font-medium text-ink">
                {payment?.currency} {payment?.fiatAmount}
              </span>
            </div>
            {payment?.metadata?.wallet_address && (
              <div className="flex justify-between">
                <span className="text-muted shrink-0">Wallet</span>
                <span className="font-mono text-xs text-ink ml-2 truncate max-w-[200px]">
                  {payment.metadata.wallet_address}
                </span>
              </div>
            )}
            {txHash && explorerUrl && (
              <>
                <hr className="border-line" />
                <div className="flex items-center justify-between">
                  <span className="text-muted shrink-0">Mint Tx</span>
                  <a
                    href={explorerUrl!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 font-mono text-xs text-accent hover:underline ml-2 truncate max-w-[180px]"
                  >
                    {txHash.slice(0, 10)}…{txHash.slice(-6)}
                    <ExternalLink className="h-3 w-3 shrink-0" />
                  </a>
                </div>
              </>
            )}
          </div>

          <div className="space-y-3">
            {tokenAddress && (
              <button
                type="button"
                onClick={addTokenToMetaMask}
                className="btn-secondary flex w-full items-center justify-center gap-2 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10"
              >
                <Wallet className="h-4 w-4" />
                Add Token to MetaMask
              </button>
            )}
            <Link href="/portfolio" className="btn-primary inline-block w-full">
              View Portfolio
            </Link>
            <Link href="/transactions" className="inline-block w-full rounded-md border border-line px-4 py-2 text-sm font-medium text-ink hover:bg-surface-header">
              View All Orders
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PaymentSuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-accent" />
        </div>
      }
    >
      <PaymentSuccessContent />
    </Suspense>
  );
}
