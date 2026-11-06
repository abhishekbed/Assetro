'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, AlertCircle, Plus, Trash2 } from 'lucide-react';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';

interface Token {
  id: string;
  name: string;
  symbol: string;
  status: string;
}

type ActionType = 'dividend' | 'stock_split' | 'voting' | 'buyback' | 'announcement';

const ACTION_TYPES: { value: ActionType; label: string; description: string }[] = [
  { value: 'dividend', label: 'Dividend', description: 'Distribute profit to token holders' },
  { value: 'stock_split', label: 'Stock Split', description: 'Increase token supply proportionally' },
  { value: 'voting', label: 'Voting', description: 'Corporate governance vote' },
  { value: 'buyback', label: 'Buyback', description: 'Repurchase tokens from holders' },
  { value: 'announcement', label: 'Announcement', description: 'Inform holders of news/updates' },
];

export default function CreateCorporateActionPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const headers = user?.id ? { 'x-user-id': user.id } : {};

  const [tokens, setTokens] = useState<Token[]>([]);
  const [loadingTokens, setLoadingTokens] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form fields
  const [type, setType] = useState<ActionType>('dividend');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tokenId, setTokenId] = useState('');
  const [recordDate, setRecordDate] = useState('');
  const [paymentDate, setPaymentDate] = useState('');

  // Dividend params
  const [amountPerToken, setAmountPerToken] = useState('');
  const [payoutType, setPayoutType] = useState<'fiat' | 'token'>('fiat');

  // Stock split params
  const [splitNumerator, setSplitNumerator] = useState('2');
  const [splitDenominator, setSplitDenominator] = useState('1');

  // Voting params
  const [resolution, setResolution] = useState('');
  const [votingOptions, setVotingOptions] = useState<string[]>(['For', 'Against', 'Abstain']);
  const [votingDeadline, setVotingDeadline] = useState('');

  // Buyback params
  const [pricePerToken, setPricePerToken] = useState('');
  const [maxTokens, setMaxTokens] = useState('');

  useEffect(() => {
    api.get('/tokens').then(r => {
      const data = r.data?.data ?? r.data ?? [];
      setTokens(Array.isArray(data) ? data.filter((t: Token) => t.status === 'active' || t.status === 'deployed') : []);
    }).catch(() => {}).finally(() => setLoadingTokens(false));
  }, []);

  const buildParameters = (): Record<string, unknown> => {
    switch (type) {
      case 'dividend':
        return { amount_per_token: parseFloat(amountPerToken) || 0, payout_type: payoutType };
      case 'stock_split':
        return { ratio_numerator: parseInt(splitNumerator) || 2, ratio_denominator: parseInt(splitDenominator) || 1 };
      case 'voting':
        return { resolution_text: resolution, options: votingOptions.filter(Boolean), deadline: votingDeadline || null };
      case 'buyback':
        return { price_per_token: parseFloat(pricePerToken) || 0, max_tokens: parseFloat(maxTokens) || 0 };
      default:
        return {};
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!title.trim()) { setError('Title is required'); return; }
    if (!tokenId) { setError('Please select a token'); return; }
    if (!recordDate) { setError('Record date is required'); return; }

    setSubmitting(true);
    try {
      await api.post('/corporate-actions', {
        type,
        title: title.trim(),
        description: description.trim() || undefined,
        token_id: tokenId,
        record_date: recordDate,
        payment_date: paymentDate || undefined,
        parameters: buildParameters(),
      }, { headers });
      toast.success('Corporate action created');
      router.push('/issuer/corporate-actions');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to create action';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const addVotingOption = () => setVotingOptions(v => [...v, '']);
  const removeVotingOption = (i: number) => setVotingOptions(v => v.filter((_, idx) => idx !== i));
  const updateVotingOption = (i: number, val: string) => setVotingOptions(v => v.map((o, idx) => idx === i ? val : o));

  return (
    <div className="space-y-6">
      <Link href="/issuer/corporate-actions" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-300">
        <ArrowLeft className="h-4 w-4" /> Back to Corporate Actions
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-ink">Create Corporate Action</h1>
        <p className="text-slate-400">Define a new corporate action for your token holders</p>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 p-4">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6 rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
        {/* Action type */}
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-300">Action Type</label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {ACTION_TYPES.map(at => (
              <button
                key={at.value}
                type="button"
                onClick={() => setType(at.value)}
                className={`rounded-lg border p-3 text-left transition-colors ${
 type === at.value
 ? 'border-blue-500 bg-blue-500/10 ring-1 ring-blue-500/40' : 'border-slate-800 bg-slate-800/40 hover:border-slate-700 hover:bg-slate-800' }`}
              >
                <p className="text-sm font-medium text-ink">{at.label}</p>
                <p className="text-xs text-slate-500">{at.description}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Token */}
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-300">Token *</label>
          {loadingTokens ? (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : (
            <select
              className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-ink focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 [color-scheme:dark]"
              value={tokenId}
              onChange={e => setTokenId(e.target.value)}
              required
            >
              <option value="">Select a token…</option>
              {tokens.map(t => (
                <option key={t.id} value={t.id}>{t.name} ({t.symbol})</option>
              ))}
            </select>
          )}
        </div>

        {/* Title */}
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-300">Title *</label>
          <input
            className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-ink placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            placeholder="e.g., Q1 2026 Dividend Distribution"
            value={title}
            onChange={e => setTitle(e.target.value)}
            required
          />
        </div>

        {/* Description */}
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-300">Description</label>
          <textarea
            className="min-h-[80px] w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-ink placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            placeholder="Details about this corporate action…"
            value={description}
            onChange={e => setDescription(e.target.value)}
          />
        </div>

        {/* Dates */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-300">Record Date *</label>
            <input
              type="date"
              className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-ink focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 [color-scheme:dark]"
              value={recordDate}
              onChange={e => setRecordDate(e.target.value)}
              required
            />
            <p className="mt-1 text-xs text-slate-500">Holders at this date qualify</p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-300">Payment / Execution Date</label>
            <input
              type="date"
              className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-ink focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 [color-scheme:dark]"
              value={paymentDate}
              onChange={e => setPaymentDate(e.target.value)}
            />
          </div>
        </div>

        {/* ── Dividend params ──────────────────────────────────────── */}
        {type === 'dividend' && (
          <div className="space-y-4 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4">
            <p className="text-sm font-medium text-emerald-300">Dividend Parameters</p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-300">Amount per Token (USD) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-ink placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  placeholder="e.g. 0.50"
                  value={amountPerToken}
                  onChange={e => setAmountPerToken(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-300">Payout Type</label>
                <select
                  className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-ink focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 [color-scheme:dark]"
                  value={payoutType}
                  onChange={e => setPayoutType(e.target.value as 'fiat' | 'token')}
                >
                  <option value="fiat">Fiat (CSV export for wire transfers)</option>
                  <option value="token">Token (batch mint to holders)</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* ── Stock split params ───────────────────────────────────── */}
        {type === 'stock_split' && (
          <div className="space-y-4 rounded-lg border border-blue-500/20 bg-blue-500/5 p-4">
            <p className="text-sm font-medium text-blue-300">Stock Split Parameters</p>
            <div className="flex items-center gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-300">New shares</label>
                <input
                  type="number"
                  min="2"
                  className="w-24 rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-ink focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  value={splitNumerator}
                  onChange={e => setSplitNumerator(e.target.value)}
                />
              </div>
              <span className="mt-5 text-slate-500">:</span>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-300">Old shares</label>
                <input
                  type="number"
                  min="1"
                  className="w-24 rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-ink focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  value={splitDenominator}
                  onChange={e => setSplitDenominator(e.target.value)}
                />
              </div>
              <p className="mt-5 text-sm text-blue-300">
                Each holder gets {((parseInt(splitNumerator) / parseInt(splitDenominator)) - 1).toFixed(2)}x additional tokens
              </p>
            </div>
          </div>
        )}

        {/* ── Voting params ────────────────────────────────────────── */}
        {type === 'voting' && (
          <div className="space-y-4 rounded-lg border border-violet-500/20 bg-violet-500/5 p-4">
            <p className="text-sm font-medium text-violet-300">Voting Parameters</p>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-300">Resolution Text *</label>
              <textarea
                className="min-h-[80px] w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-ink placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                placeholder="Describe the resolution being voted on…"
                value={resolution}
                onChange={e => setResolution(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-300">Voting Options</label>
              <div className="space-y-2">
                {votingOptions.map((opt, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-ink placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      placeholder={`Option ${i + 1}`}
                      value={opt}
                      onChange={e => updateVotingOption(i, e.target.value)}
                    />
                    {votingOptions.length > 2 && (
                      <button type="button" onClick={() => removeVotingOption(i)} className="rounded-md p-1.5 text-red-400 hover:bg-red-500/10">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
                <button type="button" onClick={addVotingOption} className="flex items-center gap-1 text-sm font-medium text-blue-400 hover:text-blue-300">
                  <Plus className="h-4 w-4" /> Add option
                </button>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-300">Voting Deadline *</label>
              <input
                type="date"
                className="w-full max-w-xs rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-ink focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 [color-scheme:dark]"
                value={votingDeadline}
                onChange={e => setVotingDeadline(e.target.value)}
                required
              />
            </div>
          </div>
        )}

        {/* ── Buyback params ───────────────────────────────────────── */}
        {type === 'buyback' && (
          <div className="space-y-4 rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
            <p className="text-sm font-medium text-amber-300">Buyback Parameters</p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-300">Price per Token (USD) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-ink placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  placeholder="e.g. 10.00"
                  value={pricePerToken}
                  onChange={e => setPricePerToken(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-300">Max Tokens to Buyback</label>
                <input
                  type="number"
                  min="0"
                  className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-ink placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  placeholder="Leave blank for unlimited"
                  value={maxTokens}
                  onChange={e => setMaxTokens(e.target.value)}
                />
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-3 border-t border-slate-800 pt-4">
          <Link
            href="/issuer/corporate-actions"
            className="inline-flex items-center justify-center rounded-lg border border-slate-700 bg-slate-800/60 px-4 py-2 text-sm font-medium text-slate-200 transition-all hover:bg-slate-800"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-slate-950 shadow-lg transition-all hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-50"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Create Action
          </button>
        </div>
      </form>
    </div>
  );
}
