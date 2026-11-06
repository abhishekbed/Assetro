import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  Logger,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';
import { TokenService } from './token.service';
import { Token, TokenStatus } from '../entities/token.entity';
import { MintTokenDto, BatchMintDto } from '../dto/mint-token.dto';
import { TokenEligibilityService } from '../../kyc/services/token-eligibility.service';
import { IdentityRegistryService } from '../../identity/services/identity-registry.service';
import { NotificationService } from '../../notifications/services/notification.service';
import { User } from '../../auth/entities/user.entity';

/**
 * Normalize an amount string for ethers.parseUnits().
 * Strips trailing decimal zeros and truncates to at most `decimals` places.
 * Handles DB decimal columns that store "100.00000000" for integer amounts.
 *
 * Examples:
 *   normalizeAmount("100.00000000", 0) → "100"
 *   normalizeAmount("100.50000000", 2) → "100.5"
 *   normalizeAmount("1.123456789", 6) → "1.123456"
 */
function normalizeAmount(amount: string, decimals: number): string {
  const n = parseFloat(amount);
  if (isNaN(n)) throw new Error(`Invalid token amount: "${amount}"`);
  if (decimals === 0) return Math.floor(n).toString();
  // Format to at most `decimals` places, then strip trailing zeros
  return n.toFixed(decimals).replace(/\.?0+$/, '') || '0';
}

const TOKEN_ABI = [
  'function mint(address _to, uint256 _amount) external',
  'function burn(address _from, uint256 _amount) external',
  'function pause() external',
  'function unpause() external',
  'function setAddressFrozen(address _userAddress, bool _freeze) external',
  'function forcedTransfer(address _from, address _to, uint256 _amount) external returns (bool)',
  'function recoveryAddress(address _lostWallet, address _newWallet, address _investorOnchainID) external returns (bool)',
  'function decimals() external view returns (uint8)',
  'function batchMint(address[] calldata _toList, uint256[] calldata _amounts) external',
  'function addAgent(address _agent) external',
  'function removeAgent(address _agent) external',
  'function isAgent(address _agent) external view returns (bool)',
];

export interface TransactionResult {
  transactionHash: string;
  blockNumber: number;
  status: string;
}

@Injectable()
export class TokenLifecycleService {
  private readonly logger = new Logger(TokenLifecycleService.name);
  private readonly blockchainServiceUrl: string;

  constructor(
    private readonly tokenService: TokenService,
    private readonly configService: ConfigService,
    private readonly tokenEligibility: TokenEligibilityService,
    private readonly notificationService: NotificationService,
    private readonly identityRegistry: IdentityRegistryService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {
    this.blockchainServiceUrl = this.configService.get<string>(
      'BLOCKCHAIN_SERVICE_URL',
      'http://localhost:3040',
    );
  }

  async mint(dto: MintTokenDto, tenantId?: string): Promise<TransactionResult> {
    const token = await this.validateActiveToken(dto.token_id, tenantId);

    // Resolve investor user by user_id or connected wallet address
    let user: User | null = null;
    if (dto.user_id) {
      user = await this.userRepository.findOne({ where: { id: dto.user_id } });
    }
    if (!user) {
      user = await this.userRepository
        .createQueryBuilder('u')
        .where('LOWER(u.wallet_address) = LOWER(:wallet)', { wallet: dto.to_address })
        .getOne();
    }
    if (user && (!user.walletAddress || user.walletAddress.toLowerCase() !== dto.to_address.toLowerCase())) {
      user.walletAddress = dto.to_address;
      await this.userRepository.save(user);
    }

    // Auto-register recipient in IdentityRegistry on-chain before executing ERC-3643 mint
    if (token.identityRegistryAddress && user) {
      try {
        const isRegistered = await this.identityRegistry.isRegistered(
          dto.to_address,
          token.identityRegistryAddress,
        );
        if (!isRegistered) {
          this.logger.log(
            `[Mint] Auto-registering recipient ${dto.to_address} in IR ${token.identityRegistryAddress} for user ${user.id} before mint`,
          );
          await this.identityRegistry.registerInToken(
            user.id,
            dto.to_address,
            token.id,
            token.identityRegistryAddress,
            0,
          );
        }
      } catch (err: unknown) {
        this.logger.warn(`[Mint] IR pre-mint auto-registration: ${(err as Error).message}`);
      }
    }

    // ── Eligibility gate: IR.isVerified(to) + claims + compliance rules ──────
    // The recipient wallet MUST be verified in the token's IdentityRegistry
    // before any tokens can be minted to it.
    const eligibility = await this.tokenEligibility.canPurchaseByWallet(
      dto.to_address,
      token.id,
      dto.amount.toString(),
      user?.id,
    );

    if (!eligibility.eligible) {
      let isVerifiedOnChain = false;
      const rpcUrlCheck = this.configService.get<string>('SEPOLIA_RPC_URL');
      if (rpcUrlCheck && token.identityRegistryAddress) {
        try {
          const provider = new ethers.JsonRpcProvider(rpcUrlCheck, undefined, { staticNetwork: true });
          const irAbi = ['function isVerified(address) view returns (bool)'];
          const ir = new ethers.Contract(token.identityRegistryAddress, irAbi, provider);
          isVerifiedOnChain = await ir.isVerified(dto.to_address);
          if (isVerifiedOnChain) {
            this.logger.log(`[Mint] Wallet ${dto.to_address} verified on-chain in IdentityRegistry ✓`);
          }
        } catch (err) {
          this.logger.warn(`[Mint] IR on-chain check error: ${(err as Error).message}`);
        }
      }

      if (!isVerifiedOnChain) {
        const reasons = eligibility.reasons.join('; ');
        this.logger.warn(
          `[Mint] BLOCKED  wallet=${dto.to_address}  token=${token.id}  reasons=${reasons}`,
        );
        throw new ForbiddenException(
          `Wallet ${dto.to_address} is not eligible to receive token ${token.id}: ${reasons}`,
        );
      }
    }

    await this.assertVerifiedOnChain(token, dto.to_address);

    this.logger.log(
      `[Mint] Eligibility confirmed  wallet=${dto.to_address}  isWhitelisted=${eligibility.isWhitelisted}  complianceAllowed=${eligibility.complianceAllowed}`,
    );
    this.logger.log(`Minting ${dto.amount} tokens to ${dto.to_address} for token ${token.id}`);

    const result = await this.callBlockchainAction(token, 'mint', {
      to: dto.to_address,
      amount: dto.amount,
    });

    // ── Emit payment.minted notification ─────────────────────────────────────
    // Find the investor by wallet address and notify them
    this.emitMintedNotification(token, dto.to_address, dto.amount, result.transactionHash).catch(
      (err: Error) => this.logger.warn(`[Mint] notification failed: ${err.message}`),
    );

    return result;
  }

  async burn(
    tokenId: string,
    fromAddress: string,
    amount: string,
    tenantId?: string,
  ): Promise<TransactionResult> {
    const token = await this.validateActiveToken(tokenId, tenantId);

    this.logger.log(`Burning ${amount} tokens from ${fromAddress} for token ${token.id}`);

    return this.callBlockchainAction(token, 'burn', {
      from: fromAddress,
      amount,
    });
  }

  async pause(tokenId: string, tenantId?: string): Promise<TransactionResult> {
    const token = await this.validateActiveToken(tokenId, tenantId);

    this.logger.log(`Pausing token ${token.id}`);

    const result = await this.callBlockchainAction(token, 'pause', {});
    await this.tokenService.updateStatus(tokenId, TokenStatus.PAUSED);

    return result;
  }

  async unpause(tokenId: string, tenantId?: string): Promise<TransactionResult> {
    const token = await this.tokenService.findById(tokenId, tenantId);

    if (token.status !== TokenStatus.PAUSED) {
      throw new BadRequestException(
        `Token must be paused to unpause. Current status: ${token.status}`,
      );
    }

    this.logger.log(`Unpausing token ${token.id}`);

    const result = await this.callBlockchainAction(token, 'unpause', {});
    await this.tokenService.updateStatus(tokenId, TokenStatus.ACTIVE);

    return result;
  }

  async freezeAddress(
    tokenId: string,
    address: string,
    tenantId?: string,
  ): Promise<TransactionResult> {
    const token = await this.validateActiveToken(tokenId, tenantId);

    this.logger.log(`Freezing address ${address} for token ${token.id}`);

    return this.callBlockchainAction(token, 'freeze', { address });
  }

  async recoveryAddress(
    tokenId: string,
    lostWallet: string,
    newWallet: string,
    investorOnchainId: string,
    tenantId?: string,
  ): Promise<TransactionResult> {
    const token = await this.validateActiveToken(tokenId, tenantId);
    this.logger.log(`Recovery: token=${token.id} lost=${lostWallet} new=${newWallet} onchainId=${investorOnchainId}`);
    return this.callBlockchainAction(token, 'recovery', {
      lostWallet,
      newWallet,
      investorOnchainId,
    });
  }

  async forceTransfer(
    tokenId: string,
    fromAddress: string,
    toAddress: string,
    amount: string,
    tenantId?: string,
  ): Promise<TransactionResult> {
    const token = await this.validateActiveToken(tokenId, tenantId);
    this.logger.log(`Force transfer ${amount} tokens from ${fromAddress} to ${toAddress} on token ${token.id}`);
    return this.callBlockchainAction(token, 'forceTransfer', { from: fromAddress, to: toAddress, amount });
  }

  async unfreezeAddress(
    tokenId: string,
    address: string,
    tenantId?: string,
  ): Promise<TransactionResult> {
    const token = await this.validateActiveToken(tokenId, tenantId);

    this.logger.log(`Unfreezing address ${address} for token ${token.id}`);

    return this.callBlockchainAction(token, 'unfreeze', { address });
  }

  async batchMint(dto: BatchMintDto, tenantId?: string): Promise<TransactionResult> {
    const token = await this.validateActiveToken(dto.token_id, tenantId);

    this.logger.log(
      `Batch minting to ${dto.recipients.length} recipients for token ${token.id}`,
    );

    return this.callBlockchainAction(token, 'batchMint', {
      recipients: dto.recipients,
    });
  }

  /** Fire-and-forget: create in-app notification for investor after mint succeeds */
  private async emitMintedNotification(
    token: Token,
    walletAddress: string,
    amount: string,
    txHash: string,
  ): Promise<void> {
    const user = await this.userRepository.findOne({
      where: { walletAddress: walletAddress.toLowerCase() },
    }).catch(() => null)
    ?? await this.userRepository.findOne({
      where: { walletAddress },
    }).catch(() => null);

    if (!user) {
      this.logger.debug(`[Mint] No user found for wallet ${walletAddress} — skipping notification`);
      return;
    }

    await this.notificationService.create({
      userId: user.id,
      title: 'Tokens Minted to Your Wallet',
      message: `${parseFloat(amount).toLocaleString('en-US')} ${token.symbol} tokens have been minted to your wallet. Transaction: ${txHash.slice(0, 10)}...`,
      type: 'success',
      channel: 'in_app',
      category: 'payment',
      metadata: {
        token_id: token.id,
        token_name: token.name,
        token_symbol: token.symbol,
        amount,
        tx_hash: txHash,
        wallet_address: walletAddress,
        event: 'payment.minted',
      },
      tenantId: token.tenantId ?? undefined,
    });

    this.logger.log(`[Mint] payment.minted notification sent to user=${user.id}  token=${token.symbol}  amount=${amount}`);
  }

  private async validateActiveToken(tokenId: string, tenantId?: string): Promise<Token> {
    const token = await this.tokenService.findById(tokenId, tenantId);

    if (token.status !== TokenStatus.ACTIVE) {
      throw new BadRequestException(
        `Token must be active to perform this operation. Current status: ${token.status}`,
      );
    }

    if (!token.tokenAddress) {
      throw new BadRequestException('Token has not been deployed to the blockchain');
    }

    return token;
  }

  /**
   * The token contract rejects a mint to an unverified identity with a bare
   * revert, which would surface as a 500. Check IR.isVerified() up front and,
   * when it fails, name the claim topics the investor's ONCHAINID is missing.
   */
  private async assertVerifiedOnChain(token: Token, wallet: string): Promise<void> {
    if (this.configService.get<string>('BLOCKCHAIN_MODE', 'local') === 'local') return;
    const rpcUrl = this.configService.get<string>('SEPOLIA_RPC_URL');
    if (!rpcUrl || !token.identityRegistryAddress) return;

    try {
      const provider = new ethers.JsonRpcProvider(rpcUrl, undefined, { staticNetwork: true });
      const ir = new ethers.Contract(
        token.identityRegistryAddress,
        [
          'function isVerified(address) view returns (bool)',
          'function identity(address) view returns (address)',
          'function topicsRegistry() view returns (address)',
        ],
        provider,
      );
      if (await ir.isVerified(wallet)) return;

      const missing: string[] = [];
      const identityAddr: string = await ir.identity(wallet);
      if (identityAddr !== ethers.ZeroAddress) {
        const ctr = new ethers.Contract(
          await ir.topicsRegistry(),
          ['function getClaimTopics() view returns (uint256[])'],
          provider,
        );
        const identity = new ethers.Contract(
          identityAddr,
          ['function getClaimIdsByTopic(uint256) view returns (bytes32[])'],
          provider,
        );
        for (const topic of (await ctr.getClaimTopics()) as bigint[]) {
          if ((await identity.getClaimIdsByTopic(topic)).length === 0) missing.push(topic.toString());
        }
      }

      const detail = missing.length
        ? `missing claim topic(s) ${missing.join(', ')} on its on-chain identity`
        : 'its claims are not signed by a trusted issuer or are invalid';
      throw new HttpException(
        `Wallet ${wallet} is not verified in the token's IdentityRegistry: ${detail}. ` +
          `Re-run the investor's KYC claim issuance, then retry the mint.`,
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    } catch (err) {
      if (err instanceof HttpException) throw err;
      this.logger.warn(`[Mint] isVerified pre-check RPC error (proceeding): ${(err as Error).message}`);
    }
  }

  /**
   * Runs a token action and turns contract reverts / RPC failures into
   * readable 4xx/5xx HTTP errors, instead of leaking a raw ethers error as an
   * opaque 500.
   */
  private async callBlockchainAction(
    token: Token,
    action: string,
    payload: Record<string, unknown>,
  ): Promise<TransactionResult> {
    try {
      return await this.executeBlockchainAction(token, action, payload);
    } catch (err) {
      if (err instanceof HttpException) throw err;
      const e = err as { code?: string; reason?: string; shortMessage?: string; message?: string };
      this.logger.error(`[Blockchain] '${action}' failed for token ${token.id}: ${e.shortMessage ?? e.message}`);
      if (e.code === 'CALL_EXCEPTION' || e.code === 'UNPREDICTABLE_GAS_LIMIT') {
        throw new HttpException(
          `On-chain '${action}' was rejected by the contract: ${e.reason ?? e.shortMessage ?? 'execution reverted'}`,
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }
      if (e.code === 'INSUFFICIENT_FUNDS') {
        throw new HttpException(
          `The platform wallet has insufficient funds to send the '${action}' transaction.`,
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
      throw new HttpException(
        `Blockchain '${action}' failed: ${e.shortMessage ?? e.message ?? 'unknown error'}`,
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  private async executeBlockchainAction(
    token: Token,
    action: string,
    payload: Record<string, unknown>,
  ): Promise<TransactionResult> {
    const mode = this.configService.get<string>('BLOCKCHAIN_MODE', 'local');

    if (mode === 'local') {
      this.logger.warn(`[Blockchain] LOCAL mode — simulating '${action}' for token ${token.id}`);
      return {
        transactionHash: '0x' + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join(''),
        blockNumber: Math.floor(Math.random() * 1000000) + 1000000,
        status: 'confirmed',
      };
    }

    // ── LIVE mode: on-chain canTransfer() pre-check before signing ────────────
    // Force/burn are agent operations that bypass compliance modules — skip check.
    // Mint and batchMint call compliance.created() which fires moduleCheck.
    if (token.complianceAddress && (action === 'mint' || action === 'batchMint')) {
      const rpcUrlCheck = this.configService.get<string>('SEPOLIA_RPC_URL');
      if (rpcUrlCheck) {
        try {
          const provider = new ethers.JsonRpcProvider(rpcUrlCheck, undefined, { staticNetwork: true });
          const cAbi = ['function canTransfer(address,address,uint256) view returns (bool)'];
          const compliance = new ethers.Contract(token.complianceAddress, cAbi, provider);
          const decimals = token.decimals ?? 18;

          if (action === 'mint') {
            const toAddr = String(payload.to);
            const valueWei = ethers.parseUnits(normalizeAmount(String(payload.amount), decimals), decimals);
            const canTransfer: boolean = await compliance.canTransfer(ethers.ZeroAddress, toAddr, valueWei);
            if (!canTransfer) {
              throw new HttpException(
                `Mint blocked by on-chain compliance module (compliance.canTransfer = false). ` +
                `Check SupplyLimit, MaxBalance, MaxHolder, CountryRestrict, or TransferWindow rules bound to this token.`,
                HttpStatus.UNPROCESSABLE_ENTITY,
              );
            }
            this.logger.log(`[Mint] compliance.canTransfer(0x0, ${toAddr}, ${valueWei}) = TRUE ✓`);
          }

          if (action === 'batchMint') {
            const recipients = payload.recipients as Array<{ address: string; amount: string }>;
            for (const r of recipients) {
              const valueWei = ethers.parseUnits(normalizeAmount(r.amount, decimals), decimals);
              const canTransfer: boolean = await compliance.canTransfer(ethers.ZeroAddress, r.address, valueWei);
              if (!canTransfer) {
                throw new HttpException(
                  `Batch mint blocked for recipient ${r.address} by on-chain compliance module.`,
                  HttpStatus.UNPROCESSABLE_ENTITY,
                );
              }
            }
            this.logger.log(`[BatchMint] compliance.canTransfer checks passed for all ${(payload.recipients as []).length} recipients ✓`);
          }
        } catch (err) {
          if (err instanceof HttpException) throw err;
          this.logger.warn(`[${action}] canTransfer pre-check RPC error (proceeding): ${(err as Error).message}`);
        }
      }
    }

    // ── LIVE mode: call token contract directly via ethers.js ─────────────────
    const rpcUrl = this.configService.get<string>('SEPOLIA_RPC_URL');
    const pk = this.configService.get<string>('DEPLOYER_PRIVATE_KEY');

    if (!rpcUrl || !pk) {
      throw new HttpException(
        '[Blockchain] SEPOLIA_RPC_URL or DEPLOYER_PRIVATE_KEY not configured',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    if (!token.tokenAddress) {
      throw new BadRequestException('Token contract address not set — deploy the token first');
    }

    const provider = new ethers.JsonRpcProvider(rpcUrl, undefined, { staticNetwork: true });
    const signer = new ethers.Wallet(pk.startsWith('0x') ? pk : `0x${pk}`, provider);
    const contract = new ethers.Contract(token.tokenAddress, TOKEN_ABI, signer);
    const decimals = token.decimals ?? 18;

    let tx: ethers.TransactionResponse;

    switch (action) {
      case 'mint': {
        const amountWei = ethers.parseUnits(normalizeAmount(String(payload.amount), decimals), decimals);
        this.logger.log(`[Mint] token=${token.tokenAddress} to=${payload.to} amount=${amountWei}`);
        tx = await contract.mint(payload.to, amountWei);
        break;
      }
      case 'burn': {
        const amountWei = ethers.parseUnits(normalizeAmount(String(payload.amount), decimals), decimals);
        this.logger.log(`[Burn] token=${token.tokenAddress} from=${payload.from} amount=${amountWei}`);
        tx = await contract.burn(payload.from, amountWei);
        break;
      }
      case 'pause':
        this.logger.log(`[Pause] token=${token.tokenAddress}`);
        tx = await contract.pause();
        break;
      case 'unpause':
        this.logger.log(`[Unpause] token=${token.tokenAddress}`);
        tx = await contract.unpause();
        break;
      case 'freeze':
        this.logger.log(`[Freeze] token=${token.tokenAddress} address=${payload.address}`);
        tx = await contract.setAddressFrozen(payload.address, true);
        break;
      case 'unfreeze':
        this.logger.log(`[Unfreeze] token=${token.tokenAddress} address=${payload.address}`);
        tx = await contract.setAddressFrozen(payload.address, false);
        break;
      case 'forceTransfer': {
        const ftAmount = ethers.parseUnits(normalizeAmount(String(payload.amount), decimals), decimals);
        this.logger.log(`[ForceTransfer] token=${token.tokenAddress} from=${payload.from} to=${payload.to} amount=${ftAmount}`);
        tx = await contract.forcedTransfer(payload.from, payload.to, ftAmount);
        break;
      }
      case 'recovery':
        this.logger.log(`[Recovery] token=${token.tokenAddress} lost=${payload.lostWallet} new=${payload.newWallet}`);
        tx = await contract.recoveryAddress(payload.lostWallet, payload.newWallet, payload.investorOnchainId);
        break;
      case 'batchMint': {
        const recipients = payload.recipients as Array<{ address: string; amount: string }>;
        const addresses = recipients.map((r) => r.address);
        const amounts = recipients.map((r) => ethers.parseUnits(r.amount, decimals));
        this.logger.log(`[BatchMint] token=${token.tokenAddress} recipients=${addresses.length}`);
        tx = await contract.batchMint(addresses, amounts);
        break;
      }
      default:
        throw new HttpException(
          `Blockchain action '${action}' not implemented in live mode`,
          HttpStatus.NOT_IMPLEMENTED,
        );
    }

    const receipt = await tx.wait() as ethers.TransactionReceipt;
    this.logger.log(`[Blockchain] '${action}' confirmed  tx=${receipt.hash}  block=${receipt.blockNumber}`);

    return {
      transactionHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      status: 'confirmed',
    };
  }

  /**
   * Prepares an investor's wallet address to mint directly on-chain via MetaMask:
   * 1. Auto-registers the investor in the token's IdentityRegistry if not already registered.
   * 2. Authorizes the investor's wallet address as a token agent on the contract so the
   *    transaction can be signed directly by the investor's MetaMask (msg.sender = investor).
   */
  async prepareInvestorForMint(tokenId: string, investorAddress: string): Promise<void> {
    const token = await this.validateActiveToken(tokenId);
    if (!token.tokenAddress) {
      throw new BadRequestException('Token contract address not set');
    }

    // 1. Ensure recipient is registered in IdentityRegistry
    if (token.identityRegistryAddress) {
      try {
        const isRegistered = await this.identityRegistry.isRegistered(
          investorAddress,
          token.identityRegistryAddress,
        );
        if (!isRegistered) {
          const user = await this.userRepository
            .createQueryBuilder('u')
            .where('LOWER(u.wallet_address) = LOWER(:wallet)', { wallet: investorAddress })
            .getOne();
          if (user) {
            this.logger.log(
              `[PrepareMint] Registering ${investorAddress} in IR ${token.identityRegistryAddress}`,
            );
            await this.identityRegistry.registerInToken(
              user.id,
              investorAddress,
              token.id,
              token.identityRegistryAddress,
              0,
            );
          }
        }
      } catch (err: unknown) {
        this.logger.warn(`[PrepareMint] IR registration error: ${(err as Error).message}`);
      }
    }

    // 2. Grant temporary agent role on the token contract so investor's MetaMask can sign mint()
    const rpcUrl = this.configService.get<string>('SEPOLIA_RPC_URL');
    const pk = this.configService.get<string>('DEPLOYER_PRIVATE_KEY');
    if (!rpcUrl || !pk) return;

    try {
      const provider = new ethers.JsonRpcProvider(rpcUrl, undefined, { staticNetwork: true });
      const signer = new ethers.Wallet(pk.startsWith('0x') ? pk : `0x${pk}`, provider);
      const contract = new ethers.Contract(token.tokenAddress, TOKEN_ABI, signer);

      const isAlreadyAgent = await contract.isAgent(investorAddress);
      if (!isAlreadyAgent) {
        this.logger.log(
          `[PrepareMint] Authorizing investor ${investorAddress} as agent on token ${token.tokenAddress}`,
        );
        const tx = await contract.addAgent(investorAddress);
        await tx.wait();
        this.logger.log(`[PrepareMint] Investor ${investorAddress} authorized as agent ✓`);
      }
    } catch (err: unknown) {
      this.logger.warn(`[PrepareMint] Failed to add agent: ${(err as Error).message}`);
    }
  }

  /**
   * Cleans up temporary agent role after investor successfully mints via MetaMask.
   */
  async removeInvestorAgent(tokenId: string, investorAddress: string): Promise<void> {
    try {
      const token = await this.tokenService.findById(tokenId);
      if (!token?.tokenAddress) return;

      const rpcUrl = this.configService.get<string>('SEPOLIA_RPC_URL');
      const pk = this.configService.get<string>('DEPLOYER_PRIVATE_KEY');
      if (!rpcUrl || !pk) return;

      const provider = new ethers.JsonRpcProvider(rpcUrl, undefined, { staticNetwork: true });
      const signer = new ethers.Wallet(pk.startsWith('0x') ? pk : `0x${pk}`, provider);
      const contract = new ethers.Contract(token.tokenAddress, TOKEN_ABI, signer);

      const isAgent = await contract.isAgent(investorAddress);
      if (isAgent) {
        this.logger.log(
          `[RemoveAgent] Revoking agent role from investor ${investorAddress} on token ${token.tokenAddress}`,
        );
        const tx = await contract.removeAgent(investorAddress);
        await tx.wait();
      }
    } catch (err: unknown) {
      this.logger.warn(`[RemoveAgent] Failed to remove agent: ${(err as Error).message}`);
    }
  }
}
