'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { getWalletClient } from 'wagmi/actions';
import { wagmiConfig } from '@/lib/wagmi-config';
import { parseUnits, type Address } from 'viem';
import {
  ArrowLeft,
  Clock,
  CheckCircle,
  XCircle,
  Ban,
  Loader2,
  Send,
  InboxIcon,
  ExternalLink,
  AlertTriangle,
} from 'lucide-react';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { toast } from 'sonner';

// ─── Types ───────────────────────────────────────────────────────────────────

type TransferStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

interface TransferRequest {
  id: string;
  tokenId: string;
  tokenName?: string;
  tokenSymbol?: string;
  tokenAddress?: string;
  fromAddress: string;
  toAddress: string;
  amount: string;
  status: TransferStatus;
  approverNotes?: string;
  createdAt: string;
  resolvedAt?: string;
}

type FilterTab = 'all' | TransferStatus;

// ─── ABIs ────────────────────────────────────────────────────────────────────

const TOKEN_TRANSFER_ABI = [
  {
    name: 'transfer',
    type: 'function' as const,
    stateMutability: 'nonpayable' as const,
    inputs: [
      { name: '_to', type: 'address' },
      { name: '_amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_TABS: { key: FilterTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'cancelled', label: 'Cancelled' },
];

function statusBadge(status: TransferStatus) {
  switch (status) {
    case 'pending':
      return (
        <span className="badge-warning">
          <Clock className="h-3 w-3" />
          Pending
        </span>
      );
    case 'approved':
      return (
        <span className="badge-success">
          <CheckCircle className="h-3 w-3" />
          Approved
        </span>
      );
    case 'rejected':
      return (
        <span className="badge-danger">
          <XCircle className="h-3 w-3" />
          Rejected
        </span>
      );
    case 'cancelled':
      return (
        <span className="badge-neutral">
          <Ban className="h-3 w-3" />
          Cancelled
        </span>
      );
  }
}

function shortenAddr(addr: string) {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 8)}…${addr.slice(-6)}`;
}

function formatDate(iso?: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <div className="card flex flex-col gap-3 p-5 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-4 w-32 rounded bg-surface-header" />
        <div className="h-5 w-20 rounded-full bg-surface-header" />
      </div>
      <div className="h-3 w-48 rounded bg-surface-header" />
      <div className="h-3 w-56 rounded bg-surface-header" />
      <div className="h-3 w-24 rounded bg-surface-header" />
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TransferRequestsPage() {
  const { user } = useAuthStore();

  const [requests, setRequests] = useState<TransferRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterTab>('all');

  // Per-request action state: id -> 'cancelling' | 'executing'
  const [actionInProgress, setActionInProgress] = useState<Record<string, 'cancelling' | 'executing'>>({});

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchRequests = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await api.get('/transfers/my-requests', {
        headers: { 'x-user-id': user.id },
      });
      const data: TransferRequest[] = res.data?.data ?? res.data ?? [];
      setRequests(data);
    } catch {
      toast.error('Failed to load transfer requests');
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  // ── Cancel ─────────────────────────────────────────────────────────────────

  const handleCancel = async (id: string) => {
    setActionInProgress(prev => ({ ...prev, [id]: 'cancelling' }));
    try {
      await api.post(`/transfers/${id}/cancel`, {}, {
        headers: { 'x-user-id': user?.id },
      });
      toast.success('Transfer request cancelled');
      setRequests(prev =>
        prev.map(r =>
          r.id === id
            ? { ...r, status: 'cancelled' as TransferStatus, resolvedAt: new Date().toISOString() }
            : r
        )
      );
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Failed to cancel request';
      toast.error(msg);
    } finally {
      setActionInProgress(prev => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  };

  // ── Execute on-chain transfer ───────────────────────────────────────────────

  const handleExecute = async (req: TransferRequest) => {
    if (!req.tokenAddress) {
      toast.error('Token contract address is missing. Cannot execute transfer.');
      return;
    }

    setActionInProgress(prev => ({ ...prev, [req.id]: 'executing' }));
    try {
      const walletClient = await getWalletClient(wagmiConfig);
      if (!walletClient) {
        toast.error('No wallet connected. Please connect your wallet first.');
        return;
      }

      const account = walletClient.account?.address;
      if (!account) {
        toast.error('Wallet account not found.');
        return;
      }

      // Use 18 decimals as default since no decimals field is available
      const DECIMALS = 18;
      const parsedAmount = parseFloat(req.amount);
      if (isNaN(parsedAmount) || parsedAmount <= 0) {
        toast.error('Invalid transfer amount.');
        return;
      }

      const amountFixed = parsedAmount.toFixed(DECIMALS).replace(/\.?0+$/, '') || '0';
      const amountWei = parseUnits(amountFixed, DECIMALS);

      toast.loading('Waiting for wallet confirmation…', { id: req.id });

      const hash = await walletClient.writeContract({
        address: req.tokenAddress as Address,
        abi: TOKEN_TRANSFER_ABI,
        functionName: 'transfer',
        args: [req.toAddress as Address, amountWei],
        account,
      });

      toast.loading('Transaction submitted. Waiting for confirmation…', { id: req.id });

      // Dynamically import getPublicClient to wait for receipt
      const { getPublicClient } = await import('wagmi/actions');
      const publicClient = getPublicClient(wagmiConfig);
      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash });
      }

      toast.dismiss(req.id);
      toast.success(
        (
          <div className="flex flex-col gap-1">
            <span className="font-medium">Transfer executed on-chain!</span>
            <a
              href={`https://sepolia.etherscan.io/tx/${hash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-accent hover:underline"
            >
              View on Etherscan <ExternalLink className="inline h-3 w-3" />
            </a>
          </div>
        ),
        { duration: 8000 }
      );

      // Refresh requests so the approved one may move to completed
      await fetchRequests();
    } catch (err: unknown) {
      toast.dismiss(req.id);
      const raw = (err as Error).message ?? String(err);
      const friendly =
        raw.includes('User rejected') || raw.includes('user rejected')
          ? 'Transaction cancelled by user.'
          : raw.slice(0, 160);
      toast.error(friendly);
    } finally {
      setActionInProgress(prev => {
        const next = { ...prev };
        delete next[req.id];
        return next;
      });
    }
  };

  // ── Filtered list ──────────────────────────────────────────────────────────

  const filtered =
    filter === 'all' ? requests : requests.filter(r => r.status === filter);

  const tabCount = (key: FilterTab) =>
    key === 'all' ? requests.length : requests.filter(r => r.status === key).length;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/transfer"
          className="flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Transfer
        </Link>
      </div>

      <div>
        <h1>Transfer Requests</h1>
        <p className="mt-1 text-sm text-muted">
          Track and manage your conditional transfer approvals
        </p>
      </div>

      {/* Status filter tabs */}
      <div className="flex flex-wrap gap-2 border-b border-line pb-1">
        {STATUS_TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={[
              'flex items-center gap-1.5 rounded-t-lg px-4 py-2 text-sm font-semibold transition-colors',
              filter === tab.key
                ? 'border-b-2 border-accent text-accent'
                : 'text-muted hover:text-ink',
            ].join(' ')}
          >
            {tab.label}
            {!loading && (
              <span
                className={[
                  'rounded-full px-1.5 py-0.5 text-xs font-bold',
                  filter === tab.key
                    ? 'bg-accent-soft text-accent'
                    : 'bg-surface-header text-muted',
                ].join(' ')}
              >
                {tabCount(tab.key)}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <SkeletonRow key={i} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-card border border-dashed border-line bg-card py-16 text-center">
          <InboxIcon className="h-12 w-12 text-muted" />
          <p className="mt-4 text-sm font-medium text-muted">
            {filter === 'all' ? 'No transfer requests yet.' : `No ${filter} requests.`}
          </p>
          <Link
            href="/transfer"
            className="btn-primary mt-4"
          >
            <Send className="h-4 w-4" />
            Initiate a Transfer
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(req => {
            const busy = actionInProgress[req.id];
            return (
              <div
                key={req.id}
                className="card p-5 space-y-4"
              >
                {/* Row 1: token name + status */}
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-ink">
                      {req.tokenName
                        ? `${req.tokenName}${req.tokenSymbol ? ` (${req.tokenSymbol})` : ''}`
                        : `Token ${req.tokenId.slice(0, 8)}…`}
                    </p>
                    <p className="mt-0.5 text-xs text-muted">ID: {req.id}</p>
                  </div>
                  <div className="flex-shrink-0">{statusBadge(req.status)}</div>
                </div>

                {/* Row 2: transfer detail grid */}
                <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4 text-sm">
                  <div>
                    <p className="text-xs text-muted mb-0.5">Amount</p>
                    <p className="font-medium text-ink">
                      {parseFloat(req.amount).toLocaleString('en-US')} tokens
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted mb-0.5">From</p>
                    <p className="font-mono text-xs text-ink" title={req.fromAddress}>
                      {shortenAddr(req.fromAddress)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted mb-0.5">To</p>
                    <p className="font-mono text-xs text-ink" title={req.toAddress}>
                      {shortenAddr(req.toAddress)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted mb-0.5">Requested</p>
                    <p className="text-ink">{formatDate(req.createdAt)}</p>
                  </div>
                  {req.resolvedAt && (
                    <div>
                      <p className="text-xs text-muted mb-0.5">Resolved</p>
                      <p className="text-ink">{formatDate(req.resolvedAt)}</p>
                    </div>
                  )}
                </div>

                {/* Approver notes — shown for rejected requests */}
                {req.status === 'rejected' && req.approverNotes && (
                  <div className="flex items-start gap-2 rounded-md border border-danger bg-danger-100 p-3">
                    <AlertTriangle className="h-4 w-4 flex-shrink-0 text-danger mt-0.5" />
                    <div>
                      <p className="text-xs font-medium text-danger mb-0.5">Rejection reason</p>
                      <p className="text-xs text-danger">{req.approverNotes}</p>
                    </div>
                  </div>
                )}

                {/* Action buttons */}
                {(req.status === 'approved' || req.status === 'pending') && (
                  <div className="flex flex-wrap gap-3 pt-1">
                    {req.status === 'approved' && (
                      <button
                        onClick={() => handleExecute(req)}
                        disabled={!!busy}
                        className="btn-primary flex items-center gap-2 text-sm disabled:opacity-50"
                      >
                        {busy === 'executing' ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Executing&hellip;
                          </>
                        ) : (
                          <>
                            <Send className="h-4 w-4" />
                            Execute Transfer
                          </>
                        )}
                      </button>
                    )}

                    {req.status === 'pending' && (
                      <button
                        onClick={() => handleCancel(req.id)}
                        disabled={!!busy}
                        className="btn-secondary flex items-center gap-2 text-sm disabled:opacity-50"
                      >
                        {busy === 'cancelling' ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Cancelling&hellip;
                          </>
                        ) : (
                          <>
                            <Ban className="h-4 w-4" />
                            Cancel Request
                          </>
                        )}
                      </button>
                    )}
                  </div>
                )}

                {/* Warning when approved but token address is missing */}
                {req.status === 'approved' && !req.tokenAddress && (
                  <div className="flex items-center gap-2 rounded-md border border-warning bg-warning-100 p-3 text-xs text-warning">
                    <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                    Token contract address is unavailable. Contact support to execute this transfer.
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
