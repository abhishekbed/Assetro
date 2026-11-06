export function getTokenFactoryAddress(chainId: number): string | null {
  const envByChain =
    chainId === 1
      ? process.env.NEXT_PUBLIC_TOKEN_FACTORY_ADDRESS_1
      : chainId === 137
      ? process.env.NEXT_PUBLIC_TOKEN_FACTORY_ADDRESS_137
      : chainId === 11155111
      ? process.env.NEXT_PUBLIC_TOKEN_FACTORY_ADDRESS_11155111 ||
        process.env.NEXT_PUBLIC_TREX_FACTORY_ADDRESS_11155111 ||
        process.env.NEXT_PUBLIC_SEPOLIA_FACTORY_ADDRESS
      : chainId === 5042002
      ? process.env.NEXT_PUBLIC_TOKEN_FACTORY_ADDRESS_5042002 ||
        process.env.NEXT_PUBLIC_TREX_FACTORY_ADDRESS_5042002
      : chainId === 80002
      ? process.env.NEXT_PUBLIC_TOKEN_FACTORY_ADDRESS_80002
      : chainId === 8272
      ? process.env.NEXT_PUBLIC_TOKEN_FACTORY_ADDRESS_8272
      : undefined;

  return envByChain || process.env.NEXT_PUBLIC_TOKEN_FACTORY_ADDRESS || null;
}

export function getTokenFactoryAddressEnvNames(chainId: number): string[] {
  if (chainId === 5042002) {
    return ['NEXT_PUBLIC_TOKEN_FACTORY_ADDRESS_5042002', 'NEXT_PUBLIC_TREX_FACTORY_ADDRESS_5042002'];
  }
  if (chainId === 11155111) {
    return [
      'NEXT_PUBLIC_TOKEN_FACTORY_ADDRESS_11155111',
      'NEXT_PUBLIC_SEPOLIA_FACTORY_ADDRESS',
      'FACTORY_ADDRESS',
    ];
  }

  if (chainId === 1) {
    return ['NEXT_PUBLIC_TOKEN_FACTORY_ADDRESS_1', 'NEXT_PUBLIC_TOKEN_FACTORY_ADDRESS'];
  }

  if (chainId === 137) {
    return ['NEXT_PUBLIC_TOKEN_FACTORY_ADDRESS_137', 'NEXT_PUBLIC_TOKEN_FACTORY_ADDRESS'];
  }

  if (chainId === 80002) {
    return ['NEXT_PUBLIC_TOKEN_FACTORY_ADDRESS_80002', 'NEXT_PUBLIC_TOKEN_FACTORY_ADDRESS'];
  }

  if (chainId === 8272) {
    return ['NEXT_PUBLIC_TOKEN_FACTORY_ADDRESS_8272', 'NEXT_PUBLIC_TOKEN_FACTORY_ADDRESS'];
  }

  return ['NEXT_PUBLIC_TOKEN_FACTORY_ADDRESS'];
}

export function getRpcUrlForChain(chainId: number): string | null {
  const envByChain =
    chainId === 1
      ? process.env.NEXT_PUBLIC_RPC_URL_1
      : chainId === 137
      ? process.env.NEXT_PUBLIC_RPC_URL_137
      : chainId === 11155111
      ? process.env.NEXT_PUBLIC_RPC_URL_11155111 ||
        process.env.NEXT_PUBLIC_ETHEREUM_TESTNET_RPC_URL
      : chainId === 5042002
      ? process.env.NEXT_PUBLIC_RPC_URL_5042002
      : chainId === 80002
      ? process.env.NEXT_PUBLIC_RPC_URL_80002 ||
        process.env.NEXT_PUBLIC_POLYGON_AMOY_RPC_URL
      : chainId === 8272
      ? process.env.NEXT_PUBLIC_RPC_URL_8272 ||
        process.env.NEXT_PUBLIC_BHARAT_RPC_URL
      : undefined;

  return envByChain || null;
}

export function getClaimIssuerAddress(chainId: number): string | null {
  if (chainId === 5042002) {
    return process.env.NEXT_PUBLIC_CLAIM_ISSUER_ADDRESS_5042002 || null;
  }
  if (chainId === 11155111) {
    return (
      process.env.NEXT_PUBLIC_CLAIM_ISSUER_ADDRESS_11155111 ||
      process.env.NEXT_PUBLIC_CLAIM_ISSUER_ADDRESS ||
      null
    );
  }
  return process.env.NEXT_PUBLIC_CLAIM_ISSUER_ADDRESS || null;
}

export function getTREXGatewayAddress(chainId: number): string | null {
  if (chainId === 5042002) {
    return process.env.NEXT_PUBLIC_TREX_GATEWAY_ADDRESS_5042002 || null;
  }
  if (chainId === 11155111) {
    return (
      process.env.NEXT_PUBLIC_TREX_GATEWAY_ADDRESS_11155111 ||
      process.env.NEXT_PUBLIC_TOKEN_GATEWAY_ADDRESS_11155111 ||
      null
    );
  }
  return process.env.NEXT_PUBLIC_TOKEN_GATEWAY_ADDRESS || null;
}
