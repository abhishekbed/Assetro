import {
  Injectable,
  Logger,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';
import { IdentityDeploymentService } from './identity-deployment.service';
import { TrustedIssuersRegistryService } from './trusted-issuers-registry.service';

// ── Claim topic constants ─────────────────────────────────────────────────────
// Topics 1-3 are ALWAYS issued on investor approval (the three mandatory ERC-3643 claims).
// Topic 4 is optional — country is also stored in IdentityRegistry.registerIdentity().
export const CLAIM_TOPICS = {
  KYC: 1,                 // Identity / KYC verification passed
  AML: 2,                 // Anti-money laundering check passed
  ACCREDITED_INVESTOR: 3, // Investor accreditation status
  COUNTRY_OF_RESIDENCE: 4, // Optional; preferred path is IdentityRegistry country param
} as const;

export const CLAIM_TOPIC_NAMES: Record<number, string> = {
  [CLAIM_TOPICS.KYC]: 'KYC',
  [CLAIM_TOPICS.AML]: 'AML',
  [CLAIM_TOPICS.ACCREDITED_INVESTOR]: 'ACCREDITED_INVESTOR',
  [CLAIM_TOPICS.COUNTRY_OF_RESIDENCE]: 'COUNTRY_OF_RESIDENCE',
};

export type ClaimTopic = (typeof CLAIM_TOPICS)[keyof typeof CLAIM_TOPICS];

// ── ABIs ──────────────────────────────────────────────────────────────────────

const IDENTITY_ABI = [
  'function addClaim(uint256 _topic, uint256 _scheme, address _issuer, bytes calldata _signature, bytes calldata _data, string calldata _uri) external returns (bytes32 claimId)',
  'function removeClaim(bytes32 _claimId) external returns (bool)',
  'function getClaim(bytes32 _claimId) external view returns (uint256 topic, uint256 scheme, address issuer, bytes memory signature, bytes memory data, string memory uri)',
  'function getClaimIdsByTopic(uint256 _topic) external view returns (bytes32[] memory)',
];

// ── Result interfaces ─────────────────────────────────────────────────────────

export interface ClaimVerificationResult {
  exists: boolean;
  claimId: string | null;
  signatureValid: boolean;
  issuerAddress: string | null;
  issuerTrusted: boolean;
  topic: number;
  topicName: string;
}

export interface IssueClaimResult {
  topic: number;
  topicName: string;
  txHash: string;
  claimId: string;
  verified: boolean;
  signatureValid: boolean;
  issuerTrusted: boolean;
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class ClaimIssuanceService {
  private readonly logger = new Logger(ClaimIssuanceService.name);
  private providerCache: ethers.JsonRpcProvider | null = null;
  private claimIssuerSignerCache: ethers.Wallet | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly identityDeployment: IdentityDeploymentService,
    private readonly trustedIssuersRegistry: TrustedIssuersRegistryService,
  ) {}

  // ── Provider / signer ─────────────────────────────────────────────────────

  private getProvider(): ethers.JsonRpcProvider {
    if (!this.providerCache) {
      const mode = this.config.get<string>('BLOCKCHAIN_MODE', 'local');
      const rpcUrl =
        mode === 'local'
          ? this.config.get<string>('LOCAL_BLOCKCHAIN_RPC_URL')
          : (this.config.get<string>('SEPOLIA_RPC_URL') ||
             this.config.get<string>('NEXT_PUBLIC_ETHEREUM_TESTNET_RPC_URL'));
      if (!rpcUrl) {
        throw new InternalServerErrorException(
          mode === 'local'
            ? '[ClaimIssuance] BLOCKCHAIN_MODE=local requires LOCAL_BLOCKCHAIN_RPC_URL. ' +
              'Point it to a local Hardhat/Anvil node with ONCHAINID contracts deployed.'
            : '[ClaimIssuance] SEPOLIA_RPC_URL not configured',
        );
      }
      this.providerCache = new ethers.JsonRpcProvider(rpcUrl, undefined, { staticNetwork: true });
    }
    return this.providerCache;
  }

  private getClaimIssuerSigner(): ethers.Wallet {
    if (!this.claimIssuerSignerCache) {
      const pk = this.config.get<string>('CLAIM_ISSUER_PRIVATE_KEY');
      if (!pk)
        throw new InternalServerErrorException('[ClaimIssuance] CLAIM_ISSUER_PRIVATE_KEY not configured');
      this.claimIssuerSignerCache = new ethers.Wallet(
        pk.startsWith('0x') ? pk : `0x${pk}`,
        this.getProvider(),
      );
    }
    return this.claimIssuerSignerCache;
  }

  private getClaimIssuerAddress(): string {
    const addr = this.config.get<string>('CLAIM_ISSUER_ADDRESS');
    if (!addr)
      throw new InternalServerErrorException('[ClaimIssuance] CLAIM_ISSUER_ADDRESS not configured');
    return addr;
  }

  // ── Core: always issues KYC + AML + ACCREDITED_INVESTOR ──────────────────

  /**
   * Issue the three mandatory ERC-3643 on-chain claims after ONCHAINID deployment:
   *   1. KYC  (topic 1) — identity / KYC verification passed
   *   2. AML  (topic 2) — anti-money laundering check passed
   *   3. ACCREDITED_INVESTOR (topic 3) — accreditation status
   *   4. COUNTRY_OF_RESIDENCE (topic 4) — optional
   *
   * Each claim is verified on-chain immediately after issuance:
   *   • claim exists (getClaimIdsByTopic)
   *   • signature valid (recover signer from stored sig)
   *   • issuer trusted (TrustedIssuersRegistry — best-effort)
   */
  async issueKycClaims(
    userId: string,
    walletAddress: string,
    claimData: {
      isAccredited?: boolean;
      countryCode?: number;
    },
  ): Promise<IssueClaimResult[]> {
    const identity = await this.identityDeployment.getIdentityByUser(userId);
    if (!identity) {
      throw new NotFoundException(`No deployed identity found for user ${userId}`);
    }

    this.logger.log(`══════════════════════════════════════════════════════════════`);
    this.logger.log(
      `[ClaimIssuance] issueKycClaims START  user=${userId}  identity=${identity.identityContractAddress}`,
    );
    this.logger.log(`══════════════════════════════════════════════════════════════`);

    const results: IssueClaimResult[] = [];

    // ── 1. KYC ────────────────────────────────────────────────────────────
    this.logger.log(`[ClaimIssuance] → Issuing KYC claim  topic=${CLAIM_TOPICS.KYC}`);
    const kycResult = await this.issueAndVerify(
      identity.identityContractAddress,
      CLAIM_TOPICS.KYC,
      ethers.toUtf8Bytes('KYC_APPROVED'),
    );
    results.push(kycResult);
    await this.identityDeployment.updateClaimTopics(identity.id, CLAIM_TOPICS.KYC, kycResult.txHash);
    this.logger.log(
      `[ClaimIssuance] ✓ KYC  tx=${kycResult.txHash}  exists=${kycResult.verified}  sigValid=${kycResult.signatureValid}  trusted=${kycResult.issuerTrusted}`,
    );

    // ── 2. AML ────────────────────────────────────────────────────────────
    this.logger.log(`[ClaimIssuance] → Issuing AML claim  topic=${CLAIM_TOPICS.AML}`);
    const amlResult = await this.issueAndVerify(
      identity.identityContractAddress,
      CLAIM_TOPICS.AML,
      ethers.toUtf8Bytes('AML_APPROVED'),
    );
    results.push(amlResult);
    await this.identityDeployment.updateClaimTopics(identity.id, CLAIM_TOPICS.AML, amlResult.txHash);
    this.logger.log(
      `[ClaimIssuance] ✓ AML  tx=${amlResult.txHash}  exists=${amlResult.verified}  sigValid=${amlResult.signatureValid}  trusted=${amlResult.issuerTrusted}`,
    );

    // ── 3. ACCREDITED_INVESTOR ────────────────────────────────────────────
    // Encoded as uint256: 1 = accredited, 0 = not accredited
    this.logger.log(
      `[ClaimIssuance] → Issuing ACCREDITED_INVESTOR claim  topic=${CLAIM_TOPICS.ACCREDITED_INVESTOR}  isAccredited=${claimData.isAccredited ?? false}`,
    );
    const accreditedData = ethers.getBytes(
      ethers.AbiCoder.defaultAbiCoder().encode(['uint256'], [claimData.isAccredited ? 1 : 0]),
    );
    const accreditedResult = await this.issueAndVerify(
      identity.identityContractAddress,
      CLAIM_TOPICS.ACCREDITED_INVESTOR,
      accreditedData,
    );
    results.push(accreditedResult);
    await this.identityDeployment.updateClaimTopics(
      identity.id,
      CLAIM_TOPICS.ACCREDITED_INVESTOR,
      accreditedResult.txHash,
    );
    this.logger.log(
      `[ClaimIssuance] ✓ ACCREDITED_INVESTOR  tx=${accreditedResult.txHash}  exists=${accreditedResult.verified}  sigValid=${accreditedResult.signatureValid}`,
    );

    // ── 4. COUNTRY_OF_RESIDENCE (optional) ────────────────────────────────
    if (claimData.countryCode !== undefined) {
      this.logger.log(
        `[ClaimIssuance] → Issuing COUNTRY_OF_RESIDENCE claim  topic=${CLAIM_TOPICS.COUNTRY_OF_RESIDENCE}  country=${claimData.countryCode}`,
      );
      const countryData = ethers.getBytes(
        ethers.AbiCoder.defaultAbiCoder().encode(['uint256'], [claimData.countryCode]),
      );
      const countryResult = await this.issueAndVerify(
        identity.identityContractAddress,
        CLAIM_TOPICS.COUNTRY_OF_RESIDENCE,
        countryData,
      );
      results.push(countryResult);
      await this.identityDeployment.updateClaimTopics(
        identity.id,
        CLAIM_TOPICS.COUNTRY_OF_RESIDENCE,
        countryResult.txHash,
      );
      this.logger.log(
        `[ClaimIssuance] ✓ COUNTRY_OF_RESIDENCE  tx=${countryResult.txHash}  exists=${countryResult.verified}`,
      );
    }

    this.logger.log(`══════════════════════════════════════════════════════════════`);
    this.logger.log(
      `[ClaimIssuance] issueKycClaims COMPLETE  user=${userId}  claims=${results.length}  identity=${identity.identityContractAddress}`,
    );
    this.logger.log(`══════════════════════════════════════════════════════════════`);

    return results;
  }

  // ── Issue one claim then verify it ────────────────────────────────────────

  private async issueAndVerify(
    identityAddress: string,
    topic: number,
    data: Uint8Array,
  ): Promise<IssueClaimResult> {
    const topicName = CLAIM_TOPIC_NAMES[topic] ?? `TOPIC_${topic}`;
    const txHash = await this.issueClaim(identityAddress, topic, data);
    const verification = await this.verifyClaimOnchain(identityAddress, topic, data);
    return {
      topic,
      topicName,
      txHash,
      claimId: verification.claimId ?? '',
      verified: verification.exists,
      signatureValid: verification.signatureValid,
      issuerTrusted: verification.issuerTrusted,
    };
  }

  // ── Low-level: sign + addClaim on the identity contract ──────────────────

  async issueClaim(
    identityAddress: string,
    topic: number,
    data: Uint8Array,
  ): Promise<string> {
    const claimIssuerAddress = this.getClaimIssuerAddress();
    const signer = this.getClaimIssuerSigner();

    const claimSignature = await this.signClaim(identityAddress, topic, data, signer);

    this.logger.log(
      `[ClaimIssuance] addClaim  identity=${identityAddress}  topic=${topic}  issuer=${claimIssuerAddress}`,
    );

    // Call identity.addClaim() directly from the deployer EOA.
    // The deployer has MANAGEMENT key (purpose 1) on all identities deployed via
    // createIdentityWithManagementKeys — and keyHasPurpose(key, ANY_PURPOSE) returns
    // true when key holds purpose 1 (MANAGEMENT), satisfying onlyClaimKey modifier.
    // _issuer = ClaimIssuer contract; isClaimValid() verifies the EOA signed it.
    const identity = new ethers.Contract(identityAddress, IDENTITY_ABI, signer);
    const tx = await identity.addClaim(
      topic,
      1, // scheme: ECDSA
      claimIssuerAddress,
      claimSignature,
      data,
      '', // uri — empty for platform-issued claims
    );
    const receipt: ethers.TransactionReceipt = await tx.wait();

    this.logger.log(
      `[ClaimIssuance] addClaim tx confirmed  topic=${topic}  tx=${receipt.hash}  block=${receipt.blockNumber}`,
    );

    return receipt.hash;
  }

  // ── On-chain verification ─────────────────────────────────────────────────

  /**
   * Verify a claim that was just issued on-chain. Three checks:
   *
   *   1. Claim exists    — getClaimIdsByTopic() returns a non-empty list
   *   2. Signature valid — stored signature recovers to CLAIM_ISSUER_ADDRESS
   *   3. Issuer trusted  — TrustedIssuersRegistry.isTrustedIssuer() (best-effort;
   *                        requires TRUSTED_ISSUERS_REGISTRY_ADDRESS env var)
   *
   * If TRUSTED_ISSUERS_REGISTRY_ADDRESS is not set, issuerTrusted falls back to
   * signatureValid (our platform key signed it → implicitly trusted).
   */
  async verifyClaimOnchain(
    identityAddress: string,
    topic: number,
    expectedData: Uint8Array,
  ): Promise<ClaimVerificationResult> {
    const topicName = CLAIM_TOPIC_NAMES[topic] ?? `TOPIC_${topic}`;
    const provider = this.getProvider();
    const identity = new ethers.Contract(identityAddress, IDENTITY_ABI, provider);

    // ── 1. Claim exists? ───────────────────────────────────────────────────
    let claimId: string | null = null;
    let exists = false;

    try {
      const claimIds: string[] = await identity.getClaimIdsByTopic(topic);
      if (claimIds.length > 0) {
        claimId = claimIds[0];
        exists = true;
        this.logger.log(
          `[ClaimIssuance] ✓ Claim exists  identity=${identityAddress}  topic=${topic}  claimId=${claimId}`,
        );
      } else {
        this.logger.error(
          `[ClaimIssuance] ✗ Claim NOT found on-chain after tx  identity=${identityAddress}  topic=${topic}`,
        );
      }
    } catch (err: unknown) {
      this.logger.error(
        `[ClaimIssuance] getClaimIdsByTopic failed  topic=${topic}: ${(err as Error).message}`,
      );
    }

    // ── 2. Signature valid? ────────────────────────────────────────────────
    let signatureValid = false;
    let issuerAddress: string | null = null;

    if (claimId) {
      try {
        const claim = await identity.getClaim(claimId);
        issuerAddress = claim.issuer as string;

        // Recompute the hash that was signed: keccak256(abi.encode(identity, topic, data))
        const dataHash = ethers.keccak256(
          ethers.AbiCoder.defaultAbiCoder().encode(
            ['address', 'uint256', 'bytes'],
            [identityAddress, topic, expectedData],
          ),
        );

        // Recover the signer from the EIP-191 personal_sign signature stored on-chain
        const recoveredSigner = ethers.verifyMessage(ethers.getBytes(dataHash), claim.signature as string);
        const expectedIssuer = this.getClaimIssuerAddress();
        signatureValid = recoveredSigner.toLowerCase() === expectedIssuer.toLowerCase();

        if (signatureValid) {
          this.logger.log(
            `[ClaimIssuance] ✓ Signature valid  topic=${topic}  signer=${recoveredSigner}`,
          );
        } else {
          this.logger.error(
            `[ClaimIssuance] ✗ Signature INVALID  topic=${topic}  recovered=${recoveredSigner}  expected=${expectedIssuer}`,
          );
        }
      } catch (err: unknown) {
        this.logger.error(
          `[ClaimIssuance] Signature verification failed  topic=${topic}: ${(err as Error).message}`,
        );
      }
    }

    // ── 3. Issuer trusted? (best-effort) ───────────────────────────────────
    let issuerTrusted = false;
    const tirAddress = this.config.get<string>('TRUSTED_ISSUERS_REGISTRY_ADDRESS');

    if (tirAddress && issuerAddress) {
      try {
        issuerTrusted = await this.trustedIssuersRegistry.isTrustedIssuer(tirAddress, issuerAddress);
        if (issuerTrusted) {
          this.logger.log(
            `[ClaimIssuance] ✓ Issuer trusted  address=${issuerAddress}  tir=${tirAddress}`,
          );
        } else {
          this.logger.warn(
            `[ClaimIssuance] ⚠ Issuer NOT in TrustedIssuersRegistry  address=${issuerAddress}  tir=${tirAddress}`,
          );
        }
      } catch (err: unknown) {
        this.logger.warn(`[ClaimIssuance] TIR check error: ${(err as Error).message}`);
      }
    } else {
      // No TIR address configured — fall back to signature as trust signal
      issuerTrusted = signatureValid;
      if (!tirAddress) {
        this.logger.debug(
          `[ClaimIssuance] TRUSTED_ISSUERS_REGISTRY_ADDRESS not set — using signatureValid as issuerTrusted`,
        );
      }
    }

    return { exists, claimId, signatureValid, issuerAddress, issuerTrusted, topic, topicName };
  }

  // ── Revoke ────────────────────────────────────────────────────────────────

  async revokeClaim(userId: string, topic: number): Promise<string> {
    const identity = await this.identityDeployment.getIdentityByUser(userId);
    if (!identity) throw new NotFoundException(`No identity found for user ${userId}`);

    const signer = this.getClaimIssuerSigner();
    const identityContract = new ethers.Contract(
      identity.identityContractAddress,
      IDENTITY_ABI,
      signer,
    );

    const claimIds: string[] = await identityContract.getClaimIdsByTopic(topic);
    if (!claimIds.length) {
      this.logger.warn(
        `[ClaimIssuance] No claim found for topic ${topic} on identity ${identity.identityContractAddress}`,
      );
      return '';
    }

    const tx = await identityContract.removeClaim(claimIds[0]);
    const receipt: ethers.TransactionReceipt = await tx.wait();
    this.logger.log(
      `[ClaimIssuance] Claim revoked  topic=${topic}  user=${userId}  tx=${receipt.hash}`,
    );
    return receipt.hash;
  }

  // ── Private: EIP-191 claim signature ─────────────────────────────────────

  private async signClaim(
    identityAddress: string,
    topic: number,
    data: Uint8Array,
    signer: ethers.Wallet,
  ): Promise<string> {
    const dataHash = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ['address', 'uint256', 'bytes'],
        [identityAddress, topic, data],
      ),
    );
    // personal_sign (EIP-191) — matches what ONCHAINID's isClaimValid() verifies
    return signer.signMessage(ethers.getBytes(dataHash));
  }
}
