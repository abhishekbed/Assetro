import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';

// ── ERC-734 key purposes ──────────────────────────────────────────────────────
export const KEY_PURPOSE = {
  MANAGEMENT: 1,  // add/remove keys, execute arbitrary transactions
  ACTION: 2,      // execute non-management transactions
  CLAIM: 3,       // add/remove claims on this identity
  ENCRYPTION: 4,
} as const;

export const KEY_TYPE = {
  ECDSA: 1,
  RSA: 2,
} as const;

// ── Contract ABIs ─────────────────────────────────────────────────────────────

const OID_GATEWAY_ABI = [
  'function deployIdentityForWallet(address identityOwner) external returns (address)',
  'function transferFactoryOwnership(address newOwner) external',
  'event WalletLinked(address indexed wallet, address indexed identity)',
  'event IdentityDeployed(address indexed identity)',
  'event Deployed(address indexed addr)',
];

const ID_FACTORY_ABI = [
  'function getIdentity(address _wallet) external view returns (address)',
  'function isSaltTaken(string memory _salt) external view returns (bool)',
  'function createIdentityWithManagementKeys(address _wallet, string memory _salt, bytes32[] memory _managementKeys) external returns (address)',
  'function owner() external view returns (address)',
  'function transferOwnership(address newOwner) external',
];

export const IDENTITY_FULL_ABI = [
  // ERC-734 Key Management
  'function addKey(bytes32 _key, uint256 _purpose, uint256 _keyType) external returns (bool)',
  'function removeKey(bytes32 _key, uint256 _purpose) external returns (bool)',
  'function keyHasPurpose(bytes32 _key, uint256 _purpose) external view returns (bool)',
  'function getKey(bytes32 _key) external view returns (uint256[] memory purposes, uint256 keyType, bytes32 key)',
  'function getKeysByPurpose(uint256 _purpose) external view returns (bytes32[] memory)',
  // ERC-735 Claims
  'function addClaim(uint256 _topic, uint256 _scheme, address _issuer, bytes calldata _signature, bytes calldata _data, string calldata _uri) external returns (bytes32 claimId)',
  'function removeClaim(bytes32 _claimId) external returns (bool)',
  'function getClaim(bytes32 _claimId) external view returns (uint256 topic, uint256 scheme, address issuer, bytes memory signature, bytes memory data, string memory uri)',
  'function getClaimIdsByTopic(uint256 _topic) external view returns (bytes32[] memory)',
  // Events
  'event KeyAdded(bytes32 indexed key, uint256 indexed purpose, uint256 indexed keyType)',
  'event KeyRemoved(bytes32 indexed key, uint256 indexed purpose, uint256 indexed keyType)',
  'event ClaimAdded(bytes32 indexed claimId, uint256 indexed topic, uint256 indexed scheme, address issuer, bytes signature, bytes data, string uri)',
];

// ── Result types ──────────────────────────────────────────────────────────────

export interface IdentityDeploymentResult {
  identityContractAddress: string;
  deploymentTxHash: string;
  blockNumber: number;
  deployer: string;
  chainId: number;
  deployedAt: Date;
}

export interface KeyOperationResult {
  keyAddress: string;
  keyHash: string;
  purpose: number;
  txHash: string;
  verified: boolean;
}

export interface CreateIdentityResult extends IdentityDeploymentResult {
  walletKeyAdded: boolean;
  walletKeyTxHash: string | null;
  managementKeys: string[];
  contractCodeVerified: boolean;
}

// ── Service ───────────────────────────────────────────────────────────────────

/**
 * OnchainIdentityService — pure on-chain ONCHAINID (ERC-725/734/735) operations.
 *
 * Responsibility: deploy identity contracts, manage keys, verify on-chain state.
 * NO database interaction — the calling service (IdentityDeploymentService) owns DB.
 *
 * Architecture:
 *   createIdentity()          — orchestrates steps 1-3
 *   deployIdentityContract()  — actual on-chain deployment via OIDGateway
 *   addManagementKey()        — adds a MANAGEMENT key (purpose=1)
 *   addWalletKey()            — adds investor wallet as MANAGEMENT key
 *   setRecoveryKey()          — adds a recovery MANAGEMENT key
 *
 * Deployment strategy (in order of preference):
 *   1. deployIdentityWithSalt(deployerAddress, salt=walletAddress)
 *      → Deployer = initial management key → backend can add wallet + claim keys
 *   2. deployIdentityForWallet(walletAddress)
 *      → Investor wallet = management key (claim issuance still works via msg.sender==_issuer)
 *
 * LOCAL mode: requires LOCAL_BLOCKCHAIN_RPC_URL + OID_GATEWAY_ADDRESS pointing
 * to a local Hardhat/Anvil node with ONCHAINID contracts deployed.
 * DO NOT use fake/random addresses — this defeats the purpose of on-chain identity.
 */
@Injectable()
export class OnchainIdentityService {
  private readonly logger = new Logger(OnchainIdentityService.name);
  private providerCache: ethers.JsonRpcProvider | null = null;
  private signerCache: ethers.Wallet | null = null;

  constructor(private readonly config: ConfigService) {}

  // ── Provider / signer helpers ────────────────────────────────────────────────

  private getRpcUrl(): string {
    const mode = this.config.get<string>('BLOCKCHAIN_MODE', 'local');

    if (mode === 'local') {
      const local = this.config.get<string>('LOCAL_BLOCKCHAIN_RPC_URL');
      if (!local) {
        throw new InternalServerErrorException(
          '[ONCHAINID] BLOCKCHAIN_MODE=local requires LOCAL_BLOCKCHAIN_RPC_URL. ' +
            'Run a local Hardhat/Anvil node with ONCHAINID contracts deployed, OR ' +
            'set BLOCKCHAIN_MODE=live with SEPOLIA_RPC_URL for Sepolia testnet.',
        );
      }
      return local;
    }

    const rpc =
      this.config.get<string>('SEPOLIA_RPC_URL') ||
      this.config.get<string>('NEXT_PUBLIC_ETHEREUM_TESTNET_RPC_URL');
    if (!rpc) throw new InternalServerErrorException('[ONCHAINID] SEPOLIA_RPC_URL not configured');
    return rpc;
  }

  private getProvider(): ethers.JsonRpcProvider {
    if (!this.providerCache) {
      this.providerCache = new ethers.JsonRpcProvider(this.getRpcUrl(), undefined, { staticNetwork: true });
    }
    return this.providerCache;
  }

  private getSigner(): ethers.Wallet {
    if (!this.signerCache) {
      const pk = this.config.get<string>('DEPLOYER_PRIVATE_KEY');
      if (!pk) throw new InternalServerErrorException('[ONCHAINID] DEPLOYER_PRIVATE_KEY not configured');
      this.signerCache = new ethers.Wallet(
        pk.startsWith('0x') ? pk : `0x${pk}`,
        this.getProvider(),
      );
    }
    return this.signerCache;
  }

  private getChainId(): number {
    return parseInt(this.config.get<string>('DEFAULT_CHAIN_ID', '11155111'), 10);
  }

  /** Compute the ERC-734 key hash for an address: keccak256(abi.encode(address)) */
  private addrToKeyHash(address: string): string {
    return ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(['address'], [address]),
    );
  }

  // ── Public API ────────────────────────────────────────────────────────────────

  /**
   * Full orchestration:
   *   1. Deploy ONCHAINID contract on-chain
   *   2. Add investor wallet as MANAGEMENT key (if deployer holds management key)
   *   3. Verify contract deployment and key state on-chain
   *   4. Log every step with tx hashes and addresses
   *
   * Returns everything needed for the DB record.
   */
  async createIdentity(walletAddress: string): Promise<CreateIdentityResult> {
    const checksummedWallet = ethers.getAddress(walletAddress);
    this.logger.log(
      `══════════════════════════════════════════════════════════════`,
    );
    this.logger.log(
      `[ONCHAINID] createIdentity START  wallet=${checksummedWallet}`,
    );
    this.logger.log(
      `══════════════════════════════════════════════════════════════`,
    );

    // ── Step 1: Deploy ──────────────────────────────────────────────────────────
    const deployment = await this.deployIdentityContract(checksummedWallet);
    this.logger.log(
      `[ONCHAINID] ✓ Deployed  address=${deployment.identityContractAddress}  tx=${deployment.deploymentTxHash}  block=${deployment.blockNumber}`,
    );

    // ── Step 2: Add wallet as management key ────────────────────────────────────
    let walletKeyAdded = false;
    let walletKeyTxHash: string | null = null;
    try {
      const walletKeyResult = await this.addManagementKey(
        deployment.identityContractAddress,
        checksummedWallet,
      );
      walletKeyAdded = walletKeyResult.verified;
      walletKeyTxHash = walletKeyResult.txHash || null;
      this.logger.log(
        `[ONCHAINID] ✓ Wallet key added  wallet=${checksummedWallet}  hash=${walletKeyResult.keyHash}  tx=${walletKeyResult.txHash}  verified=${walletKeyResult.verified}`,
      );
    } catch (err: unknown) {
      // This fails if deployer is not management key (standard OIDGateway sets investor as key)
      // Claim issuance still works because addClaim allows msg.sender==_issuer without a key
      this.logger.warn(
        `[ONCHAINID] ⚠ addManagementKey(wallet) failed — deployer may not hold management key ` +
          `(standard OIDGateway sets investor wallet as management key). ` +
          `Claim issuance will still work via msg.sender==_issuer. ` +
          `Error: ${(err as Error).message}`,
      );
    }

    // ── Step 3: Verify on-chain state ───────────────────────────────────────────
    const contractCodeVerified = await this.verifyContractDeployed(
      deployment.identityContractAddress,
    );
    const managementKeys = await this.getManagementKeys(deployment.identityContractAddress);

    this.logger.log(
      `[ONCHAINID] ✓ Contract code verified=${contractCodeVerified}  management_key_count=${managementKeys.length}`,
    );
    for (const k of managementKeys) {
      this.logger.log(`[ONCHAINID]   management key: ${k}`);
    }

    this.logger.log(
      `══════════════════════════════════════════════════════════════`,
    );
    this.logger.log(
      `[ONCHAINID] createIdentity COMPLETE  identity=${deployment.identityContractAddress}`,
    );
    this.logger.log(
      `══════════════════════════════════════════════════════════════`,
    );

    return {
      ...deployment,
      walletKeyAdded,
      walletKeyTxHash,
      managementKeys,
      contractCodeVerified,
    };
  }

  /**
   * Pre-flight check for the investor-wallet-signed deployment flow
   * (DeployOnchainIdButton.tsx): tells the frontend whether the wallet already
   * has an ONCHAINID, whether the platform deployer already holds a management
   * key on it, and the deployer's key hash + the OID gateway address needed to
   * build the two MetaMask transactions (deploy, then addKey).
   */
  async getDeploymentApproval(walletAddress: string): Promise<{
    deployerKeyHash: string;
    gatewayAddress: string;
    existingIdentity: string | null;
    deployerNeedsAccess: boolean;
  }> {
    const checksummedWallet = ethers.getAddress(walletAddress);
    const gatewayAddress = this.config.get<string>('OID_GATEWAY_ADDRESS');
    const idFactoryAddress = this.config.get<string>('ID_FACTORY_ADDRESS');
    if (!gatewayAddress) throw new InternalServerErrorException('[ONCHAINID] OID_GATEWAY_ADDRESS not configured');
    if (!idFactoryAddress) throw new InternalServerErrorException('[ONCHAINID] ID_FACTORY_ADDRESS not configured');

    const signer = this.getSigner();
    const deployerKeyHash = this.addrToKeyHash(signer.address);

    const idFactory = new ethers.Contract(idFactoryAddress, ID_FACTORY_ABI, this.getProvider());
    const identity: string = await idFactory.getIdentity(checksummedWallet);
    const existingIdentity = identity && identity !== ethers.ZeroAddress ? identity : null;

    let deployerNeedsAccess = false;
    if (existingIdentity) {
      const identityContract = new ethers.Contract(existingIdentity, IDENTITY_FULL_ABI, this.getProvider());
      const hasManagementKey: boolean = await identityContract.keyHasPurpose(deployerKeyHash, KEY_PURPOSE.MANAGEMENT);
      deployerNeedsAccess = !hasManagementKey;
    }

    return {
      deployerKeyHash,
      gatewayAddress,
      existingIdentity,
      deployerNeedsAccess,
    };
  }

  /**
   * Deploy the ONCHAINID identity contract on-chain.
   *
   * Strategy: transfer IdFactory ownership to deployer → createIdentityWithManagementKeys
   * (deployer as management key) → restore factory ownership to gateway.
   * Deployer having MANAGEMENT key satisfies the onlyClaimKey modifier (keyHasPurpose
   * returns true for MANAGEMENT OR the specific purpose), so addClaim() works directly.
   */
  async deployIdentityContract(walletAddress: string): Promise<IdentityDeploymentResult> {
    const signer = this.getSigner();
    const deployerAddress = await signer.getAddress();
    const chainId = this.getChainId();

    const gatewayAddress = this.config.get<string>('OID_GATEWAY_ADDRESS');
    const idFactoryAddress = this.config.get<string>('ID_FACTORY_ADDRESS');

    if (!gatewayAddress) throw new InternalServerErrorException('[ONCHAINID] OID_GATEWAY_ADDRESS not configured');
    if (!idFactoryAddress) throw new InternalServerErrorException('[ONCHAINID] ID_FACTORY_ADDRESS not configured');

    const gateway = new ethers.Contract(gatewayAddress, OID_GATEWAY_ABI, signer);
    const factory = new ethers.Contract(idFactoryAddress, ID_FACTORY_ABI, signer);
    const deployerKeyHash = this.addrToKeyHash(deployerAddress);

    this.logger.log(`[ONCHAINID] deployIdentityContract  wallet=${walletAddress}  deployer=${deployerAddress}`);

    // ── Pre-check: reuse if wallet already has a usable identity ─────────────
    try {
      const existingAddr: string = await factory.getIdentity(walletAddress);
      if (existingAddr && existingAddr !== ethers.ZeroAddress) {
        const existing = new ethers.Contract(existingAddr, IDENTITY_FULL_ABI, signer);
        const [hasMgmt, hasClaim] = await Promise.all([
          existing.keyHasPurpose(deployerKeyHash, KEY_PURPOSE.MANAGEMENT).catch(() => false),
          existing.keyHasPurpose(deployerKeyHash, KEY_PURPOSE.CLAIM).catch(() => false),
        ]);
        if (hasMgmt || hasClaim) {
          this.logger.log(`[ONCHAINID] Reusing existing identity ${existingAddr} (deployer has key)`);
          return {
            identityContractAddress: ethers.getAddress(existingAddr),
            deploymentTxHash: 'existing',
            blockNumber: await this.getProvider().getBlockNumber(),
            deployer: deployerAddress,
            chainId,
            deployedAt: new Date(),
          };
        }
        this.logger.warn(`[ONCHAINID] Existing identity ${existingAddr} found but deployer has no key — proceeding to redeploy with deployer as management key`);
      }
    } catch (err: unknown) {
      this.logger.warn(`[ONCHAINID] Pre-check failed: ${(err as Error).message}`);
    }

    // ── Deploy via: transfer factory ownership → createWithMgmtKeys → restore ──
    // The OID Gateway owns IdFactory. Gateway owner = deployer. We temporarily
    // transfer factory ownership to deployer, create the identity with deployer
    // as MANAGEMENT key, then restore factory ownership to gateway.
    // Deployer having MANAGEMENT key = can call addClaim (satisfies onlyClaimKey).

    const salt = `assetro:${walletAddress.toLowerCase()}`;
    this.logger.log(`[ONCHAINID] Deploying identity  salt="${salt}"  deployer will be management key`);

    // Step A: give deployer direct factory access
    const factoryOwner: string = await factory.owner();
    const deployerOwnsFactory = factoryOwner.toLowerCase() === deployerAddress.toLowerCase();

    if (!deployerOwnsFactory) {
      this.logger.log(`[ONCHAINID] Transferring IdFactory ownership to deployer...`);
      const tx = await gateway.transferFactoryOwnership(deployerAddress);
      await tx.wait();
      this.logger.log(`[ONCHAINID] IdFactory ownership transferred to deployer`);
    }

    let identityAddress: string;
    let deploymentTxHash: string;
    let blockNumber: number;

    try {
      // Step B: deploy identity with investor wallet linked AND deployer as management key
      this.logger.log(`[ONCHAINID] Calling createIdentityWithManagementKeys(wallet=${walletAddress}, salt="${salt}", mgmtKeys=[deployer])`);
      const tx = await factory.createIdentityWithManagementKeys(
        walletAddress,
        salt,
        [deployerKeyHash],
      );
      const receipt: ethers.TransactionReceipt = await tx.wait();
      deploymentTxHash = receipt.hash;
      blockNumber = receipt.blockNumber;

      // Read back from factory
      identityAddress = await factory.getIdentity(walletAddress);
      if (!identityAddress || identityAddress === ethers.ZeroAddress) {
        throw new InternalServerErrorException(`[ONCHAINID] Identity not found in factory after deployment tx=${deploymentTxHash}`);
      }

      this.logger.log(`[ONCHAINID] Identity deployed: ${identityAddress}  tx=${deploymentTxHash}`);
    } finally {
      // Step C: always restore factory ownership to gateway
      if (!deployerOwnsFactory) {
        this.logger.log(`[ONCHAINID] Restoring IdFactory ownership to gateway...`);
        await factory.transferOwnership(gatewayAddress).then((tx: ethers.TransactionResponse) => tx.wait()).catch((err: Error) => {
          this.logger.error(`[ONCHAINID] CRITICAL: failed to restore factory ownership: ${err.message}`);
        });
        this.logger.log(`[ONCHAINID] IdFactory ownership restored to gateway`);
      }
    }

    // Verify deployer has management key
    const identityContract = new ethers.Contract(identityAddress, IDENTITY_FULL_ABI, signer);
    const deployerHasMgmt: boolean = await identityContract.keyHasPurpose(deployerKeyHash, KEY_PURPOSE.MANAGEMENT).catch(() => false);
    this.logger.log(`[ONCHAINID] Deployer has MANAGEMENT key: ${deployerHasMgmt}`);

    const contractCode = await this.getProvider().getCode(identityAddress);
    this.logger.log(`[ONCHAINID] Contract deployed: ${contractCode.length > 2}  bytes=${(contractCode.length - 2) / 2}`);

    return {
      identityContractAddress: ethers.getAddress(identityAddress),
      deploymentTxHash,
      blockNumber,
      deployer: deployerAddress,
      chainId,
      deployedAt: new Date(),
    };
  }

  /**
   * Add an address as a MANAGEMENT key (purpose=1) on the identity.
   *
   * Requires the CALLER (deployer signer) to already hold a MANAGEMENT key.
   * In the salt-based deployment flow, the deployer is management key from the start.
   */
  async addManagementKey(
    identityAddress: string,
    keyAddress: string,
  ): Promise<KeyOperationResult> {
    this.logger.log(
      `[ONCHAINID] addManagementKey  identity=${identityAddress}  address=${keyAddress}`,
    );
    return this.addKeyInternal(identityAddress, keyAddress, KEY_PURPOSE.MANAGEMENT);
  }

  /**
   * Add the investor's wallet as a key on their identity.
   *
   * Default: MANAGEMENT key (purpose=1) so the investor can self-manage their identity.
   * Pass purpose=2 for ACTION key if you want limited investor access.
   *
   * Requires deployer to be management key (use salt-based deployment to ensure this).
   */
  async addWalletKey(
    identityAddress: string,
    walletAddress: string,
    purpose: 1 | 2 = KEY_PURPOSE.MANAGEMENT,
  ): Promise<KeyOperationResult> {
    const purposeName = purpose === KEY_PURPOSE.MANAGEMENT ? 'MANAGEMENT' : 'ACTION';
    this.logger.log(
      `[ONCHAINID] addWalletKey  identity=${identityAddress}  wallet=${walletAddress}  purpose=${purposeName}`,
    );
    return this.addKeyInternal(identityAddress, walletAddress, purpose);
  }

  /**
   * Set a recovery key — adds the address as a MANAGEMENT key.
   * The recovery address allows identity recovery if the primary wallet is lost.
   *
   * Typically set to a hardware wallet or multi-sig the investor controls.
   */
  async setRecoveryKey(
    identityAddress: string,
    recoveryAddress: string,
  ): Promise<KeyOperationResult> {
    this.logger.log(
      `[ONCHAINID] setRecoveryKey  identity=${identityAddress}  recovery=${recoveryAddress}`,
    );
    return this.addKeyInternal(identityAddress, recoveryAddress, KEY_PURPOSE.MANAGEMENT);
  }

  /**
   * Add the platform claim-issuer EOA as a CLAIM key (purpose=3) on the identity.
   * Required so the backend EOA can call addClaim() on the investor's identity contract.
   */
  async addClaimKey(
    identityAddress: string,
    signerAddress: string,
  ): Promise<KeyOperationResult> {
    this.logger.log(
      `[ONCHAINID] addClaimKey  identity=${identityAddress}  signer=${signerAddress}`,
    );
    return this.addKeyInternal(identityAddress, signerAddress, KEY_PURPOSE.CLAIM);
  }

  // ── Internal helpers ──────────────────────────────────────────────────────────

  private async addKeyInternal(
    identityAddress: string,
    keyAddress: string,
    purpose: number,
  ): Promise<KeyOperationResult> {
    const signer = this.getSigner();
    const deployerAddress = await signer.getAddress();
    const identity = new ethers.Contract(identityAddress, IDENTITY_FULL_ABI, signer);
    const keyHash = this.addrToKeyHash(keyAddress);

    // Verify deployer holds MANAGEMENT key (will throw if not — don't silently skip)
    const deployerKeyHash = this.addrToKeyHash(deployerAddress);
    const signerIsManagement: boolean = await identity.keyHasPurpose(
      deployerKeyHash,
      KEY_PURPOSE.MANAGEMENT,
    );
    if (!signerIsManagement) {
      throw new Error(
        `[ONCHAINID] Deployer ${deployerAddress} does not hold MANAGEMENT key on ${identityAddress}. ` +
          'Salt-based deployment is required for backend key management. ' +
          'Check OID_GATEWAY_ADDRESS supports deployIdentityWithSalt().',
      );
    }

    // Skip if already has this purpose
    const alreadyHasPurpose: boolean = await identity.keyHasPurpose(keyHash, purpose);
    if (alreadyHasPurpose) {
      this.logger.log(
        `[ONCHAINID] Key already present  address=${keyAddress}  purpose=${purpose}  identity=${identityAddress}`,
      );
      return { keyAddress, keyHash, purpose, txHash: '', verified: true };
    }

    const tx = await identity.addKey(keyHash, purpose, KEY_TYPE.ECDSA);
    const receipt: ethers.TransactionReceipt = await tx.wait();

    this.logger.log(
      `[ONCHAINID] addKey tx confirmed  address=${keyAddress}  purpose=${purpose}  tx=${receipt.hash}`,
    );

    // Verify on-chain immediately after tx
    const verified: boolean = await identity.keyHasPurpose(keyHash, purpose);
    if (!verified) {
      this.logger.error(
        `[ONCHAINID] KEY VERIFICATION FAILED  address=${keyAddress}  purpose=${purpose}  identity=${identityAddress}  tx=${receipt.hash}`,
      );
    } else {
      this.logger.log(
        `[ONCHAINID] ✓ Key verified on-chain  address=${keyAddress}  purpose=${purpose}  identity=${identityAddress}`,
      );
    }

    return { keyAddress, keyHash, purpose, txHash: receipt.hash, verified };
  }

  private async verifyContractDeployed(identityAddress: string): Promise<boolean> {
    try {
      const code = await this.getProvider().getCode(identityAddress);
      return code !== '0x' && code.length > 2;
    } catch {
      return false;
    }
  }

  /**
   * Query all MANAGEMENT key hashes from the identity contract.
   */
  private async getManagementKeys(identityAddress: string): Promise<string[]> {
    try {
      const provider = this.getProvider();
      const identity = new ethers.Contract(identityAddress, IDENTITY_FULL_ABI, provider);
      const keyHashes: string[] = await identity.getKeysByPurpose(KEY_PURPOSE.MANAGEMENT);
      return keyHashes;
    } catch {
      return [];
    }
  }

  /**
   * Extract the deployed identity address from a deployment receipt.
   * Tries multiple event signatures to support different OIDGateway variants.
   */
  private async extractIdentityAddressFromReceipt(
    receipt: ethers.TransactionReceipt,
    gateway: ethers.Contract,
  ): Promise<string | null> {
    // Known event topic hashes
    const knownTopics: Record<string, number> = {
      [ethers.id('WalletLinked(address,address)')]: 2,     // identity = topics[2]
      [ethers.id('IdentityDeployed(address)')]: 1,         // identity = topics[1]
      [ethers.id('Deployed(address)')]: 1,                 // identity = topics[1]
      [ethers.id('IdentityCreated(address,address)')]: 2,  // identity = topics[2]
    };

    for (const log of receipt.logs) {
      const topicIndex = knownTopics[log.topics[0]];
      if (topicIndex !== undefined && log.topics[topicIndex]) {
        const addr = `0x${log.topics[topicIndex].slice(-40)}`;
        if (addr !== ethers.ZeroAddress) {
          this.logger.log(
            `[ONCHAINID] Identity address from event topic[${topicIndex}]: ${addr}`,
          );
          return ethers.getAddress(addr);
        }
      }
    }

    // Fallback: try parsing all logs with the gateway ABI
    for (const log of receipt.logs) {
      try {
        const parsed = gateway.interface.parseLog({
          topics: [...log.topics],
          data: log.data,
        });
        if (!parsed) continue;

        const candidate =
          (parsed.args.identity as string | undefined) ??
          (parsed.args[1] as string | undefined) ??
          (parsed.args[0] as string | undefined);

        if (
          candidate &&
          ethers.isAddress(candidate) &&
          candidate !== ethers.ZeroAddress
        ) {
          this.logger.log(
            `[ONCHAINID] Identity address from parsed event ${parsed.name}: ${candidate}`,
          );
          return ethers.getAddress(candidate);
        }
      } catch {
        // Not a gateway log — skip
      }
    }

    this.logger.warn(
      '[ONCHAINID] Could not extract identity address from receipt events. ' +
        'Set ID_FACTORY_ADDRESS for IdFactory.getIdentity() lookup.',
    );
    return null;
  }
}
