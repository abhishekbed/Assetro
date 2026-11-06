'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Plus, ExternalLink, Loader2, Coins } from 'lucide-react';
import api from '@/lib/api';

interface Token {
  id: string;
  name: string;
  symbol: string;
  chain?: string;
  chainId?: string;
  totalSupply: number;
  holders?: number;
  status: string;
  createdAt: string;
}

const statusBadge: Record<string, string> = {
  active: 'bg-emerald-500/10 text-emerald-400',
  paused: 'bg-amber-500/10 text-amber-400',
  draft: 'bg-slate-700/50 text-slate-400',
};

export default function IssuerTokensPage() {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchTokens = async () => {
      try {
        setLoading(true);
        const response = await api.get('/tokens');
        const { data } = response.data;
        setTokens(data || []);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to fetch tokens';
        setError(message);
      } finally {
        setLoading(false);
      }
    };

    fetchTokens();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-ink">Issued Tokens</h1>
            <p className="text-slate-400">Manage your tokenized assets</p>
          </div>
          <Link
            href="/issuer/tokens/create"
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-slate-950 shadow-lg transition-all hover:-translate-y-0.5"
          >
            <Plus className="h-4 w-4" />
            Create Token
          </Link>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 text-center text-red-400">{error}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">Issued Tokens</h1>
          <p className="text-slate-400">Manage your tokenized assets</p>
        </div>
        <Link
          href="/issuer/tokens/create"
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-slate-950 shadow-lg transition-all hover:-translate-y-0.5"
        >
          <Plus className="h-4 w-4" />
          Create Token
        </Link>
      </div>

      {tokens.length === 0 ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-12 text-center">
          <Coins className="mx-auto h-12 w-12 text-slate-600" />
          <h3 className="mt-4 text-lg font-medium text-ink">No tokens yet</h3>
          <p className="mt-2 text-slate-400">
            Get started by creating your first tokenized asset.
          </p>
          <Link
            href="/issuer/tokens/create"
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-slate-950 shadow-lg transition-all hover:-translate-y-0.5"
          >
            <Plus className="h-4 w-4" />
            Create Token
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/60">
          <table className="w-full min-w-[720px]">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-800/40">
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Token</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Chain</th>
                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wide text-slate-500">Total Supply</th>
                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wide text-slate-500">Holders</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Created</th>
                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wide text-slate-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {tokens.map((token) => (
                <tr key={token.id} className="hover:bg-slate-800/40">
                  <td className="px-6 py-4">
                    <Link href={`/issuer/tokens/${token.id}`} className="hover:text-blue-400">
                      <p className="text-sm font-medium text-ink">{token.name}</p>
                      <p className="text-xs text-slate-500">{token.symbol}</p>
                    </Link>
                  </td>
                  <td className="px-6 py-4">
                    <span className="inline-flex rounded-full bg-slate-700/50 px-2 py-0.5 text-xs font-medium text-slate-300">
                      {token.chain || token.chainId || '-'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right text-sm text-slate-300">
                    {Number(token.totalSupply).toLocaleString('en-US')}
                  </td>
                  <td className="px-6 py-4 text-right text-sm text-slate-300">
                    {(token.holders ?? 0).toLocaleString('en-US')}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${statusBadge[token.status] || 'bg-slate-700/50 text-slate-400'}`}>
                      {token.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-400">
                    {token.createdAt ? new Date(token.createdAt).toLocaleDateString() : '-'}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Link
                      href={`/issuer/tokens/${token.id}`}
                      className="inline-flex items-center gap-1 text-sm font-medium text-blue-400 hover:text-blue-300"
                    >
                      Manage
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
