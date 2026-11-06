'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowLeftRight,
  CheckCircle2,
  XCircle,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  Info,
  Coins,
} from 'lucide-react';
import clsx from 'clsx';
import { parseUnits, formatUnits, type Address } from 'viem';
import { usePublicClient } from 'wagmi';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import {
  identityRegistryAbi,
  modularComplianceAbi,
  tokenAbi,
} from '@/lib/contracts/artifacts';
import { getDefaultSuiteAddresses } from '@/lib/contracts/deployment';
import { isAddressLike, parseBaseError } from '@/lib/contracts/evm';

function safeParseUnits(value: string, decimals: number): bigint {
  try { return parseUnits(value || '0', decimals); } catch { return BigInt(0); }
}

// ── ERC-3643 error codes ────────────────────────────────────────────────────
const ERC3643_CODES: Record<number, string> = {
  0:  'Transfer allowed',
  16: 'Sender not whitelisted',
  17: 'Receiver not whitelisted',
  18: 'Country restriction on sender',
  19: 'Country restriction on receiver',
  20: 'Compliance module blocked',
  21: 'Token paused',
  22: 'Sender address frozen',
};

function deriveErrorCode(checks: {
  paused: boolean;
  senderVerified: boolean;
  recipientVerified: boolean;
  senderFrozen: boolean;
  complianceAllowed: boolean;
}): number {
  if (checks.paused)             return 21;
  if (!checks.senderVerified)    return 16;
  if (!checks.recipientVerified) return 17;
  if (checks.senderFrozen)       return 22;
  if (!checks.complianceAllowed) return 20;
  return 0;
}

// ── Rule type display labels ────────────────────────────────────────────────
const RULE_TYPE_LABELS: Record<string, string> = {
  country_restriction:    'Country Restriction',
  investor_limit:         'Investor Limit',
  transfer_restriction:   'Transfer Restriction',
  investor_class:         'Investor Class',
  time_based:             'Time Window / Blackout',
  supply_limit:           'Supply Limit',
  max_balance:            'Max Balance per Wallet',
  daily_monthly_limit:    'Daily / Monthly Limit',
  exchange_monthly_limit: 'Exchange Monthly Limit',
  transfer_fee:           'Transfer Fee',
  sender_whitelist:       'Sender Whitelist',
};

const RULE_TYPE_COLORS: Record<string, string> = {
  country_restriction:    'bg-rose-500/10 text-rose-400 border border-rose-500/20',
  investor_limit:         'bg-blue-500/10 text-blue-400 border border-blue-500/20',
  transfer_restriction:   'bg-amber-500/10 text-amber-400 border border-amber-500/20',
  investor_class:         'bg-purple-500/10 text-purple-400 border border-purple-500/20',
  time_based:             'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
  supply_limit:           'bg-teal-500/10 text-teal-400 border border-teal-500/20',
  max_balance:            'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20',
  daily_monthly_limit:    'bg-orange-500/10 text-orange-400 border border-orange-500/20',
  exchange_monthly_limit: 'bg-pink-500/10 text-pink-400 border border-pink-500/20',
  transfer_fee:           'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20',
  sender_whitelist:       'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20',
};

// ── Why-blocked descriptions ────────────────────────────────────────────────
const RULE_WHY_BLOCKED: Record<string, string> = {
  country_restriction:    'The sender or receiver wallet is registered to a country that is blocked for this token.',
  investor_limit:         'This token has reached its maximum number of allowed holders. No new holders can receive tokens.',
  transfer_restriction:   'A lock-in or amount restriction is active. Check the lock-in end date or min/max transfer amount.',
  investor_class:         'The receiver is not in the required investor class (e.g. accredited only). Check their KYC profile.',
  time_based:             'Transfers are currently outside the allowed trading window or inside a scheduled blackout period.',
  supply_limit:           'This mint would push total supply above the hard cap. Reduce the amount or increase the supply limit.',
  max_balance:            'The receiver\'s aggregate balance across all their wallets would exceed the per-identity maximum.',
  daily_monthly_limit:    'The sender has reached their daily or monthly transfer volume limit for this rolling window.',
  exchange_monthly_limit: 'The sender has deposited too many tokens into this exchange address this month.',
  transfer_fee:           'A transfer fee applies. The fee is deducted from the amount and sent to the collector wallet.',
  sender_whitelist:       'This wallet is not in the approved sender whitelist. Only pre-registered broker-dealers or venues may initiate transfers for this token.',
};

// ── Types ────────────────────────────────────────────────────────────────────
interface OnChainChecks {
  paused: boolean;
  senderVerified: boolean;
  recipientVerified: boolean;
  senderFrozen: boolean;
  recipientFrozen: boolean;
  senderBalance: bigint;
  complianceAllowed: boolean;
  errorCode: number;
}

interface FeeInfo {
  feeBps: number;
  feePercent: number;
  feeAmount: string;
  netAmount: string;
  collectorAddress: string;
}

interface RuleResult {
  ruleId: string;
  ruleType: string;
  passed: boolean;
  reason: string;
  fee?: FeeInfo;
}

interface OffChainResult {
  allowed: boolean;
  senderWhitelisted: boolean;
  recipientWhitelisted: boolean;
  ruleResults: RuleResult[];
  fee?: FeeInfo;
}

interface TokenInfo {
  id: string;
  name: string;
  symbol: string;
  decimals?: number;
  chainId: number;
  tokenAddress?: string | null;
  identityRegistryAddress?: string | null;
  complianceAddress?: string | null;
}

// ── ExpandableRow component ──────────────────────────────────────────────────
function RuleRow({ r }: { r: RuleResult }) {
  const [open, setOpen] = useState(false);
  const label = RULE_TYPE_LABELS[r.ruleType] ?? r.ruleType.replace(/_/g, ' ');
  const badge = RULE_TYPE_COLORS[r.ruleType] ?? 'bg-slate-800 text-slate-400 border border-slate-700';
  const why  = RULE_WHY_BLOCKED[r.ruleType];

  return (
    <div className={clsx(
      'rounded-xl border',
      r.passed ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-rose-500/20 bg-rose-500/5'
    )}>
      <div className="flex items-center gap-3 px-4 py-2.5">
        {r.passed
          ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
          : <XCircle className="h-4 w-4 shrink-0 text-rose-400" />}

        <span className={clsx('rounded-full px-2.5 py-0.5 text-xs font-medium', badge)}>
          {label}
        </span>

        <span className={clsx('flex-1 text-sm', r.passed ? 'text-emerald-300' : 'text-rose-300')}>
          {r.reason}
        </span>

        {r.fee && (
          <span className="rounded-full border border-yellow-500/20 bg-yellow-500/10 px-2.5 py-0.5 text-xs font-medium text-yellow-400">
            Fee: {r.fee.feePercent}%
          </span>
        )}

        {!r.passed && why && (
          <button
            onClick={() => setOpen(v => !v)}
            className="ml-auto shrink-0 rounded-lg p-1 text-xs font-medium text-rose-400 hover:bg-rose-500/10 transition-colors"
            title="Why is this blocked?"
          >
            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        )}
      </div>

      {/* Expandable "why blocked" */}
      {!r.passed && open && why && (
        <div className="border-t border-rose-500/20 bg-rose-500/10 px-4 py-3">
          <div className="flex items-start gap-2 text-sm text-rose-300">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
            <p>{why}</p>
          </div>
        </div>
      )}

      {/* Fee breakdown */}
      {r.fee && r.fee.feeBps > 0 && (
        <div className="border-t border-yellow-500/20 bg-yellow-500/10 px-4 py-2 text-xs text-yellow-300">
          <span className="font-medium text-yellow-200">Fee breakdown:</span>{' '}
          {r.fee.feePercent}% = {parseFloat(r.fee.feeAmount).toFixed(4)} tokens →{' '}
          recipient gets {parseFloat(r.fee.netAmount).toFixed(4)} tokens.
          Collector: <span className="font-mono text-yellow-100">{r.fee.collectorAddress.slice(0, 10)}…{r.fee.collectorAddress.slice(-6)}</span>
        </div>
      )}
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function TransferCheckPage() {
  const params = useParams();
  const id = params.id as string;
  const { user } = useAuthStore();

  const [fromAddress, setFromAddress] = useState('');
  const [toAddress, setToAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [checking, setChecking] = useState(false);
  const [onChain, setOnChain] = useState<OnChainChecks | null>(null);
  const [offChain, setOffChain] = useState<OffChainResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);

  const publicClient = usePublicClient({ chainId: tokenInfo?.chainId });
  const fallbackSuite = getDefaultSuiteAddresses(tokenInfo?.chainId);
  const effectiveTokenAddress = tokenInfo?.tokenAddress || fallbackSuite.tokenAddress;
  const effectiveIRAddress = tokenInfo?.identityRegistryAddress || fallbackSuite.identityRegistryAddress;
  const effectiveComplianceAddress = tokenInfo?.complianceAddress || fallbackSuite.complianceAddress;

  useEffect(() => {
    api.get('/tokens/' + id)
      .then(res => setTokenInfo(res.data?.data ?? res.data))
      .catch(() => {});
  }, [id]);

  const handleCheck = async () => {
    if (!fromAddress || !toAddress || !amount) {
      setError('All fields are required.');
      return;
    }
    if (!effectiveTokenAddress || !effectiveIRAddress || !effectiveComplianceAddress || !publicClient) {
      setError('Token contract addresses are not available yet.');
      return;
    }
    if (!isAddressLike(fromAddress) || !isAddressLike(toAddress)) {
      setError('Both addresses must be valid EVM wallet addresses.');
      return;
    }

    const decimals = tokenInfo?.decimals ?? 18;

    try {
      setChecking(true);
      setError(null);
      setOnChain(null);
      setOffChain(null);

      const rawAmount = parseUnits(amount, decimals);

      // ── On-chain checks (parallel) ──────────────────────────────────
      const [
        paused, senderFrozen, recipientFrozen,
        senderVerified, recipientVerified,
        senderBalance, complianceAllowed,
      ] = await Promise.all([
        publicClient.readContract({ address: effectiveTokenAddress as Address, abi: tokenAbi, functionName: 'paused' }),
        publicClient.readContract({ address: effectiveTokenAddress as Address, abi: tokenAbi, functionName: 'isFrozen', args: [fromAddress as Address] }),
        publicClient.readContract({ address: effectiveTokenAddress as Address, abi: tokenAbi, functionName: 'isFrozen', args: [toAddress as Address] }),
        publicClient.readContract({ address: effectiveIRAddress as Address, abi: identityRegistryAbi, functionName: 'isVerified', args: [fromAddress as Address] }),
        publicClient.readContract({ address: effectiveIRAddress as Address, abi: identityRegistryAbi, functionName: 'isVerified', args: [toAddress as Address] }),
        publicClient.readContract({ address: effectiveTokenAddress as Address, abi: tokenAbi, functionName: 'balanceOf', args: [fromAddress as Address] }),
        publicClient.readContract({ address: effectiveComplianceAddress as Address, abi: modularComplianceAbi, functionName: 'canTransfer', args: [fromAddress as Address, toAddress as Address, rawAmount] }),
      ]);

      const errorCode = deriveErrorCode({
        paused: paused as boolean,
        senderVerified: senderVerified as boolean,
        recipientVerified: recipientVerified as boolean,
        senderFrozen: senderFrozen as boolean,
        complianceAllowed: complianceAllowed as boolean,
      });

      setOnChain({
        paused: paused as boolean,
        senderVerified: senderVerified as boolean,
        recipientVerified: recipientVerified as boolean,
        senderFrozen: senderFrozen as boolean,
        recipientFrozen: recipientFrozen as boolean,
        senderBalance: senderBalance as bigint,
        complianceAllowed: complianceAllowed as boolean,
        errorCode,
      });

      // ── Off-chain rule engine check (API) ───────────────────────────
      try {
        const offRes = await api.post('/compliance/check-transfer', {
          token_id: id,
          from_address: fromAddress,
          to_address: toAddress,
          amount,
          ...(effectiveIRAddress ? { identity_registry_address: effectiveIRAddress } : {}),
        }, user?.id ? { headers: { 'x-user-id': user.id } } : {});

        const data = offRes.data?.data ?? offRes.data;

        // Parse rule results — API returns ruleEvaluation.results[].ruleType + reason
        const ruleResults: RuleResult[] = (data.ruleEvaluation?.results ?? []).map(
          (r: { ruleId: string; ruleType: string; passed: boolean; reason: string; fee?: FeeInfo }) => ({
            ruleId:   r.ruleId,
            ruleType: r.ruleType,
            passed:   r.passed,
            reason:   r.reason,
            fee:      r.fee,
          })
        );

        setOffChain({
          allowed:              !!data.allowed,
          senderWhitelisted:    !!data.senderWhitelisted,
          recipientWhitelisted: !!data.recipientWhitelisted,
          ruleResults,
          fee: data.ruleEvaluation?.fee ?? undefined,
        });
      } catch {
        // off-chain check is best-effort
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? parseBaseError(err) : 'Transfer check failed');
    } finally {
      setChecking(false);
    }
  };

  const decimals = tokenInfo?.decimals ?? 18;
  const sym = tokenInfo?.symbol ?? '';
  const transferAllowed = onChain?.errorCode === 0 && (offChain ? offChain.allowed : true);

  // Determine the top-priority blocking reason for the banner
  const primaryBlockReason = (): string => {
    if (!onChain) return '';
    if (onChain.paused)             return 'Token is paused — no transfers allowed.';
    if (!onChain.senderVerified)    return 'Sender is not registered in the Identity Registry.';
    if (!onChain.recipientVerified) return 'Recipient is not registered in the Identity Registry.';
    if (onChain.senderFrozen)       return 'Sender wallet is frozen by the issuer.';
    if (!onChain.complianceAllowed) return 'Blocked by on-chain compliance module.';
    if (offChain && !offChain.allowed) {
      const firstFail = offChain.ruleResults.find(r => !r.passed);
      if (firstFail) return firstFail.reason;
    }
    return '';
  };

  return (
    <div className="space-y-6">
      <Link
        href={'/issuer/tokens/' + id}
        className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-ink transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Token
      </Link>

      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
          <ArrowLeftRight className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-ink">Compliance Simulation</h1>
          <p className="text-sm text-slate-400">{tokenInfo?.name} — simulate any on-chain transfer to test all TREX compliance rules</p>
        </div>
      </div>

      {/* Input form */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl">
        <h3 className="mb-1 text-base font-semibold text-ink">Simulate Transfer</h3>
        <p className="mb-4 text-xs text-slate-400">
          Enter any sender, recipient, and token amount. All on-chain and off-chain compliance rules will be evaluated in real time.
        </p>

        {error && (
          <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 p-3.5 text-sm text-red-400">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">Sender Address</label>
            <input
              className="w-full rounded-xl border border-slate-700 bg-slate-800/80 px-3.5 py-2.5 font-mono text-sm text-ink placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
              placeholder="0x..."
              value={fromAddress}
              onChange={e => setFromAddress(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">Recipient Address</label>
            <input
              className="w-full rounded-xl border border-slate-700 bg-slate-800/80 px-3.5 py-2.5 font-mono text-sm text-ink placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
              placeholder="0x..."
              value={toAddress}
              onChange={e => setToAddress(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
              Simulated Amount <span className="text-xs text-slate-500">(for balance/limit rules)</span>
            </label>
            <input
              type="number"
              className="w-full rounded-xl border border-slate-700 bg-slate-800/80 px-3.5 py-2.5 text-sm text-ink placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
              placeholder={`e.g. 1000 ${sym}`}
              value={amount}
              onChange={e => setAmount(e.target.value)}
            />
          </div>
        </div>

        <button
          onClick={handleCheck}
          disabled={checking || !fromAddress || !toAddress || !amount}
          className="mt-5 inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-slate-950 shadow-lg disabled:cursor-not-allowed disabled:opacity-40 transition-all"
        >
          {checking ? <><Loader2 className="h-4 w-4 animate-spin" /> Running checks…</> : <><ArrowLeftRight className="h-4 w-4" /> Run Compliance Check</>}
        </button>
      </div>

      {/* Results */}
      {onChain && (
        <div className="space-y-4">

          {/* ── Combined verdict banner ──────────────────────────────── */}
          <div className={clsx(
            'flex items-start gap-4 rounded-2xl border px-6 py-5 shadow-xl',
            transferAllowed
              ? 'border-emerald-500/30 bg-emerald-500/10'
              : 'border-rose-500/30 bg-rose-500/10'
          )}>
            {transferAllowed
              ? <ShieldCheck className="mt-0.5 h-8 w-8 shrink-0 text-emerald-400" />
              : <ShieldAlert className="mt-0.5 h-8 w-8 shrink-0 text-rose-400" />}
            <div className="flex-1 min-w-0">
              <p className={clsx('text-xl font-bold', transferAllowed ? 'text-emerald-300' : 'text-rose-300')}>
                {transferAllowed ? 'Transfer Allowed' : 'Transfer Blocked'}
              </p>
              {!transferAllowed && (
                <p className="mt-1 text-sm text-rose-300 font-medium">{primaryBlockReason()}</p>
              )}
              {transferAllowed && offChain?.fee && offChain.fee.feeBps > 0 && (
                <p className="mt-1 text-sm text-emerald-300">
                  Note: a {offChain.fee.feePercent}% transfer fee applies — recipient will receive {parseFloat(offChain.fee.netAmount).toFixed(4)} {sym}.
                </p>
              )}
            </div>
            <div className={clsx(
              'shrink-0 rounded-xl border px-4 py-2.5 text-center',
              transferAllowed
                ? 'border-emerald-500/30 bg-emerald-500/20'
                : 'border-rose-500/30 bg-rose-500/20'
            )}>
              <p className={clsx('text-xs font-semibold uppercase tracking-wider', transferAllowed ? 'text-emerald-300' : 'text-rose-300')}>ERC-3643</p>
              <p className={clsx('text-2xl font-bold font-mono', transferAllowed ? 'text-emerald-300' : 'text-rose-300')}>
                {onChain.errorCode}
              </p>
              <p className={clsx('text-xs', transferAllowed ? 'text-emerald-300' : 'text-rose-300')}>
                {ERC3643_CODES[onChain.errorCode] ?? 'Unknown'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">

            {/* ── On-chain checks ─────────────────────────────────────── */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-xl">
              <h4 className="mb-3.5 flex items-center gap-2 text-sm font-semibold text-ink">
                <span className="h-2 w-2 rounded-full bg-cyan-400 inline-block shadow-sm" />
                On-Chain Checks
                <span className="ml-auto text-xs font-normal text-slate-400">via RPC · live contract state</span>
              </h4>
              <div className="space-y-2">
                {[
                  {
                    label: 'Token Active (not paused)',
                    passed: !onChain.paused,
                    detail: onChain.paused ? 'PAUSED — code 21' : 'Active',
                  },
                  {
                    label: 'Sender in Identity Registry',
                    passed: onChain.senderVerified,
                    detail: onChain.senderVerified ? 'Verified' : 'Not registered — code 16',
                  },
                  {
                    label: 'Recipient in Identity Registry',
                    passed: onChain.recipientVerified,
                    detail: onChain.recipientVerified ? 'Verified' : 'Not registered — code 17',
                  },
                  {
                    label: 'Sender Not Frozen',
                    passed: !onChain.senderFrozen,
                    detail: onChain.senderFrozen ? 'FROZEN — code 22' : 'Not frozen',
                  },
                  {
                    label: 'Recipient Not Frozen',
                    passed: !onChain.recipientFrozen,
                    detail: onChain.recipientFrozen ? 'FROZEN' : 'Not frozen',
                  },
                  {
                    label: 'Sender Balance Sufficient',
                    passed: onChain.senderBalance >= safeParseUnits(amount, decimals),
                    detail: `${formatUnits(onChain.senderBalance, decimals)} ${sym} on-chain`,
                  },
                  {
                    label: 'Compliance Modules (canTransfer)',
                    passed: onChain.complianceAllowed,
                    detail: onChain.complianceAllowed ? 'All modules allow' : 'Module blocked — code 20',
                  },
                ].map(row => (
                  <div
                    key={row.label}
                    className={clsx(
                      'flex items-center justify-between rounded-xl border px-3.5 py-2.5 text-sm transition-colors',
                      row.passed ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-rose-500/20 bg-rose-500/5'
                    )}
                  >
                    <div className="flex items-center gap-2">
                      {row.passed
                        ? <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                        : <XCircle className="h-4 w-4 text-rose-400" />}
                      <span className={clsx('font-medium', row.passed ? 'text-emerald-300' : 'text-rose-300')}>
                        {row.label}
                      </span>
                    </div>
                    <span className={clsx('text-xs font-mono', row.passed ? 'text-emerald-400' : 'text-rose-400')}>
                      {row.detail}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Off-chain rule engine ────────────────────────────────── */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-xl">
              <h4 className="mb-3.5 flex items-center gap-2 text-sm font-semibold text-ink">
                <span className="h-2 w-2 rounded-full bg-slate-500 inline-block" />
                Off-Chain Rule Engine
                <span className="ml-auto text-xs font-normal text-slate-400">DB rules · per rule breakdown</span>
              </h4>

              {/* Whitelist checks */}
              {offChain && (
                <div className="mb-3 space-y-1.5">
                  {[
                    { label: 'Sender in platform whitelist', passed: offChain.senderWhitelisted },
                    { label: 'Recipient in platform whitelist', passed: offChain.recipientWhitelisted },
                  ].map(row => (
                    <div
                      key={row.label}
                      className={clsx(
                        'flex items-center gap-2 rounded-xl border px-3.5 py-2 text-sm',
                        row.passed ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-300' : 'border-amber-500/20 bg-amber-500/5 text-amber-300'
                      )}
                    >
                      {row.passed
                        ? <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                        : <XCircle className="h-4 w-4 text-amber-400" />}
                      <span className="font-medium">{row.label}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Compliance rules breakdown */}
              {offChain ? (
                offChain.ruleResults.length === 0 ? (
                  <p className="text-sm text-slate-400 italic">No compliance rules configured for this token.</p>
                ) : (
                  <div className="space-y-2">
                    {offChain.ruleResults.map(r => (
                      <RuleRow key={r.ruleId} r={r} />
                    ))}
                  </div>
                )
              ) : checking ? (
                <div className="flex items-center gap-2 text-sm text-slate-400">
                  <Loader2 className="h-4 w-4 animate-spin text-cyan-400" /> Evaluating rules…
                </div>
              ) : null}
            </div>
          </div>

          {/* ── Fee summary (if active) ──────────────────────────────────── */}
          {offChain?.fee && offChain.fee.feeBps > 0 && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-xl">
              <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
                <Coins className="h-4 w-4 text-yellow-400" />
                Transfer Fee Summary
              </h4>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 text-sm">
                <div className="rounded-xl border border-slate-800 bg-slate-800/60 p-3.5 text-center">
                  <p className="text-xs text-slate-400 uppercase tracking-wider">Fee Rate</p>
                  <p className="text-lg font-bold text-yellow-400 mt-1">{offChain.fee.feePercent}%</p>
                  <p className="text-xs text-slate-500">{offChain.fee.feeBps} bp</p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-800/60 p-3.5 text-center">
                  <p className="text-xs text-slate-400 uppercase tracking-wider">Amount Sent</p>
                  <p className="text-lg font-bold text-ink mt-1">{parseFloat(amount).toLocaleString()}</p>
                  <p className="text-xs text-slate-500">{sym}</p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-800/60 p-3.5 text-center">
                  <p className="text-xs text-slate-400 uppercase tracking-wider">Fee Deducted</p>
                  <p className="text-lg font-bold text-rose-400 mt-1">−{parseFloat(offChain.fee.feeAmount).toFixed(4)}</p>
                  <p className="text-xs text-slate-500">{sym}</p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-800/60 p-3.5 text-center">
                  <p className="text-xs text-slate-400 uppercase tracking-wider">Recipient Gets</p>
                  <p className="text-lg font-bold text-emerald-400 mt-1">{parseFloat(offChain.fee.netAmount).toFixed(4)}</p>
                  <p className="text-xs text-slate-500">{sym}</p>
                </div>
              </div>
              <p className="mt-3 text-xs text-slate-400">
                Collector: <span className="font-mono text-cyan-300">{offChain.fee.collectorAddress}</span>
              </p>
            </div>
          )}

          {/* ── ERC-3643 error code reference ────────────────────────────── */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">ERC-3643 Error Code Reference</h4>
            <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-xs text-slate-400 md:grid-cols-4">
              {Object.entries(ERC3643_CODES).map(([code, label]) => (
                <div
                  key={code}
                  className={clsx(
                    'flex items-center gap-1.5',
                    parseInt(code) === onChain.errorCode && 'font-bold text-ink'
                  )}
                >
                  <span className={clsx(
                    'font-mono rounded px-1.5 py-0.5 text-xs font-semibold border',
                    parseInt(code) === onChain.errorCode
                      ? (transferAllowed ? 'border-emerald-500/30 bg-emerald-500/20 text-emerald-400' : 'border-rose-500/30 bg-rose-500/20 text-rose-400')
                      : 'border-slate-800 bg-slate-800/80 text-slate-400'
                  )}>
                    {code}
                  </span>
                  <span className="truncate">{label}</span>
                </div>
              ))}
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
