'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Plus,
  Trash2,
  Loader2,
  Shield,
  ToggleLeft,
  ToggleRight,
  X,
  AlertCircle,
} from 'lucide-react';
import clsx from 'clsx';
import { toast } from 'sonner';
import { type Address, type Hex, encodeFunctionData, parseUnits } from 'viem';
import { useAccount, usePublicClient, useSwitchChain, useWalletClient } from 'wagmi';
import api from '@/lib/api';
import { modularComplianceAbi } from '@/lib/contracts/artifacts';

// Shared, already-deployed module instances (one per platform, bound into many
// tokens' ModularCompliance contracts — NOT deployed fresh per rule). Must match
// the addresses used at token-creation time in tokens/create/page.tsx.
const MODULE_ADDRESSES = {
  countryRestrict: (process.env.NEXT_PUBLIC_COUNTRY_RESTRICT_MODULE_ADDRESS ?? '') as Address,
  maxHolders: (process.env.NEXT_PUBLIC_MAX_HOLDER_MODULE_ADDRESS ?? '') as Address,
  transferWindow: (process.env.NEXT_PUBLIC_TRANSFER_WINDOW_MODULE_ADDRESS ?? '') as Address,
  maxBalance: (process.env.NEXT_PUBLIC_MAX_BALANCE_MODULE_ADDRESS ?? '') as Address,
  transferFee: (process.env.NEXT_PUBLIC_TRANSFER_FEE_MODULE_ADDRESS ?? '') as Address,
};

/** Minimal ABIs for the bind preconditions the modules now enforce. */
const CAN_BIND_ABI = [{
  name: 'canComplianceBind', type: 'function', stateMutability: 'view',
  inputs: [{ name: '_compliance', type: 'address' }], outputs: [{ name: '', type: 'bool' }],
}] as const;

const PRESET_HOLDERS_ABI = [{
  name: 'preSetHolders', type: 'function', stateMutability: 'nonpayable',
  inputs: [{ name: '_compliance', type: 'address' }, { name: '_wallets', type: 'address[]' }], outputs: [],
}] as const;

const PRESET_BALANCES_ABI = [{
  name: 'batchPreSetModuleState', type: 'function', stateMutability: 'nonpayable',
  inputs: [
    { name: '_compliance', type: 'address' },
    { name: '_id', type: 'address[]' },
    { name: '_balance', type: 'uint256[]' },
  ], outputs: [],
}] as const;

const PRESET_COMPLETED_ABI = [{
  name: 'presetCompleted', type: 'function', stateMutability: 'nonpayable',
  inputs: [{ name: '_compliance', type: 'address' }], outputs: [],
}] as const;

const AGENT_ABI = [
  { name: 'isAgent', type: 'function', stateMutability: 'view',
    inputs: [{ name: '_agent', type: 'address' }], outputs: [{ name: '', type: 'bool' }] },
  { name: 'addAgent', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: '_agent', type: 'address' }], outputs: [] },
] as const;

const IDENTITY_OF_ABI = [{
  name: 'identity', type: 'function', stateMutability: 'view',
  inputs: [{ name: '_userAddress', type: 'address' }], outputs: [{ name: '', type: 'address' }],
}] as const;
import { getDefaultSuiteAddresses } from '@/lib/contracts/deployment';
import { ensureConnectedChain, parseBaseError, requireAddress, requireWalletClient, waitForReceipt } from '@/lib/contracts/evm';

interface ComplianceRule {
  id: string;
  tokenId: string;
  ruleType: string;
  parameters: Record<string, unknown>;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

interface TokenInfo {
  id: string;
  name: string;
  symbol: string;
  chainId: number;
  decimals?: number;
  tokenAddress?: string | null;
  identityRegistryAddress?: string | null;
  complianceAddress?: string | null;
}

const RULE_TYPES = [
  'country_restriction',
  'investor_limit',
  'transfer_restriction',
  'investor_class',
  'time_based',
  'supply_limit',
  'max_balance',
  'daily_monthly_limit',
  'exchange_monthly_limit',
  'transfer_fee',
  'sender_whitelist',
] as const;

type RuleType = (typeof RULE_TYPES)[number];

const RULE_TYPE_COLORS: Record<RuleType, string> = {
  country_restriction:    'border border-red-500/30 bg-red-500/15 text-red-400',
  investor_limit:         'border border-blue-500/30 bg-blue-500/15 text-blue-400',
  transfer_restriction:   'border border-amber-500/30 bg-amber-500/15 text-amber-400',
  investor_class:         'border border-purple-500/30 bg-purple-500/15 text-purple-400',
  time_based:             'border border-emerald-500/30 bg-emerald-500/15 text-emerald-400',
  supply_limit:           'border border-teal-500/30 bg-teal-500/15 text-teal-400',
  max_balance:            'border border-indigo-500/30 bg-indigo-500/15 text-indigo-400',
  daily_monthly_limit:    'border border-orange-500/30 bg-orange-500/15 text-orange-400',
  exchange_monthly_limit: 'border border-pink-500/30 bg-pink-500/15 text-pink-400',
  transfer_fee:           'border border-yellow-500/30 bg-yellow-500/15 text-yellow-400',
  sender_whitelist:       'border border-cyan-500/30 bg-cyan-500/15 text-cyan-400',
};

const RULE_TYPE_LABELS: Record<RuleType, string> = {
  country_restriction:    'Country Restriction',
  investor_limit:         'Investor Limit',
  transfer_restriction:   'Transfer Restriction',
  investor_class:         'Investor Class',
  time_based:             'Time Based',
  supply_limit:           'Supply Limit',
  max_balance:            'Max Balance',
  daily_monthly_limit:    'Daily / Monthly Limit',
  exchange_monthly_limit: 'Exchange Monthly Limit',
  transfer_fee:           'Transfer Fee',
  sender_whitelist:       'Sender Whitelist',
};

function formatParamKey(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatParamValue(value: unknown): string {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.join(', ');
  return String(value);
}

function RuleParameterFields({
  ruleType,
  params,
  onChange,
}: {
  ruleType: RuleType;
  params: Record<string, unknown>;
  onChange: (params: Record<string, unknown>) => void;
}) {
  switch (ruleType) {
    case 'country_restriction':
      return (
        <div>
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5 block">
            Blocked Countries (comma-separated ISO numeric codes)
          </label>
          <input
            className="input-field font-mono"
            placeholder="840, 156, 408"
            value={(params.blocked_countries as string) || ''}
            onChange={(e) => onChange({ ...params, blocked_countries: e.target.value })}
          />
          <p className="mt-1.5 text-xs text-slate-400">Deployed on-chain via CountryRestrictModule.</p>
        </div>
      );
    case 'investor_limit':
      return (
        <div>
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5 block">
            Maximum Holders
          </label>
          <input
            type="number"
            className="input-field"
            placeholder="e.g. 500"
            value={(params.max_holders as string) || ''}
            onChange={(e) => onChange({ ...params, max_holders: Number(e.target.value) })}
          />
        </div>
      );
    case 'transfer_restriction':
      return (
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5 block">
              Lock-in End Date
            </label>
            <input
              type="date"
              className="input-field"
              value={(params.lock_in_end_date as string) || ''}
              onChange={(e) => onChange({ ...params, lock_in_end_date: e.target.value })}
            />
          </div>
          <p className="text-xs text-slate-400">
            Stored in the off-chain rule engine. Enforced on all secondary market transfer requests.
          </p>
        </div>
      );
    case 'investor_class':
      return (
        <div className="space-y-4">
          <div className="flex items-center gap-2.5">
            <input
              type="checkbox"
              id="accredited_only"
              checked={!!params.accredited_only}
              onChange={(e) => onChange({ ...params, accredited_only: e.target.checked })}
              className="h-4 w-4 rounded border-slate-700 bg-slate-950 text-cyan-500 focus:ring-cyan-400"
            />
            <label htmlFor="accredited_only" className="text-sm font-medium text-slate-200">
              Accredited Investors Only
            </label>
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5 block">
              Retail Max Percentage
            </label>
            <input
              type="number"
              className="input-field"
              placeholder="e.g. 10"
              value={(params.retail_max_pct as string) || ''}
              onChange={(e) => onChange({ ...params, retail_max_pct: Number(e.target.value) })}
            />
          </div>
          <p className="text-xs text-slate-400">
            Stored in the off-chain rule engine. Enforces allocation ratios during primary subscription.
          </p>
        </div>
      );
    case 'time_based':
      return (
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5 block">
              Blackout Start
            </label>
            <input
              type="datetime-local"
              className="input-field"
              value={(params.blackout_start as string) || ''}
              onChange={(e) => onChange({ ...params, blackout_start: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5 block">
              Blackout End
            </label>
            <input
              type="datetime-local"
              className="input-field"
              value={(params.blackout_end as string) || ''}
              onChange={(e) => onChange({ ...params, blackout_end: e.target.value })}
            />
          </div>
          <p className="text-xs text-slate-400">
            Deployed on-chain via TransferWindowModule.
          </p>
        </div>
      );
    case 'supply_limit':
      return (
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5 block">
              Maximum Total Supply (tokens)
            </label>
            <input
              type="number"
              min="1"
              step="any"
              className="input-field"
              placeholder="e.g. 1000000"
              value={(params.supply_limit as string) || ''}
              onChange={e => onChange({ ...params, supply_limit: e.target.value })}
            />
          </div>
          <p className="text-xs text-slate-400">
            Blocks minting once total supply reaches this cap. Enforced on-chain via SupplyLimitModule.
          </p>
        </div>
      );

    case 'max_balance':
      return (
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5 block">
              Maximum Balance per Wallet (tokens)
            </label>
            <input
              type="number"
              min="1"
              step="any"
              className="input-field"
              placeholder="e.g. 50000"
              value={(params.max_balance as string) || ''}
              onChange={e => onChange({ ...params, max_balance: e.target.value })}
            />
          </div>
          <p className="text-xs text-slate-400">
            Blocks any transfer or mint that would push a wallet balance over this cap via MaxBalanceModule.
          </p>
        </div>
      );

    case 'daily_monthly_limit':
      return (
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5 block">
              Daily Transfer Limit (tokens per investor)
            </label>
            <input
              type="number"
              min="0"
              step="any"
              className="input-field"
              placeholder="e.g. 10000 (leave blank to disable)"
              value={(params.daily_limit as string) || ''}
              onChange={e => onChange({ ...params, daily_limit: e.target.value || undefined })}
            />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5 block">
              Monthly Transfer Limit (tokens per investor)
            </label>
            <input
              type="number"
              min="0"
              step="any"
              className="input-field"
              placeholder="e.g. 100000 (leave blank to disable)"
              value={(params.monthly_limit as string) || ''}
              onChange={e => onChange({ ...params, monthly_limit: e.target.value || undefined })}
            />
          </div>
          <p className="text-xs text-slate-400">
            Limits outbound transfer volume per investor on rolling windows via DayMonthLimitsModule.
          </p>
        </div>
      );

    case 'exchange_monthly_limit':
      return (
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5 block">
              Exchange Wallet Addresses (one per line)
            </label>
            <textarea
              className="input-field min-h-[80px] font-mono text-xs"
              placeholder={'0xExchangeAddress1\n0xExchangeAddress2'}
              value={(params.exchange_addresses as string[] | undefined)?.join('\n') || ''}
              onChange={e => onChange({
                ...params,
                exchange_addresses: e.target.value.split('\n').map(s => s.trim()).filter(Boolean),
              })}
            />
            <p className="mt-1 text-xs text-slate-400">Register DEX/CEX deposit wallet addresses.</p>
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5 block">
              Monthly Deposit Limit per Investor (tokens)
            </label>
            <input
              type="number"
              min="1"
              step="any"
              className="input-field"
              placeholder="e.g. 50000"
              value={(params.monthly_limit as string) || ''}
              onChange={e => onChange({ ...params, monthly_limit: e.target.value })}
            />
          </div>
          <p className="text-xs text-slate-400">
            Limits how many tokens each investor can send to exchange venues per month via ExchangeMonthlyLimitsModule.
          </p>
        </div>
      );

    case 'transfer_fee': {
      const feeBps = Number(params.fee_bps ?? 0);
      const feePercent = feeBps ? (feeBps / 100).toFixed(2) : '0';
      return (
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5 block">
              Fee Percentage (%)
            </label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min="0.01"
                max="100"
                step="0.01"
                className="input-field max-w-xs"
                placeholder="e.g. 0.50"
                value={feeBps ? (feeBps / 100).toString() : ''}
                onChange={e => {
                  const pct = parseFloat(e.target.value);
                  onChange({ ...params, fee_bps: isNaN(pct) ? 0 : Math.round(pct * 100) });
                }}
              />
              <span className="text-sm font-mono text-cyan-400">
                = {feePercent}% ({feeBps} bps)
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              0.01% minimum (1 bp) &middot; 100% maximum (10,000 bp)
            </p>
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5 block">
              Collector Wallet Address
            </label>
            <input
              className="input-field font-mono"
              placeholder="0x... wallet that receives the fee"
              value={(params.collector_address as string) || ''}
              onChange={e => onChange({ ...params, collector_address: e.target.value })}
            />
          </div>
          {feeBps > 0 && (
            <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-3 text-xs text-amber-300">
              Example: on a 1,000 token transfer, fee is{' '}
              <strong className="text-ink">{(1000 * feeBps / 10000).toFixed(4)} tokens</strong> and recipient receives{' '}
              <strong className="text-ink">{(1000 - 1000 * feeBps / 10000).toFixed(4)} tokens</strong>.
            </div>
          )}
          <div className="rounded-xl bg-blue-500/10 border border-blue-500/20 p-3 text-xs text-blue-300">
            The collector holds tokens, so it must be a <strong>KYC-approved investor</strong> on
            this token. Saving this rule also grants the fee module agent rights, which needs one
            extra wallet signature.
          </div>
        </div>
      );
    }

    case 'sender_whitelist': {
      const senders: string[] = (params.allowed_senders as string[] | undefined) ?? [];
      const raw: string = (params._raw_input as string) ?? '';
      return (
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5 block">
              Allowed Sender Wallets (one per line)
            </label>
            <textarea
              className="input-field min-h-[100px] font-mono text-xs"
              placeholder={'0xBrokerDeskWallet\n0xAuthorisedVenueWallet\n0xTransferAgentWallet'}
              value={raw !== undefined ? raw : senders.join('\n')}
              onChange={e => {
                const lines = e.target.value.split('\n').map(s => s.trim()).filter(Boolean);
                onChange({ ...params, allowed_senders: lines, _raw_input: e.target.value });
              }}
            />
            {senders.length > 0 && (
              <p className="mt-1 text-xs text-cyan-400 font-mono">
                {senders.length} address{senders.length !== 1 ? 'es' : ''} configured
              </p>
            )}
          </div>
          <div className="rounded-xl bg-cyan-500/10 border border-cyan-500/20 p-3 text-xs text-cyan-300 space-y-1">
            <p className="font-bold">How it works</p>
            <p>Only wallets in this list can initiate transfers. Any wallet can still receive tokens. Mints are always permitted.</p>
          </div>
        </div>
      );
    }

    default:
      return null;
  }
}

export default function ComplianceRulesPage() {
  const params = useParams();
  const id = params.id as string;
  const { address, chainId: walletChainId } = useAccount();
  const { data: walletClient } = useWalletClient();
  const { switchChainAsync } = useSwitchChain();

  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);
  const [rules, setRules] = useState<ComplianceRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Add rule form state
  const [newRuleType, setNewRuleType] = useState<RuleType>('country_restriction');
  const [newRuleParams, setNewRuleParams] = useState<Record<string, unknown>>({});
  const publicClient = usePublicClient({ chainId: tokenInfo?.chainId });
  const fallbackSuite = getDefaultSuiteAddresses(tokenInfo?.chainId);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [tokenRes, rulesRes] = await Promise.all([
        api.get('/tokens/' + id),
        api.get('/compliance/rules?token_id=' + id),
      ]);
      setTokenInfo(tokenRes.data.data);
      setRules(rulesRes.data.data || []);
      setError(null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to fetch data';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /**
   * Binds one of the platform's shared, already-deployed module instances to this
   * token's ModularCompliance (if not already bound), then configures it via
   * ModularCompliance.callModuleFunction — the module's setters are gated by
   * onlyComplianceCall, so they can only be invoked through the compliance
   * contract itself, never by a direct wallet call to the module.
   *
   * Module instances are shared platform-wide (state is keyed by the calling
   * compliance contract's address), matching the same addresses bound at
   * token-creation time in tokens/create/page.tsx and deployed once via
   * contracts/scripts/deploy-fresh-all.ts — never deploy a fresh instance per rule.
   */
  const deployOnchainModule = useCallback(
    async (ruleType: RuleType, parameters: Record<string, unknown>) => {
      if (!tokenInfo || !address || !publicClient) {
        throw new Error('Connect the issuer wallet to manage on-chain compliance modules.');
      }

      await ensureConnectedChain(walletChainId, tokenInfo.chainId, switchChainAsync);
      const client = requireWalletClient(walletClient);
      const complianceAddress = requireAddress(
        tokenInfo.complianceAddress || fallbackSuite.complianceAddress,
        'Compliance contract address'
      );

      const bindIfNeeded = async (moduleAddress: Address) => {
        const isBound = await publicClient.readContract({
          address: complianceAddress,
          abi: modularComplianceAbi,
          functionName: 'isModuleBound',
          args: [moduleAddress],
        });
        if (isBound) return;
        const addModuleHash = await client.writeContract({
          address: complianceAddress,
          abi: modularComplianceAbi,
          functionName: 'addModule',
          args: [moduleAddress],
          chain: client.chain,
          account: address,
        });
        await waitForReceipt(publicClient, addModuleHash);
      };

      /** Current holders from the cap table, zero balances excluded. */
      const fetchHolders = async (): Promise<{ wallet: Address; balance: bigint }[]> => {
        const res = await api.get(`/tokens/cap-table/tokens/${tokenInfo.id}`, {
          params: { limit: 500 },
        });
        const rows = (res.data?.data?.data ?? res.data?.data ?? []) as Array<{
          walletAddress: string;
          balance: string;
        }>;
        return rows
          .map((r) => ({ wallet: r.walletAddress as Address, balance: BigInt(r.balance || '0') }))
          .filter((r) => r.balance > BigInt(0));
      };

      /**
       * MaxHolder and MaxBalance mirror state rather than reading it live, so
       * they refuse to bind to a token that already has holders until those
       * holders are seeded. Seed first, then the bind is accepted.
       */
      const seedIfNeeded = async (moduleAddress: Address, kind: 'holders' | 'balances') => {
        const canBind = await publicClient.readContract({
          address: moduleAddress,
          abi: CAN_BIND_ABI,
          functionName: 'canComplianceBind',
          args: [complianceAddress],
        });
        if (canBind) return;

        const holders = await fetchHolders();
        if (holders.length === 0) {
          // Nothing to seed, but the module still wants an explicit go-ahead.
          const hash = await client.writeContract({
            address: moduleAddress, abi: PRESET_COMPLETED_ABI,
            functionName: 'presetCompleted', args: [complianceAddress],
            chain: client.chain, account: address,
          });
          await waitForReceipt(publicClient, hash);
          return;
        }

        if (kind === 'holders') {
          const hash = await client.writeContract({
            address: moduleAddress, abi: PRESET_HOLDERS_ABI,
            functionName: 'preSetHolders',
            args: [complianceAddress, holders.map((h) => h.wallet)],
            chain: client.chain, account: address,
          });
          await waitForReceipt(publicClient, hash);
          toast.info(`Seeded ${holders.length} existing holder(s) into the module.`);
          return;
        }

        // MaxBalance aggregates per ONCHAINID, so resolve each wallet's identity
        // and sum wallets that belong to the same investor.
        const registryAddress = requireAddress(
          tokenInfo.identityRegistryAddress || fallbackSuite.identityRegistryAddress,
          'Identity registry address',
        );
        const perIdentity = new Map<string, bigint>();
        for (const h of holders) {
          const identity = (await publicClient.readContract({
            address: registryAddress, abi: IDENTITY_OF_ABI,
            functionName: 'identity', args: [h.wallet],
          })) as Address;
          if (identity && identity !== '0x0000000000000000000000000000000000000000') {
            perIdentity.set(identity, (perIdentity.get(identity) ?? BigInt(0)) + h.balance);
          }
        }
        if (perIdentity.size === 0) {
          const hash = await client.writeContract({
            address: moduleAddress, abi: PRESET_COMPLETED_ABI,
            functionName: 'presetCompleted', args: [complianceAddress],
            chain: client.chain, account: address,
          });
          await waitForReceipt(publicClient, hash);
          return;
        }
        const hash = await client.writeContract({
          address: moduleAddress, abi: PRESET_BALANCES_ABI,
          functionName: 'batchPreSetModuleState',
          args: [complianceAddress, [...perIdentity.keys()] as Address[], [...perIdentity.values()]],
          chain: client.chain, account: address,
        });
        await waitForReceipt(publicClient, hash);
        toast.info(`Seeded ${perIdentity.size} investor balance(s) into the module.`);
      };

      /**
       * TransferFee collects by calling token.forcedTransfer, which is
       * agent-only, so it refuses to bind until the token has granted it.
       */
      const grantAgentIfNeeded = async (moduleAddress: Address) => {
        const tokenAddress = requireAddress(
          tokenInfo.tokenAddress || fallbackSuite.tokenAddress,
          'Token address',
        );
        const isAgent = await publicClient.readContract({
          address: tokenAddress, abi: AGENT_ABI, functionName: 'isAgent', args: [moduleAddress],
        });
        if (isAgent) return;
        const hash = await client.writeContract({
          address: tokenAddress, abi: AGENT_ABI, functionName: 'addAgent',
          args: [moduleAddress], chain: client.chain, account: address,
        });
        await waitForReceipt(publicClient, hash);
        toast.info('Granted the fee module agent rights on the token.');
      };

      const callModuleFunction = async (moduleAddress: Address, calldata: Hex) => {
        const txHash = await client.writeContract({
          address: complianceAddress,
          abi: modularComplianceAbi,
          functionName: 'callModuleFunction',
          args: [calldata, moduleAddress],
          chain: client.chain,
          account: address,
        });
        await waitForReceipt(publicClient, txHash);
      };

      if (ruleType === 'country_restriction') {
        const moduleAddress = requireAddress(MODULE_ADDRESSES.countryRestrict, 'CountryRestrictModule address');
        const blockedCountries = ((parameters.blocked_countries as number[]) || []).map(Number).filter((n) => n > 0);
        if (blockedCountries.length === 0) {
          throw new Error('At least one blocked country is required.');
        }

        await bindIfNeeded(moduleAddress);
        await callModuleFunction(
          moduleAddress,
          encodeFunctionData({
            abi: [{ name: 'batchRestrictCountries', type: 'function', inputs: [{ name: '_countries', type: 'uint16[]' }], outputs: [] }],
            functionName: 'batchRestrictCountries',
            args: [blockedCountries.map((c) => c as unknown as bigint)],
          }) as Hex,
        );

        return { moduleAddress, enforcement: 'onchain' as const };
      }

      if (ruleType === 'investor_limit') {
        const moduleAddress = requireAddress(MODULE_ADDRESSES.maxHolders, 'MaxHolderModule address');
        const maxHolders = Number(parameters.max_holders);
        if (!maxHolders || maxHolders <= 0) {
          throw new Error('max_holders must be a positive number.');
        }

        await seedIfNeeded(moduleAddress, 'holders');
        await bindIfNeeded(moduleAddress);
        await callModuleFunction(
          moduleAddress,
          encodeFunctionData({
            abi: [{ name: 'setMaxHolders', type: 'function', inputs: [{ name: '_max', type: 'uint256' }], outputs: [] }],
            functionName: 'setMaxHolders',
            args: [BigInt(maxHolders)],
          }) as Hex,
        );

        return { moduleAddress, enforcement: 'onchain' as const };
      }

      if (ruleType === 'time_based') {
        const moduleAddress = requireAddress(MODULE_ADDRESSES.transferWindow, 'TransferWindowModule address');
        const blackoutStart = parameters.blackout_start as string | undefined;
        const blackoutEnd = parameters.blackout_end as string | undefined;
        if (!blackoutStart || !blackoutEnd) {
          throw new Error('Blackout start and end are required.');
        }

        await bindIfNeeded(moduleAddress);
        await callModuleFunction(
          moduleAddress,
          encodeFunctionData({
            abi: [{ name: 'activateBlackout', type: 'function', inputs: [{ name: '_start', type: 'uint256' }, { name: '_end', type: 'uint256' }], outputs: [] }],
            functionName: 'activateBlackout',
            args: [
              BigInt(Math.floor(new Date(blackoutStart).getTime() / 1000)),
              BigInt(Math.floor(new Date(blackoutEnd).getTime() / 1000)),
            ],
          }) as Hex,
        );

        return { moduleAddress, enforcement: 'onchain' as const };
      }

      if (ruleType === 'max_balance') {
        const moduleAddress = requireAddress(MODULE_ADDRESSES.maxBalance, 'MaxBalanceModule address');
        const raw = String(parameters.max_balance ?? '').trim();
        if (!raw || Number(raw) <= 0) {
          throw new Error('Max balance must be a positive number.');
        }
        const decimals = tokenInfo.decimals ?? 18;
        const maxWei = parseUnits(raw, decimals);

        await seedIfNeeded(moduleAddress, 'balances');
        await bindIfNeeded(moduleAddress);
        await callModuleFunction(
          moduleAddress,
          encodeFunctionData({
            abi: [{ name: 'setMaxBalance', type: 'function', inputs: [{ name: '_max', type: 'uint256' }], outputs: [] }],
            functionName: 'setMaxBalance',
            args: [maxWei],
          }) as Hex,
        );

        return { moduleAddress, enforcement: 'onchain' as const };
      }

      if (ruleType === 'transfer_fee') {
        const moduleAddress = requireAddress(MODULE_ADDRESSES.transferFee, 'TransferFeeModule address');
        const feeBps = Number(parameters.fee_bps ?? 0);
        const collector = String(parameters.collector_address ?? '').trim() as Address;
        if (!feeBps || feeBps <= 0 || feeBps > 10000) {
          throw new Error('Fee must be between 1 and 10000 basis points.');
        }
        if (!/^0x[a-fA-F0-9]{40}$/.test(collector)) {
          throw new Error('A valid collector wallet address is required.');
        }

        // The collector receives tokens, so it must be a verified holder —
        // forcedTransfer enforces isVerified, and an unverified collector
        // would make every transfer on this token revert.
        const registryAddress = requireAddress(
          tokenInfo.identityRegistryAddress || fallbackSuite.identityRegistryAddress,
          'Identity registry address',
        );
        const collectorIdentity = (await publicClient.readContract({
          address: registryAddress, abi: IDENTITY_OF_ABI,
          functionName: 'identity', args: [collector],
        })) as Address;
        if (!collectorIdentity || collectorIdentity === '0x0000000000000000000000000000000000000000') {
          throw new Error(
            'The fee collector must be a registered investor on this token. ' +
            'Onboard that wallet through KYC first, otherwise every transfer would fail.',
          );
        }

        await grantAgentIfNeeded(moduleAddress);
        await bindIfNeeded(moduleAddress);
        await callModuleFunction(
          moduleAddress,
          encodeFunctionData({
            abi: [{ name: 'setFeeConfig', type: 'function', inputs: [{ name: '_feeBps', type: 'uint16' }, { name: '_collector', type: 'address' }], outputs: [] }],
            functionName: 'setFeeConfig',
            args: [feeBps, collector],
          }) as Hex,
        );

        return { moduleAddress, enforcement: 'onchain' as const };
      }

      return { moduleAddress: null, enforcement: 'offchain' as const };
    },
    [address, fallbackSuite, publicClient, switchChainAsync, tokenInfo, walletChainId, walletClient],
  );

  const handleAddRule = async () => {
    try {
      setSubmitting(true);
      let parameters = { ...newRuleParams };

      // Parse comma-separated countries into an array
      if (newRuleType === 'country_restriction' && typeof parameters.blocked_countries === 'string') {
        parameters = {
          ...parameters,
          blocked_countries: (parameters.blocked_countries as string)
            .split(',')
            .map((s) => Number((s as string).trim()))
            .filter(Boolean),
        };
      }

      const moduleSetup = await deployOnchainModule(newRuleType, parameters);
      parameters = {
        ...parameters,
        enforcement: moduleSetup.enforcement,
        ...(moduleSetup.moduleAddress ? { module_address: moduleSetup.moduleAddress } : {}),
      };

      await api.post('/compliance/rules', {
        token_id: id,
        rule_type: newRuleType,
        parameters,
        is_active: true,
      });

      setShowAddModal(false);
      setNewRuleType('country_restriction');
      setNewRuleParams({});
      await fetchData();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to add rule';
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * Module instances are shared platform-wide and bound once per token, so a
   * single module address can back several rules on the same token. Unbinding
   * must therefore only happen when no *other* active rule still needs it —
   * otherwise removing one rule would silently stop enforcing the others.
   * Binding is likewise skipped when the module is already bound, since
   * ModularCompliance.addModule reverts with "module already bound".
   */
  const setModuleBinding = useCallback(
    async (moduleAddress: Address, shouldBeBound: boolean) => {
      if (!tokenInfo || !address || !publicClient) return;
      await ensureConnectedChain(walletChainId, tokenInfo.chainId, switchChainAsync);
      const client = requireWalletClient(walletClient);
      const complianceAddress = requireAddress(
        tokenInfo.complianceAddress,
        'Compliance contract address',
      );

      const isBound = await publicClient.readContract({
        address: complianceAddress,
        abi: modularComplianceAbi,
        functionName: 'isModuleBound',
        args: [moduleAddress],
      });
      if (isBound === shouldBeBound) return;

      const txHash = await client.writeContract({
        address: complianceAddress,
        abi: modularComplianceAbi,
        functionName: shouldBeBound ? 'addModule' : 'removeModule',
        args: [moduleAddress],
        chain: client.chain,
        account: address,
      });
      await waitForReceipt(publicClient, txHash);
    },
    [address, publicClient, switchChainAsync, tokenInfo, walletChainId, walletClient],
  );

  /** True when some other still-active rule on this token uses the same module. */
  const moduleStillNeededByOtherRule = (moduleAddress: Address, excludingRuleId: string) =>
    rules.some(
      (r) =>
        r.id !== excludingRuleId &&
        r.isActive &&
        (r.parameters?.module_address as string | undefined)?.toLowerCase() ===
          moduleAddress.toLowerCase(),
    );

  const handleToggleRule = async (rule: ComplianceRule) => {
    try {
      const moduleAddress = rule.parameters?.module_address as Address | undefined;
      const enforcement = rule.parameters?.enforcement;

      if (moduleAddress && enforcement === 'onchain') {
        if (rule.isActive) {
          // deactivating — keep the module bound if another active rule needs it
          if (!moduleStillNeededByOtherRule(moduleAddress, rule.id)) {
            await setModuleBinding(moduleAddress, false);
          }
        } else {
          await setModuleBinding(moduleAddress, true);
        }
      }

      await api.patch('/compliance/rules/' + rule.id, {
        is_active: !rule.isActive,
      });
      await fetchData();
    } catch (err: unknown) {
      const message = err instanceof Error ? parseBaseError(err) : 'Failed to update rule';
      toast.error(message);
    }
  };

  const handleDeleteRule = async (ruleId: string) => {
    if (!confirm('Are you sure you want to delete this rule?')) return;
    try {
      const rule = rules.find((entry) => entry.id === ruleId);
      const moduleAddress = rule?.parameters?.module_address as Address | undefined;
      const enforcement = rule?.parameters?.enforcement;

      if (
        rule?.isActive &&
        moduleAddress &&
        enforcement === 'onchain' &&
        !moduleStillNeededByOtherRule(moduleAddress, rule.id)
      ) {
        await setModuleBinding(moduleAddress, false);
      }

      await api.delete('/compliance/rules/' + ruleId);
      await fetchData();
    } catch (err: unknown) {
      const message = err instanceof Error ? parseBaseError(err) : 'Failed to delete rule';
      toast.error(message);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
      </div>
    );
  }

  if (error || !tokenInfo) {
    return (
      <div className="space-y-6">
        <Link
          href={'/issuer/tokens/' + id}
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-400 hover:text-cyan-400 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Token
        </Link>
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-center text-red-400">
          <AlertCircle className="mx-auto mb-2 h-8 w-8 text-red-400" />
          <p className="font-medium">{error || 'Token not found'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link
        href={'/issuer/tokens/' + id}
        className="group inline-flex items-center gap-2 text-sm font-semibold text-slate-400 hover:text-cyan-400 transition-colors"
      >
        <ArrowLeft className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-1" />
        Back to Token
      </Link>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-500/10 text-cyan-400 border border-blue-500/20 shadow-md">
            <Shield className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-ink">
              {tokenInfo.name} &mdash; Compliance Rules
            </h1>
            <p className="mt-0.5 text-xs font-mono text-cyan-400/80">
              ERC-3643 Modular Compliance Engine
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-bold text-slate-950 shadow-md hover:scale-[1.02] active:scale-[0.98] transition-all"
        >
          <Plus className="h-4 w-4" />
          <span>Add Rule</span>
        </button>
      </div>

      {/* On-Chain Enforcement Banner */}
      <div className="flex items-start gap-3.5 rounded-2xl border border-cyan-500/30 bg-cyan-500/10 p-4.5 text-sm shadow-lg">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
          <Shield className="h-4 w-4" />
        </div>
        <div>
          <span className="font-bold text-cyan-300">On-Chain Enforcement: </span>
          <span className="text-slate-300 text-xs sm:text-sm leading-relaxed">
            Country restrictions, investor limits, time-based transfer windows, max wallet balance, and exchange monthly velocity. All rules are verified atomically on-chain by the Modular Compliance contract and previewed by the off-chain validator.
          </span>
        </div>
      </div>

      {rules.length === 0 ? (
        <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-12 text-center shadow-xl">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-800 bg-slate-950/60 text-slate-500 mb-3 mx-auto shadow-inner">
            <Shield className="h-7 w-7" />
          </div>
          <h3 className="text-base font-bold text-ink tracking-tight">No Compliance Rules Configured</h3>
          <p className="mt-1 max-w-sm text-xs text-slate-400 mx-auto">
            Add your first compliance rule to enforce automated KYC restrictions and transfer controls on this token.
          </p>
          <button
            onClick={() => setShowAddModal(true)}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-2 text-sm font-bold text-slate-950 shadow-md transition-all"
          >
            <Plus className="h-4 w-4" />
            <span>Add Rule</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {rules.map((rule) => (
            <div
              key={rule.id}
              className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-5 shadow-lg transition-all hover:border-slate-700/80 hover:bg-slate-900/90"
            >
              <div className="flex items-start justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={clsx(
                      'inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold',
                      RULE_TYPE_COLORS[rule.ruleType as RuleType] || 'border border-slate-700 bg-slate-800 text-slate-300'
                    )}
                  >
                    {RULE_TYPE_LABELS[rule.ruleType as RuleType] || rule.ruleType}
                  </span>
                  <span
                    className={clsx(
                      'inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold',
                      rule.isActive
                        ? 'border border-emerald-500/30 bg-emerald-500/15 text-emerald-400'
                        : 'border border-slate-700 bg-slate-800 text-slate-400'
                    )}
                  >
                    {rule.isActive ? 'Active' : 'Inactive'}
                  </span>
                  {(rule.parameters?.enforcement as string | undefined) && (
                    <span className="inline-flex rounded-full border border-blue-500/30 bg-blue-500/15 px-2.5 py-0.5 text-[10px] font-semibold text-blue-300 uppercase tracking-wider">
                      {String(rule.parameters.enforcement)}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => handleToggleRule(rule)}
                    className="rounded-lg p-1 text-slate-400 hover:text-ink transition-colors"
                    title={rule.isActive ? 'Deactivate' : 'Activate'}
                  >
                    {rule.isActive ? (
                      <ToggleRight className="h-6 w-6 text-emerald-400" />
                    ) : (
                      <ToggleLeft className="h-6 w-6 text-slate-500" />
                    )}
                  </button>
                  <button
                    onClick={() => handleDeleteRule(rule.id)}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-red-500/20 hover:text-red-400 transition-colors"
                    title="Delete rule"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="mt-4 space-y-2.5 border-t border-slate-800/80 pt-3.5">
                {Object.entries(rule.parameters || {}).map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between text-xs sm:text-sm">
                    <span className="text-slate-400">{formatParamKey(key)}</span>
                    <span className="font-semibold text-ink font-mono">
                      {formatParamValue(value)}
                    </span>
                  </div>
                ))}
                {Object.keys(rule.parameters || {}).length === 0 && (
                  <p className="text-xs text-slate-500 italic">No parameters configured</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Rule Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="card w-full max-w-lg p-6">
            <div className="mb-5 flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10 text-cyan-400 border border-blue-500/20">
                  <Shield className="h-4 w-4" />
                </div>
                <h3 className="text-lg font-bold text-ink tracking-tight">Add Compliance Rule</h3>
              </div>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setNewRuleParams({});
                }}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-ink transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5 block">
                  Rule Type
                </label>
                <select
                  className="w-full rounded-xl border border-slate-700/80 bg-slate-950/80 px-3.5 py-2.5 text-sm text-ink focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400 transition-all"
                  value={newRuleType}
                  onChange={(e) => {
                    setNewRuleType(e.target.value as RuleType);
                    setNewRuleParams({});
                  }}
                >
                  {RULE_TYPES.map((type) => (
                    <option key={type} value={type} className="bg-slate-900 text-ink">
                      {RULE_TYPE_LABELS[type]}
                    </option>
                  ))}
                </select>
              </div>

              <RuleParameterFields
                ruleType={newRuleType}
                params={newRuleParams}
                onChange={setNewRuleParams}
              />

              <div className="flex gap-3 justify-end pt-3 border-t border-slate-800">
                <button
                  onClick={() => {
                    setShowAddModal(false);
                    setNewRuleParams({});
                  }}
                  className="rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-slate-800 hover:text-ink transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddRule}
                  disabled={submitting}
                  className="inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-2 text-sm font-bold text-slate-950 shadow-md disabled:opacity-50 transition-all"
                >
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  Add Rule
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
