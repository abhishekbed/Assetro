'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Plus,
  Trash2,
  Loader2,
  ListChecks,
  UserPlus,
  AlertTriangle,
  ShieldCheck,
} from 'lucide-react';
import clsx from 'clsx';
import { toast } from 'sonner';
import { type Address, zeroAddress } from 'viem';
import { useAccount, usePublicClient, useSwitchChain, useWalletClient } from 'wagmi';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { identityRegistryAbi } from '@/lib/contracts/artifacts';
import { formatCountryCode, parseCountryNumericCode } from '@/lib/contracts/countries';
import { getDefaultSuiteAddresses, getIdFactoryAddress } from '@/lib/contracts/deployment';
import {
  ensureConnectedChain,
  parseBaseError,
  requireAddress,
  requireWalletClient,
  waitForReceipt,
} from '@/lib/contracts/evm';

// Minimal ABI — IdFactory.getIdentity(wallet) and IR.identity(wallet)
const idFactoryAbi = [
  {
    name: 'getIdentity',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: '_wallet', type: 'address' }],
    outputs: [{ name: '', type: 'address' }],
  },
] as const;

const irIdentityAbi = [
  {
    name: 'identity',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: '_userAddress', type: 'address' }],
    outputs: [{ name: '', type: 'address' }],
  },
] as const;

interface WhitelistEntry {
  id: string;
  tokenId: string;
  walletAddress: string;
  country: string;
  investorType: string;
  status: string;
  createdAt?: string;
}

interface TokenInfo {
  id: string;
  name: string;
  symbol: string;
  chainId: number;
  identityRegistryAddress?: string | null;
}

const INVESTOR_TYPES = ['accredited', 'retail', 'institutional', 'qualified'] as const;

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
  pending: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
  revoked: 'bg-red-500/10 text-red-400 border border-red-500/20',
};

function isValidEthAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

function truncateAddress(addr: string): string {
  return addr.slice(0, 6) + '…' + addr.slice(-4);
}

export default function WhitelistPage() {
  const params = useParams();
  const id = params.id as string;
  const { address, chainId: walletChainId } = useAccount();
  const { data: walletClient } = useWalletClient();
  const { switchChainAsync } = useSwitchChain();

  const [entries, setEntries] = useState<WhitelistEntry[]>([]);
  const [entryIdentities, setEntryIdentities] = useState<Record<string, string>>({});
  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [walletAddress, setWalletAddress] = useState('');
  const [country, setCountry] = useState('');
  const [investorType, setInvestorType] = useState<string>(INVESTOR_TYPES[0]);
  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // ONCHAINID lookup state
  const [lookingUpIdentity, setLookingUpIdentity] = useState(false);
  const [lookedUpIdentity, setLookedUpIdentity] = useState<string | null>(null);

  // Approved investor quick-fill — fetches investors whose KYC is approved by this issuer
  interface ApprovedInvestor { investorId: string; name: string; wallet: string | null; identity: string | null }
  const [approvedInvestors, setApprovedInvestors] = useState<ApprovedInvestor[]>([]);
  const { user } = useAuthStore();

  useEffect(() => {
    if (!showForm || !user?.id) return;
    api.get('/kyc/approved-investors', { headers: { 'x-user-id': user.id } })
      .then((res) => {
        const list: Array<{ investorId: string; name: string; walletAddress: string | null; identityContractAddress: string | null }> = res.data?.data ?? [];
        setApprovedInvestors(list.map((inv) => ({
          investorId: inv.investorId,
          name: inv.name,
          wallet: inv.walletAddress,
          identity: inv.identityContractAddress,
        })));
      })
      .catch(() => {});
  }, [showForm, user?.id]);

  const publicClient = usePublicClient({ chainId: tokenInfo?.chainId });
  const fallbackSuite = getDefaultSuiteAddresses(tokenInfo?.chainId);
  const effectiveIdentityRegistryAddress =
    tokenInfo?.identityRegistryAddress || fallbackSuite.identityRegistryAddress;

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [tokenRes, whitelistRes] = await Promise.all([
        api.get('/tokens/' + id),
        api.get('/compliance/whitelist?token_id=' + id),
      ]);
      setTokenInfo(tokenRes.data.data || tokenRes.data);
      setEntries(whitelistRes.data.data || []);
      setError(null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to fetch whitelist';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // After entries load, look up ONCHAINID for each entry from the IR
  useEffect(() => {
    if (!entries.length || !publicClient || !effectiveIdentityRegistryAddress) return;

    const irAddr = effectiveIdentityRegistryAddress as Address;
    const calls = entries.map((entry) => ({
      address: irAddr,
      abi: irIdentityAbi,
      functionName: 'identity' as const,
      args: [entry.walletAddress as Address],
    }));

    publicClient
      .multicall({ contracts: calls })
      .then((results) => {
        const map: Record<string, string> = {};
        results.forEach((result, i) => {
          if (result.status === 'success') {
            const addr = result.result as string;
            if (addr && addr !== zeroAddress) {
              map[entries[i].walletAddress.toLowerCase()] = addr;
            }
          }
        });
        setEntryIdentities(map);
      })
      .catch(() => {});
  }, [entries, publicClient, effectiveIdentityRegistryAddress]);

  // Look up investor's ONCHAINID.
  // Priority: IR.identity(wallet) for this token → IdFactory.getIdentity(wallet) fallback.
  // IR is the source of truth for this token; IdFactory is the global platform registry.
  const lookupIdentity = useCallback(async (wallet: string) => {
    if (!isValidEthAddress(wallet) || !publicClient || !tokenInfo) {
      setLookedUpIdentity(null);
      return;
    }

    setLookingUpIdentity(true);
    try {
      // 1. Check if already registered in this token's IR
      if (effectiveIdentityRegistryAddress) {
        const irAddr = effectiveIdentityRegistryAddress as Address;
        const irResult = await publicClient.readContract({
          address: irAddr,
          abi: irIdentityAbi,
          functionName: 'identity',
          args: [wallet as Address],
        }).catch(() => null);
        const irIdentity = irResult as string | null;
        if (irIdentity && irIdentity !== zeroAddress) {
          setLookedUpIdentity(irIdentity);
          return;
        }
      }

      // 2. Fall back to IdFactory global registry
      const idFactoryAddress = getIdFactoryAddress(tokenInfo.chainId);
      if (!idFactoryAddress) {
        setLookedUpIdentity(null);
        return;
      }
      const factoryResult = await publicClient.readContract({
        address: idFactoryAddress as Address,
        abi: idFactoryAbi,
        functionName: 'getIdentity',
        args: [wallet as Address],
      });
      const identityAddr = factoryResult as string;
      setLookedUpIdentity(identityAddr && identityAddr !== zeroAddress ? identityAddr : null);
    } catch {
      setLookedUpIdentity(null);
    } finally {
      setLookingUpIdentity(false);
    }
  }, [publicClient, tokenInfo, effectiveIdentityRegistryAddress]);

  const handleWalletChange = (value: string) => {
    setWalletAddress(value);
    setLookedUpIdentity(null);
    if (isValidEthAddress(value)) {
      lookupIdentity(value);
    }
  };

  const handleAdd = async () => {
    setFormError(null);

    if (!walletAddress || !country || !tokenInfo) {
      setFormError('Wallet address and country are required.');
      return;
    }

    if (!isValidEthAddress(walletAddress)) {
      setFormError('Invalid Ethereum address. Must be 0x followed by 40 hex characters.');
      return;
    }

    // Block registration if investor has no ONCHAINID
    if (!lookedUpIdentity) {
      setFormError('Investor must have approved KYC first. No ONCHAINID contract found for this wallet.');
      return;
    }

    try {
      setSubmitting(true);
      if (!address) {
        throw new Error('Connect the issuer wallet before updating the identity registry.');
      }

      await ensureConnectedChain(walletChainId, tokenInfo.chainId, switchChainAsync);
      const identityRegistryAddress = requireAddress(
        effectiveIdentityRegistryAddress,
        'Identity registry address',
      );
      const countryCode = parseCountryNumericCode(country);

      // Check if investor is already registered in the IR (pipeline may have already done it)
      const irAddr = identityRegistryAddress as Address;
      const alreadyRegistered = await publicClient!.readContract({
        address: irAddr,
        abi: irIdentityAbi,
        functionName: 'identity',
        args: [walletAddress as Address],
      }).then((r) => r !== zeroAddress).catch(() => false);

      if (!alreadyRegistered) {
        // Not yet registered — call registerIdentity on-chain
        const client = requireWalletClient(walletClient);
        const txHash = await client.writeContract({
          address: irAddr,
          abi: identityRegistryAbi,
          functionName: 'registerIdentity',
          args: [walletAddress as Address, lookedUpIdentity as Address, countryCode],
          chain: client.chain,
          account: address,
        });
        await waitForReceipt(publicClient, txHash);
      }
      // If already registered, skip the on-chain tx and just sync the DB

      await api.post('/compliance/whitelist', {
        token_id: id,
        wallet_address: walletAddress,
        country: formatCountryCode(countryCode),
        investor_type: investorType,
      });
      setWalletAddress('');
      setCountry('');
      setInvestorType(INVESTOR_TYPES[0]);
      setLookedUpIdentity(null);
      setShowForm(false);
      await fetchData();
    } catch (err: unknown) {
      const message = err instanceof Error ? parseBaseError(err) : 'Failed to add to whitelist';
      setFormError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemove = async (entry: WhitelistEntry) => {
    if (!confirm('Remove ' + entry.walletAddress + ' from the whitelist?')) return;
    try {
      if (!tokenInfo || !address) {
        throw new Error('Connect the issuer wallet before removing a whitelist entry.');
      }

      await ensureConnectedChain(walletChainId, tokenInfo.chainId, switchChainAsync);
      const client = requireWalletClient(walletClient);
      const identityRegistryAddress = requireAddress(
        effectiveIdentityRegistryAddress,
        'Identity registry address',
      );

      const txHash = await client.writeContract({
        address: identityRegistryAddress,
        abi: identityRegistryAbi,
        functionName: 'deleteIdentity',
        args: [entry.walletAddress as Address],
        chain: client.chain,
        account: address,
      });

      await waitForReceipt(publicClient, txHash);

      await api.delete('/compliance/whitelist/' + id + '/' + entry.walletAddress);
      await fetchData();
    } catch (err: unknown) {
      const message = err instanceof Error ? parseBaseError(err) : 'Failed to remove entry';
      toast.error(message);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <Link
          href={'/issuer/tokens/' + id}
          className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-ink transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Token
        </Link>
        <div className="rounded-2xl border border-red-500/20 bg-slate-900/60 p-6 text-center text-red-400">{error}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link
        href={'/issuer/tokens/' + id}
        className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-ink transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Token
      </Link>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
            <ListChecks className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-ink">Whitelist Management</h1>
            <p className="text-sm text-slate-400">Control accredited addresses authorized to hold this security token</p>
          </div>
        </div>
        <button
          onClick={() => { setShowForm(!showForm); setLookedUpIdentity(null); setFormError(null); }}
          className={clsx(
            'inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-200',
            showForm
              ? 'border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'
              : 'bg-accent text-slate-950 shadow-lg hover:-translate-y-0.5'
          )}
        >
          {showForm ? (
            'Cancel'
          ) : (
            <>
              <UserPlus className="h-4 w-4" />
              Add to Whitelist
            </>
          )}
        </button>
      </div>

      {/* Add to Whitelist Form */}
      {showForm && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl">
          <h3 className="mb-4 text-lg font-semibold text-ink">Add Address to Whitelist</h3>
          {formError && (
            <div className="mb-4 flex items-start gap-2 rounded-xl bg-red-500/10 border border-red-500/20 p-3.5 text-sm text-red-400">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {formError}
            </div>
          )}
          {/* Quick-fill from approved investors */}
          {approvedInvestors.length > 0 && (
            <div className="mb-5">
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                Quick-fill from approved investors
              </label>
              <div className="flex flex-wrap gap-2">
                {approvedInvestors.map((inv) => (
                  <button
                    key={inv.investorId}
                    type="button"
                    disabled={!inv.wallet}
                    title={inv.wallet ? `Wallet: ${inv.wallet}` : 'No wallet linked yet'}
                    onClick={() => {
                      if (inv.wallet) {
                        handleWalletChange(inv.wallet);
                      }
                    }}
                    className="rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-1.5 text-xs font-medium text-cyan-300 transition-colors hover:bg-slate-700 hover:border-cyan-500/40 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {inv.name}
                    {!inv.wallet && ' (no wallet)'}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                Wallet Address
              </label>
              <input
                className="w-full rounded-xl border border-slate-700 bg-slate-800/80 px-3.5 py-2.5 font-mono text-sm text-ink placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                placeholder="0x..."
                value={walletAddress}
                onChange={(e) => handleWalletChange(e.target.value)}
              />
              {/* ONCHAINID lookup result */}
              <div className="mt-1.5 min-h-[20px]">
                {lookingUpIdentity && (
                  <p className="flex items-center gap-1.5 text-xs text-slate-400">
                    <Loader2 className="h-3 w-3 animate-spin text-cyan-400" />
                    Checking ONCHAINID…
                  </p>
                )}
                {!lookingUpIdentity && isValidEthAddress(walletAddress) && lookedUpIdentity && (
                  <p className="flex items-center gap-1.5 text-xs text-emerald-400">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Identity: {truncateAddress(lookedUpIdentity)}
                    {entryIdentities[walletAddress.toLowerCase()] && (
                      <span className="ml-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 text-[11px] text-emerald-400">already registered</span>
                    )}
                  </p>
                )}
                {!lookingUpIdentity && isValidEthAddress(walletAddress) && !lookedUpIdentity && walletAddress.length === 42 && (
                  <p className="flex items-center gap-1.5 text-xs text-amber-400">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    No ONCHAINID — investor must complete KYC first
                  </p>
                )}
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                Country (ISO 3166-1 numeric)
              </label>
              <input
                className="w-full rounded-xl border border-slate-700 bg-slate-800/80 px-3.5 py-2.5 text-sm text-ink placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                placeholder="e.g. 840"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                Investor Type
              </label>
              <select
                className="w-full rounded-xl border border-slate-700 bg-slate-800/80 px-3.5 py-2.5 text-sm text-ink focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                value={investorType}
                onChange={(e) => setInvestorType(e.target.value)}
              >
                {INVESTOR_TYPES.map((type) => (
                  <option key={type} value={type} className="bg-slate-900 text-ink">
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <button
                onClick={handleAdd}
                disabled={submitting || !lookedUpIdentity}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-slate-950 shadow-lg transition-all disabled:cursor-not-allowed disabled:opacity-40"
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                Add Address
              </button>
            </div>
          </div>
          <p className="mt-3 text-xs text-slate-400">
            The investor must have a deployed ONCHAINID (requires approved KYC). Country codes: 840 (US), 356 (India), 826 (UK).
          </p>
        </div>
      )}

      {/* Whitelist Table */}
      {entries.length === 0 ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-12 text-center">
          <ListChecks className="mx-auto h-12 w-12 text-slate-600" />
          <h3 className="mt-4 text-lg font-medium text-ink">No whitelisted addresses</h3>
          <p className="mt-1 text-sm text-slate-400">
            Add wallet addresses to the whitelist to allow them to hold and transfer this token.
          </p>
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-slate-950 shadow-lg"
            >
              <UserPlus className="h-4 w-4" />
              Add to Whitelist
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-800/40">
                  <th className="px-6 py-3.5 text-left text-xs font-medium uppercase tracking-wide text-slate-400">
                    Wallet Address
                  </th>
                  <th className="px-6 py-3.5 text-left text-xs font-medium uppercase tracking-wide text-slate-400">
                    ONCHAINID
                  </th>
                  <th className="px-6 py-3.5 text-left text-xs font-medium uppercase tracking-wide text-slate-400">
                    Country
                  </th>
                  <th className="px-6 py-3.5 text-left text-xs font-medium uppercase tracking-wide text-slate-400">
                    Investor Type
                  </th>
                  <th className="px-6 py-3.5 text-left text-xs font-medium uppercase tracking-wide text-slate-400">
                    Status
                  </th>
                  <th className="px-6 py-3.5 text-left text-xs font-medium uppercase tracking-wide text-slate-400">
                    Date Added
                  </th>
                  <th className="px-6 py-3.5 text-right text-xs font-medium uppercase tracking-wide text-slate-400">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {entries.map((entry) => {
                  const identityAddr = entryIdentities[entry.walletAddress.toLowerCase()];
                  return (
                    <tr key={entry.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="px-6 py-4 font-mono text-sm text-slate-200">
                        {entry.walletAddress}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        {identityAddr ? (
                          <span
                            className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-400"
                            title={identityAddr}
                          >
                            <ShieldCheck className="h-3 w-3" />
                            {truncateAddress(identityAddr)}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-400">
                            <AlertTriangle className="h-3 w-3" />
                            No identity
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-300">{entry.country}</td>
                      <td className="px-6 py-4 text-sm capitalize text-slate-300">
                        {entry.investorType}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={clsx(
                            'inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium',
                            STATUS_COLORS[entry.status] || 'bg-slate-800 text-slate-400 border border-slate-700'
                          )}
                        >
                          {entry.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-400">
                        {entry.createdAt
                          ? new Date(entry.createdAt).toLocaleDateString()
                          : '-'}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => handleRemove(entry)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-red-500/10 hover:text-red-400 transition-colors"
                          title="Remove from whitelist"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
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
