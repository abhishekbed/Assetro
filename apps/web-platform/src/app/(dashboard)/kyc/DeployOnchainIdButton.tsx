'use client';

import { useState, useEffect } from 'react';
import { Shield, Loader2, CheckCircle, Key } from 'lucide-react';
import { getWalletClient, getPublicClient } from 'wagmi/actions';
import { wagmiConfig } from '@/lib/wagmi-config';
import api from '@/lib/api';
import { keccak256, encodeAbiParameters, parseAbiParameters, type Address } from 'viem';

// deployIdentityForWallet — no signature needed, investor wallet = initial management key
const OID_GATEWAY_ABI = [
  {
    name: 'deployIdentityForWallet',
    type: 'function' as const,
    stateMutability: 'nonpayable' as const,
    inputs: [{ name: 'identityOwner', type: 'address' }],
    outputs: [{ name: '', type: 'address' }],
  },
] as const;

// After deployment, add deployer as management key so backend can issue claims
const IDENTITY_ABI = [
  {
    name: 'addKey',
    type: 'function' as const,
    stateMutability: 'nonpayable' as const,
    inputs: [
      { name: '_key', type: 'bytes32' },
      { name: '_purpose', type: 'uint256' },
      { name: '_keyType', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'keyHasPurpose',
    type: 'function' as const,
    stateMutability: 'view' as const,
    inputs: [{ name: '_key', type: 'bytes32' }, { name: '_purpose', type: 'uint256' }],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

interface ApprovalData {
  deployer_key_hash: string;
  gateway_address: string;
  existing_identity: string | null;
  deployer_needs_access: boolean;
}

interface Props {
  walletAddress: string;
  onDeployed?: () => void;
}

export default function DeployOnchainIdButton({ walletAddress, onDeployed }: Props) {
  const [loading, setLoading] = useState(true);
  const [approval, setApproval] = useState<ApprovalData | null>(null);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!walletAddress) return;
    setLoading(true);
    api.post('/blockchain/deploy-approval', { wallet_address: walletAddress })
      .then(r => setApproval(r.data.data || r.data))
      .catch(() => setMsg('Failed to prepare ONCHAINID setup. Refresh and try again.'))
      .finally(() => setLoading(false));
  }, [walletAddress]);

  /** Deploy fresh identity then grant deployer access — two MetaMask transactions */
  const handleFreshDeploy = async () => {
    if (!approval) return;
    setBusy(true);
    setMsg(null);

    try {
      const walletClient = await getWalletClient(wagmiConfig);
      if (!walletClient) { setMsg('Connect MetaMask first.'); return; }
      const publicClient = getPublicClient(wagmiConfig);
      if (!publicClient) { setMsg('No RPC client available.'); return; }

      // TX 1: deploy identity — investor wallet becomes initial management key
      setStep('Step 1/2: Deploying ONCHAINID… (MetaMask)');
      const deployHash = await walletClient.writeContract({
        address: approval.gateway_address as Address,
        abi: OID_GATEWAY_ABI,
        functionName: 'deployIdentityForWallet',
        args: [walletAddress as Address],
      });
      const deployReceipt = await publicClient.waitForTransactionReceipt({ hash: deployHash });
      console.log('[ONCHAINID] Deployed, tx:', deployReceipt.transactionHash);

      // Extract identity address from logs (WalletLinked event topic[2] or IdentityDeployed topic[1])
      let identityAddress: string | null = null;
      for (const log of deployReceipt.logs) {
        if (log.topics.length >= 3 && log.topics[2]) {
          identityAddress = '0x' + log.topics[2].slice(-40);
          break;
        }
        if (log.topics.length >= 2 && log.topics[1]) {
          identityAddress = '0x' + log.topics[1].slice(-40);
          break;
        }
      }

      if (!identityAddress) {
        // Fallback: read from IdFactory via API
        const verifyRes = await api.post('/blockchain/deploy-approval', { wallet_address: walletAddress });
        const data = verifyRes.data.data || verifyRes.data;
        identityAddress = data.existing_identity;
      }

      if (!identityAddress) {
        setMsg('Identity deployed but address not found. Retry from the KYC page.');
        setBusy(false);
        return;
      }

      // TX 2: add deployer as management key so backend can issue claims without investor action
      setStep('Step 2/2: Granting platform access… (MetaMask)');
      const addKeyHash = await walletClient.writeContract({
        address: identityAddress as Address,
        abi: IDENTITY_ABI,
        functionName: 'addKey',
        args: [
          approval.deployer_key_hash as `0x${string}`,
          BigInt(1), // MANAGEMENT purpose
          BigInt(1), // ECDSA key type
        ],
      });
      await publicClient.waitForTransactionReceipt({ hash: addKeyHash });

      setDone(true);
      setMsg('ONCHAINID created and platform access granted. The issuer can now approve your KYC.');
      onDeployed?.();
    } catch (err: unknown) {
      const m = (err as Error).message ?? String(err);
      if (m.includes('User rejected') || m.includes('user rejected')) {
        setMsg('Transaction cancelled. Click the button again to retry.');
      } else {
        setMsg('Error: ' + m.slice(0, 150));
      }
      setStep('');
    } finally {
      setBusy(false);
    }
  };

  /** Grant deployer access to an existing identity (investor wallet = management key) */
  const handleGrantAccess = async () => {
    if (!approval?.existing_identity) return;
    setBusy(true);
    setMsg(null);

    try {
      const walletClient = await getWalletClient(wagmiConfig);
      if (!walletClient) { setMsg('Connect MetaMask first.'); return; }
      const publicClient = getPublicClient(wagmiConfig);
      if (!publicClient) { setMsg('No RPC client available.'); return; }

      setStep('Adding platform access… (MetaMask)');

      // Compute deployer key hash via viem (matches ERC-734 format)
      const deployerKeyHash = keccak256(
        encodeAbiParameters(parseAbiParameters('address'), [approval.deployer_key_hash as Address])
      );
      // Note: approval.deployer_key_hash IS already keccak256(abi.encode(deployer)) — use it directly
      const hash = await walletClient.writeContract({
        address: approval.existing_identity as Address,
        abi: IDENTITY_ABI,
        functionName: 'addKey',
        args: [
          approval.deployer_key_hash as `0x${string}`, // already the correct key hash
          BigInt(1),
          BigInt(1),
        ],
      });
      await publicClient.waitForTransactionReceipt({ hash });

      setDone(true);
      setMsg('Platform access granted. The issuer can now process your KYC.');
      onDeployed?.();
    } catch (err: unknown) {
      const m = (err as Error).message ?? String(err);
      if (m.includes('User rejected') || m.includes('user rejected')) {
        setMsg('Transaction cancelled.');
      } else {
        setMsg('Error: ' + m.slice(0, 150));
      }
      setStep('');
    } finally {
      setBusy(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  if (done) {
    return (
      <div className="flex items-center gap-2 rounded-md bg-success-100 p-3 text-sm text-success">
        <CheckCircle className="h-4 w-4 shrink-0" />
        {msg}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Checking identity status…
      </div>
    );
  }

  if (busy) {
    return (
      <div className="flex items-center gap-2 text-xs text-accent">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        {step || 'Processing…'}
      </div>
    );
  }

  // Existing identity, deployer already has access — nothing to do
  if (approval?.existing_identity && !approval.deployer_needs_access) {
    return (
      <div className="flex items-center gap-2 rounded-md bg-success-100 p-3 text-sm text-success">
        <CheckCircle className="h-4 w-4 shrink-0" />
        ONCHAINID is ready ({approval.existing_identity.slice(0, 8)}…{approval.existing_identity.slice(-4)}).
        The issuer can process your KYC.
      </div>
    );
  }

  // Existing identity, deployer needs access
  if (approval?.existing_identity && approval.deployer_needs_access) {
    return (
      <div className="space-y-2">
        <p className="text-xs text-ink">
          You already have an ONCHAINID (<span className="font-mono">{approval.existing_identity.slice(0, 8)}…</span>).
          Grant the platform one-time access to issue KYC claims on it.
        </p>
        {msg && <p className="text-xs text-danger">{msg}</p>}
        <button
          onClick={handleGrantAccess}
          disabled={busy}
          className="flex items-center gap-2 rounded-md bg-warning px-4 py-2 text-sm font-medium text-ink hover:bg-warning disabled:opacity-50"
        >
          <Key className="h-4 w-4" />
          Grant Platform Access
        </button>
        <p className="text-xs text-muted">Requires one MetaMask signature.</p>
      </div>
    );
  }

  // No identity — fresh deploy
  return (
    <div className="space-y-2">
      <p className="text-xs text-ink">
        Create your on-chain identity. This is a <strong>one-time setup</strong> — your ONCHAINID is
        reused across all issuers and token investments. Requires <strong>2 MetaMask signatures</strong>.
      </p>
      {msg && <p className="text-xs text-danger">{msg}</p>}
      <button
        onClick={handleFreshDeploy}
        disabled={busy}
        className="flex items-center gap-2 rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-btn-text hover:bg-primary-700 disabled:opacity-50"
      >
        <Shield className="h-4 w-4" />
        Deploy My ONCHAINID
      </button>
      <p className="text-xs text-muted">
        MetaMask must be connected and on Sepolia network.
      </p>
    </div>
  );
}
