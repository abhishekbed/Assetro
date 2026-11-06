import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';
import { OnchainIdentity } from '../entities/onchain-identity.entity';
import { InvestorClaim, ClaimStatus } from '../../kyc/entities/investor-claim.entity';
import { Whitelist } from '../../compliance/entities/whitelist.entity';
import { User } from '../../auth/entities/user.entity';
import { Token } from '../../tokens/entities/token.entity';
import { TrustedIssuersRegistryService } from './trusted-issuers-registry.service';
import { CLAIM_TOPIC_NAMES } from './claim-issuance.service';

// ── ABIs (minimal — read-only calls) ─────────────────────────────────────────

const IDENTITY_ABI = [
  'function getClaimIdsByTopic(uint256 _topic) external view returns (bytes32[] memory)',
  'function getClaim(bytes32 _claimId) external view returns (uint256 topic, uint256 scheme, address issuer, bytes memory signature, bytes memory data, string memory uri)',
  'function getKeysByPurpose(uint256 _purpose) external view returns (bytes32[] memory)',
];

const CLAIM_ISSUER_ABI = [
  'function isClaimValid(address _identity, uint256 claimTopic, bytes memory sig, bytes memory data) external view returns (bool)',
  'function keyHasPurpose(bytes32 _key, uint256 _purpose) external view returns (bool)',
];

const IDENTITY_REGISTRY_ABI = [
  'function isVerified(address _userAddress) external view returns (bool)',
  'function identity(address _userAddress) external view returns (address)',
  'function investorCountry(address _userAddress) external view returns (uint16)',
];

// ── Result types ──────────────────────────────────────────────────────────────

export interface ClaimSyncResult {
  topic: number;
  claimId: string | null;
  signatureValid: boolean;
  issuerTrusted: boolean;
  existed: boolean;
}

export interface WhitelistSyncResult {
  walletAddress: string;
  tokenId: string;
  irAddress: string;
  verifiedOnChain: boolean;
  registeredIdentity: string | null;
  countryCode: number;
}

export interface InvestorSyncReport {
  investorId: string;
  identityAddress: string | null;
  claimsSynced: ClaimSyncResult[];
  whitelistEntries: WhitelistSyncResult[];
  syncedAt: Date;
  errors: string[];
}

/** Pure chain-read result for GET /blockchain/identity/:wallet */
export interface ChainIdentityState {
  walletAddress: string;
  identityAddress: string | null;
  /** Identity address from DB record */
  dbIdentityAddress: string | null;
  /** true if chain identity matches DB record */
  identityAddressMatch: boolean;
  /** Management key hashes from identity contract */
  managementKeys: string[];
  /** Contract bytecode exists on-chain */
  contractDeployed: boolean;
  /** Per-token IR state */
  tokenStates: ChainTokenWhitelistState[];
  /** DB record, if exists */
  dbRecord: {
    deploymentTxHash: string | null;
    chainId: number;
    syncStatus: string | null;
    chainSyncedAt: Date | null;
    claimTopicsIssued: Record<string, string>;
    claimIds: Record<string, string>;
  } | null;
}

export interface ChainTokenWhitelistState {
  tokenId: string;
  irAddress: string;
  isVerified: boolean;
  registeredIdentity: string | null;
  countryCode: number;
}

/** Pure chain-read result for GET /blockchain/verify/:wallet */
export interface ChainVerificationState extends ChainIdentityState {
  claims: ChainClaimState[];
  fullyVerified: boolean; // all claims + at least one IR whitelist
}

export interface ChainClaimState {
  topic: number;
  topicName: string;
  claimId: string | null;
  exists: boolean;
  signatureValid: boolean;
  issuerTrusted: boolean;
}

// ── Service ───────────────────────────────────────────────────────────────────

/**
 * BlockchainSyncService — the single place that reads from the blockchain and
 * writes the results back to the DB mirror.
 *
 * Design rule: every public method reads state from chain FIRST, then writes DB.
 * The DB is NEVER treated as authoritative for eligibility decisions.
 */
@Injectable()
export class BlockchainSyncService {
  private readonly logger = new Logger(BlockchainSyncService.name);
  private providerCache: ethers.JsonRpcProvider | null = null;

  constructor(
    @InjectRepository(OnchainIdentity)
    private readonly identityRepo: Repository<OnchainIdentity>,
    @InjectRepository(InvestorClaim)
    private readonly claimRepo: Repository<InvestorClaim>,
    @InjectRepository(Whitelist)
    private readonly whitelistRepo: Repository<Whitelist>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Token)
    private readonly tokenRepo: Repository<Token>,
    private readonly config: ConfigService,
    private readonly trustedIssuersRegistry: TrustedIssuersRegistryService,
  ) {}

  // ── Provider ──────────────────────────────────────────────────────────────

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
            ? '[BlockchainSync] BLOCKCHAIN_MODE=local requires LOCAL_BLOCKCHAIN_RPC_URL'
            : '[BlockchainSync] SEPOLIA_RPC_URL not configured',
        );
      }
      this.providerCache = new ethers.JsonRpcProvider(rpcUrl, undefined, { staticNetwork: true });
    }
    return this.providerCache;
  }

  // ── Claims sync ───────────────────────────────────────────────────────────

  /**
   * Read all KYC claims from the ONCHAINID contract on-chain and update:
   *   • investor_claims.claim_id
   *   • investor_claims.signature_valid
   *   • investor_claims.issuer_trusted
   *   • investor_claims.chain_synced_at
   *   • onchain_identities.claim_ids       (topic → bytes32 claimId)
   *   • onchain_identities.sync_status
   *   • onchain_identities.chain_synced_at
   *
   * Chain is authoritative. If the claim no longer exists on-chain the DB row
   * is marked REVOKED.
   */
  async syncClaims(userId: string, identityAddress: string): Promise<ClaimSyncResult[]> {
    this.logger.log(
      `[Sync] syncClaims START  user=${userId}  identity=${identityAddress}`,
    );

    const provider = this.getProvider();
    const identityContract = new ethers.Contract(identityAddress, IDENTITY_ABI, provider);
    const claimIssuerAddress = this.config.get<string>('CLAIM_ISSUER_ADDRESS') ?? '';
    const tirAddress = this.config.get<string>('TRUSTED_ISSUERS_REGISTRY_ADDRESS');

    const mandatoryTopics = [1, 2, 3]; // KYC, AML, ACCREDITED_INVESTOR
    const results: ClaimSyncResult[] = [];
    const claimIdsMap: Record<string, string> = {};
    const now = new Date();

    for (const topic of mandatoryTopics) {
      let claimId: string | null = null;
      let signatureValid = false;
      let issuerTrusted = false;
      let existed = false;

      try {
        const claimIds: string[] = await identityContract.getClaimIdsByTopic(topic);
        existed = claimIds.length > 0;

        if (existed) {
          claimId = claimIds[0];
          claimIdsMap[String(topic)] = claimId;
          this.logger.log(
            `[Sync] ✓ Claim exists on-chain  identity=${identityAddress}  topic=${topic}  claimId=${claimId}`,
          );

          // Read the claim and verify signature
          const claim = await identityContract.getClaim(claimId);
          const issuerAddr: string = claim.issuer;

          // Recompute EIP-191 hash and recover signer
          try {
            const dataHash = ethers.keccak256(
              ethers.AbiCoder.defaultAbiCoder().encode(
                ['address', 'uint256', 'bytes'],
                [identityAddress, topic, claim.data],
              ),
            );
            const recovered = ethers.verifyMessage(ethers.getBytes(dataHash), claim.signature as string);
            signatureValid = await this.isClaimSignatureValid(
              identityAddress,
              topic,
              claim.issuer as string,
              claim.signature as string,
              claim.data as string,
              recovered,
            );
            this.logger.log(
              `[Sync] Signature  topic=${topic}  valid=${signatureValid}  recovered=${recovered}`,
            );
          } catch (err: unknown) {
            this.logger.warn(`[Sync] Signature check failed topic=${topic}: ${(err as Error).message}`);
          }

          // Check TrustedIssuersRegistry
          if (tirAddress && issuerAddr) {
            try {
              issuerTrusted = await this.trustedIssuersRegistry.isTrustedIssuer(tirAddress, issuerAddr);
            } catch (err: unknown) {
              this.logger.warn(`[Sync] TIR check failed topic=${topic}: ${(err as Error).message}`);
              issuerTrusted = signatureValid; // fall back
            }
          } else {
            issuerTrusted = signatureValid; // no TIR configured — signature is the trust signal
          }

          this.logger.log(
            `[Sync] Claim verified  topic=${topic}  sigValid=${signatureValid}  trusted=${issuerTrusted}`,
          );
        } else {
          this.logger.warn(
            `[Sync] Claim NOT found on-chain  identity=${identityAddress}  topic=${topic}`,
          );
        }
      } catch (err: unknown) {
        this.logger.error(
          `[Sync] Error reading claim topic=${topic} from chain: ${(err as Error).message}`,
        );
      }

      // Upsert investor_claims row with chain-read data
      await this.claimRepo.upsert(
        {
          investorId: userId,
          identityContract: identityAddress,
          claimTopic: topic,
          claimTopicName: CLAIM_TOPIC_NAMES[topic] ?? `TOPIC_${topic}`,
          issuerAddress: claimIssuerAddress,
          claimId,
          signatureValid,
          issuerTrusted,
          chainSyncedAt: now,
          chainId: parseInt(this.config.get<string>('DEFAULT_CHAIN_ID', '11155111'), 10),
          status: existed ? ClaimStatus.ACTIVE : ClaimStatus.REVOKED,
          issuedAt: now,
        },
        {
          conflictPaths: ['investorId', 'claimTopic'],
          skipUpdateIfNoValuesChanged: false,
        },
      );

      results.push({ topic, claimId, signatureValid, issuerTrusted, existed });
    }

    // Update onchain_identities with claim IDs and sync status
    const allExist = results.every((r) => r.existed);
    await this.identityRepo.update(
      { userId, identityContractAddress: identityAddress },
      {
        claimIds: claimIdsMap,
        syncStatus: allExist ? 'synced' : 'stale',
        chainSyncedAt: now,
        syncError: allExist ? null : 'One or more mandatory claims missing on-chain',
      },
    );

    this.logger.log(
      `[Sync] syncClaims COMPLETE  user=${userId}  topics=${results.map((r) => r.topic).join(',')}  allExist=${allExist}`,
    );

    return results;
  }

  // ── Whitelist entry sync ──────────────────────────────────────────────────

  /**
   * Read IR.isVerified(wallet), IR.identity(wallet), IR.investorCountry(wallet)
   * from the chain and upsert the whitelists row.
   *
   * This makes the DB mirror accurate: verified_on_chain reflects what the chain
   * actually says, not what the last DB write said.
   */
  async syncWhitelistEntry(
    walletAddress: string,
    tokenId: string,
    irAddress: string,
    opts: {
      userId?: string;
      txHash?: string;
      countryCode?: number;
      country?: string;
    } = {},
  ): Promise<WhitelistSyncResult> {
    this.logger.log(
      `[Sync] syncWhitelist  wallet=${walletAddress}  token=${tokenId}  ir=${irAddress}`,
    );

    const provider = this.getProvider();
    const ir = new ethers.Contract(irAddress, IDENTITY_REGISTRY_ABI, provider);
    const now = new Date();

    let verifiedOnChain = false;
    let registeredIdentity: string | null = null;
    let countryCode = opts.countryCode ?? 0;

    try {
      [verifiedOnChain, registeredIdentity] = await Promise.all([
        ir.isVerified(walletAddress) as Promise<boolean>,
        (ir.identity(walletAddress) as Promise<string>).then((addr) =>
          addr === ethers.ZeroAddress ? null : addr,
        ),
      ]);
      this.logger.log(
        `[Sync] IR.isVerified(${walletAddress}) = ${verifiedOnChain}  identity=${registeredIdentity ?? 'not registered'}`,
      );
    } catch (err: unknown) {
      this.logger.error(
        `[Sync] IR read failed wallet=${walletAddress} ir=${irAddress}: ${(err as Error).message}`,
      );
    }

    try {
      const onChainCountry: number = Number(await ir.investorCountry(walletAddress));
      if (onChainCountry > 0) countryCode = onChainCountry;
      this.logger.log(`[Sync] IR.investorCountry(${walletAddress}) = ${onChainCountry}`);
    } catch {
      // investorCountry may revert if not registered — use supplied countryCode
    }

    // Upsert the whitelist row with on-chain data
    const existing = await this.whitelistRepo.findOne({
      where: { tokenId, walletAddress: walletAddress.toLowerCase() },
    });

    if (existing) {
      await this.whitelistRepo.update(existing.id, {
        verifiedOnChain,
        verificationTxHash: opts.txHash ?? existing.verificationTxHash,
        irAddress,
        countryCode,
        chainSyncedAt: now,
        isActive: verifiedOnChain, // DB active status mirrors chain whitelist status
      });
      this.logger.log(
        `[Sync] Updated whitelist row  token=${tokenId}  wallet=${walletAddress}  verifiedOnChain=${verifiedOnChain}`,
      );
    } else {
      // Row doesn't exist yet — create it
      const token = await this.tokenRepo.findOne({ where: { id: tokenId } });
      const newEntry = this.whitelistRepo.create({
        tokenId,
        userId: opts.userId ?? null,
        walletAddress: walletAddress.toLowerCase(),
        country: opts.country ?? null,
        countryCode,
        irAddress,
        verifiedOnChain,
        verificationTxHash: opts.txHash ?? null,
        chainSyncedAt: now,
        isActive: verifiedOnChain,
        verifiedAt: verifiedOnChain ? now : null,
      });
      await this.whitelistRepo.save(newEntry);
      this.logger.log(
        `[Sync] Created whitelist row  token=${tokenId}  wallet=${walletAddress}  verifiedOnChain=${verifiedOnChain}`,
      );
    }

    return { walletAddress, tokenId, irAddress, verifiedOnChain, registeredIdentity, countryCode };
  }

  // ── Full investor sync ────────────────────────────────────────────────────

  /**
   * Full re-sync for one investor: reads claims from ONCHAINID contract, then
   * reads IR.isVerified() for every token the issuer has deployed, and writes all
   * results to the DB mirror.
   *
   * Safe to call at any time — idempotent.
   */
  async syncAllForInvestor(investorId: string): Promise<InvestorSyncReport> {
    const now = new Date();
    const errors: string[] = [];
    const claimsSynced: ClaimSyncResult[] = [];
    const whitelistEntries: WhitelistSyncResult[] = [];

    this.logger.log(`══════════════════════════════════════════════════════════════`);
    this.logger.log(`[Sync] syncAllForInvestor START  investor=${investorId}`);

    const user = await this.userRepo.findOne({ where: { id: investorId } });
    const walletAddress = user?.walletAddress ?? '';
    const identityRecord = await this.identityRepo.findOne({ where: { userId: investorId } });
    const identityAddress =
      user?.identityContractAddress ??
      identityRecord?.identityContractAddress ??
      null;

    if (!identityAddress || !walletAddress) {
      this.logger.warn(
        `[Sync] investor=${investorId} has no identity or wallet — sync skipped`,
      );
      return { investorId, identityAddress, claimsSynced, whitelistEntries, syncedAt: now, errors };
    }

    // ── Sync claims ───────────────────────────────────────────────────────────
    try {
      const results = await this.syncClaims(investorId, identityAddress);
      claimsSynced.push(...results);
    } catch (err: unknown) {
      const msg = `Claims sync failed: ${(err as Error).message}`;
      this.logger.error(`[Sync] ${msg}`);
      errors.push(msg);

      // Mark identity record as error
      await this.identityRepo.update(
        { userId: investorId, identityContractAddress: identityAddress },
        { syncStatus: 'error', syncError: msg, chainSyncedAt: now },
      );
    }

    // ── Sync whitelist for all deployed tokens ────────────────────────────────
    const tokens = await this.tokenRepo
      .createQueryBuilder('t')
      .where('t.identity_registry_address IS NOT NULL')
      .getMany();

    for (const token of tokens) {
      if (!token.identityRegistryAddress) continue;
      try {
        const result = await this.syncWhitelistEntry(walletAddress, token.id, token.identityRegistryAddress, {
          userId: investorId,
        });
        whitelistEntries.push(result);
      } catch (err: unknown) {
        const msg = `Whitelist sync failed for token ${token.id}: ${(err as Error).message}`;
        this.logger.warn(`[Sync] ${msg}`);
        errors.push(msg);
      }
    }

    this.logger.log(
      `[Sync] syncAllForInvestor COMPLETE  investor=${investorId}  claims=${claimsSynced.length}  whitelist=${whitelistEntries.length}  errors=${errors.length}`,
    );
    this.logger.log(`══════════════════════════════════════════════════════════════`);

    return { investorId, identityAddress, claimsSynced, whitelistEntries, syncedAt: now, errors };
  }

  async syncAllForWallet(walletAddress: string): Promise<InvestorSyncReport | null> {
    const user = await this.userRepo.findOne({
      where: { walletAddress: ethers.getAddress(walletAddress) },
    });

    if (!user) {
      const lowerUser = await this.userRepo.findOne({
        where: { walletAddress: walletAddress.toLowerCase() },
      });
      if (!lowerUser) {
        this.logger.warn(`[Sync] No platform user found for wallet ${walletAddress}`);
        return null;
      }
      return this.syncAllForInvestor(lowerUser.id);
    }

    return this.syncAllForInvestor(user.id);
  }

  // ── Pure chain reads (no DB writes) ──────────────────────────────────────

  /**
   * Read the full on-chain identity state for a wallet address.
   * Pure read — does NOT write to the DB.
   * Used by GET /blockchain/identity/:wallet.
   */
  async readIdentityOnChain(walletAddress: string): Promise<ChainIdentityState> {
    const provider = this.getProvider();

    // Resolve from DB. Compare case-insensitively: the column holds both
    // checksummed and lowercase addresses depending on which code path wrote
    // the row, and Postgres varchar equality is case-sensitive.
    // Where historical duplicates exist for one wallet, prefer the row that
    // actually owns an ONCHAINID record; fall back to the oldest.
    const user = await this.userRepo
      .createQueryBuilder('u')
      .leftJoin('onchain_identities', 'oi', 'oi.user_id = u.id')
      .where('LOWER(u.wallet_address) = LOWER(:wallet)', { wallet: walletAddress })
      .orderBy('CASE WHEN oi.id IS NULL THEN 1 ELSE 0 END', 'ASC')
      .addOrderBy('u.created_at', 'ASC')
      .getOne();
    const dbRecord = user
      ? await this.identityRepo.findOne({ where: { userId: user.id } })
      : null;

    if (!user) {
      this.logger.warn(
        `[ReadChain] No platform user matches wallet ${walletAddress} — ` +
          `reporting chain state only, with no DB mirror.`,
      );
    }

    const dbIdentityAddress = dbRecord?.identityContractAddress ?? null;

    // Verify bytecode exists on-chain for DB identity
    let contractDeployed = false;
    let identityAddress: string | null = dbIdentityAddress;
    let managementKeys: string[] = [];

    if (dbIdentityAddress) {
      try {
        const code = await provider.getCode(dbIdentityAddress);
        contractDeployed = code !== '0x' && code.length > 2;
        this.logger.log(
          `[ReadChain] Contract code check  identity=${dbIdentityAddress}  deployed=${contractDeployed}`,
        );
      } catch (err: unknown) {
        this.logger.warn(`[ReadChain] getCode failed: ${(err as Error).message}`);
      }

      if (contractDeployed) {
        try {
          const identity = new ethers.Contract(dbIdentityAddress, IDENTITY_ABI, provider);
          managementKeys = await identity.getKeysByPurpose(1); // MANAGEMENT = 1
        } catch { /* getKeysByPurpose may not exist on all ONCHAINID versions */ }
      }
    }

    // Per-token IR state
    const tokens = await this.tokenRepo
      .createQueryBuilder('t')
      .where('t.identity_registry_address IS NOT NULL')
      .getMany();

    const tokenStates: ChainTokenWhitelistState[] = [];
    for (const token of tokens) {
      if (!token.identityRegistryAddress) continue;
      try {
        const ir = new ethers.Contract(token.identityRegistryAddress, IDENTITY_REGISTRY_ABI, provider);
        const [isVerified, registeredRaw, countryRaw] = await Promise.all([
          ir.isVerified(walletAddress) as Promise<boolean>,
          ir.identity(walletAddress) as Promise<string>,
          ir.investorCountry(walletAddress) as Promise<bigint>,
        ]);
        const registeredIdentity =
          registeredRaw === ethers.ZeroAddress ? null : registeredRaw;

        // If the IR knows an identity address but DB doesn't, use the IR's value
        if (!identityAddress && registeredIdentity) {
          identityAddress = registeredIdentity;
        }

        this.logger.log(
          `[ReadChain] token=${token.id}  IR.isVerified=${isVerified}  IR.identity=${registeredIdentity ?? 'none'}  country=${Number(countryRaw)}`,
        );

        tokenStates.push({
          tokenId: token.id,
          irAddress: token.identityRegistryAddress,
          isVerified,
          registeredIdentity,
          countryCode: Number(countryRaw),
        });
      } catch (err: unknown) {
        this.logger.warn(
          `[ReadChain] IR read failed token=${token.id}: ${(err as Error).message}`,
        );
      }
    }

    // The Identity Registry may know an identity the DB mirror does not — the
    // mirror is written asynchronously by the approval pipeline and can lag or
    // fail outright. The loop above recovers that address, but contractDeployed
    // still reflects the DB address we never had, so the bytecode check has to
    // run again against whatever we actually resolved. Without this, a wallet
    // that is demonstrably whitelisted on-chain reports "not deployed" with
    // zero claims, because claim reads are gated on this flag.
    if (!contractDeployed && identityAddress) {
      try {
        const code = await provider.getCode(identityAddress);
        contractDeployed = code !== '0x' && code.length > 2;
        this.logger.log(
          `[ReadChain] Recovered identity from registry  identity=${identityAddress}  deployed=${contractDeployed}`,
        );
        if (contractDeployed) {
          try {
            const identity = new ethers.Contract(identityAddress, IDENTITY_ABI, provider);
            managementKeys = await identity.getKeysByPurpose(1); // MANAGEMENT = 1
          } catch { /* getKeysByPurpose may not exist on all ONCHAINID versions */ }
        }
      } catch (err: unknown) {
        this.logger.warn(`[ReadChain] getCode failed for recovered identity: ${(err as Error).message}`);
      }
    }

    const identityAddressMatch =
      !!identityAddress &&
      !!dbIdentityAddress &&
      identityAddress.toLowerCase() === dbIdentityAddress.toLowerCase();

    return {
      walletAddress,
      identityAddress,
      dbIdentityAddress,
      identityAddressMatch,
      managementKeys,
      contractDeployed,
      tokenStates,
      dbRecord: dbRecord
        ? {
            deploymentTxHash: dbRecord.deploymentTxHash,
            chainId: dbRecord.chainId,
            syncStatus: dbRecord.syncStatus,
            chainSyncedAt: dbRecord.chainSyncedAt,
            claimTopicsIssued: dbRecord.claimTopicsIssued,
            claimIds: dbRecord.claimIds ?? {},
          }
        : null,
    };
  }

  /**
   * Full on-chain verification: identity state + claim verification.
   * Pure read — does NOT write to the DB.
   * Used by GET /blockchain/verify/:wallet.
   */
  /**
   * Is this claim's signature valid for the issuer that signed it?
   *
   * Authoritative answer comes from the ClaimIssuer contract's own
   * `isClaimValid()` — the same check an ERC-3643 Identity Registry performs.
   *
   * This used to be `recovered === CLAIM_ISSUER_ADDRESS`, comparing the EOA that
   * signed the claim against the issuer *contract* address. Those are never
   * equal, so every claim was reported as having an invalid signature, which
   * made `fullyVerified` — and so the investor's "Eligible to Buy" state —
   * permanently false even with perfectly valid claims on-chain.
   *
   * `recovered` is passed in because the caller has already computed it for
   * logging; it is only used by the fallbacks.
   */
  private async isClaimSignatureValid(
    identityAddress: string,
    topic: number,
    issuerAddress: string,
    signature: string,
    data: string,
    recovered: string,
  ): Promise<boolean> {
    const issuer = new ethers.Contract(issuerAddress, CLAIM_ISSUER_ABI, this.getProvider());

    try {
      return await issuer.isClaimValid(identityAddress, topic, signature, data);
    } catch {
      /* issuer may predate isClaimValid() — fall through */
    }

    // Fallback: does the recovered key carry CLAIM purpose (3) on the issuer?
    try {
      const keyHash = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(['address'], [recovered]),
      );
      return await issuer.keyHasPurpose(keyHash, 3);
    } catch {
      /* not an ONCHAINID-shaped issuer — fall through */
    }

    // Last resort: compare against the address our own signing key derives to.
    try {
      const pk = this.config.get<string>('CLAIM_ISSUER_PRIVATE_KEY');
      if (!pk) return false;
      return recovered.toLowerCase() === new ethers.Wallet(pk).address.toLowerCase();
    } catch {
      return false;
    }
  }

  async readVerificationOnChain(walletAddress: string): Promise<ChainVerificationState> {
    const identityState = await this.readIdentityOnChain(walletAddress);
    const tirAddress = this.config.get<string>('TRUSTED_ISSUERS_REGISTRY_ADDRESS');
    const provider = this.getProvider();
    const claims: ChainClaimState[] = [];

    if (identityState.identityAddress && identityState.contractDeployed) {
      const identity = new ethers.Contract(identityState.identityAddress, IDENTITY_ABI, provider);

      for (const topic of [1, 2, 3]) {
        const topicName = CLAIM_TOPIC_NAMES[topic] ?? `TOPIC_${topic}`;
        let claimId: string | null = null;
        let exists = false;
        let signatureValid = false;
        let issuerTrusted = false;

        try {
          const ids: string[] = await identity.getClaimIdsByTopic(topic);
          exists = ids.length > 0;
          if (exists) {
            claimId = ids[0];

            const claim = await identity.getClaim(claimId);
            const dataHash = ethers.keccak256(
              ethers.AbiCoder.defaultAbiCoder().encode(
                ['address', 'uint256', 'bytes'],
                [identityState.identityAddress, topic, claim.data],
              ),
            );
            const recovered = ethers.verifyMessage(ethers.getBytes(dataHash), claim.signature as string);
            signatureValid = await this.isClaimSignatureValid(
              identityState.identityAddress,
              topic,
              claim.issuer as string,
              claim.signature as string,
              claim.data as string,
              recovered,
            );

            if (tirAddress) {
              try {
                issuerTrusted = await this.trustedIssuersRegistry.isTrustedIssuer(
                  tirAddress,
                  claim.issuer as string,
                );
              } catch { issuerTrusted = signatureValid; }
            } else {
              issuerTrusted = signatureValid;
            }

            this.logger.log(
              `[ReadChain] claim topic=${topic}  claimId=${claimId?.slice(0, 10)}...  sigValid=${signatureValid}  trusted=${issuerTrusted}`,
            );
          }
        } catch (err: unknown) {
          this.logger.warn(`[ReadChain] claim read failed topic=${topic}: ${(err as Error).message}`);
        }

        claims.push({ topic, topicName, claimId, exists, signatureValid, issuerTrusted });
      }
    }

    const allClaimsValid = claims.length === 3 && claims.every((c) => c.exists && c.signatureValid);
    const anyTokenWhitelisted = identityState.tokenStates.some((t) => t.isVerified);
    const fullyVerified = allClaimsValid && anyTokenWhitelisted;

    this.logger.log(
      `[ReadChain] verify  wallet=${walletAddress}  claims=${claims.filter((c) => c.exists).length}/3  anyWhitelisted=${anyTokenWhitelisted}  fullyVerified=${fullyVerified}`,
    );

    return { ...identityState, claims, fullyVerified };
  }
}
