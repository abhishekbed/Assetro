/** Human names for the chains the platform deploys to. */
const CHAIN_NAMES: Record<number, string> = {
  1: 'Ethereum',
  11155111: 'Sepolia',
  5042002: 'Arc Testnet',
  137: 'Polygon',
  80002: 'Amoy',
};

/**
 * A readable chain label. A raw id like `11155111` is meaningless to an
 * investor, so fall back to `Chain <id>` rather than printing the number bare.
 */
export const chainLabel = (chain?: string | number | null): string | null => {
  if (chain === null || chain === undefined || chain === '') return null;
  if (typeof chain === 'string' && !/^\d+$/.test(chain)) return chain;
  const id = Number(chain);
  if (!Number.isFinite(id)) return String(chain);
  return CHAIN_NAMES[id] ?? `Chain ${id}`;
};

/** Block explorer roots, keyed by chain id. */
const EXPLORERS: Record<number, string> = {
  1: 'https://etherscan.io',
  11155111: 'https://sepolia.etherscan.io',
  5042002: 'https://testnet.arcscan.app',
  137: 'https://polygonscan.com',
  80002: 'https://amoy.polygonscan.com',
};

/**
 * A block-explorer link for an address, token or transaction on a given chain.
 * Returns null for a chain we have no explorer for, so callers can hide the
 * link rather than render one that 404s.
 */
export const explorerUrl = (
  chain: string | number | null | undefined,
  kind: 'address' | 'token' | 'tx',
  value: string,
): string | null => {
  const id = Number(chain);
  if (!Number.isFinite(id)) return null;
  const root = EXPLORERS[id];
  return root ? `${root}/${kind}/${value}` : null;
};
