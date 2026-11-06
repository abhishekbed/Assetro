import api from '@/lib/api';

export interface InvestorPosition {
  tokenId: string;
  name: string;
  symbol: string;
  assetType: string;
  status: string;
  chainId: number;
  tokenAddress: string | null;
  identityRegistryAddress?: string | null;
  complianceAddress?: string | null;
  totalSupply: string;
  quantity: string;
  investedAmount: string;
  orders: number;
  ownershipPercent: number;
  source: 'cap_table' | 'payments';
  walletAddress: string | null;
  lastUpdatedAt: string | null;
  /** Paid for, awaiting the issuer's mint. Not counted in `quantity`. */
  purchasedQuantity?: string;
  pendingQuantity?: string;
  pendingAmount?: string;
  pendingOrders?: number;
}

/**
 * Fetch on-chain balance + frozen status via the backend API.
 * Routes through the NestJS server so the browser never calls the RPC directly
 * (avoids Alchemy CORS blocks on free-tier endpoints).
 */
export async function fetchOnchainBalance(
  tokenId: string,
  walletAddress: string,
): Promise<{ balance: number | null; frozen: boolean | null }> {
  try {
    // Goes through the shared client so the auth and tenant headers are sent;
    // the endpoint is tenant-scoped and a bare fetch is rejected.
    const res = await api.get(`/tokens/${tokenId}/onchain-balance`, {
      params: { wallet: walletAddress },
    });
    return {
      balance: res.data?.data?.balance ?? null,
      frozen: res.data?.data?.frozen ?? null,
    };
  } catch {
    return { balance: null, frozen: null };
  }
}

// Kept for backward compatibility — now delegates to fetchOnchainBalance
export async function fetchOnchainFrozen(
  _publicClient: unknown,
  _tokenAddress: string,
  _walletAddress: string,
): Promise<boolean | null> {
  return null;
}
