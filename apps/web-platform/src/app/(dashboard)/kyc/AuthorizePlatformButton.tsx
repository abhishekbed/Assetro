'use client';

import { useState } from 'react';
import { Shield, Loader2 } from 'lucide-react';
import { getWalletClient, getPublicClient } from 'wagmi/actions';
import { wagmiConfig } from '@/lib/wagmi-config';
import { keccak256, encodeAbiParameters, parseAbiParameters } from 'viem';

const IDENTITY_ADD_KEY_ABI = [
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

interface Props {
  identityAddress: string;
}

export default function AuthorizePlatformButton({ identityAddress }: Props) {
  const [authorizing, setAuthorizing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const platformAgent = process.env.NEXT_PUBLIC_PLATFORM_AGENT_ADDRESS;
  if (!platformAgent) return null;

  const handleAuthorize = async () => {
    setAuthorizing(true);
    setMsg(null);
    try {
      // Get clients imperatively — avoids WagmiProvider SSR hook error
      const walletClient = await getWalletClient(wagmiConfig);
      if (!walletClient) {
        setMsg('Connect your MetaMask wallet first.');
        return;
      }
      const publicClient = getPublicClient(wagmiConfig);
      if (!publicClient) {
        setMsg('No public client available.');
        return;
      }

      const agentKeyHash = keccak256(
        encodeAbiParameters(parseAbiParameters('address'), [platformAgent as `0x${string}`])
      );

      const alreadyAuthorized = await publicClient.readContract({
        address: identityAddress as `0x${string}`,
        abi: IDENTITY_ADD_KEY_ABI,
        functionName: 'keyHasPurpose',
        args: [agentKeyHash, BigInt(3)],
      });

      if (alreadyAuthorized) {
        setMsg('Platform agent already authorized. Ask the issuer to retry the pipeline.');
        return;
      }

      const hash = await walletClient.writeContract({
        address: identityAddress as `0x${string}`,
        abi: IDENTITY_ADD_KEY_ABI,
        functionName: 'addKey',
        args: [agentKeyHash, BigInt(3), BigInt(1)],
      });

      await publicClient.waitForTransactionReceipt({ hash });
      setMsg('✓ Authorized! Ask the issuer to retry the pipeline — KYC claims will now be issued.');
    } catch (err: unknown) {
      setMsg('Error: ' + ((err as Error).message ?? String(err)).slice(0, 120));
    } finally {
      setAuthorizing(false);
    }
  };

  return (
    <div className="mt-3 rounded-md border border-warning bg-warning-100 p-3 space-y-2">
      <div className="flex items-start gap-2">
        <Shield className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
        <p className="text-xs text-warning">
          <strong>One-time step required:</strong> Authorize the platform to issue KYC claims to your ONCHAINID.
          Connect your linked wallet and sign this transaction.
        </p>
      </div>
      {msg ? (
        <p className={`text-xs ${msg.startsWith('✓') ? 'text-success' : 'text-danger'}`}>{msg}</p>
      ) : (
        <button
          onClick={handleAuthorize}
          disabled={authorizing}
          className="flex items-center gap-1.5 rounded-md bg-warning px-3 py-1.5 text-xs font-medium text-ink hover:bg-warning disabled:opacity-50"
        >
          {authorizing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Shield className="h-3.5 w-3.5" />}
          {authorizing ? 'Authorizing…' : 'Authorize Platform Agent'}
        </button>
      )}
    </div>
  );
}
