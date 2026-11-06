export interface DefaultSuiteAddresses {
  tokenAddress: string | null;
  identityRegistryAddress: string | null;
  claimTopicsAddress: string | null;
  trustedIssuersAddress: string | null;
  complianceAddress: string | null;
}

export function getDefaultSuiteAddresses(chainId?: number): DefaultSuiteAddresses {
  if (chainId === 11155111) {
    return {
      tokenAddress: process.env.NEXT_PUBLIC_SEPOLIA_TOKEN_PROXY_ADDRESS || null,
      identityRegistryAddress:
        process.env.NEXT_PUBLIC_SEPOLIA_IDENTITY_REGISTRY_ADDRESS || null,
      claimTopicsAddress:
        process.env.NEXT_PUBLIC_SEPOLIA_CLAIM_TOPICS_REGISTRY_ADDRESS || null,
      trustedIssuersAddress:
        process.env.NEXT_PUBLIC_SEPOLIA_TRUSTED_ISSUERS_REGISTRY_ADDRESS || null,
      complianceAddress:
        process.env.NEXT_PUBLIC_SEPOLIA_MODULAR_COMPLIANCE_ADDRESS || null,
    };
  }

  return {
    tokenAddress: null,
    identityRegistryAddress: null,
    claimTopicsAddress: null,
    trustedIssuersAddress: null,
    complianceAddress: null,
  };
}

export function getIdFactoryAddress(chainId?: number): string | null {
  if (chainId === 5042002) {
    return process.env.NEXT_PUBLIC_ID_FACTORY_ADDRESS_5042002 || null;
  }
  if (chainId === 11155111) {
    return process.env.NEXT_PUBLIC_ID_FACTORY_ADDRESS_11155111 || null;
  }
  return null;
}
