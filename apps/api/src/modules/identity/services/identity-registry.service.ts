import {
  Injectable,
  Logger,
  NotFoundException,
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';
import { OnchainIdentity } from '../entities/onchain-identity.entity';
import { User } from '../../auth/entities/user.entity';
import { IdentityDeploymentService } from './identity-deployment.service';

const IDENTITY_REGISTRY_ABI = [
  'function registerIdentity(address _userAddress, address _identity, uint16 _country) external',
  'function updateIdentity(address _userAddress, address _identity) external',
  'function updateCountry(address _userAddress, uint16 _country) external',
  'function deleteIdentity(address _userAddress) external',
  'function isVerified(address _userAddress) external view returns (bool)',
  'function identity(address _userAddress) external view returns (address)',
  'function investorCountry(address _userAddress) external view returns (uint16)',
  'function isAgent(address _agent) external view returns (bool)',
  'function addAgent(address _agent) external',
  'event IdentityRegistered(address indexed investorAddress, address indexed identity, uint16 country)',
  'event IdentityRemoved(address indexed investorAddress)',
  'event CountryUpdated(address indexed investorAddress, uint16 country)',
];

// ── Result type ───────────────────────────────────────────────────────────────

export interface RegisterIdentityResult {
  txHash: string;
  walletAddress: string;
  identityAddress: string;
  country: number;
  /** Address returned by IR.identity(wallet) after registration — should match identityAddress */
  verifiedAddress: string | null;
  verificationPassed: boolean;
  alreadyRegistered: boolean;
  /** Final IR.isVerified(wallet) result — the real on-chain whitelist status */
  isWhitelisted: boolean;
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class IdentityRegistryService {
  private readonly logger = new Logger(IdentityRegistryService.name);
  private providerCache: ethers.JsonRpcProvider | null = null;
  private signerCache: ethers.Wallet | null = null;

  constructor(
    @InjectRepository(OnchainIdentity)
    private readonly identityRepo: Repository<OnchainIdentity>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly config: ConfigService,
    private readonly identityDeployment: IdentityDeploymentService,
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
            ? '[IdentityRegistry] BLOCKCHAIN_MODE=local requires LOCAL_BLOCKCHAIN_RPC_URL'
            : '[IdentityRegistry] SEPOLIA_RPC_URL not configured',
        );
      }
      this.providerCache = new ethers.JsonRpcProvider(rpcUrl, undefined, { staticNetwork: true });
    }
    return this.providerCache;
  }

  private getSigner(): ethers.Wallet {
    if (!this.signerCache) {
      const pk = this.config.get<string>('DEPLOYER_PRIVATE_KEY');
      if (!pk)
        throw new InternalServerErrorException('[IdentityRegistry] DEPLOYER_PRIVATE_KEY not configured');
      this.signerCache = new ethers.Wallet(
        pk.startsWith('0x') ? pk : `0x${pk}`,
        this.getProvider(),
      );
    }
    return this.signerCache;
  }

  // ── Core: register investor wallet + identity in the token's IR ───────────

  /**
   * Call IdentityRegistry.registerIdentity(wallet, identity, country) on-chain,
   * then immediately verify with IdentityRegistry.identity(wallet) to confirm the
   * registration was persisted.
   *
   * Idempotent: if already registered, runs the verification check and returns early.
   *
   * Works in BOTH local (Hardhat/Anvil) and live (Sepolia) modes — there are no mocks.
   */
  async registerInToken(
    userId: string,
    walletAddress: string,
    tokenId: string,
    identityRegistryAddress: string,
    countryCode: number = 0,
  ): Promise<RegisterIdentityResult> {
    // ── Resolve wallet ─────────────────────────────────────────────────────
    if (!walletAddress) {
      const user = await this.userRepo.findOne({ where: { id: userId } });
      if (!user?.walletAddress) {
        throw new BadRequestException(
          '[IdentityRegistry] Wallet address is required to register in IdentityRegistry',
        );
      }
      walletAddress = user.walletAddress;
    }

    // ── Resolve identity contract ──────────────────────────────────────────
    const onchainId = await this.identityDeployment.getIdentityByUser(userId);
    if (!onchainId) {
      throw new NotFoundException(
        `[IdentityRegistry] No deployed ONCHAINID for user ${userId}. Deploy identity first.`,
      );
    }

    const identityAddress = onchainId.identityContractAddress;

    this.logger.log(`══════════════════════════════════════════════════════════════`);
    this.logger.log(
      `[IdentityRegistry] registerInToken START  user=${userId}  wallet=${walletAddress}  identity=${identityAddress}  ir=${identityRegistryAddress}  country=${countryCode}`,
    );
    this.logger.log(`══════════════════════════════════════════════════════════════`);

    const signer = this.getSigner();
    const deployerAddress = await signer.getAddress();
    const ir = new ethers.Contract(identityRegistryAddress, IDENTITY_REGISTRY_ABI, signer);

    // ── Verify deployer is an IR agent ─────────────────────────────────────
    // registerIdentity requires onlyAgent. Tokens deployed via deployTREXSuite always
    // have the deployer added as irAgent. Tokens deployed externally may not.
    const isAgent: boolean = await ir.isAgent(deployerAddress).catch(() => false);
    if (!isAgent) {
      throw new BadRequestException(
        `[IdentityRegistry] Deployer ${deployerAddress} is not an IR agent on ${identityRegistryAddress}. ` +
        'Ensure the token was deployed via deployTREXSuite with irAgents:[deployerAddress], ' +
        'or call ir.addAgent(deployerAddress) from the IR owner.',
      );
    }

    // ── Check if already registered ────────────────────────────────────────
    const alreadyVerified: boolean = await ir.isVerified(walletAddress);

    if (alreadyVerified) {
      this.logger.log(
        `[IdentityRegistry] ${walletAddress} is already registered in IR ${identityRegistryAddress} — running verification check`,
      );
      const verifiedAddress = await this.verifyRegistration(ir, walletAddress, identityAddress);
      const isWhitelisted = await this.confirmWhitelisted(ir, walletAddress);
      await this.identityDeployment.addRegisteredToken(userId, tokenId);

      this.logger.log(
        `[IdentityRegistry] Already registered  wallet=${walletAddress}  identity(wallet)=${verifiedAddress}  isVerified=${isWhitelisted}`,
      );

      return {
        txHash: '',
        walletAddress,
        identityAddress,
        country: countryCode,
        verifiedAddress,
        verificationPassed: verifiedAddress?.toLowerCase() === identityAddress.toLowerCase(),
        alreadyRegistered: true,
        isWhitelisted,
      };
    }

    // ── Call registerIdentity on-chain ─────────────────────────────────────
    this.logger.log(
      `[IdentityRegistry] Calling registerIdentity(wallet=${walletAddress}, identity=${identityAddress}, country=${countryCode})`,
    );

    const tx = await ir.registerIdentity(walletAddress, identityAddress, countryCode);
    const receipt: ethers.TransactionReceipt = await tx.wait();

    this.logger.log(
      `[IdentityRegistry] registerIdentity tx confirmed  tx=${receipt.hash}  block=${receipt.blockNumber}`,
    );

    // ── Verify: IR.identity(wallet) must return our identity address ───────
    const verifiedAddress = await this.verifyRegistration(ir, walletAddress, identityAddress);

    if (verifiedAddress && verifiedAddress.toLowerCase() === identityAddress.toLowerCase()) {
      this.logger.log(
        `[IdentityRegistry] ✓ identity() check passed  IR.identity(${walletAddress}) = ${verifiedAddress}`,
      );
    } else {
      this.logger.error(
        `[IdentityRegistry] ✗ identity() check FAILED  returned=${verifiedAddress ?? 'null'}  expected=${identityAddress}`,
      );
    }

    // ── Final whitelist check: isVerified(wallet) must be TRUE ─────────────
    const isWhitelisted = await this.confirmWhitelisted(ir, walletAddress);

    // Update DB — investor is now registered in this token's IR
    await this.identityDeployment.addRegisteredToken(userId, tokenId);

    this.logger.log(`══════════════════════════════════════════════════════════════`);
    this.logger.log(
      `[IdentityRegistry] registerInToken COMPLETE  wallet=${walletAddress}  tx=${receipt.hash}  isWhitelisted=${isWhitelisted}`,
    );
    this.logger.log(`══════════════════════════════════════════════════════════════`);

    return {
      txHash: receipt.hash,
      walletAddress,
      identityAddress,
      country: countryCode,
      verifiedAddress,
      verificationPassed: verifiedAddress?.toLowerCase() === identityAddress.toLowerCase(),
      alreadyRegistered: false,
      isWhitelisted,
    };
  }

  // ── Query methods ─────────────────────────────────────────────────────────

  /**
   * Returns true if the wallet has a registered identity in this IR.
   * Calls IR.isVerified(wallet) on-chain in both local and live modes.
   */
  async isRegistered(walletAddress: string, identityRegistryAddress: string): Promise<boolean> {
    try {
      const signer = this.getSigner();
      const ir = new ethers.Contract(identityRegistryAddress, IDENTITY_REGISTRY_ABI, signer);
      const verified: boolean = await ir.isVerified(walletAddress);
      this.logger.debug(
        `[IdentityRegistry] isVerified(${walletAddress}) = ${verified}  ir=${identityRegistryAddress}`,
      );
      return verified;
    } catch (err: unknown) {
      this.logger.warn(
        `[IdentityRegistry] isVerified check failed for ${walletAddress}: ${(err as Error).message}`,
      );
      return false;
    }
  }

  /**
   * Returns the identity contract address registered for a wallet, or null.
   * Calls IR.identity(wallet) on-chain in both local and live modes.
   */
  async getRegisteredIdentity(
    walletAddress: string,
    identityRegistryAddress: string,
  ): Promise<string | null> {
    try {
      const signer = this.getSigner();
      const ir = new ethers.Contract(identityRegistryAddress, IDENTITY_REGISTRY_ABI, signer);
      const addr: string = await ir.identity(walletAddress);
      return addr === ethers.ZeroAddress ? null : addr;
    } catch (err: unknown) {
      this.logger.warn(
        `[IdentityRegistry] identity() lookup failed for ${walletAddress}: ${(err as Error).message}`,
      );
      return null;
    }
  }

  // ── Whitelist verification ────────────────────────────────────────────────

  /**
   * Authoritative whitelist check: calls IdentityRegistry.isVerified(wallet) on-chain.
   *
   * This is the REAL whitelist — not database state.
   * An investor is eligible to transfer tokens if and only if this returns true.
   *
   * Works in both local (Hardhat/Anvil) and live (Sepolia) modes.
   */
  async verifyWhitelist(walletAddress: string, identityRegistryAddress: string): Promise<boolean> {
    this.logger.log(
      `[IdentityRegistry] verifyWhitelist  wallet=${walletAddress}  ir=${identityRegistryAddress}`,
    );
    try {
      const signer = this.getSigner();
      const ir = new ethers.Contract(identityRegistryAddress, IDENTITY_REGISTRY_ABI, signer);
      const whitelisted: boolean = await ir.isVerified(walletAddress);
      if (whitelisted) {
        this.logger.log(
          `[IdentityRegistry] ✓ IR.isVerified(${walletAddress}) = TRUE — investor IS whitelisted`,
        );
      } else {
        this.logger.error(
          `[IdentityRegistry] ✗ IR.isVerified(${walletAddress}) = FALSE — investor is NOT whitelisted`,
        );
      }
      return whitelisted;
    } catch (err: unknown) {
      this.logger.error(
        `[IdentityRegistry] verifyWhitelist failed for ${walletAddress}: ${(err as Error).message}`,
      );
      return false;
    }
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private async confirmWhitelisted(ir: ethers.Contract, walletAddress: string): Promise<boolean> {
    try {
      const whitelisted: boolean = await ir.isVerified(walletAddress);
      if (whitelisted) {
        this.logger.log(
          `[IdentityRegistry] ✓ IR.isVerified(${walletAddress}) = TRUE — whitelist confirmed`,
        );
      } else {
        this.logger.error(
          `[IdentityRegistry] ✗ IR.isVerified(${walletAddress}) = FALSE — registration succeeded but whitelist check failed`,
        );
      }
      return whitelisted;
    } catch (err: unknown) {
      this.logger.error(
        `[IdentityRegistry] isVerified() call failed after registration: ${(err as Error).message}`,
      );
      return false;
    }
  }

  /**
   * Call IR.identity(wallet) and return the registered identity address.
   * Logs a clear error if the returned address doesn't match what we just registered.
   */
  private async verifyRegistration(
    ir: ethers.Contract,
    walletAddress: string,
    expectedIdentityAddress: string,
  ): Promise<string | null> {
    try {
      const registeredIdentity: string = await ir.identity(walletAddress);

      if (!registeredIdentity || registeredIdentity === ethers.ZeroAddress) {
        this.logger.error(
          `[IdentityRegistry] IR.identity(${walletAddress}) returned zero address — registration may have failed`,
        );
        return null;
      }

      return registeredIdentity;
    } catch (err: unknown) {
      this.logger.error(
        `[IdentityRegistry] IR.identity() call failed for ${walletAddress}: ${(err as Error).message}`,
      );
      return null;
    }
  }
}
