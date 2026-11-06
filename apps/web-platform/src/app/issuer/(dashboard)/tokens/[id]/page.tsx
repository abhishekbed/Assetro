'use client';

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import clsx from 'clsx';
import {
  ArrowLeft,
  Users,
  Coins,
  ArrowLeftRight,
  Pause,
  Play,
  Snowflake,
  Plus,
  Flame,
  Loader2,
  Shield,
  ListChecks,
  FileCheck,
  BarChart3,
  Building2,
  CheckCircle2,
  Clock,
  XCircle,
  Layers,
  AlertTriangle,
  RefreshCw,
  Wallet,
  ExternalLink,
  Check,
  Copy,
  X,
  Info,
} from 'lucide-react';
import { chainLabel, explorerUrl } from '@/lib/chains';
import { toast } from 'sonner';
import { useIssuerWallet } from '@/components/issuer/wallet/IssuerWalletProvider';
import { formatUnits, parseUnits, type Address, parseEventLogs } from 'viem';
import { useAccount, useConnect, useDisconnect, usePublicClient, useSwitchChain, useWalletClient } from 'wagmi';
import api from '@/lib/api';
import {
  buildOnchainModuleArrays,
  type ComplianceModulesMetadata,
} from '@/lib/complianceModules';
import { useAuthStore } from '@/store/auth.store';
import { tokenAbi, tokenFactoryAbi, tokenGatewayAbi } from '@/lib/contracts/artifacts';
import {
  getTREXGatewayAddress,
  getClaimIssuerAddress,
} from '@/lib/contracts/config';
import { getDefaultSuiteAddresses } from '@/lib/contracts/deployment';
import {
  ensureConnectedChain,
  isAddressLike,
  parseBaseError,
  requireAddress,
  requireWalletClient,
  waitForReceipt,
} from '@/lib/contracts/evm';

interface TokenInfo {
  id: string;
  name: string;
  symbol: string;
  chain?: string;
  chainId?: number;
  status: string;
  /** Set by the platform admin when a token creation request is declined. */
  rejectionReason?: string | null;
  /** Holds `compliance_modules` chosen in the create wizard. */
  metadata?: Record<string, unknown> | null;
  deploymentTxHash?: string | null;
  minInvestment?: number;
  maxInvestment?: number;
  totalSupply: number | string;
  circulatingSupply?: number;
  holders?: number;
  totalTransfers?: number;
  tokenAddress?: string | null;
  identityRegistryAddress?: string | null;
  complianceAddress?: string | null;
  claimTopicsAddress?: string | null;
  trustedIssuersAddress?: string | null;
  decimals?: number;
  assetType?: string;
  description?: string;
}

interface Payment {
  id: string;
  userId: string;
  tokenAmount: string;
  fiatAmount: string;
  currency?: string;
  status: string;
  paymentMethod?: string;
  stripeSessionId?: string;
  createdAt: string;
  metadata?: {
    wallet_address?: string;
    [key: string]: unknown;
  } | null;
}

const TOKEN_MINT_ABI = [{
  name: 'mint',
  type: 'function' as const,
  stateMutability: 'nonpayable' as const,
  inputs: [
    { name: '_to', type: 'address' },
    { name: '_amount', type: 'uint256' },
  ],
  outputs: [],
}] as const;

export default function TokenManagementPage() {
  const params = useParams();
  const id = params.id as string;
  const { user } = useAuthStore();
  const { address, chainId: walletChainId } = useAccount();
  const { assertCanTransact } = useIssuerWallet();
  const { data: walletClient } = useWalletClient();
  const { switchChainAsync } = useSwitchChain();

  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mintAmount, setMintAmount] = useState('');
  const [mintAddress, setMintAddress] = useState('');
  const [showMintModal, setShowMintModal] = useState(false);
  const [showFreezeModal, setShowFreezeModal] = useState(false);
  const [freezeAddress, setFreezeAddress] = useState('');
  const [freezeMode, setFreezeMode] = useState<'freeze' | 'unfreeze'>('freeze');
  const [burnAmount, setBurnAmount] = useState('');
  const [burnAddress, setBurnAddress] = useState('');
  const [showBurnModal, setShowBurnModal] = useState(false);
  const [showForceTransferModal, setShowForceTransferModal] = useState(false);
  const [ftFrom, setFtFrom] = useState('');
  const [ftTo, setFtTo] = useState('');
  const [ftAmount, setFtAmount] = useState('');
  const [ftReason, setFtReason] = useState('regulatory_order');
  const [ftNotes, setFtNotes] = useState('');
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);
  const [recLostWallet, setRecLostWallet] = useState('');
  const [recNewWallet, setRecNewWallet] = useState('');
  const [recOnchainId, setRecOnchainId] = useState('');
  const [recLookingUp, setRecLookingUp] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [deployLoading, setDeployLoading] = useState(false);
  const [deployedTxHash, setDeployedTxHash] = useState<string | null>(null);
  const [tokenPayments, setTokenPayments] = useState<Payment[]>([]);
  const [onchainPaused, setOnchainPaused] = useState<boolean | null>(null);
  const [onchainTotalSupply, setOnchainTotalSupply] = useState<string | null>(null);
  const [platformAgentMissing, setPlatformAgentMissing] = useState(false);
  const [addingAgent, setAddingAgent] = useState(false);
  const [callerIsAgent, setCallerIsAgent] = useState<boolean | null>(null);

  const { connectors, connect } = useConnect();
  const { disconnect } = useDisconnect();

  const headers = user?.id ? { 'x-user-id': user.id } : {};
  const targetChainId = tokenInfo?.chainId ? Number(tokenInfo.chainId) : undefined;
  const activeChainId = targetChainId || Number(process.env.NEXT_PUBLIC_DEFAULT_CHAIN_ID || '11155111');
  const activeChainLabel = chainLabel(activeChainId) || 'Blockchain';
  const publicClient = usePublicClient({ chainId: targetChainId });
  const fallbackSuite = getDefaultSuiteAddresses(targetChainId);
  const effectiveTokenAddress = tokenInfo?.tokenAddress || fallbackSuite.tokenAddress;

  const effectiveTxHash =
    deployedTxHash ||
    tokenInfo?.deploymentTxHash ||
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (tokenInfo?.metadata as any)?.deployment_tx_hash ||
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (tokenInfo?.metadata as any)?.tx_hash ||
    null;

  const creationTxLink = effectiveTxHash
    ? explorerUrl(activeChainId, 'tx', effectiveTxHash)
    : null;
  const contractExplorerLink = effectiveTokenAddress
    ? explorerUrl(activeChainId, 'token', effectiveTokenAddress)
    : null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const offeringInfo = (tokenInfo?.metadata as any)?.offering;
  const tokenMinInv = tokenInfo?.minInvestment ?? offeringInfo?.min_investment;
  const tokenMaxInv = tokenInfo?.maxInvestment ?? offeringInfo?.max_investment;
  const tokenInitialPrice = offeringInfo?.initial_price;

  const isAgentAbi = [
    {
      name: 'isAgent',
      type: 'function' as const,
      stateMutability: 'view' as const,
      inputs: [{ name: '_agent', type: 'address' as const }],
      outputs: [{ name: '', type: 'bool' as const }],
    },
  ] as const;

  const checkIsAgent = useCallback(async (accountAddress?: string | null): Promise<boolean> => {
    if (!accountAddress || !publicClient || !effectiveTokenAddress) return false;
    try {
      const res = await publicClient.readContract({
        address: effectiveTokenAddress as Address,
        abi: isAgentAbi,
        functionName: 'isAgent',
        args: [accountAddress as Address],
      });
      return Boolean(res);
    } catch {
      return false;
    }
  }, [publicClient, effectiveTokenAddress]);

  const handleSwitchAccount = async () => {
    try {
      if (typeof window !== 'undefined' && (window as any).ethereum?.request) {
        await (window as any).ethereum.request({
          method: 'wallet_requestPermissions',
          params: [{ eth_accounts: {} }],
        });
      } else {
        disconnect();
      }
    } catch {
      // User dismissed dialog
    }
  };

  const handleConnectWallet = () => {
    const metaMaskConnector =
      connectors.find((c) => c.name.toLowerCase().includes('metamask')) ||
      connectors[0];
    if (metaMaskConnector) {
      connect({ connector: metaMaskConnector });
    }
  };

  useEffect(() => {
    let active = true;
    if (address && effectiveTokenAddress && publicClient) {
      checkIsAgent(address).then((isAg) => {
        if (active) setCallerIsAgent(isAg);
      });
    } else {
      setCallerIsAgent(null);
    }
    return () => {
      active = false;
    };
  }, [address, effectiveTokenAddress, publicClient, checkIsAgent]);

  const fetchToken = useCallback(async () => {
    const response = await api.get('/tokens/' + id);
    const nextToken = response.data.data || response.data;
    setTokenInfo(nextToken);
    return nextToken as TokenInfo;
  }, [id]);

  const fetchPayments = useCallback(async () => {
    try {
      const response = await api.get('/payments/token/' + id);
      const data = response.data?.data || response.data || [];
      setTokenPayments(Array.isArray(data) ? data : []);
    } catch {
      // silently fail
    }
  }, [id]);

  const refreshOnchainState = useCallback(
    async (token: TokenInfo | null) => {
      const tokenAddress = token?.tokenAddress || getDefaultSuiteAddresses(token?.chainId).tokenAddress;
      if (!tokenAddress || !token?.chainId || !publicClient) {
        setOnchainPaused(null);
        setOnchainTotalSupply(null);
        return;
      }

      try {
        const platformAgent = process.env.NEXT_PUBLIC_PLATFORM_AGENT_ADDRESS as Address | undefined;

        const isAgentAbi = [{
          name: 'isAgent', type: 'function' as const, stateMutability: 'view' as const,
          inputs: [{ name: '_agent', type: 'address' }], outputs: [{ name: '', type: 'bool' }],
        }] as const;

        const calls: Promise<unknown>[] = [
          publicClient.readContract({ address: tokenAddress as Address, abi: tokenAbi, functionName: 'paused' }),
          publicClient.readContract({ address: tokenAddress as Address, abi: tokenAbi, functionName: 'totalSupply' }),
        ];
        if (platformAgent) {
          calls.push(publicClient.readContract({ address: tokenAddress as Address, abi: isAgentAbi, functionName: 'isAgent', args: [platformAgent] }));
        }

        const results = await Promise.all(calls);
        const [paused, totalSupply, agentStatus] = results;

        setOnchainPaused(Boolean(paused));
        setOnchainTotalSupply(formatUnits(totalSupply as bigint, token.decimals ?? 18));
        if (platformAgent) setPlatformAgentMissing(agentStatus === false);
      } catch {
        setOnchainPaused(null);
        setOnchainTotalSupply(null);
      }
    },
    [publicClient],
  );

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        // On-chain state is refreshed by the effect below once the token (and
        // a chain client) is available, so it must not re-trigger this load.
        await Promise.all([fetchToken(), fetchPayments()]);
        setError(null);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to fetch token details';
        setError(message);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [fetchPayments, fetchToken]);

  useEffect(() => {
    if (tokenInfo && publicClient) {
      refreshOnchainState(tokenInfo);
    }
  }, [publicClient, refreshOnchainState, tokenInfo]);

  const handleBlockchainError = (err: unknown) => {
    const error = err as { response?: { status?: number; data?: { message?: string } }; message?: string };
    const status = error?.response?.status;
    if (status === 503 || status === 502) {
      toast.error('Blockchain service not available yet. This feature will work once the blockchain is connected.');
    } else {
      const msg = error?.response?.data?.message || parseBaseError(err) || 'An error occurred';
      toast.error(msg);
    }
  };

  const handleDeploy = async () => {
    if (!assertCanTransact()) return;
    if (!tokenInfo || !targetChainId || !address) {
      toast.error('Connect the issuer wallet to deploy this token.');
      return;
    }

    setDeployLoading(true);
    try {
      await ensureConnectedChain(walletChainId, targetChainId, switchChainAsync);

      if (!publicClient) {
        throw new Error('RPC not available for this chain. Check your RPC URL configuration.');
      }

      const client = requireWalletClient(walletClient);
      const resolvedGatewayAddress = getTREXGatewayAddress(targetChainId);

      if (!resolvedGatewayAddress) {
        throw new Error(
          `TREXGateway address is not configured for chain ${targetChainId}. Set NEXT_PUBLIC_TREX_GATEWAY_ADDRESS_${targetChainId} in the web-platform environment and rebuild.`,
        );
      }

      const gatewayAddress = requireAddress(resolvedGatewayAddress, 'TREXGateway address');
      const claimIssuerAddr = getClaimIssuerAddress(targetChainId);
      const ZERO = '0x0000000000000000000000000000000000000000' as Address;

      // Platform backend agent: added to irAgents + tokenAgents so the backend EOA
      // can call registerIdentity() (whitelist investors) and mint() after payment.
      // Derived from DEPLOYER_PRIVATE_KEY — exposed as NEXT_PUBLIC_PLATFORM_AGENT_ADDRESS.
      const platformAgent = process.env.NEXT_PUBLIC_PLATFORM_AGENT_ADDRESS as Address | undefined;
      const agents = platformAgent && platformAgent !== address
        ? [address, platformAgent]
        : [address];

      // All 3 required KYC claim topics must be registered in the ClaimTopicsRegistry
      const allClaimTopics = [BigInt(1), BigInt(2), BigInt(3)];

      // Compliance modules selected during creation live on the token's
      // metadata. Binding them here, in the same transaction, is the only
      // atomic way — a post-deploy addModule needs a separate signature per
      // module and leaves the token briefly unguarded.
      const { modules: onchainModules, settings: onchainSettings } =
        buildOnchainModuleArrays(
          (tokenInfo.metadata?.compliance_modules ?? null) as ComplianceModulesMetadata | null,
          tokenInfo.decimals ?? 18,
        );
      if (onchainModules.length > 0) {
        console.log('[deploy] binding compliance modules:', onchainModules);
      }

      const deployArgs = [
          {
            owner: address,
            name: tokenInfo.name,
            symbol: tokenInfo.symbol,
            decimals: tokenInfo.decimals ?? 18,
            irs: ZERO,
            ONCHAINID: ZERO,
            irAgents: agents,   // issuer wallet + platform backend EOA
            tokenAgents: agents, // issuer wallet + platform backend EOA
            // Compliance modules chosen in the create wizard are stored on the
            // token's metadata; bind and configure them atomically here.
            complianceModules: onchainModules,
            complianceSettings: onchainSettings,
          },
          {
            claimTopics: allClaimTopics,
            issuers: claimIssuerAddr ? [claimIssuerAddr as Address] : [],
            issuerClaims: claimIssuerAddr ? [allClaimTopics] : [],
          },
        ] as const;

      // The suite deploys ~24M gas of contracts in one call, which is beyond
      // what MetaMask's own simulation handles ("likely to fail"). Estimate it
      // here (surfaces any real revert) and pass an explicit limit with headroom.
      const estimatedGas = await publicClient.estimateContractGas({
        address: gatewayAddress,
        abi: tokenGatewayAbi,
        functionName: 'deployTREXSuite',
        args: deployArgs,
        account: address,
      });

      const txHash = await client.writeContract({
        address: gatewayAddress,
        abi: tokenGatewayAbi,
        functionName: 'deployTREXSuite',
        args: deployArgs,
        gas: (estimatedGas * BigInt(120)) / BigInt(100),
        chain: client.chain,
        account: address,
      });

      setDeployedTxHash(txHash);

      const receipt = await waitForReceipt(publicClient, txHash);

      const suiteEvents = parseEventLogs({
        abi: tokenFactoryAbi,
        eventName: 'TREXSuiteDeployed',
        logs: receipt.logs,
      });

      if (!suiteEvents.length) {
        throw new Error('Deployment confirmed but TREXSuiteDeployed event not found in receipt.');
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const evArgs = (suiteEvents[0] as any).args;
      const tokenAddress = evArgs._token as Address;
      const irAddress = evArgs._ir as Address;
      const complianceAddr = evArgs._mc as Address;
      const trustedIssuersAddr = evArgs._tir as Address;
      const claimTopicsAddr = evArgs._ctr as Address;

      await api.post(
        '/tokens/' + id + '/sync-deployment',
        {
          token_address: tokenAddress,
          identity_registry_address: irAddress,
          compliance_address: complianceAddr,
          claim_topics_address: claimTopicsAddr,
          trusted_issuers_address: trustedIssuersAddr,
          tx_hash: txHash,
        },
        { headers },
      );

      toast.success('Token deployed successfully! It is now active.');
      const nextToken = await fetchToken();
      await refreshOnchainState(nextToken);
    } catch (err: unknown) {
      handleBlockchainError(err);
    } finally {
      setDeployLoading(false);
    }
  };


  const handleAddTokenAgent = async () => {
    const platformAgent = process.env.NEXT_PUBLIC_PLATFORM_AGENT_ADDRESS as Address | undefined;
    if (!platformAgent || !effectiveTokenAddress || !address || !targetChainId) return;
    setAddingAgent(true);
    try {
      await ensureConnectedChain(walletChainId, targetChainId, switchChainAsync);
      const client = requireWalletClient(walletClient);
      const addAgentAbi = [{
        name: 'addAgent', type: 'function' as const, stateMutability: 'nonpayable' as const,
        inputs: [{ name: '_agent', type: 'address' }], outputs: [],
      }] as const;
      const txHash = await client.writeContract({
        address: effectiveTokenAddress as Address,
        abi: addAgentAbi,
        functionName: 'addAgent',
        args: [platformAgent],
        chain: client.chain,
        account: address,
      });
      await waitForReceipt(publicClient!, txHash);
      setPlatformAgentMissing(false);
      toast.success('Platform agent added. Payments can now be confirmed and tokens minted.');
    } catch (err: unknown) {
      handleBlockchainError(err);
    } finally {
      setAddingAgent(false);
    }
  };

  const handleMint = async () => {
    if (!assertCanTransact()) return;
    if (!tokenInfo || !mintAmount || !mintAddress || !targetChainId) return;
    setActionLoading(true);
    try {
      if (!isAddressLike(mintAddress)) {
        throw new Error('Recipient must be a valid wallet address.');
      }

      const tokenAddress = requireAddress(effectiveTokenAddress, 'Token address');
      const decimals = tokenInfo.decimals ?? 18;
      const amountWei = parseUnits(mintAmount, decimals);

      // ── On-chain compliance.canTransfer() pre-check ────────────────────────
      const complianceAddr = tokenInfo.complianceAddress || fallbackSuite.complianceAddress;
      if (complianceAddr && publicClient) {
        const COMPLIANCE_CAN_TRANSFER_ABI = [{
          name: 'canTransfer', type: 'function' as const, stateMutability: 'view' as const,
          inputs: [
            { name: '_from', type: 'address' as const },
            { name: '_to', type: 'address' as const },
            { name: '_value', type: 'uint256' as const },
          ],
          outputs: [{ name: '', type: 'bool' as const }],
        }] as const;
        const canTransfer = await publicClient.readContract({
          address: complianceAddr as Address,
          abi: COMPLIANCE_CAN_TRANSFER_ABI,
          functionName: 'canTransfer',
          args: ['0x0000000000000000000000000000000000000000' as Address, mintAddress as Address, amountWei],
        }).catch(() => true);
        if (!canTransfer) {
          throw new Error(
            `Mint blocked by on-chain compliance module.\n` +
            `Possible reasons: SupplyLimit cap reached, MaxBalance per-wallet exceeded, MaxHolder limit reached, ` +
            `CountryRestrict on recipient, or TransferWindow blackout active.\n` +
            `Go to Compliance Rules to check configured modules.`
          );
        }
      }

      let txHash: `0x${string}` | null = null;
      const isAgent = address ? await checkIsAgent(address) : false;

      if (isAgent && walletClient) {
        try {
          await ensureConnectedChain(walletChainId, targetChainId, switchChainAsync);
          txHash = await walletClient.writeContract({
            address: tokenAddress,
            abi: tokenAbi,
            functionName: 'mint',
            args: [mintAddress as Address, amountWei],
            chain: walletClient.chain,
            account: address!,
          });
          if (publicClient && txHash) {
            await waitForReceipt(publicClient, txHash);
          }
        } catch (directErr: unknown) {
          const errText = String((directErr as { message?: string })?.message || directErr);
          if (errText.includes('User rejected') || errText.includes('user rejected')) {
            throw directErr;
          }
          console.warn('[Mint] Direct execution failed, falling back to platform agent:', directErr);
          txHash = null;
        }
      }

      if (!txHash) {
        // Execute via platform agent so any connected MetaMask account can mint
        const res = await api.post(
          '/tokens/' + id + '/mint',
          { to_address: mintAddress, amount: String(mintAmount) },
          { headers },
        );
        txHash = res.data?.data?.transactionHash || null;
      }

      toast.success(`Successfully minted ${mintAmount} ${tokenInfo.symbol} to ${mintAddress}`);
      setShowMintModal(false);
      setMintAmount('');
      setMintAddress('');
      await refreshOnchainState(tokenInfo);
    } catch (err: unknown) {
      handleBlockchainError(err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleBurn = async () => {
    if (!tokenInfo || !burnAmount || !burnAddress || !targetChainId) return;
    setActionLoading(true);
    try {
      if (!isAddressLike(burnAddress)) {
        throw new Error('Holder address must be a valid wallet address.');
      }

      const tokenAddress = requireAddress(effectiveTokenAddress, 'Token address');
      const decimals = tokenInfo.decimals ?? 18;
      const amountWei = parseUnits(burnAmount, decimals);

      let txHash: `0x${string}` | null = null;
      const isAgent = address ? await checkIsAgent(address) : false;

      if (isAgent && walletClient) {
        try {
          await ensureConnectedChain(walletChainId, targetChainId, switchChainAsync);
          txHash = await walletClient.writeContract({
            address: tokenAddress,
            abi: tokenAbi,
            functionName: 'burn',
            args: [burnAddress as Address, amountWei],
            chain: walletClient.chain,
            account: address!,
          });
          if (publicClient && txHash) {
            await waitForReceipt(publicClient, txHash);
          }
        } catch (directErr: unknown) {
          const errText = String((directErr as { message?: string })?.message || directErr);
          if (errText.includes('User rejected') || errText.includes('user rejected')) {
            throw directErr;
          }
          console.warn('[Burn] Direct execution failed, falling back to platform agent:', directErr);
          txHash = null;
        }
      }

      if (!txHash) {
        // Execute via platform agent so any connected MetaMask account can burn
        const res = await api.post(
          '/tokens/' + id + '/burn',
          { from_address: burnAddress, amount: String(burnAmount) },
          { headers },
        );
        txHash = res.data?.data?.transactionHash || null;
      }

      toast.success(`Successfully burned ${burnAmount} ${tokenInfo.symbol} from ${burnAddress}`);
      setShowBurnModal(false);
      setBurnAmount('');
      setBurnAddress('');
      await refreshOnchainState(tokenInfo);
    } catch (err: unknown) {
      handleBlockchainError(err);
    } finally {
      setActionLoading(false);
    }
  };

  const handlePauseUnpause = async () => {
    if (!assertCanTransact()) return;
    if (!tokenInfo || !targetChainId) return;
    setActionLoading(true);
    const isPaused = onchainPaused ?? tokenInfo.status === 'paused';
    try {
      const tokenAddress = requireAddress(effectiveTokenAddress, 'Token address');

      let txHash: `0x${string}` | null = null;
      const isAgent = address ? await checkIsAgent(address) : false;

      if (isAgent && walletClient) {
        try {
          await ensureConnectedChain(walletChainId, targetChainId, switchChainAsync);
          txHash = await walletClient.writeContract({
            address: tokenAddress,
            abi: tokenAbi,
            functionName: isPaused ? 'unpause' : 'pause',
            args: [],
            chain: walletClient.chain,
            account: address!,
          });
          if (publicClient && txHash) {
            await waitForReceipt(publicClient, txHash);
          }
          await api.post('/tokens/' + id + '/sync-status', {
            status: isPaused ? 'active' : 'paused',
          }, { headers });
        } catch (directErr: unknown) {
          const errText = String((directErr as { message?: string })?.message || directErr);
          if (errText.includes('User rejected') || errText.includes('user rejected')) {
            throw directErr;
          }
          console.warn('[Pause/Unpause] Direct execution failed, falling back to platform agent:', directErr);
          txHash = null;
        }
      }

      if (!txHash) {
        // Execute via platform agent so any connected MetaMask account can pause / unpause
        const res = await api.post(
          '/tokens/' + id + (isPaused ? '/unpause' : '/pause'),
          {},
          { headers },
        );
        txHash = res.data?.data?.transactionHash || null;
      }

      setOnchainPaused(!isPaused);
      setTokenInfo((current) => (current ? { ...current, status: isPaused ? 'active' : 'paused' } : current));
      toast.success(`Token ${isPaused ? 'unpaused' : 'paused'} successfully`);
    } catch (err: unknown) {
      handleBlockchainError(err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleFreeze = async () => {
    if (!assertCanTransact()) return;
    if (!tokenInfo || !freezeAddress || !targetChainId) return;
    setActionLoading(true);
    const isFreezing = freezeMode === 'freeze';
    try {
      if (!isAddressLike(freezeAddress)) {
        throw new Error('Wallet address must be valid.');
      }

      const tokenAddress = requireAddress(tokenInfo.tokenAddress || effectiveTokenAddress, 'Token address');

      let txHash: `0x${string}` | null = null;
      const isAgent = address ? await checkIsAgent(address) : false;

      if (isAgent && walletClient) {
        try {
          await ensureConnectedChain(walletChainId, targetChainId, switchChainAsync);
          txHash = await walletClient.writeContract({
            address: tokenAddress,
            abi: tokenAbi,
            functionName: 'setAddressFrozen',
            args: [freezeAddress as Address, isFreezing],
            chain: walletClient.chain,
            account: address!,
          });
          if (publicClient && txHash) {
            await waitForReceipt(publicClient, txHash);
          }
        } catch (directErr: unknown) {
          const errText = String((directErr as { message?: string })?.message || directErr);
          if (errText.includes('User rejected') || errText.includes('user rejected')) {
            throw directErr;
          }
          console.warn('[Freeze/Unfreeze] Direct execution failed, falling back to platform agent:', directErr);
          txHash = null;
        }
      }

      if (!txHash) {
        // Execute via platform agent so any connected MetaMask account can freeze / unfreeze
        const endpoint = `/tokens/${id}/${isFreezing ? 'freeze' : 'unfreeze'}/${freezeAddress}`;
        const res = await api.post(endpoint, {}, { headers });
        txHash = res.data?.data?.transactionHash || null;
      }

      toast.success(`Address ${freezeAddress} ${isFreezing ? 'frozen' : 'unfrozen'} successfully`);
      setShowFreezeModal(false);
      setFreezeAddress('');
    } catch (err: unknown) {
      handleBlockchainError(err);
    } finally {
      setActionLoading(false);
    }
  };

  // Auto-lookup investor's ONCHAINID when lost wallet is entered
  const handleLostWalletBlur = async () => {
    if (!isAddressLike(recLostWallet)) return;
    setRecLookingUp(true);
    try {
      // Try to find ONCHAINID from the identity endpoint
      const res = await api.get(`/blockchain/identity/${recLostWallet}`);
      const identityAddr = res.data?.data?.identityAddress;
      if (identityAddr) setRecOnchainId(identityAddr);
    } catch { /* silently fail — user can enter manually */ }
    finally { setRecLookingUp(false); }
  };

  const handleRecovery = async () => {
    if (!tokenInfo || !recLostWallet || !recNewWallet || !recOnchainId || !targetChainId) return;
    if (!isAddressLike(recLostWallet) || !isAddressLike(recNewWallet) || !isAddressLike(recOnchainId)) {
      toast.error('All three addresses must be valid Ethereum addresses.');
      return;
    }
    setActionLoading(true);
    try {
      const tokenAddress = requireAddress(tokenInfo.tokenAddress || effectiveTokenAddress, 'Token address');

      let txHash: `0x${string}` | null = null;
      const isAgent = address ? await checkIsAgent(address) : false;

      if (isAgent && walletClient) {
        try {
          await ensureConnectedChain(walletChainId, targetChainId, switchChainAsync);
          const recoveryAbi = [{
            name: 'recoveryAddress',
            type: 'function' as const,
            stateMutability: 'nonpayable' as const,
            inputs: [
              { name: '_lostWallet', type: 'address' },
              { name: '_newWallet', type: 'address' },
              { name: '_investorOnchainID', type: 'address' },
            ],
            outputs: [{ name: '', type: 'bool' }],
          }] as const;

          txHash = await walletClient.writeContract({
            address: tokenAddress,
            abi: recoveryAbi,
            functionName: 'recoveryAddress',
            args: [recLostWallet as Address, recNewWallet as Address, recOnchainId as Address],
            chain: walletClient.chain,
            account: address!,
          });
          if (publicClient && txHash) {
            await waitForReceipt(publicClient, txHash);
          }
        } catch (directErr: unknown) {
          const errText = String((directErr as { message?: string })?.message || directErr);
          if (errText.includes('User rejected') || errText.includes('user rejected')) {
            throw directErr;
          }
          console.warn('[Recovery] Direct execution failed, falling back to platform agent:', directErr);
          txHash = null;
        }
      }

      if (!txHash) {
        const res = await api.post(`/tokens/${id}/recovery`, {
          lost_wallet: recLostWallet,
          new_wallet: recNewWallet,
          investor_onchain_id: recOnchainId,
        }, { headers });
        txHash = res.data?.data?.transactionHash || null;
      }

      toast.success(`Recovery complete. Tokens moved from ${recLostWallet.slice(0, 8)}… to ${recNewWallet.slice(0, 8)}…`);
      setShowRecoveryModal(false);
      setRecLostWallet(''); setRecNewWallet(''); setRecOnchainId('');
      const nextToken = await fetchToken();
      await refreshOnchainState(nextToken);
    } catch (err: unknown) {
      handleBlockchainError(err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleForceTransfer = async () => {
    if (!tokenInfo || !ftFrom || !ftTo || !ftAmount || !targetChainId) return;
    if (!isAddressLike(ftFrom) || !isAddressLike(ftTo)) {
      toast.error('Both addresses must be valid Ethereum addresses.');
      return;
    }
    setActionLoading(true);
    try {
      const tokenAddress = requireAddress(tokenInfo.tokenAddress || effectiveTokenAddress, 'Token address');

      let txHash: `0x${string}` | null = null;
      const isAgent = address ? await checkIsAgent(address) : false;

      if (isAgent && walletClient) {
        try {
          await ensureConnectedChain(walletChainId, targetChainId, switchChainAsync);
          const forcedTransferAbi = [{
            name: 'forcedTransfer',
            type: 'function' as const,
            stateMutability: 'nonpayable' as const,
            inputs: [
              { name: '_from', type: 'address' },
              { name: '_to', type: 'address' },
              { name: '_amount', type: 'uint256' },
            ],
            outputs: [{ name: '', type: 'bool' }],
          }] as const;

          const { parseUnits } = await import('viem');
          const amountWei = parseUnits(
            parseFloat(ftAmount).toFixed(tokenInfo.decimals ?? 18).replace(/\.?0+$/, '') || '0',
            tokenInfo.decimals ?? 18,
          );

          txHash = await walletClient.writeContract({
            address: tokenAddress,
            abi: forcedTransferAbi,
            functionName: 'forcedTransfer',
            args: [ftFrom as Address, ftTo as Address, amountWei],
            chain: walletClient.chain,
            account: address!,
          });
          if (publicClient && txHash) {
            await waitForReceipt(publicClient, txHash);
          }
        } catch (directErr: unknown) {
          const errText = String((directErr as { message?: string })?.message || directErr);
          if (errText.includes('User rejected') || errText.includes('user rejected')) {
            throw directErr;
          }
          console.warn('[ForceTransfer] Direct execution failed, falling back to platform agent:', directErr);
          txHash = null;
        }
      }

      if (!txHash) {
        const res = await api.post(`/tokens/${id}/force-transfer`, {
          from_address: ftFrom,
          to_address: ftTo,
          amount: ftAmount,
          reason: ftReason,
          notes: ftNotes,
        }, { headers });
        txHash = res.data?.data?.transactionHash || null;
      }

      toast.success(`Force transfer of ${ftAmount} ${tokenInfo.symbol} completed.`);
      setShowForceTransferModal(false);
      setFtFrom(''); setFtTo(''); setFtAmount(''); setFtNotes('');
      const nextToken = await fetchToken();
      await refreshOnchainState(nextToken);
    } catch (err: unknown) {
      handleBlockchainError(err);
    } finally {
      setActionLoading(false);
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
          href="/issuer/tokens"
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-400 hover:text-cyan-400 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Tokens
        </Link>
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-center text-red-400">{error || 'Token not found'}</div>
      </div>
    );
  }

  // Pre-deployment states have no on-chain counterpart, so the DB status is
  // authoritative and the pause lookup must not override it.
  const PRE_CHAIN_STATUSES = ['draft', 'pending_approval', 'approved', 'rejected'];

  const effectiveStatus = PRE_CHAIN_STATUSES.includes(tokenInfo.status)
    ? tokenInfo.status
    : onchainPaused === null
      ? tokenInfo.status
      : onchainPaused
      ? 'paused'
      : 'active';

  const displayedSupply = onchainTotalSupply ?? Number(tokenInfo.totalSupply).toLocaleString('en-US');

  // The cap the issuer entered when creating the token. Stored as a plain
  // integer string (numeric 78,0), so format it via BigInt — Number() silently
  // loses precision past 2^53 and a large cap would render wrong.
  const maxSupplyDisplay = (() => {
    const raw = tokenInfo.totalSupply;
    if (raw === null || raw === undefined || raw === '') return '—';
    try {
      return BigInt(String(raw).split('.')[0]).toLocaleString('en-US');
    } catch {
      return String(raw);
    }
  })();

  return (
    <div className="space-y-6">
      <Link
        href="/issuer/tokens"
        className="group inline-flex items-center gap-2 text-sm font-semibold text-slate-400 hover:text-cyan-400 transition-colors"
      >
        <ArrowLeft className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-1" />
        Back to Tokens
      </Link>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-ink">
              {tokenInfo.name}
            </h1>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider ${
 effectiveStatus === 'active' ? 'border border-emerald-500/30 bg-emerald-500/15 text-emerald-400 shadow-sm' : effectiveStatus === 'paused' ? 'border border-amber-500/30 bg-amber-500/15 text-amber-400 shadow-sm' : effectiveStatus === 'pending_approval' ? 'border border-amber-500/30 bg-amber-500/15 text-amber-400' : effectiveStatus === 'rejected' ? 'border border-red-500/30 bg-red-500/15 text-red-400' : effectiveStatus === 'approved' ? 'border border-emerald-500/30 bg-emerald-500/15 text-emerald-400' : 'border border-blue-500/30 bg-blue-500/15 text-blue-400' }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
 effectiveStatus === 'active' ? 'bg-emerald-400 animate-pulse' : effectiveStatus === 'paused' ? 'bg-amber-400' : effectiveStatus === 'pending_approval' ? 'bg-amber-400 animate-pulse' : effectiveStatus === 'rejected' ? 'bg-red-400' : effectiveStatus === 'approved' ? 'bg-emerald-400' : 'bg-blue-400' }`}
              />
              {effectiveStatus === 'pending_approval'
                ? 'Pending Approval'
                : effectiveStatus === 'approved'
                ? 'Approved'
                : effectiveStatus}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <p className="text-sm font-mono text-cyan-400/80">
              {tokenInfo.symbol} <span className="text-slate-500">&middot;</span> chain ID {tokenInfo.chain || tokenInfo.chainId || '-'}
            </p>
            {creationTxLink && (
              <a
                href={creationTxLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-mono text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                title={`View token creation transaction on ${activeChainLabel}`}
              >
                <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                <span>{activeChainLabel} Creation Tx: {effectiveTxHash ? `${effectiveTxHash.slice(0, 8)}...${effectiveTxHash.slice(-6)}` : 'View'}</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(effectiveStatus === 'approved' || effectiveStatus === 'draft') && (
            <button
              onClick={handleDeploy}
              disabled={deployLoading}
              className="inline-flex items-center gap-2 rounded-xl bg-success px-5 py-2.5 text-sm font-bold text-slate-950 shadow-md hover:brightness-110 disabled:opacity-50 transition-all"
            >
              {deployLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {deployLoading ? 'Deploying...' : 'Deploy Token'}
            </button>
          )}
          {(effectiveStatus === 'active' || effectiveStatus === 'paused') && (
            <>
              <button
                onClick={() => setShowMintModal(true)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-sm font-bold text-slate-950 shadow-md hover:scale-[1.02] active:scale-[0.98] transition-all"
              >
                <Plus className="h-4 w-4" />
                <span>Mint</span>
              </button>
              <button
                onClick={() => setShowBurnModal(true)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-400 hover:bg-red-500/20 hover:border-red-500/50 transition-all"
              >
                <Flame className="h-4 w-4" />
                <span>Burn</span>
              </button>
              <button
                onClick={handlePauseUnpause}
                disabled={actionLoading}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700/80 bg-slate-800/60 px-4 py-2 text-sm font-medium text-slate-200 hover:border-slate-600 hover:bg-slate-800 hover:text-ink transition-all disabled:opacity-50"
              >
                {effectiveStatus === 'paused' ? <Play className="h-4 w-4 text-emerald-400" /> : <Pause className="h-4 w-4 text-amber-400" />}
                <span>{effectiveStatus === 'paused' ? 'Unpause' : 'Pause'}</span>
              </button>
              <button
                onClick={() => {
                  setFreezeMode('freeze');
                  setShowFreezeModal(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-2 text-sm font-semibold text-blue-400 hover:bg-blue-500/20 transition-all"
              >
                <Snowflake className="h-4 w-4" />
                <span>Freeze</span>
              </button>
              <button
                onClick={() => {
                  setFreezeMode('unfreeze');
                  setShowFreezeModal(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-sky-500/30 bg-sky-500/10 px-4 py-2 text-sm font-semibold text-sky-400 hover:bg-sky-500/20 transition-all"
              >
                <Snowflake className="h-4 w-4" />
                <span>Unfreeze</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Platform review state ─────────────────────────────────── */}
      {effectiveStatus === 'pending_approval' && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 shadow-md">
          <div className="flex items-start gap-3">
            <Clock className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-400" />
            <div>
              <p className="font-semibold text-amber-300">Awaiting platform approval</p>
              <p className="mt-1 text-sm leading-relaxed text-slate-300">
                This token has been submitted to the platform compliance team. Once it is
                approved you will be able to deploy it on-chain from this page. You can
                still edit the details while it is under review — editing returns it to the
                review queue.
              </p>
            </div>
          </div>
        </div>
      )}

      {effectiveStatus === 'rejected' && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 shadow-md">
          <div className="flex items-start gap-3">
            <XCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-400" />
            <div>
              <p className="font-semibold text-red-300">
                This token was rejected by the platform
              </p>
              {tokenInfo.rejectionReason ? (
                <div className="mt-2 rounded-xl border border-red-500/20 bg-slate-900/60 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-red-400">
                    Reason
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-slate-200">
                    {tokenInfo.rejectionReason}
                  </p>
                </div>
              ) : (
                <p className="mt-1 text-sm text-slate-300">No reason was recorded.</p>
              )}
              <p className="mt-2 text-sm leading-relaxed text-slate-300">
                Edit the token to address the feedback — saving your changes resubmits it
                for review.
              </p>
            </div>
          </div>
        </div>
      )}

      {effectiveStatus === 'approved' && (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 shadow-md">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-400" />
            <div>
              <p className="font-semibold text-emerald-300">Approved for deployment</p>
              <p className="mt-1 text-sm leading-relaxed text-slate-300">
                The platform has approved this token. Use <strong>Deploy Token</strong>{' '}
                above to publish the ERC-3643 suite from your connected wallet.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* The backend EOA mints after a payment clears. Tokens deployed before
          that agent was added automatically would fail silently at mint time,
          so surface it with a one-click fix. */}
      {platformAgentMissing && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 shadow-md">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-400" />
              <div>
                <p className="font-semibold text-amber-300">Platform agent not registered</p>
                <p className="mt-1 text-sm leading-relaxed text-slate-300">
                  This token has no platform agent, so investor payments cannot be settled
                  into minted tokens automatically. Add it once to enable that.
                </p>
              </div>
            </div>
            <button
              onClick={handleAddTokenAgent}
              disabled={addingAgent}
              className="inline-flex flex-shrink-0 items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-sm font-bold text-slate-950 transition-all hover:brightness-110 disabled:opacity-50"
            >
              {addingAgent ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {addingAgent ? 'Adding...' : 'Add Platform Agent'}
            </button>
          </div>
        </div>
      )}

      {/* Connected MetaMask Account Info & Switcher Banner */}
      <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-4 shadow-md backdrop-blur-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-xl p-2.5 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <Wallet className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Connected MetaMask Account
                </span>
                {address && (
                  <span
                    className={clsx(
                      'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
                      callerIsAgent
                        ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                        : 'border border-cyan-500/30 bg-cyan-500/10 text-cyan-400'
                    )}
                  >
                    {callerIsAgent ? 'On-Chain Agent' : 'Platform Agent Delegated'}
                  </span>
                )}
              </div>
              <p className="font-mono text-sm font-semibold text-ink">
                {address ? (
                  <>
                    {address}{' '}
                    <span className="text-xs font-normal text-slate-400 font-sans">
                      (Any connected account can mint, burn, pause, unpause, and freeze)
                    </span>
                  </>
                ) : (
                  <span className="text-slate-400 font-sans">
                    No wallet connected — actions will run via the platform agent
                  </span>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {address ? (
              <button
                type="button"
                onClick={handleSwitchAccount}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/80 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-slate-600 hover:bg-slate-800 hover:text-ink transition-all shadow-sm"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Switch Account
              </button>
            ) : (
              <button
                type="button"
                onClick={handleConnectWallet}
                className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-3 py-1.5 text-xs font-bold text-slate-950 shadow-sm hover:brightness-110 transition-all"
              >
                <Wallet className="h-3.5 w-3.5" />
                Connect MetaMask
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-5 shadow-lg transition-all hover:border-slate-700/80 hover:bg-slate-900/90">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Buyers</p>
            <div className="rounded-xl p-2 bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <Users className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-3 text-3xl font-extrabold tracking-tight text-ink">
            {new Set(tokenPayments.map((p) => p.userId)).size}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-5 shadow-lg transition-all hover:border-slate-700/80 hover:bg-slate-900/90">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total Supply</p>
            <div className="rounded-xl p-2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Coins className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-3 text-3xl font-extrabold tracking-tight text-ink">
            {displayedSupply}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">Minted on-chain</p>
        </div>

        <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-5 shadow-lg transition-all hover:border-slate-700/80 hover:bg-slate-900/90">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Max Supply</p>
            <div className="rounded-xl p-2 bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <Layers className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-3 text-3xl font-extrabold tracking-tight text-ink">
            {maxSupplyDisplay}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">Cap set at creation</p>
        </div>

        <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-5 shadow-lg transition-all hover:border-slate-700/80 hover:bg-slate-900/90">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Tokens Sold</p>
            <div className="rounded-xl p-2 bg-purple-500/10 text-purple-400 border border-purple-500/20">
              <Coins className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-3 text-3xl font-extrabold tracking-tight text-ink">
            {tokenPayments.reduce((s, p) => s + (parseFloat(p.tokenAmount) || 0), 0).toLocaleString('en-US')}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-5 shadow-lg transition-all hover:border-slate-700/80 hover:bg-slate-900/90">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Revenue</p>
            <div className="rounded-xl p-2 bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <ArrowLeftRight className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-3 text-3xl font-extrabold tracking-tight text-ink">
            ${tokenPayments.reduce((s, p) => s + (parseFloat(p.fiatAmount) || 0), 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </p>
        </div>
      </div>

      {/* Offering & Investment Limits */}
      {(tokenMinInv != null || tokenMaxInv != null || tokenInitialPrice != null) && (
        <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-5 shadow-lg">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Offering Parameters & Investment Limits</p>
              <div className="mt-2.5 flex flex-wrap items-center gap-6 text-sm">
                {tokenInitialPrice != null && (
                  <div>
                    <span className="text-slate-400 text-xs">Initial Price: </span>
                    <strong className="text-ink">${Number(tokenInitialPrice).toFixed(2)}</strong>
                  </div>
                )}
                {tokenMinInv != null && (
                  <div>
                    <span className="text-slate-400 text-xs">Minimum Investment: </span>
                    <strong className="text-emerald-400">{Number(tokenMinInv).toLocaleString('en-US')} tokens</strong>
                  </div>
                )}
                {tokenMaxInv != null && (
                  <div>
                    <span className="text-slate-400 text-xs">Maximum Investment: </span>
                    <strong className="text-cyan-400">{Number(tokenMaxInv).toLocaleString('en-US')} tokens</strong>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Management Actions */}
      <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-6 shadow-xl">
        <h3 className="mb-4 text-lg font-bold text-ink tracking-tight">Management</h3>
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          <Link
            href={'/issuer/tokens/' + id + '/cap-table'}
            className="group flex items-start gap-3.5 rounded-xl border border-slate-800/80 bg-slate-950/50 p-4 transition-all duration-200 hover:border-slate-700 hover:bg-slate-900/80 hover:shadow-lg hover:-translate-y-0.5"
          >
            <div className="rounded-xl p-2.5 bg-purple-500/10 text-purple-400 border border-purple-500/20 transition-transform duration-200 group-hover:scale-110">
              <BarChart3 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-ink group-hover:text-cyan-300 transition-colors">Cap Table</p>
              <p className="text-xs text-slate-400 mt-0.5">View ownership distribution</p>
            </div>
          </Link>
          <Link
            href={'/issuer/tokens/' + id + '/compliance'}
            className="group flex items-start gap-3.5 rounded-xl border border-slate-800/80 bg-slate-950/50 p-4 transition-all duration-200 hover:border-slate-700 hover:bg-slate-900/80 hover:shadow-lg hover:-translate-y-0.5"
          >
            <div className="rounded-xl p-2.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 transition-transform duration-200 group-hover:scale-110">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-ink group-hover:text-cyan-300 transition-colors">Compliance Rules</p>
              <p className="text-xs text-slate-400 mt-0.5">Configure transfer restrictions</p>
            </div>
          </Link>
          <Link
            href={'/issuer/tokens/' + id + '/whitelist'}
            className="group flex items-start gap-3.5 rounded-xl border border-slate-800/80 bg-slate-950/50 p-4 transition-all duration-200 hover:border-slate-700 hover:bg-slate-900/80 hover:shadow-lg hover:-translate-y-0.5"
          >
            <div className="rounded-xl p-2.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 transition-transform duration-200 group-hover:scale-110">
              <ListChecks className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-ink group-hover:text-cyan-300 transition-colors">Whitelist</p>
              <p className="text-xs text-slate-400 mt-0.5">Approve investor addresses</p>
            </div>
          </Link>
          <Link
            href={'/issuer/tokens/' + id + '/transfer-check'}
            className="group flex items-start gap-3.5 rounded-xl border border-slate-800/80 bg-slate-950/50 p-4 transition-all duration-200 hover:border-slate-700 hover:bg-slate-900/80 hover:shadow-lg hover:-translate-y-0.5"
          >
            <div className="rounded-xl p-2.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 transition-transform duration-200 group-hover:scale-110">
              <FileCheck className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-ink group-hover:text-cyan-300 transition-colors">Transfer Check</p>
              <p className="text-xs text-slate-400 mt-0.5">Test transfer eligibility</p>
            </div>
          </Link>
          <Link
            href={'/issuer/tokens/' + id + '/transfer-approvals'}
            className="group flex items-start gap-3.5 rounded-xl border border-slate-800/80 bg-slate-950/50 p-4 transition-all duration-200 hover:border-slate-700 hover:bg-slate-900/80 hover:shadow-lg hover:-translate-y-0.5"
          >
            <div className="rounded-xl p-2.5 bg-violet-500/10 text-violet-400 border border-violet-500/20 transition-transform duration-200 group-hover:scale-110">
              <ArrowLeftRight className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-ink group-hover:text-cyan-300 transition-colors">Transfer Approvals</p>
              <p className="text-xs text-slate-400 mt-0.5">Approve or reject investor transfers</p>
            </div>
          </Link>
          <Link
            href={'/issuer/tokens/' + id + '/vesting'}
            className="group flex items-start gap-3.5 rounded-xl border border-slate-800/80 bg-slate-950/50 p-4 transition-all duration-200 hover:border-slate-700 hover:bg-slate-900/80 hover:shadow-lg hover:-translate-y-0.5"
          >
            <div className="rounded-xl p-2.5 bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 transition-transform duration-200 group-hover:scale-110">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-ink group-hover:text-cyan-300 transition-colors">Vesting Schedules</p>
              <p className="text-xs text-slate-400 mt-0.5">Manage token vesting</p>
            </div>
          </Link>
          <Link
            href={'/issuer/tokens/' + id + '/documents'}
            className="group flex items-start gap-3.5 rounded-xl border border-slate-800/80 bg-slate-950/50 p-4 transition-all duration-200 hover:border-slate-700 hover:bg-slate-900/80 hover:shadow-lg hover:-translate-y-0.5"
          >
            <div className="rounded-xl p-2.5 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 transition-transform duration-200 group-hover:scale-110">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-ink group-hover:text-cyan-300 transition-colors">Documents</p>
              <p className="text-xs text-slate-400 mt-0.5">Prospectus, term sheets, legal</p>
            </div>
          </Link>
          {(effectiveStatus === 'active' || effectiveStatus === 'paused') && (
            <button
              onClick={() => setShowForceTransferModal(true)}
              className="group flex items-start gap-3.5 rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-left transition-all duration-200 hover:border-red-500/50 hover:bg-red-500/10 hover:shadow-lg hover:-translate-y-0.5"
            >
              <div className="rounded-xl p-2.5 bg-red-500/15 text-red-400 border border-red-500/30 transition-transform duration-200 group-hover:scale-110">
                <ArrowLeftRight className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-bold text-red-400 group-hover:text-red-300 transition-colors">Force Transfer</p>
                <p className="text-xs text-red-400/70 mt-0.5">Move tokens between wallets</p>
              </div>
            </button>
          )}
          {(effectiveStatus === 'active' || effectiveStatus === 'paused') && (
            <button
              onClick={() => setShowRecoveryModal(true)}
              className="group flex items-start gap-3.5 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-left transition-all duration-200 hover:border-amber-500/50 hover:bg-amber-500/10 hover:shadow-lg hover:-translate-y-0.5"
            >
              <div className="rounded-xl p-2.5 bg-amber-500/15 text-amber-400 border border-amber-500/30 transition-transform duration-200 group-hover:scale-110">
                <RefreshCw className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-bold text-amber-400 group-hover:text-amber-300 transition-colors">Token Recovery</p>
                <p className="text-xs text-amber-400/70 mt-0.5">Recover lost wallet tokens</p>
              </div>
            </button>
          )}
        </div>
      </div>

      {(effectiveTokenAddress || effectiveTxHash) && (
        <div className="space-y-3">
          {effectiveTokenAddress && (
            <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-5">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Contract Address</p>
                    <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400 border border-emerald-500/20">
                      ERC-3643
                    </span>
                  </div>
                  <p className="font-mono text-xs sm:text-sm text-cyan-300 mt-1 break-all select-all">
                    {effectiveTokenAddress}
                  </p>
                </div>
                <div className="flex items-center gap-2 self-start sm:self-center shrink-0">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(effectiveTokenAddress);
                      toast.success('Contract address copied!');
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:border-cyan-400/50 hover:text-cyan-300 transition-colors"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Copy Address
                  </button>
                  {contractExplorerLink && (
                    <a
                      href={contractExplorerLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold text-cyan-300 hover:bg-cyan-500/20 transition-colors"
                    >
                      <span>Contract Etherscan</span>
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Sepolia Token Creation Transaction Link */}
          {(effectiveTxHash || creationTxLink) && (
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/20 p-5 shadow-lg shadow-emerald-950/10">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="rounded-full bg-emerald-500/20 p-1 text-emerald-400">
                      <CheckCircle2 className="h-4 w-4" />
                    </div>
                    <p className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                      Token Creation Transaction ({activeChainLabel})
                    </p>
                  </div>
                  <p className="font-mono text-xs sm:text-sm text-slate-200 mt-1.5 break-all select-all">
                    {effectiveTxHash}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    On-chain deployment transaction confirmed on {activeChainLabel}.
                  </p>
                </div>
                <div className="flex items-center gap-2 self-start sm:self-center shrink-0">
                  <button
                    onClick={() => {
                      if (effectiveTxHash) {
                        navigator.clipboard.writeText(effectiveTxHash);
                        toast.success('Transaction hash copied!');
                      }
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:border-emerald-400/50 hover:text-emerald-300 transition-colors"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Copy Tx
                  </button>
                  {creationTxLink && (
                    <a
                      href={creationTxLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3.5 py-1.5 text-xs font-bold text-slate-950 shadow-md hover:bg-emerald-400 transition-colors"
                    >
                      <span>View on {activeChainLabel} explorer</span>
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}



      <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 overflow-hidden shadow-xl">
        <div className="border-b border-slate-800 px-6 py-4">
          <h3 className="text-base font-bold text-ink tracking-tight">Purchase Orders</h3>
        </div>
        {tokenPayments.length === 0 ? (
          <div className="p-10 text-center text-slate-400">
            No purchase orders for this token yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/60">
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Order ID</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Investor Wallet</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-400">Tokens</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-400">Amount</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">On-Chain Tx</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {tokenPayments.map((p) => {
                  const mintTx = p.metadata?.mint_tx_hash as string | undefined;
                  const mintTxUrl = mintTx ? explorerUrl(activeChainId, 'tx', mintTx) : null;
                  return (
                    <tr key={p.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="px-6 py-4 text-sm text-slate-400">
                        {new Date(p.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 font-mono text-xs text-slate-300">
                        {p.id.slice(0, 8)}...
                      </td>
                      <td className="px-6 py-4 text-xs font-mono text-slate-300">
                        {p.metadata?.wallet_address ? (
                          <span title={p.metadata.wallet_address} className="text-emerald-400 font-semibold">
                            {p.metadata.wallet_address.slice(0, 6)}...{p.metadata.wallet_address.slice(-4)}
                          </span>
                        ) : (
                          <span className="text-slate-500 italic">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right text-sm font-bold text-ink">
                        {parseFloat(p.tokenAmount).toLocaleString('en-US')}
                      </td>
                      <td className="px-6 py-4 text-right text-sm font-bold text-ink">
                        ${parseFloat(p.fiatAmount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${
                          p.status === 'completed' ? 'border border-emerald-500/30 bg-emerald-500/15 text-emerald-400' :
                          p.status === 'failed' ? 'border border-red-500/30 bg-red-500/15 text-red-400' :
                          p.status === 'processing' ? 'border border-blue-500/30 bg-blue-500/15 text-blue-400' :
                          'border border-amber-500/30 bg-amber-500/15 text-amber-400' }`}>
                          {p.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs font-mono">
                        {mintTxUrl ? (
                          <a
                            href={mintTxUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-emerald-400 hover:text-emerald-300 hover:underline"
                          >
                            <span>{mintTx!.slice(0, 6)}...{mintTx!.slice(-4)}</span>
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : (
                          <span className="text-slate-500 italic">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Mint Modal */}
      {showMintModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="card w-full max-w-md p-6">
            <h3 className="mb-4 text-lg font-bold text-ink tracking-tight">
              Mint Tokens
            </h3>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5 block">
                  Recipient Address
                </label>
                <input
                  className="w-full rounded-xl border border-slate-700/80 bg-slate-950/80 px-3.5 py-2.5 font-mono text-sm text-ink placeholder-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400 transition-all"
                  placeholder="0x..."
                  value={mintAddress}
                  onChange={(e) => setMintAddress(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5 block">
                  Amount
                </label>
                <input
                  type="number"
                  className="w-full rounded-xl border border-slate-700/80 bg-slate-950/80 px-3.5 py-2.5 text-sm text-ink placeholder-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400 transition-all"
                  placeholder="Number of tokens"
                  value={mintAmount}
                  onChange={(e) => setMintAmount(e.target.value)}
                />
              </div>
              <div className="flex gap-3 justify-end pt-2">
                <button
                  onClick={() => { setShowMintModal(false); setMintAmount(''); setMintAddress(''); }}
                  className="rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-2.5 text-sm font-semibold text-slate-300 hover:bg-slate-800 hover:text-ink transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleMint}
                  disabled={!mintAmount || !mintAddress || actionLoading}
                  className="inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-bold text-slate-950 shadow-md disabled:opacity-50 transition-all"
                >
                  {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Confirm Mint
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Burn Modal */}
      {showBurnModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="card w-full max-w-md p-6">
            <h3 className="mb-4 text-lg font-bold text-ink tracking-tight">
              Burn Tokens
            </h3>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5 block">
                  Holder Address
                </label>
                <input
                  className="w-full rounded-xl border border-slate-700/80 bg-slate-950/80 px-3.5 py-2.5 font-mono text-sm text-ink placeholder-slate-500 focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-400 transition-all"
                  placeholder="0x..."
                  value={burnAddress}
                  onChange={(e) => setBurnAddress(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5 block">
                  Amount to Burn
                </label>
                <input
                  type="number"
                  className="w-full rounded-xl border border-slate-700/80 bg-slate-950/80 px-3.5 py-2.5 text-sm text-ink placeholder-slate-500 focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-400 transition-all"
                  placeholder="Number of tokens"
                  value={burnAmount}
                  onChange={(e) => setBurnAmount(e.target.value)}
                />
              </div>
              <div className="flex gap-3 justify-end pt-2">
                <button
                  onClick={() => { setShowBurnModal(false); setBurnAmount(''); setBurnAddress(''); }}
                  className="rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-2.5 text-sm font-semibold text-slate-300 hover:bg-slate-800 hover:text-ink transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleBurn}
                  disabled={!burnAmount || !burnAddress || actionLoading}
                  className="inline-flex items-center gap-2 rounded-xl bg-danger px-5 py-2.5 text-sm font-bold text-btn-text shadow-md hover:brightness-110 disabled:opacity-50 transition-all"
                >
                  {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Confirm Burn
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Freeze Modal */}
      {showFreezeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="card w-full max-w-md p-6">
            <h3 className="mb-4 text-lg font-bold text-ink tracking-tight">
              {freezeMode === 'freeze' ? 'Freeze Address' : 'Unfreeze Address'}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5 block">
                  Wallet Address to {freezeMode === 'freeze' ? 'Freeze' : 'Unfreeze'}
                </label>
                <input
                  className="w-full rounded-xl border border-slate-700/80 bg-slate-950/80 px-3.5 py-2.5 font-mono text-sm text-ink placeholder-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400 transition-all"
                  placeholder="0x..."
                  value={freezeAddress}
                  onChange={(e) => setFreezeAddress(e.target.value)}
                />
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                {freezeMode === 'freeze'
                  ? 'Freezing an address prevents it from sending or receiving tokens on-chain.'
                  : 'Unfreezing restores normal transfer permissions for the address.'}
              </p>
              <div className="flex gap-3 justify-end pt-2">
                <button
                  onClick={() => { setShowFreezeModal(false); setFreezeAddress(''); }}
                  className="rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-2.5 text-sm font-semibold text-slate-300 hover:bg-slate-800 hover:text-ink transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleFreeze}
                  disabled={!freezeAddress || actionLoading}
                  className={clsx(
                    'inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-ink disabled:opacity-50 transition-all',
                    freezeMode === 'freeze'
                      ? 'bg-blue-600 hover:bg-blue-500 shadow-md'
                      : 'bg-sky-600 hover:bg-sky-500 shadow-md'
                  )}
                >
                  {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {freezeMode === 'freeze' ? 'Confirm Freeze' : 'Confirm Unfreeze'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Force Transfer Modal */}
      {showForceTransferModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="card w-full max-w-md p-6">
            <h3 className="mb-1 text-lg font-bold text-ink tracking-tight">Force Transfer</h3>
            <p className="mb-4 text-xs text-slate-400">
              Administratively transfer tokens between wallets. Both addresses must be whitelisted.
            </p>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5 block">From Address</label>
                <input
                  className="w-full rounded-xl border border-slate-700/80 bg-slate-950/80 px-3.5 py-2.5 font-mono text-sm text-ink placeholder-slate-500 focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-400 transition-all"
                  placeholder="0x... (source wallet)"
                  value={ftFrom}
                  onChange={e => setFtFrom(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5 block">To Address</label>
                <input
                  className="w-full rounded-xl border border-slate-700/80 bg-slate-950/80 px-3.5 py-2.5 font-mono text-sm text-ink placeholder-slate-500 focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-400 transition-all"
                  placeholder="0x... (destination wallet)"
                  value={ftTo}
                  onChange={e => setFtTo(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5 block">Amount ({tokenInfo?.symbol})</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  className="w-full rounded-xl border border-slate-700/80 bg-slate-950/80 px-3.5 py-2.5 text-sm text-ink placeholder-slate-500 focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-400 transition-all"
                  placeholder="0"
                  value={ftAmount}
                  onChange={e => setFtAmount(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5 block">Reason</label>
                <select
                  className="w-full rounded-xl border border-slate-700/80 bg-slate-950/80 px-3.5 py-2.5 text-sm text-ink focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-400 transition-all"
                  value={ftReason}
                  onChange={e => setFtReason(e.target.value)}
                >
                  <option value="regulatory_order">Regulatory Order</option>
                  <option value="issuer_recovery">Issuer Recovery</option>
                  <option value="dividend_reallocation">Dividend Reallocation</option>
                  <option value="error_correction">Error Correction</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5 block">Notes (optional)</label>
                <textarea
                  className="w-full rounded-xl border border-slate-700/80 bg-slate-950/80 px-3.5 py-2.5 text-sm text-ink placeholder-slate-500 focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-400 transition-all min-h-[80px]"
                  placeholder="Additional context for audit log..."
                  value={ftNotes}
                  onChange={e => setFtNotes(e.target.value)}
                />
              </div>
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300">
                ⚠ Force transfers bypass normal compliance checks. This action is logged permanently in the audit trail.
              </div>
            </div>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => { setShowForceTransferModal(false); setFtFrom(''); setFtTo(''); setFtAmount(''); setFtNotes(''); }}
                className="flex-1 rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-2.5 text-sm font-semibold text-slate-300 hover:bg-slate-800 hover:text-ink transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleForceTransfer}
                disabled={actionLoading || !ftFrom || !ftTo || !ftAmount}
                className="flex-1 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-btn-text hover:bg-red-500 disabled:opacity-50 shadow-md transition-all"
              >
                {actionLoading ? 'Transferring…' : 'Execute Force Transfer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Recovery Modal */}
      {showRecoveryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="card w-full max-w-md p-6">
            <h3 className="mb-1 text-lg font-bold text-ink tracking-tight">Token Recovery</h3>
            <p className="mb-4 text-xs text-slate-400">
              Transfer all tokens from a lost/compromised wallet to a new wallet. The investor&apos;s ONCHAINID must be linked to the new wallet.
            </p>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5 block">Lost / Compromised Wallet</label>
                <input
                  className="w-full rounded-xl border border-slate-700/80 bg-slate-950/80 px-3.5 py-2.5 font-mono text-sm text-ink placeholder-slate-500 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 transition-all"
                  placeholder="0x... (wallet that lost access)"
                  value={recLostWallet}
                  onChange={e => setRecLostWallet(e.target.value)}
                  onBlur={handleLostWalletBlur}
                />
                <p className="mt-1 text-xs text-slate-500">Must be in the cap table for this token</p>
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5 block">New Wallet Address</label>
                <input
                  className="w-full rounded-xl border border-slate-700/80 bg-slate-950/80 px-3.5 py-2.5 font-mono text-sm text-ink placeholder-slate-500 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 transition-all"
                  placeholder="0x... (investor&apos;s new wallet)"
                  value={recNewWallet}
                  onChange={e => setRecNewWallet(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5 block">Investor ONCHAINID Contract</label>
                <div className="relative">
                  <input
                    className="w-full rounded-xl border border-slate-700/80 bg-slate-950/80 px-3.5 py-2.5 pr-8 font-mono text-sm text-ink placeholder-slate-500 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 transition-all"
                    placeholder="0x... (auto-filled from lost wallet)"
                    value={recOnchainId}
                    onChange={e => setRecOnchainId(e.target.value)}
                  />
                  {recLookingUp && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-slate-400" />
                  )}
                </div>
                <p className="mt-1 text-xs text-slate-500">Auto-filled when you enter the lost wallet. Edit if needed.</p>
              </div>
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300">
                ⚠ Recovery transfers ALL tokens from the lost wallet to the new wallet and updates the investor registry. This cannot be undone.
              </div>
            </div>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => { setShowRecoveryModal(false); setRecLostWallet(''); setRecNewWallet(''); setRecOnchainId(''); }}
                className="flex-1 rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-2.5 text-sm font-semibold text-slate-300 hover:bg-slate-800 hover:text-ink transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleRecovery}
                disabled={actionLoading || !recLostWallet || !recNewWallet || !recOnchainId}
                className="flex-1 rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-bold text-btn-text hover:bg-amber-500 disabled:opacity-50 shadow-md transition-all"
              >
                {actionLoading ? 'Processing…' : 'Execute Recovery'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
