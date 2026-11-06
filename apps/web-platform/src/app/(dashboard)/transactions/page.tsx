'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Filter, Download, Loader2, ShoppingCart, CheckCircle, Clock, XCircle, RefreshCw } from 'lucide-react';
import clsx from 'clsx';
import { toast } from 'sonner';
import { useAuthStore } from '@/store/auth.store';
import api from '@/lib/api';

interface Payment {
  id: string;
  tokenId: string;
  tokenAmount: string;
  fiatAmount: string;
  currency: string;
  status: string;
  createdAt: string;
  stripeSessionId?: string;
  metadata?: { demo_mode?: boolean } | null;
}

interface Token {
  id: string;
  name: string;
  symbol: string;
}

const statusConfig: Record<string, { color: string; icon: typeof CheckCircle }> = {
  completed: { color: 'bg-success-100 text-success', icon: CheckCircle },
  paid: { color: 'bg-warning-100 text-warning', icon: Clock },
  processing: { color: 'bg-warning-100 text-warning', icon: Clock },
  pending: { color: 'bg-warning-100 text-warning', icon: Clock },
  cancelled: { color: 'bg-surface-header text-ink', icon: XCircle },
  failed: { color: 'bg-danger-100 text-danger', icon: XCircle },
  expired: { color: 'bg-surface-header text-ink', icon: XCircle },
};

export default function TransactionsPage() {
  const { user } = useAuthStore();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [tokens, setTokens] = useState<Token[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('all');
  const [checkingPaymentId, setCheckingPaymentId] = useState<string | null>(null);

  const checkPayment = async (payment: Payment) => {
    if (!payment.stripeSessionId) return;
    setCheckingPaymentId(payment.id);
    try {
      const response = await api.get(`/payments/session/${encodeURIComponent(payment.stripeSessionId)}`);
      const updated = response.data?.data as Payment | null;
      if (!updated) throw new Error('Payment record was not found.');
      setPayments((current) => current.map((item) => item.id === updated.id ? updated : item));
      if (updated.status === 'pending') {
        toast.info('Stripe has not confirmed this payment yet.');
      } else if (updated.status === 'completed') {
        toast.success('Payment confirmed and tokens minted.');
      } else if (updated.status === 'paid' || updated.status === 'processing') {
        toast.info('Payment confirmed. Token minting is still in progress.');
      } else {
        toast.info(`Payment status: ${updated.status}`);
      }
    } catch (error) {
      const message = (error as { response?: { data?: { message?: string } } }).response?.data?.message;
      toast.error(message || 'Could not check this payment. Please try again.');
    } finally {
      setCheckingPaymentId(null);
    }
  };

  useEffect(() => {
    async function fetchData() {
      if (!user?.id) {
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        const [paymentsRes, tokensRes] = await Promise.all([
          api.get('/payments/history', { headers: { 'x-user-id': user.id } }),
          api.get('/tokens'),
        ]);
        const payData = paymentsRes.data?.data || paymentsRes.data || [];
        setPayments(Array.isArray(payData) ? payData : []);
        setTokens(tokensRes.data?.data || tokensRes.data || []);
      } catch {
        setPayments([]);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [user?.id]);

  const filtered = payments.filter((p) => {
    if (filterStatus !== 'all' && p.status !== filterStatus) return false;
    return true;
  });

  const totalOrders = payments.length;
  const totalTokensBought = payments
    .filter((p) => p.status === 'completed')
    .reduce((s, p) => s + (parseFloat(p.tokenAmount) || 0), 0);
  const totalSpent = payments
    .filter((p) => ['paid', 'processing', 'completed'].includes(p.status))
    .reduce((s, p) => s + (parseFloat(p.fiatAmount) || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">Transactions</h1>
          <p className="text-muted">Your purchase history</p>
        </div>
        <div className="relative group">
          <button className="btn-secondary gap-2 opacity-60 cursor-not-allowed" disabled>
            <Download className="h-4 w-4" />
            Export CSV
          </button>
          <div className="absolute right-0 top-full mt-1 hidden group-hover:block rounded-md bg-surface-header px-3 py-1.5 text-xs text-ink shadow-card whitespace-nowrap z-10">
            Coming soon
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="card p-5">
          <p className="text-sm text-muted">Total Orders</p>
          <p className="mt-1 text-2xl font-bold text-ink">{totalOrders}</p>
        </div>
        <div className="card p-5">
          <p className="text-sm text-muted">Tokens Received</p>
          <p className="mt-1 text-2xl font-bold text-ink">
            {totalTokensBought.toLocaleString('en-US')}
          </p>
        </div>
        <div className="card p-5">
          <p className="text-sm text-muted">Total Spent</p>
          <p className="mt-1 text-2xl font-bold text-ink">
            ${totalSpent.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </p>
        </div>
      </div>

      {/* Filter */}
      <div className="card p-4">
        <div className="flex items-center gap-3">
          <Filter className="h-4 w-4 text-muted" />
          <div>
            <label className="label mb-1 block text-xs">Status</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="input-field w-auto"
            >
              <option value="all">All Status</option>
              <option value="completed">Completed</option>
              <option value="pending">Pending</option>
              <option value="failed">Failed</option>
            </select>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="card flex items-center justify-center p-12">
          <Loader2 className="h-6 w-6 animate-spin text-accent" />
          <span className="ml-3 text-muted">Loading transactions...</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card p-12 text-center">
          <ShoppingCart className="mx-auto h-12 w-12 text-muted" />
          <p className="mt-3 text-muted">
            {payments.length === 0 ? 'No transactions yet.' : 'No transactions match your filter.'}
          </p>
          {payments.length === 0 && (
            <Link href="/tokens" className="mt-2 inline-block text-sm text-accent hover:underline">
              Browse tokens to start investing
            </Link>
          )}
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-line bg-card">
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase text-muted">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase text-muted">Order ID</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase text-muted">Token</th>
                  <th className="px-6 py-3 text-right text-xs font-medium uppercase text-muted">Amount</th>
                  <th className="px-6 py-3 text-right text-xs font-medium uppercase text-muted">Value</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase text-muted">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase text-muted">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filtered.map((p) => {
                  const token = tokens.find((t) => t.id === p.tokenId);
                  const config = statusConfig[p.status] || statusConfig.pending;
                  const StatusIcon = config.icon;
                  return (
                    <tr key={p.id} className="hover:bg-surface-header">
                      <td className="px-6 py-4 text-sm text-ink">
                        {new Date(p.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-mono text-xs text-muted">
                          {p.id.slice(0, 8)}...
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div>
                          <p className="text-sm font-medium text-ink">
                            {token?.name || p.tokenId.slice(0, 8)}
                          </p>
                          <p className="text-xs text-muted">{token?.symbol || '???'}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right text-sm text-ink">
                        {parseFloat(p.tokenAmount).toLocaleString('en-US')} tokens
                      </td>
                      <td className="px-6 py-4 text-right text-sm font-medium text-ink">
                        {p.metadata?.demo_mode
                          ? 'Demo · $0 collected'
                          : `$${parseFloat(p.fiatAmount).toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
                      </td>
                      <td className="px-6 py-4">
                        <span className={clsx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium capitalize', config.color)}>
                          <StatusIcon className="h-3 w-3" />
                          {p.metadata?.demo_mode ? `Demo ${p.status}` : p.status}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {p.stripeSessionId && ['pending', 'paid', 'processing'].includes(p.status) && (
                          <button
                            type="button"
                            onClick={() => void checkPayment(p)}
                            disabled={checkingPaymentId === p.id}
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:underline disabled:opacity-50"
                          >
                            <RefreshCw className={clsx('h-3.5 w-3.5', checkingPaymentId === p.id && 'animate-spin')} />
                            Check payment
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
