'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAccount } from 'wagmi';
import { getAccount, getPublicClient, getWalletClient } from 'wagmi/actions';
import { wagmiConfig } from '@/lib/wagmi-config';
import { parseUnits, type Address } from 'viem';
import {
  ArrowLeftRight,
  CheckCircle,
  XCircle,
  MinusCircle,
  Loader2,
  Send,
  AlertTriangle,
  ExternalLink,
  ShieldCheck,
  Coins,
  Globe,
} from 'lucide-react';
import api from '@/lib/api';
import { chainLabel, explorerUrl } from '@/lib/chains';
import { useAuthStore } from '@/store/auth.store';
import { InvestorPosition, fetchOnchainBalance } from '@/lib/investor-positions';

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
  {
    name: 'decimals',
    type: 'function' as const,
    stateMutability: 'view' as const,
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
] as const;

interface FeeInfo {
  feeBps: number;
  feePercent: number;
  feeAmount: string;
  netAmount: string;
  collectorAddress: string;
}

interface CheckResult {
  allowed: boolean;
  reasons: string[];
  failedRules: { ruleType: string; reason: string }[];
  fee?: FeeInfo;
  onchainModules?: {
    allowed: boolean;
    complianceCanTransfer: boolean | null;
  };
  senderVerifiedOnchain?: boolean;
  recipientVerifiedOnchain?: boolean;
}

interface TransferRecord {
  id: string;
  tokenId: string;
  tokenAmount: string;
  status: string;
  createdAt: string;
  metadata?: { tx_hash?: string; to_address?: string; token_name?: string; token_symbol?: string };
}

function isValidAddress(addr: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(addr);
}

export default function TransferPage() {
  const { user } = useAuthStore();
  const { address: connectedAddress } = useAccount();
  const address = connectedAddress || getAccount(wagmiConfig).address || (user?.walletAddress as Address | undefined);

  // Holdings
  const [positions, setPositions] = useState<InvestorPosition[]>([]);
  const [loadingPositions, setLoadingPositions] = useState(true);
  const [onchainBalances, setOnchainBalances] = useState<Record<string, number>>({});

  // Form
  const [selectedTokenId, setSelectedTokenId] = useState('');
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');

  // Check
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<CheckResult | null>(null);

  // Send
  const [sending, setSending] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  // Transaction history
  const [history, setHistory] = useState<TransferRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  // Load positions
  const loadPositions = useCallback(async () => {
    if (!user?.id) { setLoadingPositions(false); return; }
    try {
      const res = await api.get('/tokens/portfolio/me', {
        headers: { 'x-user-id': user.id },
        params: address ? { wallet_address: address } : undefined,
      });
      const data: InvestorPosition[] = res.data?.data ?? [];
      const active = data.filter(p => p.tokenAddress && p.status === 'active');
      setPositions(active);

      // Fetch on-chain balances via backend API (avoids browser CORS on RPC)
      if (address) {
        const balances: Record<string, number> = {};
        await Promise.all(active.map(async (pos) => {
          if (!pos.tokenAddress) return;
          const { balance } = await fetchOnchainBalance(pos.tokenId, address);
          if (balance !== null) balances[pos.tokenId] = balance;
        }));
        setOnchainBalances(prev => ({ ...prev, ...balances }));
      }
    } catch {
      setPositions([]);
    } finally {
      setLoadingPositions(false);
    }
  }, [user?.id, address]);

  useEffect(() => { loadPositions(); }, [loadPositions]);

  // Load transfer history (completed payments)
  useEffect(() => {
    if (!user?.id) { setLoadingHistory(false); return; }
    api.get('/payments/history', { headers: { 'x-user-id': user.id } })
      .then(r => setHistory(r.data?.data ?? []))
      .catch(() => setHistory([]))
      .finally(() => setLoadingHistory(false));
  }, [user?.id]);

  const selectedPosition = positions.find(p => p.tokenId === selectedTokenId);
  const maxBalance = selectedTokenId ? (onchainBalances[selectedTokenId] ?? Number(selectedPosition?.quantity ?? 0)) : 0;

  // Reset check result when inputs change
  useEffect(() => {
    setCheckResult(null);
    setSendError(null);
  }, [selectedTokenId, recipient, amount]);

  const handleCheck = async () => {
    if (!selectedPosition || !isValidAddress(recipient) || !amount) return;
    setChecking(true);
    setCheckResult(null);
    try {
      const res = await api.post('/compliance/check-transfer', {
        token_id: selectedTokenId,
        from_address: address,
        to_address: recipient,
        amount,
        ...(selectedPosition.identityRegistryAddress ? { identity_registry_address: selectedPosition.identityRegistryAddress } : {}),
        ...(selectedPosition.complianceAddress ? { compliance_address: selectedPosition.complianceAddress } : {}),
      });
      setCheckResult(res.data?.data ?? null);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Check failed';
      setCheckResult({ allowed: false, reasons: [msg], failedRules: [] });
    } finally {
      setChecking(false);
    }
  };

  const handleSend = async () => {
    if (!selectedPosition?.tokenAddress || !address) return;
    const walletClient = await getWalletClient(wagmiConfig);
    const publicClient = getPublicClient(wagmiConfig);
    if (!walletClient || !publicClient) return;
    setSending(true);
    setSendError(null);
    setTxHash(null);
    try {
      // Fetch decimals from contract
      const decimalsRaw = await publicClient.readContract({
        address: selectedPosition.tokenAddress as Address,
        abi: TOKEN_TRANSFER_ABI,
        functionName: 'decimals',
      });
      const decimals = Number(decimalsRaw);
      const amountWei = parseUnits(
        parseFloat(amount).toFixed(decimals).replace(/\.?0+$/, '') || '0',
        decimals,
      );

      const hash = await walletClient.writeContract({
        address: selectedPosition.tokenAddress as Address,
        abi: TOKEN_TRANSFER_ABI,
        functionName: 'transfer',
        args: [recipient as Address, amountWei],
        account: address,
      });

      await publicClient.waitForTransactionReceipt({ hash });
      setTxHash(hash);
      setAmount('');
      setRecipient('');
      setCheckResult(null);
      await loadPositions();
    } catch (err: unknown) {
      const msg = (err as Error).message ?? String(err);
      setSendError(msg.includes('User rejected') ? 'Transaction cancelled.' : msg.slice(0, 150));
    } finally {
      setSending(false);
    }
  };

  // A transfer to your own wallet is a no-op, and one above your balance
  // reverts on-chain. Both were previously warned about but still allowed
  // through to the compliance check and the send button.
  const isSelfTransfer =
    isValidAddress(recipient) && recipient.toLowerCase() === address?.toLowerCase();
  const exceedsBalance = !!amount && parseFloat(amount) > maxBalance;

  const canCheck =
    !!selectedTokenId &&
    isValidAddress(recipient) &&
    !isSelfTransfer &&
    !!amount &&
    parseFloat(amount) > 0 &&
    !exceedsBalance;
  const canSend = !!checkResult?.allowed && canCheck && !sending;

  // Explorer links follow the token's own chain where we know it. History rows
  // carry no chain, so fall back to the position we hold for that token.
  const selectedChainId = selectedPosition?.chainId;
  const chainIdForToken = (tokenId: string) =>
    positions.find((p) => p.tokenId === tokenId)?.chainId ?? selectedChainId ?? 11155111;

  const stepTone = (done: boolean) =>
    done
      ? 'bg-accent text-btn-text border-accent'
      : 'bg-surface-header text-muted border-line';

  return (
    <div className="space-y-6 pb-10">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="kicker">Wallet</p>
          <h1 className="page-title mt-1">Transfer Tokens</h1>
          <p className="mt-1 text-muted">Send your tokens to another whitelisted wallet</p>
        </div>
        <a href="/transfer/requests" className="btn-secondary shrink-0">
          <ArrowLeftRight className="h-4 w-4" />
          My Requests
        </a>
      </div>

      {!address && (
        <div className="card flex flex-wrap items-center gap-4 p-4">
          <div className="icon-chip bg-warning-100 text-warning">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="min-w-[14rem] flex-1">
            <p className="text-sm font-semibold text-ink">Wallet not connected</p>
            <p className="text-sm text-muted">
              Connect the wallet holding your tokens to compose a transfer.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* ── Compose ───────────────────────────────────────────────────── */}
        <div className="space-y-6 lg:col-span-3">
          <div className="card p-6">
            <h3>New Transfer</h3>
            <p className="stat-label mt-0.5">Every transfer is checked against this token&apos;s compliance rules</p>

            <div className="mt-5 space-y-5">
              {/* Step 1 — token */}
              <div>
                <div className="flex items-center gap-2">
                  <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[11px] font-bold ${stepTone(!!selectedTokenId)}`}>
                    1
                  </span>
                  <label htmlFor="transfer-token" className="label">Token</label>
                </div>

                <div className="mt-2">
                  {loadingPositions ? (
                    <div className="h-10 animate-pulse rounded-[10px] bg-surface-header" />
                  ) : positions.length === 0 ? (
                    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line py-8 text-center">
                      <div className="icon-chip">
                        <Coins className="h-5 w-5" />
                      </div>
                      <p className="mt-2 text-sm font-semibold text-ink">No transferable holdings</p>
                      <p className="stat-label mt-0.5">
                        Only active tokens with a deployed contract can be transferred
                      </p>
                    </div>
                  ) : (
                    <select
                      id="transfer-token"
                      className="input-field"
                      value={selectedTokenId}
                      onChange={e => { setSelectedTokenId(e.target.value); setCheckResult(null); }}
                    >
                      <option value="">Select a token…</option>
                      {positions.map(p => (
                        <option key={p.tokenId} value={p.tokenId}>
                          {p.name} ({p.symbol}) — Balance:{' '}
                          {(onchainBalances[p.tokenId] ?? Number(p.quantity)).toLocaleString('en-US')}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {selectedPosition && (
                  <div className="tile mt-2 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="stat-label">Available balance</p>
                      <p className="mt-0.5 text-base font-bold text-ink">
                        {maxBalance.toLocaleString('en-US')}{' '}
                        <span className="font-mono text-xs font-normal text-muted">{selectedPosition.symbol}</span>
                      </p>
                    </div>
                    <span className="badge-neutral shrink-0">
                      <Globe className="h-3 w-3" />
                      {chainLabel(selectedPosition.chainId)}
                    </span>
                  </div>
                )}
              </div>

              {/* Step 2 — recipient */}
              <div>
                <div className="flex items-center gap-2">
                  <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[11px] font-bold ${stepTone(isValidAddress(recipient) && !isSelfTransfer)}`}>
                    2
                  </span>
                  <label htmlFor="transfer-recipient" className="label">Recipient wallet address</label>
                </div>
                <input
                  id="transfer-recipient"
                  className={`input-field mt-2 font-mono ${recipient && (!isValidAddress(recipient) || isSelfTransfer) ? '!border-danger' : ''}`}
                  placeholder="0x…"
                  value={recipient}
                  onChange={e => setRecipient(e.target.value)}
                  spellCheck={false}
                  autoComplete="off"
                />
                {recipient && !isValidAddress(recipient) && (
                  <p className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-danger">
                    <XCircle className="h-3.5 w-3.5 shrink-0" />
                    Not a valid Ethereum address
                  </p>
                )}
                {isSelfTransfer && (
                  <p className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-danger">
                    <XCircle className="h-3.5 w-3.5 shrink-0" />
                    This is your own wallet — choose a different recipient
                  </p>
                )}
                {isValidAddress(recipient) && !isSelfTransfer && (
                  <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted">
                    <CheckCircle className="h-3.5 w-3.5 shrink-0 text-success" />
                    The recipient must already be whitelisted on this token
                  </p>
                )}
              </div>

              {/* Step 3 — amount */}
              <div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[11px] font-bold ${stepTone(!!amount && parseFloat(amount) > 0 && !exceedsBalance)}`}>
                      3
                    </span>
                    <label htmlFor="transfer-amount" className="label">Amount</label>
                  </div>
                  {selectedTokenId && (
                    <button
                      type="button"
                      onClick={() => setAmount(maxBalance.toString())}
                      className="btn-ghost px-2 py-1 text-xs font-bold text-accent"
                    >
                      Max {maxBalance.toLocaleString('en-US')}
                    </button>
                  )}
                </div>
                <input
                  id="transfer-amount"
                  type="number"
                  min="0"
                  step="any"
                  className={`input-field mt-2 ${exceedsBalance ? '!border-danger' : ''}`}
                  placeholder="0"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                />
                {exceedsBalance && (
                  <p className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-danger">
                    <XCircle className="h-3.5 w-3.5 shrink-0" />
                    Exceeds your balance of {maxBalance.toLocaleString('en-US')}
                  </p>
                )}
              </div>

              <button
                onClick={handleCheck}
                disabled={!canCheck || checking}
                className="btn-secondary w-full"
              >
                {checking
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Checking compliance…</>
                  : <><ShieldCheck className="h-4 w-4" /> Check Transfer</>}
              </button>
            </div>
          </div>

          {/* ── Compliance verdict ──────────────────────────────────────── */}
          {checkResult && (
            <div className="card p-6">
              <div
                className={`flex items-start gap-3 rounded-[10px] border p-4 ${
                  checkResult.allowed
                    ? 'border-success bg-success-100'
                    : 'border-danger bg-danger-100'
                }`}
              >
                {checkResult.allowed
                  ? <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-success" />
                  : <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-danger" />}
                <div className="min-w-0">
                  <p className={`text-sm font-bold ${checkResult.allowed ? 'text-success' : 'text-danger'}`}>
                    {checkResult.allowed ? 'Transfer allowed' : 'Transfer blocked'}
                  </p>
                  {checkResult.allowed ? (
                    <p className="mt-1 text-xs text-success">
                      All compliance layers passed. You can submit this transfer.
                    </p>
                  ) : checkResult.reasons.length > 0 && (
                    <ul className="mt-1.5 space-y-1">
                      {checkResult.reasons.map((r, i) => (
                        <li key={i} className="text-xs text-danger">• {r}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              {/* Layer breakdown — icon + label, never colour alone */}
              <p className="label mt-5">Compliance layers checked</p>
              <ul className="mt-2 space-y-2">
                {([
                  {
                    name: 'ONCHAINID Identity Registry',
                    state:
                      checkResult.senderVerifiedOnchain === null || checkResult.senderVerifiedOnchain === undefined
                        ? ('unknown' as const)
                        : checkResult.senderVerifiedOnchain && checkResult.recipientVerifiedOnchain
                          ? ('pass' as const)
                          : ('fail' as const),
                    detail:
                      checkResult.senderVerifiedOnchain === null || checkResult.senderVerifiedOnchain === undefined
                        ? 'Not checked'
                        : checkResult.senderVerifiedOnchain && checkResult.recipientVerifiedOnchain
                          ? 'Both wallets verified'
                          : checkResult.senderVerifiedOnchain === false
                            ? 'Sender not registered'
                            : 'Recipient not registered',
                  },
                  {
                    name: 'On-chain Compliance Modules',
                    state:
                      checkResult.onchainModules?.complianceCanTransfer === null ||
                      checkResult.onchainModules?.complianceCanTransfer === undefined
                        ? ('unknown' as const)
                        : checkResult.onchainModules.complianceCanTransfer
                          ? ('pass' as const)
                          : ('fail' as const),
                    detail:
                      checkResult.onchainModules?.complianceCanTransfer === null ||
                      checkResult.onchainModules?.complianceCanTransfer === undefined
                        ? 'Not available'
                        : checkResult.onchainModules.complianceCanTransfer
                          ? 'All modules allow'
                          : 'Blocked by a module',
                  },
                  {
                    name: 'Off-chain Rule Engine',
                    state: checkResult.failedRules?.length > 0 ? ('fail' as const) : ('pass' as const),
                    detail:
                      checkResult.failedRules?.length > 0
                        ? `${checkResult.failedRules.length} rule${checkResult.failedRules.length === 1 ? '' : 's'} failed`
                        : 'All rules pass',
                  },
                ]).map((layer) => (
                  <li
                    key={layer.name}
                    className="flex items-center justify-between gap-3 rounded-[10px] bg-surface-header px-3 py-2.5"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      {layer.state === 'pass' ? (
                        <CheckCircle className="h-4 w-4 shrink-0 text-success" />
                      ) : layer.state === 'fail' ? (
                        <XCircle className="h-4 w-4 shrink-0 text-danger" />
                      ) : (
                        <MinusCircle className="h-4 w-4 shrink-0 text-muted" />
                      )}
                      <span className="truncate text-sm font-semibold text-ink">{layer.name}</span>
                    </span>
                    <span
                      className={`shrink-0 text-xs font-semibold ${
                        layer.state === 'pass'
                          ? 'text-success'
                          : layer.state === 'fail'
                            ? 'text-danger'
                            : 'text-muted'
                      }`}
                    >
                      {layer.detail}
                    </span>
                  </li>
                ))}
              </ul>

              {/* Fee preview */}
              {checkResult.fee && checkResult.fee.feeBps > 0 && (
                <div className="mt-5 rounded-[10px] border border-warning bg-warning-100 p-4">
                  <p className="flex items-center gap-1.5 text-sm font-bold text-warning">
                    <AlertTriangle className="h-4 w-4" />
                    Transfer fee ({checkResult.fee.feePercent}%)
                  </p>
                  <dl className="mt-3 space-y-1.5 text-sm">
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted">Transfer amount</dt>
                      <dd className="font-medium text-ink">
                        {parseFloat(amount).toLocaleString('en-US')} tokens
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted">Fee ({checkResult.fee.feePercent}%)</dt>
                      <dd className="font-medium text-ink">
                        − {parseFloat(checkResult.fee.feeAmount).toLocaleString('en-US')} tokens
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3 border-t border-line pt-1.5 font-bold">
                      <dt className="text-ink">Recipient receives</dt>
                      <dd className="text-ink">
                        {parseFloat(checkResult.fee.netAmount).toLocaleString('en-US')} tokens
                      </dd>
                    </div>
                  </dl>
                  <p className="mt-2 text-xs text-muted">
                    Fee collector:{' '}
                    <span className="font-mono">
                      {checkResult.fee.collectorAddress.slice(0, 10)}…{checkResult.fee.collectorAddress.slice(-6)}
                    </span>
                  </p>
                </div>
              )}

              <button onClick={handleSend} disabled={!canSend} className="btn-primary mt-5 w-full">
                {sending
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</>
                  : <><Send className="h-4 w-4" /> Send Transfer</>}
              </button>

              {checkResult.allowed && !sending && (
                <p className="mt-2 text-center text-xs text-muted">
                  Your wallet will ask you to confirm the on-chain transaction.
                </p>
              )}
            </div>
          )}

          {!checkResult && canCheck && (
            <p className="text-center text-xs text-muted">
              Run the compliance check to enable sending.
            </p>
          )}

          {/* ── Result ──────────────────────────────────────────────────── */}
          {sendError && (
            <div className="card flex items-start gap-3 border-danger p-4">
              <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
              <div className="min-w-0">
                <p className="text-sm font-bold text-danger">Transfer failed</p>
                <p className="mt-0.5 break-words text-xs text-muted">{sendError}</p>
              </div>
            </div>
          )}

          {txHash && (
            <div className="card flex flex-wrap items-center gap-4 border-success p-4">
              <div className="icon-chip bg-success-100 text-success">
                <CheckCircle className="h-5 w-5" />
              </div>
              <div className="min-w-[12rem] flex-1">
                <p className="text-sm font-bold text-ink">Transfer complete</p>
                <p className="font-mono text-xs text-muted">
                  {txHash.slice(0, 10)}…{txHash.slice(-8)}
                </p>
              </div>
              {explorerUrl(selectedChainId, 'tx', txHash) && (
                <a
                  href={explorerUrl(selectedChainId, 'tx', txHash)!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-secondary ml-auto shrink-0"
                >
                  View on explorer
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
          )}
        </div>

        {/* ── History ───────────────────────────────────────────────────── */}
        <div className="lg:col-span-2">
          <div className="card sticky top-6">
            <div className="border-b border-line px-6 py-5">
              <h3>Transfer History</h3>
              <p className="stat-label mt-0.5">Your most recent movements</p>
            </div>

            {loadingHistory ? (
              <div className="space-y-3 p-6">
                {[0, 1, 2].map(i => (
                  <div key={i} className="h-12 animate-pulse rounded-[10px] bg-surface-header" />
                ))}
              </div>
            ) : history.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
                <div className="icon-chip h-12 w-12">
                  <ArrowLeftRight className="h-6 w-6" />
                </div>
                <p className="mt-3 text-base font-bold text-ink">No transfers yet</p>
                <p className="mt-1 max-w-xs text-sm text-muted">
                  Transfers you send appear here with a link to the on-chain transaction.
                </p>
              </div>
            ) : (
              <ul className="max-h-[32rem] divide-y divide-line overflow-y-auto">
                {history.slice(0, 20).map(tx => {
                  const link = tx.metadata?.tx_hash
                    ? explorerUrl(chainIdForToken(tx.tokenId), 'tx', tx.metadata.tx_hash)
                    : null;
                  return (
                    <li key={tx.id} className="flex items-start justify-between gap-3 px-6 py-4">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-ink">
                          {tx.metadata?.token_name ?? 'Token'}
                          {tx.metadata?.token_symbol && (
                            <span className="ml-1.5 font-mono text-xs font-normal text-muted">
                              {tx.metadata.token_symbol}
                            </span>
                          )}
                        </p>
                        <p className="mt-0.5 text-xs text-muted">
                          {new Date(tx.createdAt).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                          {tx.metadata?.to_address && (
                            <>
                              {' · to '}
                              <span className="font-mono">
                                {tx.metadata.to_address.slice(0, 6)}…{tx.metadata.to_address.slice(-4)}
                              </span>
                            </>
                          )}
                        </p>
                      </div>

                      <div className="flex shrink-0 flex-col items-end gap-1.5">
                        <p className="text-sm font-semibold text-ink">
                          {parseFloat(tx.tokenAmount).toLocaleString('en-US')}
                        </p>
                        <div className="flex items-center gap-1.5">
                          <span
                            className={
                              tx.status === 'completed'
                                ? 'badge-success'
                                : tx.status === 'failed'
                                  ? 'badge-danger'
                                  : 'badge-warning'
                            }
                          >
                            <span className="capitalize">{tx.status}</span>
                          </span>
                          {link && (
                            <a
                              href={link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-muted transition-colors hover:text-accent"
                              aria-label="View transaction on block explorer"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
