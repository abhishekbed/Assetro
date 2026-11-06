import {
  Injectable,
  BadRequestException,
  Logger,
  HttpException,
  HttpStatus,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';
import { TokenService } from './token.service';
import { TokenStatus, DEPLOYABLE_TOKEN_STATUSES } from '../entities/token.entity';
import { IssuerQualificationService } from '../../kyc/services/issuer-qualification.service';
import { TrustedIssuersRegistryService } from '../../identity/services/trusted-issuers-registry.service';
import { ClaimTopicsRegistryService } from '../../identity/services/claim-topics-registry.service';
import { CLAIM_TOPICS } from '../../identity/services/claim-issuance.service';

// ── ABIs ──────────────────────────────────────────────────────────────────────

const TREX_GATEWAY_ABI = [
  // No _salt param — gateway derives salt from owner+name internally
  'function deployTREXSuite(tuple(address owner, string name, string symbol, uint8 decimals, address irs, address ONCHAINID, address[] irAgents, address[] tokenAgents, address[] complianceModules, bytes[] complianceSettings) _tokenDetails, tuple(uint256[] claimTopics, address[] issuers, uint256[][] issuerClaims) _claimDetails) external',
  'function isDeployer(address deployer) external view returns (bool)',
  'function getPublicDeploymentStatus() external view returns (bool)',
];

const TREX_FACTORY_EVENTS_ABI = [
  // emitted by TREXFactory inside the gateway tx — carries all deployed addresses
  'event TREXSuiteDeployed(address indexed _token, address _ir, address _irs, address _tir, address _ctr, address _mc, string indexed _salt)',
];

export interface DeploymentResult {
  tokenAddress: string;
  identityRegistryAddress: string;
  complianceAddress: string;
  claimTopicsAddress: string;
  trustedIssuersAddress: string;
  transactionHash: string;
  blockNumber: number;
}

export interface DeploymentStatus {
  tokenId: string;
  status: TokenStatus;
  tokenAddress: string | null;
  deployedAt: Date | null;
}

@Injectable()
export class TokenDeploymentService {
  private readonly logger = new Logger(TokenDeploymentService.name);
  private readonly blockchainServiceUrl: string;

  constructor(
    private readonly tokenService: TokenService,
    private readonly configService: ConfigService,
    @Inject(forwardRef(() => IssuerQualificationService))
    private readonly qualificationService: IssuerQualificationService,
    private readonly trustedIssuersRegistry: TrustedIssuersRegistryService,
    private readonly claimTopicsRegistry: ClaimTopicsRegistryService,
  ) {
    this.blockchainServiceUrl = this.configService.get<string>(
      'BLOCKCHAIN_SERVICE_URL',
      'http://localhost:3040',
    );
  }

  async deployToken(tokenId: string, tenantId?: string): Promise<DeploymentResult> {
    const token = await this.tokenService.findById(tokenId, tenantId);

    if (!DEPLOYABLE_TOKEN_STATUSES.includes(token.status)) {
      throw new BadRequestException(
        token.status === TokenStatus.PENDING_APPROVAL
          ? 'This token is still awaiting platform approval and cannot be deployed yet.'
          : token.status === TokenStatus.REJECTED
            ? `This token was rejected and cannot be deployed. Reason: ${token.rejectionReason ?? 'not given'}`
            : `Token must be approved before deployment. Current status: ${token.status}`,
      );
    }

    // Transition to deploying status
    await this.tokenService.updateStatus(tokenId, TokenStatus.DEPLOYING);
    this.logger.log(`Token ${tokenId} status changed to DEPLOYING`);

    try {
      // Call blockchain service to deploy the ERC-3643 token contracts
      const deploymentResult = await this.callBlockchainDeploy(token);

      // Update token with contract addresses
      await this.tokenService.updateContractAddresses(tokenId, {
        tokenAddress: deploymentResult.tokenAddress,
        identityRegistryAddress: deploymentResult.identityRegistryAddress,
        complianceAddress: deploymentResult.complianceAddress,
        claimTopicsAddress: deploymentResult.claimTopicsAddress,
        trustedIssuersAddress: deploymentResult.trustedIssuersAddress,
        txHash: deploymentResult.transactionHash,
      });

      // Transition to active status
      await this.tokenService.updateStatus(tokenId, TokenStatus.ACTIVE);
      this.logger.log(`Token ${tokenId} deployed successfully at ${deploymentResult.tokenAddress}`);

      // Register the platform claim issuer as trusted in this token's TrustedIssuersRegistry
      // and populate the ClaimTopicsRegistry with the required claim topics
      const claimIssuerAddress = this.configService.get<string>('CLAIM_ISSUER_ADDRESS');
      const allTopics = Object.values(CLAIM_TOPICS) as number[];

      if (claimIssuerAddress) {
        this.trustedIssuersRegistry
          .addTrustedIssuer(deploymentResult.trustedIssuersAddress, claimIssuerAddress, allTopics)
          .catch((err: Error) =>
            this.logger.error(
              `addTrustedIssuer failed for token ${tokenId}: ${err.message}`,
              err.stack,
            ),
          );
      }

      this.claimTopicsRegistry
        .setupTopics(deploymentResult.claimTopicsAddress, allTopics)
        .catch((err: Error) =>
          this.logger.error(
            `setupTopics failed for token ${tokenId}: ${err.message}`,
            err.stack,
          ),
        );

      // Register all existing approved investors in the new token's IdentityRegistry
      this.qualificationService
        .whitelistForNewToken(token.createdBy, tokenId, deploymentResult.identityRegistryAddress)
        .catch((err: Error) =>
          this.logger.error(`Retroactive whitelist failed for token ${tokenId}: ${err.message}`, err.stack),
        );

      return deploymentResult;
    } catch (error: any) {
      // Revert to approved on failure so the issuer can retry without a
      // second trip through the admin queue.
      await this.tokenService.updateStatus(tokenId, TokenStatus.APPROVED);
      this.logger.error(`Token ${tokenId} deployment failed: ${error.message}`, error.stack);

      throw new HttpException(
        `Token deployment failed: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getDeploymentStatus(tokenId: string, tenantId?: string): Promise<DeploymentStatus> {
    const token = await this.tokenService.findById(tokenId, tenantId);

    return {
      tokenId: token.id,
      status: token.status,
      tokenAddress: token.tokenAddress,
      deployedAt: token.deployedAt,
    };
  }

  private async callBlockchainDeploy(token: {
    id: string;
    name: string;
    symbol: string;
    decimals: number;
    totalSupply: string;
    chainId: number;
    metadata: Record<string, unknown> | null;
  }): Promise<DeploymentResult> {
    const mode = this.configService.get<string>('BLOCKCHAIN_MODE', 'local');

    if (mode === 'local') {
      this.logger.warn('[TREXDeploy] LOCAL mode — generating mock contract addresses');
      const randomAddr = () => '0x' + Array.from({ length: 40 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
      return {
        tokenAddress: randomAddr(),
        identityRegistryAddress: randomAddr(),
        complianceAddress: randomAddr(),
        claimTopicsAddress: randomAddr(),
        trustedIssuersAddress: randomAddr(),
        transactionHash: '0x' + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join(''),
        blockNumber: Math.floor(Math.random() * 1000000) + 1000000,
      };
    }

    // ── LIVE mode: deploy via TREXGateway on Sepolia ──────────────────────────
    const rpcUrl = this.configService.get<string>('SEPOLIA_RPC_URL');
    const pk = this.configService.get<string>('DEPLOYER_PRIVATE_KEY');
    const gatewayAddress = this.configService.get<string>('TREX_GATEWAY_ADDRESS');
    const claimIssuerAddress = this.configService.get<string>('CLAIM_ISSUER_ADDRESS');

    if (!rpcUrl) throw new Error('[TREXDeploy] SEPOLIA_RPC_URL not configured');
    if (!pk) throw new Error('[TREXDeploy] DEPLOYER_PRIVATE_KEY not configured');
    if (!gatewayAddress) throw new Error('[TREXDeploy] TREX_GATEWAY_ADDRESS not configured');

    const provider = new ethers.JsonRpcProvider(rpcUrl, undefined, { staticNetwork: true });
    const deployer = new ethers.Wallet(pk.startsWith('0x') ? pk : `0x${pk}`, provider);
    const deployerAddress = await deployer.getAddress();

    this.logger.log(`[TREXDeploy] Deploying "${token.name}" (${token.symbol}) via TREXGateway=${gatewayAddress}`);
    this.logger.log(`[TREXDeploy] deployer=${deployerAddress}  claimIssuer=${claimIssuerAddress ?? 'none'}`);

    const gateway = new ethers.Contract(gatewayAddress, TREX_GATEWAY_ABI, deployer);

    // ── Authorization check ────────────────────────────────────────────────────
    try {
      const isPublic: boolean = await gateway.getPublicDeploymentStatus();
      const isApproved: boolean = await gateway.isDeployer(deployerAddress);
      this.logger.log(`[TREXDeploy] gateway auth: publicDeployments=${isPublic}  isApprovedDeployer=${isApproved}`);
      if (!isPublic && !isApproved) {
        throw new Error(
          `[TREXDeploy] Deployer ${deployerAddress} is not an approved deployer on TREXGateway and public deployments are disabled. ` +
          `Call gateway.addDeployer(${deployerAddress}) from the gateway owner.`,
        );
      }
    } catch (authErr: unknown) {
      const msg = (authErr as Error).message;
      if (msg.startsWith('[TREXDeploy]')) throw authErr;
      this.logger.warn(`[TREXDeploy] Auth pre-check failed (proceeding): ${msg}`);
    }

    // ── TokenDetails ──────────────────────────────────────────────────────────
    const tokenDetails = {
      owner: deployerAddress,
      name: token.name,
      symbol: token.symbol,
      decimals: token.decimals,
      irs: ethers.ZeroAddress,        // deploy new IdentityRegistryStorage
      ONCHAINID: ethers.ZeroAddress,  // deploy new ONCHAINID for the token itself
      irAgents: [deployerAddress],    // deployer can registerIdentity (whitelist investors)
      tokenAgents: [deployerAddress], // deployer can mint/burn
      complianceModules: [] as string[],
      complianceSettings: [] as string[],
    };

    // ── Compliance Modules ────────────────────────────────────────────────────
    // Build complianceModules / complianceSettings from token.metadata.compliance_modules
    const modulesConfig = (token.metadata as any)?.compliance_modules ?? {};

    const countryRestrictAddress = this.configService.get<string>('COUNTRY_RESTRICT_MODULE_ADDRESS');
    const maxHolderAddress = this.configService.get<string>('MAX_HOLDER_MODULE_ADDRESS');
    const transferWindowAddress = this.configService.get<string>('TRANSFER_WINDOW_MODULE_ADDRESS');
    const supplyLimitAddress = this.configService.get<string>('SUPPLY_LIMIT_MODULE_ADDRESS');
    const maxBalanceAddress = this.configService.get<string>('MAX_BALANCE_MODULE_ADDRESS');
    const dayMonthLimitsAddress = this.configService.get<string>('DAY_MONTH_LIMITS_MODULE_ADDRESS');
    const exchangeMonthlyAddress = this.configService.get<string>('EXCHANGE_MONTHLY_LIMITS_MODULE_ADDRESS');

    // Module amount settings are stored in the token's metadata as human-readable
    // strings; on-chain they are base units (value * 10^decimals).
    const toBaseUnits = (value: string | number): bigint =>
      ethers.parseUnits(String(value), token.decimals);

    // Country restrict module
    if (countryRestrictAddress && modulesConfig.country_restrict?.enabled) {
      const countries: number[] = modulesConfig.country_restrict.restricted_countries ?? [];
      if (countries.length > 0) {
        tokenDetails.complianceModules.push(countryRestrictAddress);
        const iface = new ethers.Interface(['function batchRestrictCountries(uint16[] calldata _countries)']);
        tokenDetails.complianceSettings.push(iface.encodeFunctionData('batchRestrictCountries', [countries]));
        this.logger.log(`[TREXDeploy] CountryRestrictModule enabled — restricted countries: [${countries.join(', ')}]`);
      }
    }

    // Max holder module
    if (maxHolderAddress && modulesConfig.max_holders?.enabled && modulesConfig.max_holders?.max > 0) {
      tokenDetails.complianceModules.push(maxHolderAddress);
      const iface = new ethers.Interface(['function setMaxHolders(uint256 _max)']);
      tokenDetails.complianceSettings.push(iface.encodeFunctionData('setMaxHolders', [modulesConfig.max_holders.max]));
      this.logger.log(`[TREXDeploy] MaxHolderModule enabled — max holders: ${modulesConfig.max_holders.max}`);
    }

    // Transfer window module — bound with a harmless deactivateBlackout() no-op at deploy
    // time (blackout windows are activated later, post-deploy). NOTE: TREXFactory calls
    // mc.callModuleFunction(complianceSettings[i], ...) UNCONDITIONALLY for every index
    // below complianceSettings.length — it does NOT skip empty '0x' calldata. Since
    // AbstractModule has no fallback function, passing '0x' here reverts the whole
    // deployTREXSuite transaction. Always push a real, harmless call instead.
    if (transferWindowAddress && modulesConfig.transfer_window?.enabled) {
      tokenDetails.complianceModules.push(transferWindowAddress);
      const iface = new ethers.Interface(['function deactivateBlackout()']);
      tokenDetails.complianceSettings.push(iface.encodeFunctionData('deactivateBlackout', []));
      this.logger.log(`[TREXDeploy] TransferWindowModule enabled — blackout configured post-deploy`);
    }

    // Supply limit module — caps total mintable supply
    if (supplyLimitAddress && modulesConfig.supply_limit?.enabled && modulesConfig.supply_limit?.limit) {
      const limitWei = toBaseUnits(modulesConfig.supply_limit.limit);
      tokenDetails.complianceModules.push(supplyLimitAddress);
      const iface = new ethers.Interface(['function setSupplyLimit(uint256 _limit)']);
      tokenDetails.complianceSettings.push(iface.encodeFunctionData('setSupplyLimit', [limitWei]));
      this.logger.log(`[TREXDeploy] SupplyLimitModule enabled — limit: ${modulesConfig.supply_limit.limit}`);
    }

    // Max balance module — caps the balance any single investor identity may hold
    if (maxBalanceAddress && modulesConfig.max_balance?.enabled && modulesConfig.max_balance?.max) {
      const maxWei = toBaseUnits(modulesConfig.max_balance.max);
      tokenDetails.complianceModules.push(maxBalanceAddress);
      const iface = new ethers.Interface(['function setMaxBalance(uint256 _max)']);
      tokenDetails.complianceSettings.push(iface.encodeFunctionData('setMaxBalance', [maxWei]));
      this.logger.log(`[TREXDeploy] MaxBalanceModule enabled — max balance: ${modulesConfig.max_balance.max}`);
    }

    // Day/month limits module — needs two setup calls, so the module address is
    // pushed twice. TREXFactory skips the second addModule (isModuleBound) but
    // still runs callModuleFunction for both entries.
    if (dayMonthLimitsAddress && modulesConfig.day_month_limits?.enabled) {
      const dailyLimit = modulesConfig.day_month_limits.daily_limit;
      const monthlyLimit = modulesConfig.day_month_limits.monthly_limit;
      if (dailyLimit) {
        tokenDetails.complianceModules.push(dayMonthLimitsAddress);
        const iface = new ethers.Interface(['function setDailyLimit(uint256 _limit)']);
        tokenDetails.complianceSettings.push(
          iface.encodeFunctionData('setDailyLimit', [toBaseUnits(dailyLimit)]),
        );
        this.logger.log(`[TREXDeploy] DayMonthLimitsModule — daily limit: ${dailyLimit}`);
      }
      if (monthlyLimit) {
        tokenDetails.complianceModules.push(dayMonthLimitsAddress);
        const iface = new ethers.Interface(['function setMonthlyLimit(uint256 _limit)']);
        tokenDetails.complianceSettings.push(
          iface.encodeFunctionData('setMonthlyLimit', [toBaseUnits(monthlyLimit)]),
        );
        this.logger.log(`[TREXDeploy] DayMonthLimitsModule — monthly limit: ${monthlyLimit}`);
      }
    }

    // Exchange monthly limits module — the module keys exchanges by their
    // ONCHAINID, not their wallet, so the configured wallets can only be
    // registered once those identities exist. Bind the module here and warn
    // loudly that the per-exchange caps must be applied post-deployment.
    if (exchangeMonthlyAddress && modulesConfig.exchange_monthly_limits?.enabled) {
      this.logger.warn(
        `[TREXDeploy] exchange_monthly_limits was configured but is NOT bound at deploy time: ` +
          `the module keys exchanges by ONCHAINID and those identities do not exist yet. ` +
          `Register them from the compliance page once the exchange investors are onboarded.`,
      );
    }

    if (tokenDetails.complianceModules.length === 0) {
      this.logger.log(`[TREXDeploy] No compliance modules configured — claim-based access only`);
    }

    // ── ClaimDetails ──────────────────────────────────────────────────────────
    // Registers our ClaimIssuer as trusted in the TrustedIssuersRegistry upfront.
    // Factory handles TIR + CTR setup via this struct, so the post-deploy
    // addTrustedIssuer / setupTopics calls become idempotent safety checks.
    const requiredTopics = [
      CLAIM_TOPICS.KYC,
      CLAIM_TOPICS.AML,
      CLAIM_TOPICS.ACCREDITED_INVESTOR,
    ];
    const claimDetails = claimIssuerAddress
      ? {
          claimTopics: requiredTopics,
          issuers: [claimIssuerAddress],
          issuerClaims: [requiredTopics], // this issuer handles all required topics
        }
      : { claimTopics: [], issuers: [], issuerClaims: [] };

    this.logger.log(`[TREXDeploy] TokenDetails: irAgents=${tokenDetails.irAgents} tokenAgents=${tokenDetails.tokenAgents} complianceModules=[${tokenDetails.complianceModules.join(', ')}]`);
    this.logger.log(`[TREXDeploy] ClaimDetails: topics=${requiredTopics} issuers=[${claimDetails.issuers}]`);

    // ── Submit tx ──────────────────────────────────────────────────────────────
    const tx = await gateway.deployTREXSuite(tokenDetails, claimDetails);
    this.logger.log(`[TREXDeploy] tx submitted: ${tx.hash}`);

    const receipt: ethers.TransactionReceipt = await tx.wait();
    this.logger.log(`[TREXDeploy] tx confirmed: hash=${receipt.hash} block=${receipt.blockNumber}`);

    // ── Parse TREXSuiteDeployed event (emitted by TREXFactory inside the tx) ──
    const factoryIface = new ethers.Interface(TREX_FACTORY_EVENTS_ABI);
    let tokenAddress: string | null = null;
    let identityRegistryAddress: string | null = null;
    let complianceAddress: string | null = null;
    let claimTopicsAddress: string | null = null;
    let trustedIssuersAddress: string | null = null;

    for (const log of receipt.logs) {
      try {
        const parsed = factoryIface.parseLog({ topics: [...log.topics], data: log.data });
        if (parsed?.name === 'TREXSuiteDeployed') {
          tokenAddress           = parsed.args._token as string;
          identityRegistryAddress = parsed.args._ir   as string;
          trustedIssuersAddress  = parsed.args._tir   as string;
          claimTopicsAddress     = parsed.args._ctr   as string;
          complianceAddress      = parsed.args._mc    as string;

          this.logger.log(`[TREXDeploy] TREXSuiteDeployed:`);
          this.logger.log(`[TREXDeploy]   token=${tokenAddress}`);
          this.logger.log(`[TREXDeploy]   ir=${identityRegistryAddress}`);
          this.logger.log(`[TREXDeploy]   tir=${trustedIssuersAddress}`);
          this.logger.log(`[TREXDeploy]   ctr=${claimTopicsAddress}`);
          this.logger.log(`[TREXDeploy]   mc=${complianceAddress}`);
          break;
        }
      } catch { /* not a factory event — skip */ }
    }

    if (!tokenAddress || !identityRegistryAddress || !complianceAddress || !claimTopicsAddress || !trustedIssuersAddress) {
      throw new Error(
        `[TREXDeploy] TREXSuiteDeployed event not found in tx ${receipt.hash}. ` +
        'Check TREX_FACTORY_ADDRESS and TREX_GATEWAY_ADDRESS point to the correct contracts on this chain.',
      );
    }

    return {
      tokenAddress,
      identityRegistryAddress,
      complianceAddress,
      claimTopicsAddress,
      trustedIssuersAddress,
      transactionHash: receipt.hash,
      blockNumber: receipt.blockNumber,
    };
  }
}
