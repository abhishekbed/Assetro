import type { Address, Chain, PublicClient, WalletClient } from 'viem';

export function parseBaseError(error: unknown): string {
  if (error instanceof Error && error.message) {
    const raw = error.message;
    if (raw.includes('0xb7ab6e2c') || raw.includes('PublicDeploymentsNotAllowed')) {
      return 'Public deployments are currently disabled on the TREXGateway smart contract. Please contact platform administration.';
    }
    if (raw.includes('0x18f44adb') || raw.includes('PublicCannotDeployOnBehalf')) {
      return 'The connected wallet is not authorized to deploy on behalf of the token owner.';
    }
    if (raw.includes('User rejected') || raw.includes('user rejected') || raw.includes('ACTION_REJECTED')) {
      return 'Transaction was rejected in your wallet.';
    }
    if (raw.includes('Timed out while waiting for transaction')) {
      return 'Transaction timed out while waiting for confirmation. It may still succeed on Sepolia — please check your wallet activity.';
    }
    const [firstLine] = raw.split('\n');
    return firstLine;
  }

  return 'Transaction failed';
}

export function isAddressLike(value: string): value is Address {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

export async function ensureConnectedChain(
  walletChainId: number | undefined,
  targetChainId: number,
  switchChainAsync?: (args: { chainId: number }) => Promise<Chain>,
) {
  if (walletChainId === targetChainId) {
    return;
  }

  if (!switchChainAsync) {
    throw new Error(`Switch your wallet to chain ${targetChainId} and try again.`);
  }

  await switchChainAsync({ chainId: targetChainId });
  throw new Error('Wallet network updated. Please click the action again to continue.');
}

export async function waitForReceipt(
  publicClient: PublicClient | undefined,
  txHash: `0x${string}`,
) {
  if (!publicClient) {
    throw new Error('Public client is not available for this chain.');
  }

  return publicClient.waitForTransactionReceipt({ hash: txHash });
}

export function requireWalletClient(
  walletClient: WalletClient | undefined,
): WalletClient {
  if (!walletClient) {
    throw new Error('Connect your wallet to continue.');
  }

  return walletClient;
}

export function requireAddress(value: string | null | undefined, label: string): Address {
  if (!value || !isAddressLike(value)) {
    throw new Error(`${label} is not configured.`);
  }

  return value;
}
