import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UploadedFile,
  UseInterceptors,
  UseGuards,
  ParseUUIDPipe,
  ParseIntPipe,
  DefaultValuePipe,
  HttpCode,
  HttpStatus,
  BadRequestException,
  ForbiddenException,
  Req,
} from '@nestjs/common';
import type { Request as ExpressRequest } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { JwtPayload } from '../../auth/services/jwt.service';
import { UserRole } from '../../auth/entities/user.entity';

// Legacy KYC services
import { KycService } from '../services/kyc.service';
import { DocumentService } from '../services/document.service';
import { SubmitKycDto } from '../dto/submit-kyc.dto';
import { ReviewKycDto } from '../dto/review-kyc.dto';
import { KycStatus } from '../entities/kyc-submission.entity';

// New reusable identity services
import { InvestorProfileService } from '../services/investor-profile.service';
import { IssuerQualificationService } from '../services/issuer-qualification.service';
import { TokenEligibilityService } from '../services/token-eligibility.service';
import { InvestorEligibilityService } from '../services/investor-eligibility.service';
import { SubmitProfileDto } from '../dto/submit-profile.dto';
import { ReviewQualificationDto } from '../dto/review-qualification.dto';
import { QualificationStatus } from '../entities/issuer-investor-qualification.entity';
import { DocumentType } from '../entities/kyc-document.entity';

const AGENT_ROLES = [UserRole.ISSUER, UserRole.COMPLIANCE_OFFICER, UserRole.TRANSFER_AGENT, UserRole.ADMIN];

@UseGuards(JwtAuthGuard)
@Controller('kyc')
export class KycController {
  constructor(
    // Legacy
    private readonly kycService: KycService,
    private readonly documentService: DocumentService,
    // New
    private readonly profileService: InvestorProfileService,
    private readonly qualificationService: IssuerQualificationService,
    private readonly eligibilityService: TokenEligibilityService,
    private readonly eligibilityEngine: InvestorEligibilityService,
  ) {}

  // ─── INVESTOR: Global Profile ──────────────────────────────────────────────

  @Post('profile')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles(UserRole.INVESTOR)
  async submitProfile(
    @CurrentUser() user: JwtPayload,
    @Body() dto: SubmitProfileDto,
  ) {
    const profile = await this.profileService.submitProfile(user.sub, dto);
    return { success: true, data: profile };
  }

  @Get('profile')
  @UseGuards(RolesGuard)
  @Roles(UserRole.INVESTOR)
  async getMyProfile(@CurrentUser() user: JwtPayload) {
    const profile = await this.profileService.getProfile(user.sub);
    return { success: true, data: profile };
  }

  // ─── INVESTOR: Wallet Management ─────────────────────────────────────────────

  @Patch('wallet')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles(UserRole.INVESTOR)
  async linkWallet(
    @CurrentUser() user: JwtPayload,
    @Body('wallet_address') walletAddress: string,
  ) {
    if (!walletAddress) throw new BadRequestException('wallet_address is required');
    const result = await this.profileService.linkWallet(user.sub, walletAddress);
    return { success: true, data: result };
  }

  @Delete('wallet')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles(UserRole.INVESTOR)
  async unlinkWallet(@CurrentUser() user: JwtPayload) {
    await this.profileService.unlinkWallet(user.sub);
    return { success: true };
  }

  @Get('wallet')
  @UseGuards(RolesGuard)
  @Roles(UserRole.INVESTOR)
  async getWallets(@CurrentUser() user: JwtPayload) {
    const wallets = await this.profileService.getWallets(user.sub);
    return { success: true, data: wallets };
  }

  @Post('profile/documents')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(RolesGuard)
  @Roles(UserRole.INVESTOR)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  async uploadProfileDocument(
    @CurrentUser() user: JwtPayload,
    @Body('profile_id') profileId: string,
    @Body('document_type') documentType: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('file is required');
    if (!profileId) throw new BadRequestException('profile_id is required');
    if (!documentType) throw new BadRequestException('document_type is required');
    const doc = await this.profileService.uploadDocument(
      profileId,
      documentType as DocumentType,
      file,
      user.tenantId || 'default',
    );
    return { success: true, data: doc };
  }

  // ─── INVESTOR: On-chain claims (DB mirror) ────────────────────────────────

  @Get('my-claims')
  @UseGuards(RolesGuard)
  @Roles(UserRole.INVESTOR)
  async getMyClaims(@CurrentUser() user: JwtPayload) {
    const claims = await this.qualificationService.getInvestorClaims(user.sub);
    return { success: true, data: claims };
  }

  // ─── INVESTOR: Qualification Requests ─────────────────────────────────────

  @Post('qualify/:issuerId')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles(UserRole.INVESTOR)
  async requestQualification(
    @CurrentUser() user: JwtPayload,
    @Param('issuerId', ParseUUIDPipe) issuerId: string,
  ) {
    const qual = await this.qualificationService.requestQualification(user.sub, issuerId);
    return { success: true, data: qual };
  }

  /** Investor's platform-admin KYC level (separate from any issuer's approval). */
  @Get('admin-status')
  @UseGuards(RolesGuard)
  @Roles(UserRole.INVESTOR)
  async getAdminStatus(@CurrentUser() user: JwtPayload) {
    const status = await this.qualificationService.getAdminKycStatus(user.sub);
    return { success: true, data: { status } };
  }

  @Get('my-qualifications')
  @UseGuards(RolesGuard)
  @Roles(UserRole.INVESTOR, UserRole.ISSUER, UserRole.ADMIN)
  async getMyQualifications(@CurrentUser() user: JwtPayload) {
    const list = await this.qualificationService.getMyQualifications(user.sub);
    return { success: true, data: list };
  }

  // ─── INVESTOR: Token Eligibility ───────────────────────────────────────────

  @Get('eligibility/:tokenId')
  @UseGuards(RolesGuard)
  @Roles(UserRole.INVESTOR, UserRole.ISSUER, UserRole.ADMIN)
  async checkEligibility(
    @CurrentUser() user: JwtPayload,
    @Param('tokenId', ParseUUIDPipe) tokenId: string,
  ) {
    // Full gate: IR.isVerified() on-chain + issuer qualification + claims + compliance rules
    const result = await this.eligibilityService.canPurchase(user.sub, tokenId);
    return { success: true, data: result };
  }

  /** Granular: issuer-level qualification check (reusable across all tokens of same issuer) */
  @Get('issuers/:issuerId/qualification')
  @UseGuards(RolesGuard)
  @Roles(UserRole.INVESTOR, UserRole.ISSUER, UserRole.ADMIN)
  async checkQualification(
    @CurrentUser() user: JwtPayload,
    @Param('issuerId', ParseUUIDPipe) issuerId: string,
  ) {
    const result = await this.eligibilityEngine.isInvestorQualified(user.sub, issuerId);
    return { success: true, data: result };
  }

  /** Granular: token-required claims check (DB mirror, no on-chain call) */
  @Get('tokens/:tokenId/claims-check')
  @UseGuards(RolesGuard)
  @Roles(UserRole.INVESTOR, UserRole.ISSUER, UserRole.ADMIN)
  async checkClaims(
    @CurrentUser() user: JwtPayload,
    @Param('tokenId', ParseUUIDPipe) tokenId: string,
  ) {
    const result = await this.eligibilityEngine.hasValidClaims(user.sub, tokenId);
    return { success: true, data: result };
  }

  /** Granular: on-chain IdentityRegistry registration status */
  @Get('tokens/:tokenId/onchain-check')
  @UseGuards(RolesGuard)
  @Roles(UserRole.INVESTOR, UserRole.ISSUER, UserRole.ADMIN)
  async checkOnchain(
    @CurrentUser() user: JwtPayload,
    @Param('tokenId', ParseUUIDPipe) tokenId: string,
  ) {
    const result = await this.eligibilityEngine.isWhitelistedOnchain(user.sub, tokenId);
    return { success: true, data: result };
  }

  /** Granular: full receive eligibility (transfer compliance) */
  @Get('tokens/:tokenId/can-receive')
  @UseGuards(RolesGuard)
  @Roles(UserRole.INVESTOR, UserRole.ISSUER, UserRole.ADMIN)
  async checkCanReceive(
    @CurrentUser() user: JwtPayload,
    @Param('tokenId', ParseUUIDPipe) tokenId: string,
  ) {
    const result = await this.eligibilityEngine.canReceiveToken(user.sub, tokenId);
    return { success: true, data: result };
  }

  // ─── ISSUER: Qualification Review ─────────────────────────────────────────

  @Get('approved-investors')
  @UseGuards(RolesGuard)
  @Roles(...AGENT_ROLES)
  async getApprovedInvestors(@CurrentUser() issuer: JwtPayload) {
    const data = await this.qualificationService.getApprovedInvestorsWithWallets(issuer.sub);
    return { success: true, data };
  }

  @Get('qualifications')
  @UseGuards(RolesGuard)
  @Roles(...AGENT_ROLES)
  async listQualifications(
    @CurrentUser() issuer: JwtPayload,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('status') status?: QualificationStatus,
  ) {
    const result = await this.qualificationService.listForIssuer(issuer.sub, page, limit, status);
    return { success: true, ...result };
  }

  @Get('qualifications/stats')
  @UseGuards(RolesGuard)
  @Roles(...AGENT_ROLES)
  async getQualificationStats(@CurrentUser() issuer: JwtPayload) {
    const stats = await this.qualificationService.getStats(issuer.sub);
    return { success: true, data: stats };
  }

  @Get('qualifications/:id')
  @UseGuards(RolesGuard)
  @Roles(...AGENT_ROLES)
  async getQualification(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    const qual = await this.qualificationService.getQualification(id);
    // Issuers may only read their own investors' records; agents can read any.
    if (user.role === UserRole.ISSUER && qual.issuerId !== user.sub) {
      throw new ForbiddenException('You are not the issuer for this qualification.');
    }
    return { success: true, data: qual };
  }

  @Post('qualifications/:id/retry-pipeline')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles(...AGENT_ROLES, UserRole.ADMIN)
  async retryPipeline(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() issuer: JwtPayload,
  ) {
    const identityAddress = await this.qualificationService.retryBlockchainPipeline(
      id, issuer.sub, issuer.role as UserRole,
    );
    return { success: true, data: { identity_address: identityAddress, message: 'Blockchain pipeline re-queued.' } };
  }

  @Post('qualifications/:id/revoke')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles(UserRole.ISSUER, UserRole.ADMIN)
  async revokeQualification(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @Body('reason') reason: string,
  ) {
    if (!reason || !reason.trim()) throw new BadRequestException('A reason is required to revoke approval.');
    const qual = await this.qualificationService.revokeQualification(
      id,
      user.sub,
      user.role as UserRole,
      reason.trim(),
    );
    return { success: true, data: qual };
  }

  @Patch('qualifications/:id/review')
  @UseGuards(RolesGuard)
  @Roles(...AGENT_ROLES)
  async reviewQualification(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() issuer: JwtPayload,
    @Body() dto: ReviewQualificationDto,
  ) {
    const { qualification, identityAddress } =
      await this.qualificationService.reviewQualification(id, issuer.sub, issuer.role as UserRole, dto);
    return { success: true, data: { ...qualification, identity_address: identityAddress } };
  }

  // ─── ISSUER: Token Required Claims ────────────────────────────────────────

  @Post('tokens/:tokenId/claims')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles(...AGENT_ROLES)
  async setRequiredClaims(
    @Param('tokenId', ParseUUIDPipe) tokenId: string,
    @Body() body: { claims: { claim_topic: number; claim_name?: string; is_required?: boolean }[] },
  ) {
    const result = await this.eligibilityService.setRequiredClaims(tokenId, body.claims ?? []);
    return { success: true, data: result };
  }

  @Get('tokens/:tokenId/claims')
  async getRequiredClaims(@Param('tokenId', ParseUUIDPipe) tokenId: string) {
    const claims = await this.eligibilityService.getRequiredClaims(tokenId);
    return { success: true, data: claims };
  }

  // ─── LEGACY: Old submission endpoints (backward compat) ───────────────────

  @Post('submit')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(RolesGuard)
  @Roles(UserRole.INVESTOR)
  async submitKyc(@CurrentUser() user: JwtPayload, @Body() dto: SubmitKycDto) {
    const submission = await this.kycService.submitKyc(user.sub, dto);
    return { success: true, data: submission };
  }

  @Get('my-submission')
  @UseGuards(RolesGuard)
  @Roles(UserRole.INVESTOR)
  async getMySubmission(
    @CurrentUser() user: JwtPayload,
    @Query('token_id') tokenId?: string,
  ) {
    try {
      const submission = await this.kycService.getMySubmission(user.sub, tokenId);
      return { success: true, data: submission };
    } catch {
      return { success: true, data: null };
    }
  }

  @Get('my-submissions')
  @UseGuards(RolesGuard)
  @Roles(UserRole.INVESTOR)
  async getMySubmissions(@CurrentUser() user: JwtPayload) {
    const submissions = await this.kycService.getMySubmissions(user.sub);
    return { success: true, data: submissions };
  }

  @Post('documents')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(RolesGuard)
  @Roles(UserRole.INVESTOR)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  async uploadDocument(
    @CurrentUser() user: JwtPayload,
    @Body('submission_id') submissionId: string,
    @Body('document_type') documentType: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('File is required');
    if (!submissionId) throw new BadRequestException('submission_id is required');
    if (!documentType) throw new BadRequestException('document_type is required');
    const document = await this.documentService.uploadDocument(
      submissionId,
      documentType as any,
      file,
      user.tenantId || 'default',
    );
    return { success: true, data: document };
  }

  @Get('submissions')
  @UseGuards(RolesGuard)
  @Roles(...AGENT_ROLES)
  async getAllSubmissions(
    @CurrentUser() reviewer: JwtPayload,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('status') status?: KycStatus,
  ) {
    const result = await this.kycService.getAllSubmissions(reviewer.sub, page, limit, status);
    return { success: true, ...result };
  }

  @Get('stats')
  @UseGuards(RolesGuard)
  @Roles(...AGENT_ROLES)
  async getStats(@CurrentUser() reviewer: JwtPayload) {
    const stats = await this.kycService.getStats(reviewer.sub);
    return { success: true, data: stats };
  }

  @Get('submissions/user/:userId')
  @UseGuards(RolesGuard)
  @Roles(...AGENT_ROLES)
  async getSubmissionByUser(@Param('userId', ParseUUIDPipe) userId: string) {
    const submission = await this.kycService.getMySubmission(userId);
    return { success: true, data: submission };
  }

  @Get('submissions/:id')
  @UseGuards(RolesGuard)
  @Roles(...AGENT_ROLES)
  async getSubmission(@Param('id', ParseUUIDPipe) id: string) {
    const submission = await this.kycService.getSubmission(id);
    return { success: true, data: submission };
  }

  @Patch('submissions/:id/review')
  @UseGuards(RolesGuard)
  @Roles(...AGENT_ROLES)
  async reviewSubmission(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() reviewer: JwtPayload,
    @Body() dto: ReviewKycDto,
  ) {
    const { submission, identityAddress } = await this.kycService.reviewSubmission(
      id,
      reviewer.sub,
      dto,
    );
    return { success: true, data: { ...submission, identity_address: identityAddress } };
  }

  @Get('submissions/:id/documents')
  @UseGuards(RolesGuard)
  @Roles(...AGENT_ROLES)
  async getSubmissionDocuments(@Param('id', ParseUUIDPipe) id: string) {
    const documents = await this.documentService.getDocuments(id);
    return { success: true, data: documents };
  }

  @Get('documents/:id/download')
  @UseGuards(RolesGuard)
  @Roles(...AGENT_ROLES, UserRole.INVESTOR, UserRole.ADMIN)
  async getDocumentDownloadUrl(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: ExpressRequest,
  ) {
    const result = await this.documentService.getDownloadUrl(id);
    const proto = req.get('x-forwarded-proto') || req.protocol || 'http';
    const host = req.get('x-forwarded-host') || req.get('host') || `localhost:${process.env.PORT ?? 3000}`;
    const dynamicBase = process.env.API_BASE_URL?.replace(/\/+$/, '') || `${proto}://${host}`;

    let fullUrl = result.url;
    if (fullUrl.startsWith('/')) {
      fullUrl = `${dynamicBase}${fullUrl}`;
    }
    return { success: true, data: { ...result, url: fullUrl } };
  }
}
