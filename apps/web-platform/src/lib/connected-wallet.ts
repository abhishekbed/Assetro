/**
 * The wallet the issuer currently has connected in MetaMask. The api client
 * sends it as `X-Wallet-Address` so the backend can check it against the
 * issuer's registered wallet before any on-chain action.
 */
let connectedWallet: string | null = null;

export function setConnectedWallet(address: string | null | undefined) {
  connectedWallet = address ? address.toLowerCase() : null;
}

export function getConnectedWallet(): string | null {
  return connectedWallet;
}
