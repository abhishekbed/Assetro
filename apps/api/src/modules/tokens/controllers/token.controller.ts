import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Headers,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  UploadedFile,
  UseInterceptors,
  Res,
  Req,
  Logger,
  Inject,
  forwardRef,
  UseGuards,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response, Request as ExpressRequest } from 'express';
import * as fs from 'fs';
import { TokenService, TokenFilter } from '../services/token.service';
import { TokenDeploymentService } from '../services/token-deployment.service';
import { TokenLifecycleService } from '../services/token-lifecycle.service';
import { InvestorPortfolioService } from '../services/investor-portfolio.service';
import { VestingService, CreateVestingDto } from '../services/vesting.service';
import { TokenDocumentService } from '../services/token-document.service';
import { AuditLogService } from '../../admin/services/audit-log.service';
import { CreateTokenDto } from '../dto/create-token.dto';
import { MintTokenDto, BatchMintDto } from '../dto/mint-token.dto';
import { AssetType, TokenStatus } from '../entities/token.entity';
import { DocumentType, DocumentVisibility } from '../entities/token-document.entity';
import { IssuerQualificationService } from '../../kyc/services/issuer-qualification.service';
import { Roles } from '../../auth/decorators/roles.decorator';
import { TenantScope } from '../../auth/decorators/tenant-scope.decorator';
import { UserRole } from '../../auth/entities/user.entity';
import { IssuerWalletGuard } from '../../auth/guards/issuer-wallet.guard';

@Controller('tokens')
export class TokenController {
  private readonly logger = new Logger(TokenController.name);

  constructor(
    private readonly tokenService: TokenService,
    private readonly tokenDeploymentService: TokenDeploymentService,
    private readonly tokenLifecycleService: TokenLifecycleService,
    private readonly investorPortfolioService: InvestorPortfolioService,
    private readonly vestingService: VestingService,
    private readonly tokenDocumentService: TokenDocumentService,
    private readonly auditLog: AuditLogService,
    @Inject(forwardRef(() => IssuerQualificationService))
    private readonly issuerQualification: IssuerQualificationService,
  ) {}

  @Roles(UserRole.ISSUER, UserRole.ADMIN)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateTokenDto,
    @Headers('x-user-id') userId: string,
    @TenantScope() tenantId?: string,
  ) {
    const token = await this.tokenService.create(dto, userId, tenantId);
    return { success: true, data: token };
  }

  @Get()
  async findAll(
    @Headers('x-tenant-id') tenantId?: string,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('status') status?: TokenStatus,
    @Query('asset_type') assetType?: AssetType,
    @Query('chain_id') chainId?: number,
    @Query('search') search?: string,
  ) {
    const filter: TokenFilter = {};
    if (status) filter.status = status;
    if (assetType) filter.assetType = assetType;
    if (chainId) filter.chainId = chainId;
    if (search) filter.search = search;

    const result = await this.tokenService.findAll(tenantId, page, limit, filter);
    return { success: true, ...result };
  }

  @Get('vesting/me')
  async getMyVesting(@Headers('x-user-id') userId: string) {
    const schedules = await this.vestingService.getSchedulesForBeneficiary(userId);
    return { success: true, data: schedules };
  }

  @Get('vesting/:id')
  async getVestingById(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('x-user-id') userId: string,
  ) {
    const schedule = await this.vestingService.getScheduleById(id, userId);
    return { success: true, data: schedule };
  }

  @Get('portfolio/me')
  async getMyPortfolio(
    @Headers('x-user-id') userId: string,
    @Headers('x-tenant-id') tenantId?: string,
    @Query('wallet_address') walletAddress?: string,
  ) {
    const positions = await this.investorPortfolioService.getPortfolio(
      userId,
      tenantId,
      walletAddress,
    );
    return { success: true, data: positions };
  }

  /**
   * POST /tokens/upload-logo
   * Accepts an image file (PNG/JPG/SVG/WEBP ≤ 5 MB), saves it to uploads/logos/,
   * and returns the public URL. Call this before creating the token, then pass
   * the returned url as metadata.logo in the create-token payload.
   */
  @Roles(UserRole.ISSUER, UserRole.ADMIN)
  @Post('upload-logo')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file', { storage: undefined }))
  async uploadLogo(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: ExpressRequest,
  ) {
    if (!file) throw new Error('No file provided');

    const allowed = new Set(['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp', 'image/gif']);
    if (!allowed.has(file.mimetype)) {
      throw new Error('File type not allowed. Use PNG, JPG, SVG, WebP or GIF.');
    }
    if (file.size > 5 * 1024 * 1024) throw new Error('Logo must be smaller than 5 MB');

    const { path: nodePath, fs: nodeFs } = await import('path').then(p => ({ path: p, fs: require('fs') as typeof import('fs') }));
    const uploadsRoot = process.env.UPLOADS_PATH ?? nodePath.join(process.cwd(), 'uploads');
    const dir = nodePath.join(uploadsRoot, 'logos');
    nodeFs.mkdirSync(dir, { recursive: true });

    const ext = file.originalname.split('.').pop() ?? 'png';
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    nodeFs.writeFileSync(nodePath.join(dir, fileName), file.buffer);

    const relativePath = `/api/v1/uploads/logos/${fileName}`;
    const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'http';
    const host = (req.headers['x-forwarded-host'] as string) || req.get('host') || `localhost:${process.env.PORT ?? 3000}`;
    const baseUrl = process.env.API_BASE_URL
      ? process.env.API_BASE_URL.replace(/\/+$/, '')
      : `${proto}://${host}`;
    const url = `${baseUrl}${relativePath}`;
    return { success: true, data: { url, relativePath } };
  }

  /**
   * POST /tokens/upload-document
   * Accepts a document (PDF/DOC/DOCX/image ≤ 10 MB), saves it to uploads/token-documents/
   * and returns the public URL.
   */
  @Roles(UserRole.ISSUER, UserRole.ADMIN)
  @Post('upload-document')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file', { storage: undefined }))
  async uploadDocumentFile(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: ExpressRequest,
  ) {
    if (!file) throw new Error('No file provided');

    const allowed = new Set([
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/png',
      'image/jpeg',
    ]);
    if (!allowed.has(file.mimetype)) {
      throw new Error('File type not allowed. Use PDF, DOC, DOCX, PNG or JPG.');
    }
    if (file.size > 10 * 1024 * 1024) throw new Error('Document must be smaller than 10 MB');

    const nodePath = await import('path');
    const nodeFs = await import('fs');
    const uploadsRoot = process.env.UPLOADS_PATH ?? nodePath.join(process.cwd(), 'uploads');
    const dir = nodePath.join(uploadsRoot, 'token-documents');
    nodeFs.mkdirSync(dir, { recursive: true });

    const ext = (file.originalname.split('.').pop() ?? 'pdf').replace(/[^a-zA-Z0-9]/g, '');
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    nodeFs.writeFileSync(nodePath.join(dir, fileName), file.buffer);

    const relativePath = `/api/v1/uploads/token-documents/${fileName}`;
    const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'http';
    const host = (req.headers['x-forwarded-host'] as string) || req.get('host') || `localhost:${process.env.PORT ?? 3000}`;
    const baseUrl = process.env.API_BASE_URL
      ? process.env.API_BASE_URL.replace(/\/+$/, '')
      : `${proto}://${host}`;
    return { success: true, data: { url: `${baseUrl}${relativePath}`, relativePath, name: file.originalname } };
  }

  @Get(':id')
  async findById(
    @Param('id', new ParseUUIDPipe()) id: string,
    @TenantScope() tenantId?: string,
  ) {
    const token = await this.tokenService.findById(id, tenantId);
    return { success: true, data: token };
  }

  /**
   * Server-side on-chain balance + frozen status for a wallet.
   * Proxies the RPC call through the backend so the browser never needs
   * direct Alchemy access (avoids CORS issues on free-tier endpoints).
   */
  @Get(':id/onchain-balance')
  async getOnchainBalance(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query('wallet') wallet: string,
    @TenantScope() tenantId?: string,
  ) {
    if (!wallet || !/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
      return { success: true, data: { balance: null, frozen: null } };
    }
    const token = await this.tokenService.findById(id, tenantId);
    if (!token.tokenAddress) {
      return { success: true, data: { balance: null, frozen: null } };
    }

    try {
      const { ethers } = await import('ethers');
      const { ConfigService } = await import('@nestjs/config');
      // Use injected config via tokenService's module context
      const rpcUrl = process.env.SEPOLIA_RPC_URL?.trim();
      if (!rpcUrl) return { success: true, data: { balance: null, frozen: null } };

      const provider = new ethers.JsonRpcProvider(rpcUrl, undefined, { staticNetwork: true });
      const ABI = [
        'function balanceOf(address) view returns (uint256)',
        'function isFrozen(address) view returns (bool)',
        'function decimals() view returns (uint8)',
      ];
      const contract = new ethers.Contract(token.tokenAddress, ABI, provider);

      const [rawBalance, frozen, decimals] = await Promise.all([
        contract.balanceOf(wallet).catch(() => null),
        contract.isFrozen(wallet).catch(() => null),
        contract.decimals().catch(() => token.decimals ?? 18),
      ]);

      const balance = rawBalance !== null
        ? Number(ethers.formatUnits(rawBalance, Number(decimals)))
        : null;

      return { success: true, data: { balance, frozen, decimals: Number(decimals) } };
    } catch {
      return { success: true, data: { balance: null, frozen: null } };
    }
  }

  // ── Token Documents ───────────────────────────────────────────────────────

  @Get(':id/documents')
  async listDocuments(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('public_only') publicOnly?: string,
  ) {
    const data = await this.tokenDocumentService.listDocuments(id, publicOnly === 'true');
    return { success: true, data };
  }

  @Roles(UserRole.ISSUER, UserRole.ADMIN)
  @Post(':id/documents')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file', { storage: undefined /* memory */ }))
  async uploadDocument(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { name?: string; type?: string; visibility?: string },
    @Headers('x-user-id') userId?: string,
  ) {
    if (!file) throw new Error('No file provided');
    const doc = await this.tokenDocumentService.saveDocument(
      id,
      file,
      {
        name: body.name ?? file.originalname,
        type: (body.type as DocumentType) ?? DocumentType.OTHER,
        visibility: (body.visibility as DocumentVisibility) ?? DocumentVisibility.PRIVATE,
      },
      userId,
    );
    return { success: true, data: doc };
  }

  @Roles(UserRole.ISSUER, UserRole.ADMIN)
  @Delete(':id/documents/:docId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteDocument(
    @Param('id', ParseUUIDPipe) tokenId: string,
    @Param('docId', ParseUUIDPipe) docId: string,
    @Headers('x-user-id') userId?: string,
    @TenantScope() tenantId?: string,
  ) {
    await this.tokenDocumentService.deleteDocument(docId, tokenId);
    this.auditLog.create({
      tenant_id: tenantId ?? 'system',
      actor_id: userId ?? 'system',
      actor_role: 'issuer',
      action: 'token.document.deleted',
      resource_type: 'token_document',
      resource_id: docId,
      details: { tokenId },
    }).catch(() => {});
  }

  @Get(':id/documents/:docId/download')
  async downloadDocument(
    @Param('id', ParseUUIDPipe) tokenId: string,
    @Param('docId', ParseUUIDPipe) docId: string,
    @Res() res: Response,
  ) {
    const { absolutePath, mimeType, originalName } = await this.tokenDocumentService.getFilePath(docId, tokenId);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${originalName}"`);
    fs.createReadStream(absolutePath).pipe(res);
  }

  @Get(':id/position')
  async getMyTokenPosition(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('x-user-id') userId: string,
    @Headers('x-tenant-id') tenantId?: string,
    @Query('wallet_address') walletAddress?: string,
  ) {
    const position = await this.investorPortfolioService.getTokenPosition(
      id,
      userId,
      tenantId,
      walletAddress,
    );
    return { success: true, data: position };
  }

  @Roles(UserRole.ISSUER, UserRole.ADMIN)
  @Patch(':id')
  async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() updates: { name?: string; description?: string; document_uri?: string; metadata?: Record<string, unknown> },
    @TenantScope() tenantId?: string,
  ) {
    const mapped: Record<string, unknown> = {};
    if (updates.name !== undefined) mapped.name = updates.name;
    if (updates.description !== undefined) mapped.description = updates.description;
    if (updates.document_uri !== undefined) mapped.documentUri = updates.document_uri;
    if (updates.metadata !== undefined) mapped.metadata = updates.metadata;

    const token = await this.tokenService.update(id, mapped, tenantId);
    return { success: true, data: token };
  }

  @Roles(UserRole.ISSUER, UserRole.ADMIN)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @Param('id', new ParseUUIDPipe()) id: string,
    @TenantScope() tenantId?: string,
  ) {
    await this.tokenService.delete(id, tenantId);
  }

  @Roles(UserRole.ISSUER, UserRole.ADMIN)
  @UseGuards(IssuerWalletGuard)
  @Post(':id/deploy')
  async deploy(
    @Param('id', new ParseUUIDPipe()) id: string,
    @TenantScope() tenantId?: string,
  ) {
    const result = await this.tokenDeploymentService.deployToken(id, tenantId);
    return { success: true, data: result };
  }

  @Get(':id/deployment-status')
  async getDeploymentStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @TenantScope() tenantId?: string,
  ) {
    const status = await this.tokenDeploymentService.getDeploymentStatus(id, tenantId);
    return { success: true, data: status };
  }

  @Roles(UserRole.ISSUER, UserRole.ADMIN)
  @UseGuards(IssuerWalletGuard)
  @Post(':id/pause')
  async pause(
    @Param('id', new ParseUUIDPipe()) id: string,
    @TenantScope() tenantId?: string,
  ) {
    const result = await this.tokenLifecycleService.pause(id, tenantId);
    return { success: true, data: result };
  }

  @Roles(UserRole.ISSUER, UserRole.ADMIN)
  @UseGuards(IssuerWalletGuard)
  @Post(':id/unpause')
  async unpause(
    @Param('id', new ParseUUIDPipe()) id: string,
    @TenantScope() tenantId?: string,
  ) {
    const result = await this.tokenLifecycleService.unpause(id, tenantId);
    return { success: true, data: result };
  }

  @Roles(UserRole.ISSUER, UserRole.ADMIN)
  @UseGuards(IssuerWalletGuard)
  @Post(':id/mint')
  async mint(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: Omit<MintTokenDto, 'token_id'>,
    @TenantScope() tenantId?: string,
  ) {
    const result = await this.tokenLifecycleService.mint(
      { token_id: id, ...dto } as MintTokenDto,
      tenantId,
    );
    return { success: true, data: result };
  }

  @Roles(UserRole.ISSUER, UserRole.ADMIN)
  @Post(':id/burn')
  async burn(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: { from_address: string; amount: string },
    @TenantScope() tenantId?: string,
  ) {
    const result = await this.tokenLifecycleService.burn(
      id,
      body.from_address,
      body.amount,
      tenantId,
    );
    return { success: true, data: result };
  }

  @Roles(UserRole.ISSUER, UserRole.ADMIN)
  @UseGuards(IssuerWalletGuard)
  @Post(':id/batch-mint')
  async batchMint(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: Omit<BatchMintDto, 'token_id'>,
    @TenantScope() tenantId?: string,
  ) {
    const result = await this.tokenLifecycleService.batchMint(
      { token_id: id, ...dto } as BatchMintDto,
      tenantId,
    );
    return { success: true, data: result };
  }

  @Roles(UserRole.ISSUER, UserRole.ADMIN)
  @UseGuards(IssuerWalletGuard)
  @Post(':id/freeze/:address')
  async freezeAddress(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('address') address: string,
    @TenantScope() tenantId?: string,
  ) {
    const result = await this.tokenLifecycleService.freezeAddress(id, address, tenantId);
    return { success: true, data: result };
  }

  @Roles(UserRole.ISSUER, UserRole.ADMIN)
  @UseGuards(IssuerWalletGuard)
  @Post(':id/unfreeze/:address')
  async unfreezeAddress(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('address') address: string,
    @TenantScope() tenantId?: string,
  ) {
    const result = await this.tokenLifecycleService.unfreezeAddress(id, address, tenantId);
    return { success: true, data: result };
  }

  @Roles(UserRole.ISSUER, UserRole.ADMIN)
  @Post(':id/recovery')
  async recoveryAddress(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: { lost_wallet: string; new_wallet: string; investor_onchain_id: string },
    @Headers('x-user-id') userId?: string,
    @TenantScope() tenantId?: string,
  ) {
    const result = await this.tokenLifecycleService.recoveryAddress(
      id,
      body.lost_wallet,
      body.new_wallet,
      body.investor_onchain_id,
      tenantId,
    );
    this.auditLog.create({
      tenant_id: tenantId ?? 'system',
      actor_id: userId ?? 'system',
      actor_role: 'issuer',
      action: 'token.recovery',
      resource_type: 'token',
      resource_id: id,
      details: {
        lost_wallet: body.lost_wallet,
        new_wallet: body.new_wallet,
        investor_onchain_id: body.investor_onchain_id,
        tx: result.transactionHash,
      },
    }).catch(() => {});
    return { success: true, data: result };
  }

  @Roles(UserRole.ISSUER, UserRole.ADMIN)
  @Post(':id/force-transfer')
  async forceTransfer(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: { from_address: string; to_address: string; amount: string; reason?: string; notes?: string; actor_id?: string },
    @Headers('x-user-id') userId?: string,
    @TenantScope() tenantId?: string,
  ) {
    const result = await this.tokenLifecycleService.forceTransfer(id, body.from_address, body.to_address, body.amount, tenantId);
    // Audit log
    this.auditLog.create({
      tenant_id: tenantId ?? 'system',
      actor_id: userId ?? body.actor_id ?? 'system',
      actor_role: 'issuer',
      action: 'token.force_transfer',
      resource_type: 'token',
      resource_id: id,
      details: {
        from: body.from_address,
        to: body.to_address,
        amount: body.amount,
        reason: body.reason,
        notes: body.notes,
        tx: result.transactionHash,
      },
    }).catch(() => {});
    return { success: true, data: result };
  }

  // ── Issuer: Vesting Schedule management ─────────────────────────────────

  @Get(':id/vesting-schedules')
  async getVestingSchedules(
    @Param('id', ParseUUIDPipe) tokenId: string,
  ) {
    const data = await this.vestingService.getSchedulesForToken(tokenId);
    return { success: true, data };
  }

  @Roles(UserRole.ISSUER, UserRole.ADMIN)
  @Post(':id/vesting-schedules')
  @HttpCode(HttpStatus.CREATED)
  async createVestingSchedule(
    @Param('id', ParseUUIDPipe) tokenId: string,
    @Body() dto: CreateVestingDto,
    @Headers('x-user-id') userId?: string,
    @TenantScope() tenantId?: string,
  ) {
    const schedule = await this.vestingService.createSchedule(tokenId, dto);
    this.auditLog.create({
      tenant_id: tenantId ?? 'system',
      actor_id: userId ?? 'system',
      actor_role: 'issuer',
      action: 'vesting.created',
      resource_type: 'vesting_schedule',
      resource_id: schedule.id,
      details: { tokenId, beneficiary: dto.beneficiary_address, amount: dto.total_amount },
    }).catch(() => {});
    return { success: true, data: schedule };
  }

  @Roles(UserRole.ISSUER, UserRole.ADMIN)
  @Delete(':id/vesting-schedules/:scheduleId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteVestingSchedule(
    @Param('id', ParseUUIDPipe) tokenId: string,
    @Param('scheduleId', ParseUUIDPipe) scheduleId: string,
    @Headers('x-user-id') userId?: string,
    @TenantScope() tenantId?: string,
  ) {
    await this.vestingService.deleteSchedule(scheduleId, tokenId);
    this.auditLog.create({
      tenant_id: tenantId ?? 'system',
      actor_id: userId ?? 'system',
      actor_role: 'issuer',
      action: 'vesting.cancelled',
      resource_type: 'vesting_schedule',
      resource_id: scheduleId,
      details: { tokenId },
    }).catch(() => {});
  }

  @Roles(UserRole.ISSUER, UserRole.ADMIN)
  @Post(':id/vesting-schedules/:scheduleId/release')
  async releaseVested(
    @Param('id', ParseUUIDPipe) tokenId: string,
    @Param('scheduleId', ParseUUIDPipe) scheduleId: string,
    @Body() body: { released_amount: string; tx_hash?: string },
    @Headers('x-user-id') userId?: string,
    @TenantScope() tenantId?: string,
  ) {
    const schedule = await this.vestingService.markReleased(scheduleId, tokenId, body.released_amount);
    this.auditLog.create({
      tenant_id: tenantId ?? 'system',
      actor_id: userId ?? 'system',
      actor_role: 'issuer',
      action: 'vesting.released',
      resource_type: 'vesting_schedule',
      resource_id: scheduleId,
      details: { tokenId, released: body.released_amount, txHash: body.tx_hash },
    }).catch(() => {});
    return { success: true, data: schedule };
  }

  @Roles(UserRole.ISSUER, UserRole.ADMIN)
  @UseGuards(IssuerWalletGuard)
  @Post(':id/sync-deployment')
  async syncDeployment(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body()
    body: {
      token_address: string;
      identity_registry_address: string;
      compliance_address: string;
      claim_topics_address: string;
      trusted_issuers_address: string;
      tx_hash?: string;
      transaction_hash?: string;
    },
    @TenantScope() tenantId?: string,
  ) {
    const token = await this.tokenService.syncDeployment(
      id,
      {
        tokenAddress: body.token_address,
        identityRegistryAddress: body.identity_registry_address,
        complianceAddress: body.compliance_address,
        claimTopicsAddress: body.claim_topics_address,
        trustedIssuersAddress: body.trusted_issuers_address,
        txHash: body.tx_hash || body.transaction_hash,
      },
      tenantId,
    );

    // A fresh token gets a fresh IdentityRegistry, which knows nobody. Investors
    // this issuer already approved were only registered into the tokens that
    // existed back then, so without this they would hit "Identity Activation
    // Pending" here and be unable to buy. Runs in the background: it is a chain
    // round-trip per investor and must not hold up the issuer's deploy flow.
    void this.issuerQualification
      .backfillTokenRegistrations(id)
      .catch((err) =>
        this.logger.error(
          `[sync-deployment] investor back-fill failed for token ${id}: ${err.message}`,
        ),
      );

    return { success: true, data: token };
  }

  /**
   * Re-run the approved-investor back-fill for a token.
   *
   * Repair hatch for tokens deployed before the back-fill existed, or where it
   * partially failed (a chain hiccup, an investor without a wallet at the
   * time). Idempotent — already-registered investors are a no-op.
   */
  @Roles(UserRole.ISSUER, UserRole.ADMIN)
  @Post(':id/backfill-investors')
  async backfillInvestors(@Param('id', new ParseUUIDPipe()) id: string) {
    const result = await this.issuerQualification.backfillTokenRegistrations(id);
    return { success: true, data: result };
  }

  @Roles(UserRole.ISSUER, UserRole.ADMIN)
  @Post(':id/sync-status')
  async syncStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: { status: TokenStatus },
    @TenantScope() tenantId?: string,
  ) {
    const token = await this.tokenService.syncStatus(id, body.status, tenantId);
    return { success: true, data: token };
  }
}
