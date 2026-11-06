import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';
import { OnchainIdentity } from '../entities/onchain-identity.entity';
import { InvestorClaim, ClaimStatus } from '../../kyc/entities/investor-claim.entity';
import { Whitelist } from '../../compliance/entities/whitelist.entity';
import { Token, TokenStatus } from '../../tokens/entities/token.entity';
import { User } from '../../auth/entities/user.entity';
import { BlockchainSyncService } from './blockchain-sync.service';
import { CLAIM_TOPIC_NAMES } from './claim-issuance.service';

// ── Event ABIs ────────────────────────────────────────────────────────────────

const IR_ABI = [
  'event IdentityRegistered(address indexed investorAddress, address indexed identity, uint16 country)',
  'event IdentityRemoved(address indexed investorAddress)',
];

const IDENTITY_ABI = [
  'event ClaimAdded(bytes32 indexed claimId, uint256 indexed topic, uint256 indexed scheme, address issuer, bytes signature, bytes data, string uri)',
  'event ClaimRemoved(bytes32 indexed claimId, uint256 indexed topic)',
];

const GATEWAY_ABI = [
  'event WalletLinked(address indexed wallet, address indexed identity)',
];

interface HttpEventSubscription {
  contract: ethers.Contract;
  eventName: string;
  listener: (...args: any[]) => void;
  nextBlock: number | null;
}

// ── Service ───────────────────────────────────────────────────────────────────

/**
 * ContractEventListenerService — real-time EVM event indexer.
 *
 * Subscribes to:
 *   IdentityRegistry:  IdentityRegistered, IdentityRemoved
 *   ONCHAINID:         ClaimAdded, ClaimRemoved
 *   OIDGateway:        WalletLinked
 *
 * On every event the DB mirror is updated via BlockchainSyncService so the
 * database always reflects what the chain says.
 *
 * Mode:
 *   BLOCKCHAIN_MODE=local  → uses LOCAL_BLOCKCHAIN_RPC_URL (Hardhat/Anvil supports eth_newFilter polling)
 *   BLOCKCHAIN_MODE=live   → uses SEPOLIA_RPC_URL (WebSocket if WS URL configured, else polling)
 *
 * The listener refreshes subscriptions every REFRESH_MS to pick up newly deployed tokens
 * and identity contracts.
 */
@Injectable()
export class ContractEventListenerService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(ContractEventListenerService.name);
  private provider: ethers.AbstractProvider | null = null;
  private readonly irContracts = new Map<string, ethers.Contract>();
  private readonly identityContracts = new Map<string, ethers.Contract>();
  private gatewayContract: ethers.Contract | null = null;
  private refreshInterval: NodeJS.Timeout | null = null;
  private httpPollInterval: NodeJS.Timeout | null = null;
  private readonly httpSubscriptions: HttpEventSubscription[] = [];
  private latestObservedBlock: number | null = null;
  private httpPollInProgress = false;
  private httpPollFailures = 0;
  private nextHttpPollAt = 0;
  private readonly REFRESH_MS = 5 * 60 * 1000; // re-scan for new contracts every 5 min
  private readonly HTTP_POLL_MS = 30 * 1000;
  private readonly MAX_BLOCK_RANGE = 100;

  constructor(
    @InjectRepository(OnchainIdentity)
    private readonly identityRepo: Repository<OnchainIdentity>,
    @InjectRepository(InvestorClaim)
    private readonly claimRepo: Repository<InvestorClaim>,
    @InjectRepository(Whitelist)
    private readonly whitelistRepo: Repository<Whitelist>,
    @InjectRepository(Token)
    private readonly tokenRepo: Repository<Token>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly config: ConfigService,
    private readonly blockchainSync: BlockchainSyncService,
  ) {}

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  async onApplicationBootstrap(): Promise<void> {
    const rpcUrl = this.getRpcUrl();
    if (!rpcUrl) {
      this.logger.warn(
        'No RPC URL configured — contract event listeners disabled. ' +
          'Set LOCAL_BLOCKCHAIN_RPC_URL (local) or SEPOLIA_RPC_URL (live).',
      );
      return;
    }

    this.logger.log(
      `[Events] Starting event listener  mode=${this.config.get('BLOCKCHAIN_MODE', 'local')}  rpc=${rpcUrl.replace(/\/\/.*@/, '//<redacted>@')}`,
    );

    await this.refreshSubscriptions();

    if (this.provider instanceof ethers.JsonRpcProvider) {
      this.httpPollInterval = setInterval(() => {
        void this.pollHttpEvents();
      }, this.HTTP_POLL_MS);
      await this.pollHttpEvents();
    }

    this.refreshInterval = setInterval(() => {
      this.refreshSubscriptions().catch((err: Error) =>
        this.logger.error(`[Events] Subscription refresh failed: ${err.message}`, err.stack),
      );
    }, this.REFRESH_MS);
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
    if (this.httpPollInterval) {
      clearInterval(this.httpPollInterval);
      this.httpPollInterval = null;
    }
    this.httpSubscriptions.length = 0;
    if (this.gatewayContract) await this.gatewayContract.removeAllListeners();
    for (const c of this.irContracts.values()) await c.removeAllListeners();
    for (const c of this.identityContracts.values()) await c.removeAllListeners();
    this.irContracts.clear();
    this.identityContracts.clear();
    this.provider?.destroy();
    this.provider = null;
    this.logger.log('[Events] Listeners removed');
  }

  // ── Provider ──────────────────────────────────────────────────────────────

  private getRpcUrl(): string | undefined {
    const mode = this.config.get<string>('BLOCKCHAIN_MODE', 'local');
    return mode === 'local'
      ? this.config.get<string>('LOCAL_BLOCKCHAIN_RPC_URL')
      : (this.config.get<string>('SEPOLIA_RPC_URL') ||
         this.config.get<string>('NEXT_PUBLIC_ETHEREUM_TESTNET_RPC_URL'));
  }

  private getProvider(): ethers.AbstractProvider {
    if (!this.provider) {
      const rpcUrl = this.getRpcUrl();
      if (!rpcUrl) throw new Error('[Events] RPC URL not configured');
      const wsUrl = this.config.get<string>('ARC_TESTNET_WS_URL');
      const useWebSocket = Boolean(wsUrl) && Number(this.config.get('DEFAULT_CHAIN_ID')) === 5042002;
      this.logger.log(`[Events] Transport: ${useWebSocket ? 'WebSocket' : 'HTTP log polling'}`);
      this.provider = useWebSocket
        ? new ethers.WebSocketProvider(wsUrl!)
        : new ethers.JsonRpcProvider(rpcUrl, undefined, { staticNetwork: true, polling: true });
    }
    return this.provider;
  }

  private listenForEvent(
    contract: ethers.Contract,
    eventName: string,
    listener: (...args: any[]) => void,
  ): void {
    if (this.provider instanceof ethers.JsonRpcProvider) {
      this.httpSubscriptions.push({
        contract,
        eventName,
        listener,
        nextBlock: this.latestObservedBlock,
      });
      return;
    }

    void contract.on(eventName, listener).catch((err: Error) =>
      this.logger.error(`[Events] ${eventName} subscription failed: ${err.message}`, err.stack),
    );
  }

  private async pollHttpEvents(): Promise<void> {
    if (
      !(this.provider instanceof ethers.JsonRpcProvider) ||
      this.httpPollInProgress ||
      this.httpSubscriptions.length === 0 ||
      Date.now() < this.nextHttpPollAt
    ) return;

    this.httpPollInProgress = true;
    try {
      const latestBlock = await this.provider.getBlockNumber();
      this.latestObservedBlock = latestBlock;

      for (const subscription of this.httpSubscriptions) {
        if (subscription.nextBlock === null) subscription.nextBlock = latestBlock;
        if (subscription.nextBlock > latestBlock) continue;

        const toBlock = Math.min(
          latestBlock,
          subscription.nextBlock + this.MAX_BLOCK_RANGE - 1,
        );
        const logs = await subscription.contract.queryFilter(
          subscription.eventName,
          subscription.nextBlock,
          toBlock,
        );

        for (const log of logs) {
          if (!(log instanceof ethers.EventLog)) continue;
          try {
            subscription.listener(...log.args, log);
          } catch (err) {
            this.logger.error(
              `[Events] ${subscription.eventName} handler failed: ${(err as Error).message}`,
            );
          }
        }

        // Advance only after getLogs succeeds, so throttling cannot skip events.
        subscription.nextBlock = toBlock + 1;
      }

      this.httpPollFailures = 0;
      this.nextHttpPollAt = 0;
    } catch (err) {
      this.httpPollFailures += 1;
      const retryMs = Math.min(
        2 * 60 * 1000,
        this.HTTP_POLL_MS * 2 ** Math.min(this.httpPollFailures - 1, 2),
      );
      this.nextHttpPollAt = Date.now() + retryMs;
      this.logger.warn(
        `[Events] RPC log poll failed: ${(err as Error).message}. Retrying in ${retryMs / 1000}s`,
      );
    } finally {
      this.httpPollInProgress = false;
    }
  }

  // ── Subscription management ───────────────────────────────────────────────

  private async refreshSubscriptions(): Promise<void> {
    const provider = this.getProvider();

    // 1. Subscribe to all active tokens' IdentityRegistry contracts
    const tokens = await this.tokenRepo.find({
      where: { status: TokenStatus.ACTIVE },
      select: ['id', 'identityRegistryAddress'],
    });

    for (const token of tokens) {
      if (!token.identityRegistryAddress) continue;
      if (this.irContracts.has(token.identityRegistryAddress)) continue;
      this.subscribeToIR(token.identityRegistryAddress, token.id, provider);
    }

    // 2. Subscribe to all known ONCHAINID contracts
    const identities = await this.identityRepo.find({
      select: ['userId', 'identityContractAddress'],
    });

    for (const rec of identities) {
      if (this.identityContracts.has(rec.identityContractAddress)) continue;
      this.subscribeToIdentity(rec.identityContractAddress, rec.userId, provider);
    }

    // 3. Subscribe to OIDGateway WalletLinked event (once)
    if (!this.gatewayContract) {
      const gatewayAddress = this.config.get<string>('OID_GATEWAY_ADDRESS');
      if (gatewayAddress) {
        this.subscribeToGateway(gatewayAddress, provider);
      }
    }

    this.logger.log(
      `[Events] Subscriptions: ${this.irContracts.size} IR  ${this.identityContracts.size} identity  gateway=${!!this.gatewayContract}`,
    );
  }

  // ── IdentityRegistry subscriptions ───────────────────────────────────────

  private subscribeToIR(
    irAddress: string,
    tokenId: string,
    provider: ethers.AbstractProvider,
  ): void {
    const contract = new ethers.Contract(irAddress, IR_ABI, provider);
    this.irContracts.set(irAddress, contract);

    this.listenForEvent(
      contract,
      'IdentityRegistered',
      (
        investorAddress: string,
        identity: string,
        country: bigint,
        event: ethers.EventLog,
      ) => {
        this.logger.log(
          `[Event] IdentityRegistered  investor=${investorAddress}  identity=${identity}  country=${Number(country)}  ir=${irAddress}  tx=${event.transactionHash}`,
        );
        this.handleIdentityRegistered(
          investorAddress,
          identity,
          tokenId,
          irAddress,
          Number(country),
          event.transactionHash,
        ).catch((err: Error) =>
          this.logger.error(`[Event] IdentityRegistered handler error: ${err.message}`, err.stack),
        );
      },
    );

    this.listenForEvent(
      contract,
      'IdentityRemoved',
      (investorAddress: string, event: ethers.EventLog) => {
        this.logger.log(
          `[Event] IdentityRemoved  investor=${investorAddress}  ir=${irAddress}  tx=${event.transactionHash}`,
        );
        this.handleIdentityRemoved(investorAddress, tokenId, event.transactionHash).catch(
          (err: Error) =>
            this.logger.error(`[Event] IdentityRemoved handler error: ${err.message}`, err.stack),
        );
      },
    );

    this.logger.log(`[Events] Subscribed to IR ${irAddress} (token ${tokenId})`);
  }

  // ── ONCHAINID contract subscriptions ─────────────────────────────────────

  private subscribeToIdentity(
    identityAddress: string,
    userId: string,
    provider: ethers.AbstractProvider,
  ): void {
    const contract = new ethers.Contract(identityAddress, IDENTITY_ABI, provider);
    this.identityContracts.set(identityAddress, contract);

    this.listenForEvent(
      contract,
      'ClaimAdded',
      (
        claimId: string,
        topic: bigint,
        _scheme: bigint,
        issuer: string,
        signature: string,
        data: string,
        _uri: string,
        event: ethers.EventLog,
      ) => {
        const topicNum = Number(topic);
        this.logger.log(
          `[Event] ClaimAdded  identity=${identityAddress}  topic=${topicNum}  issuer=${issuer}  claimId=${claimId}  tx=${event.transactionHash}`,
        );
        this.handleClaimAdded(
          userId,
          identityAddress,
          topicNum,
          issuer,
          claimId,
          data,
          signature,
          event.transactionHash,
        ).catch((err: Error) =>
          this.logger.error(`[Event] ClaimAdded handler error: ${err.message}`, err.stack),
        );
      },
    );

    this.listenForEvent(
      contract,
      'ClaimRemoved',
      (claimId: string, topic: bigint, event: ethers.EventLog) => {
        const topicNum = Number(topic);
        this.logger.log(
          `[Event] ClaimRemoved  identity=${identityAddress}  topic=${topicNum}  claimId=${claimId}  tx=${event.transactionHash}`,
        );
        this.handleClaimRemoved(userId, topicNum, claimId, event.transactionHash).catch(
          (err: Error) =>
            this.logger.error(`[Event] ClaimRemoved handler error: ${err.message}`, err.stack),
        );
      },
    );

    this.logger.log(`[Events] Subscribed to ONCHAINID ${identityAddress} (user ${userId})`);
  }

  // ── OIDGateway subscription ───────────────────────────────────────────────

  private subscribeToGateway(
    gatewayAddress: string,
    provider: ethers.AbstractProvider,
  ): void {
    this.gatewayContract = new ethers.Contract(gatewayAddress, GATEWAY_ABI, provider);

    this.listenForEvent(
      this.gatewayContract,
      'WalletLinked',
      (wallet: string, identity: string, event: ethers.EventLog) => {
        this.logger.log(
          `[Event] WalletLinked  wallet=${wallet}  identity=${identity}  gateway=${gatewayAddress}  tx=${event.transactionHash}`,
        );
        this.handleWalletLinked(wallet, identity, event.transactionHash).catch(
          (err: Error) =>
            this.logger.error(`[Event] WalletLinked handler error: ${err.message}`, err.stack),
        );
      },
    );

    this.logger.log(`[Events] Subscribed to WalletLinked on gateway ${gatewayAddress}`);
  }

  // ── Event handlers ────────────────────────────────────────────────────────

  /**
   * IdentityRegistered(investorAddress, identity, country)
   *
   * 1. Resolve platform user from wallet address
   * 2. Update onchain_identities.registeredTokenIds
   * 3. Upsert whitelists row with verifiedOnChain=true, irAddress, countryCode, txHash
   * 4. If the investor has no claim records yet, trigger a full sync
   */
  private async handleIdentityRegistered(
    investorAddress: string,
    identityAddress: string,
    tokenId: string,
    irAddress: string,
    countryCode: number,
    txHash: string,
  ): Promise<void> {
    const user = await this.userRepo.findOne({
      where: { walletAddress: investorAddress.toLowerCase() },
    });
    if (!user) {
      this.logger.warn(
        `[Event] IdentityRegistered: no platform user for wallet ${investorAddress} — DB not updated`,
      );
      return;
    }

    // Update registeredTokenIds in onchain_identities
    const chainId = parseInt(this.config.get<string>('DEFAULT_CHAIN_ID', '11155111'), 10);
    const record = await this.identityRepo.findOne({ where: { userId: user.id, chainId } });
    if (record && !record.registeredTokenIds.includes(tokenId)) {
      record.registeredTokenIds = [...record.registeredTokenIds, tokenId];
      await this.identityRepo.save(record);
      this.logger.log(
        `[Event] Updated registeredTokenIds  user=${user.id}  token=${tokenId}`,
      );
    }

    // Sync whitelist entry: write IR.isVerified() + countryCode to DB
    // We got the event so isVerified should be true, but we call the chain to confirm
    try {
      await this.blockchainSync.syncWhitelistEntry(investorAddress, tokenId, irAddress, {
        userId: user.id,
        txHash,
        countryCode,
      });
      this.logger.log(
        `[Event] Whitelist synced from IdentityRegistered event  user=${user.id}  token=${tokenId}  tx=${txHash}`,
      );
    } catch (err: unknown) {
      // Fallback: write directly without chain re-read
      this.logger.warn(
        `[Event] syncWhitelistEntry failed — writing direct DB entry: ${(err as Error).message}`,
      );
      await this.whitelistRepo
        .createQueryBuilder()
        .insert()
        .into(Whitelist)
        .values({
          tokenId,
          userId: user.id,
          walletAddress: investorAddress.toLowerCase(),
          verifiedOnChain: true,
          verificationTxHash: txHash,
          irAddress,
          countryCode,
          chainSyncedAt: new Date(),
          isActive: true,
          verifiedAt: new Date(),
        })
        .orUpdate(
          ['verified_on_chain', 'verification_tx_hash', 'ir_address', 'country_code', 'chain_synced_at', 'is_active'],
          ['token_id', 'wallet_address'],
        )
        .execute();
    }
  }

  /**
   * IdentityRemoved(investorAddress)
   *
   * Mark the investor's whitelist entry as inactive (verifiedOnChain=false).
   * Don't delete — keep the row for audit history.
   */
  private async handleIdentityRemoved(
    investorAddress: string,
    tokenId: string,
    txHash: string,
  ): Promise<void> {
    const now = new Date();
    await this.whitelistRepo
      .createQueryBuilder()
      .update(Whitelist)
      .set({
        verifiedOnChain: false,
        isActive: false,
        chainSyncedAt: now,
      })
      .where('wallet_address = :wallet AND token_id = :tokenId', {
        wallet: investorAddress.toLowerCase(),
        tokenId,
      })
      .execute();

    this.logger.log(
      `[Event] IdentityRemoved: deactivated whitelist  wallet=${investorAddress}  token=${tokenId}  tx=${txHash}`,
    );
  }

  /**
   * ClaimAdded(claimId, topic, scheme, issuer, signature, data, uri)
   *
   * Upsert investor_claims with the full event data.
   * Also update onchain_identities.claimTopicsIssued + claimIds.
   *
   * Note: we do NOT re-verify the signature here because the event fires immediately —
   * we trust the on-chain state. A full sync (syncClaims) can be triggered separately.
   */
  private async handleClaimAdded(
    userId: string,
    identityContract: string,
    claimTopic: number,
    issuerAddress: string,
    claimId: string,
    claimData: string,
    signature: string,
    txHash: string,
  ): Promise<void> {
    const chainId = parseInt(this.config.get<string>('DEFAULT_CHAIN_ID', '11155111'), 10);
    const now = new Date();

    // Update onchain_identities.claimTopicsIssued + claimIds
    const record = await this.identityRepo.findOne({ where: { userId, chainId } });
    if (record) {
      record.claimTopicsIssued = {
        ...record.claimTopicsIssued,
        [claimTopic.toString()]: txHash,
      };
      record.claimIds = {
        ...(record.claimIds ?? {}),
        [claimTopic.toString()]: claimId,
      };
      record.syncStatus = 'synced';
      record.chainSyncedAt = now;
      await this.identityRepo.save(record);
    }

    // Upsert investor_claims with all available event data
    await this.claimRepo.upsert(
      {
        investorId: userId,
        identityContract,
        claimTopic,
        claimTopicName: CLAIM_TOPIC_NAMES[claimTopic] ?? `TOPIC_${claimTopic}`,
        issuerAddress,
        claimId,
        claimData,
        txHash,
        chainId,
        chainSyncedAt: now,
        status: ClaimStatus.ACTIVE,
        issuedAt: now,
      },
      {
        conflictPaths: ['investorId', 'claimTopic'],
        skipUpdateIfNoValuesChanged: false,
      },
    );

    this.logger.log(
      `[Event] ClaimAdded synced  user=${userId}  topic=${claimTopic}  claimId=${claimId}  tx=${txHash}`,
    );
  }

  /**
   * ClaimRemoved(claimId, topic)
   *
   * Mark the claim as REVOKED in investor_claims.
   * Clear the entry from onchain_identities.claimTopicsIssued + claimIds.
   */
  private async handleClaimRemoved(
    userId: string,
    claimTopic: number,
    claimId: string,
    txHash: string,
  ): Promise<void> {
    const now = new Date();

    // Mark claim revoked
    await this.claimRepo.update(
      { investorId: userId, claimTopic },
      {
        status: ClaimStatus.REVOKED,
        revokedAt: now,
        chainSyncedAt: now,
      },
    );

    // Remove from onchain_identities maps
    const chainId = parseInt(this.config.get<string>('DEFAULT_CHAIN_ID', '11155111'), 10);
    const record = await this.identityRepo.findOne({ where: { userId, chainId } });
    if (record) {
      const topics = { ...record.claimTopicsIssued };
      const ids = { ...(record.claimIds ?? {}) };
      delete topics[claimTopic.toString()];
      delete ids[claimTopic.toString()];
      record.claimTopicsIssued = topics;
      record.claimIds = ids;
      record.syncStatus = 'stale';
      record.chainSyncedAt = now;
      await this.identityRepo.save(record);
    }

    this.logger.log(
      `[Event] ClaimRemoved  user=${userId}  topic=${claimTopic}  claimId=${claimId}  tx=${txHash}`,
    );
  }

  /**
   * WalletLinked(wallet, identity)
   *
   * An ONCHAINID was deployed or linked via the gateway.
   *
   * 1. If we have a platform user for this wallet and no onchain_identities record → create one
   * 2. Subscribe to the new identity contract for ClaimAdded/ClaimRemoved events
   * 3. Trigger a full sync so any claims already on the contract are indexed
   */
  private async handleWalletLinked(
    walletAddress: string,
    identityAddress: string,
    txHash: string,
  ): Promise<void> {
    const user = await this.userRepo.findOne({
      where: { walletAddress: walletAddress.toLowerCase() },
    });
    if (!user) {
      this.logger.log(
        `[Event] WalletLinked: no platform user for wallet ${walletAddress} — skipping DB update`,
      );
      return;
    }

    const chainId = parseInt(this.config.get<string>('DEFAULT_CHAIN_ID', '11155111'), 10);

    let record = await this.identityRepo.findOne({ where: { userId: user.id, chainId } });
    if (!record) {
      record = this.identityRepo.create({
        userId: user.id,
        identityContractAddress: identityAddress,
        deploymentTxHash: txHash,
        chainId,
        claimTopicsIssued: {},
        claimIds: {},
        registeredTokenIds: [],
        deployedAt: new Date(),
        syncStatus: 'pending',
        chainSyncedAt: new Date(),
      });
      await this.identityRepo.save(record);
      this.logger.log(
        `[Event] WalletLinked: created onchain_identities  user=${user.id}  identity=${identityAddress}  tx=${txHash}`,
      );
    } else if (record.identityContractAddress !== identityAddress) {
      // Identity address changed (unusual but handle it)
      this.logger.warn(
        `[Event] WalletLinked: identity address changed for user ${user.id}  old=${record.identityContractAddress}  new=${identityAddress}`,
      );
      record.identityContractAddress = identityAddress;
      record.deploymentTxHash = txHash;
      record.syncStatus = 'pending';
      await this.identityRepo.save(record);
    }

    // Update user.identityContractAddress in the users table
    await this.userRepo.update(user.id, { identityContractAddress: identityAddress });

    // Subscribe to ClaimAdded/ClaimRemoved on the newly linked identity
    if (!this.identityContracts.has(identityAddress) && this.provider) {
      this.subscribeToIdentity(identityAddress, user.id, this.provider);
    }

    // Trigger a full sync to index any existing claims on this identity
    this.blockchainSync.syncClaims(user.id, identityAddress).catch((err: Error) =>
      this.logger.warn(`[Event] WalletLinked claim sync failed: ${err.message}`),
    );

    this.logger.log(
      `[Event] WalletLinked handled  user=${user.id}  wallet=${walletAddress}  identity=${identityAddress}`,
    );
  }
}
