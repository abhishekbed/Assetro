import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { DataSource } from 'typeorm';
import { TokenService } from '../services/token.service';
import { TokenDocument } from '../entities/token-document.entity';
import { User } from '../../auth/entities/user.entity';
import { Tenant } from '../../admin/entities/tenant.entity';
import { ComplianceRule } from '../../compliance/entities/compliance-rule.entity';
import { TokenStatus } from '../entities/token.entity';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../auth/entities/user.entity';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { JwtPayload } from '../../auth/services/jwt.service';

export class RejectTokenDto {
  @IsString()
  @IsNotEmpty({ message: 'A rejection reason is required' })
  @MaxLength(2000)
  rejection_reason: string;
}

/**
 * Platform-admin review of issuer token creation.
 *
 * An issuer creates a token, it lands here as `pending_approval`, and only an
 * approval lets them run the on-chain deployment from their own wallet.
 */
@Controller('admin/tokens')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class TokenApprovalController {
  constructor(
    private readonly tokenService: TokenService,
    private readonly dataSource: DataSource,
  ) {}

  /** Tokens across every tenant, newest first, optionally filtered by status. */
  @Get()
  async findAll(
    @Query('status') status?: TokenStatus,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('search') search?: string,
  ) {
    const result = await this.tokenService.findAll(
      // No tenant id — an admin reviews every tenant's tokens.
      undefined,
      parseInt(page, 10) || 1,
      parseInt(limit, 10) || 20,
      { status, search },
    );
    return { success: true, data: result };
  }

  @Get('stats')
  async stats() {
    return { success: true, data: await this.tokenService.getApprovalStats() };
  }

  @Get(':id')
  async findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return { success: true, data: await this.tokenService.findById(id) };
  }

  /** Everything an admin needs to review a token: the token plus who made it. */
  @Get(':id/details')
  async details(@Param('id', new ParseUUIDPipe()) id: string) {
    const token = await this.tokenService.findById(id);
    const m = this.dataSource.manager;
    const [creator, tenant, documents, complianceRules] = await Promise.all([
      m.findOne(User, { where: { id: token.createdBy } }),
      token.tenantId ? m.findOne(Tenant, { where: { id: token.tenantId } }) : null,
      m.find(TokenDocument, { where: { tokenId: id }, order: { createdAt: 'DESC' } }),
      m.find(ComplianceRule, { where: { tokenId: id }, order: { priority: 'ASC' } }),
    ]);
    return {
      success: true,
      data: {
        token,
        issuer: creator
          ? { id: creator.id, name: creator.name, email: creator.email }
          : null,
        tenant: tenant ? { id: tenant.id, name: tenant.name, slug: tenant.slug } : null,
        documents: documents.map((d) => ({
          id: d.id,
          name: d.name,
          type: d.type,
          originalName: d.originalName,
          mimeType: d.mimeType,
          fileSize: d.fileSize,
          fileUrl: d.fileUrl,
          createdAt: d.createdAt,
        })),
        complianceRules: complianceRules.map((r) => ({
          id: r.id,
          ruleType: r.ruleType,
          parameters: r.parameters,
          isActive: r.isActive,
          description: r.description,
        })),
      },
    };
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  async approve(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() admin: JwtPayload,
  ) {
    const token = await this.tokenService.approveCreation(id, admin?.sub ?? null);
    return {
      success: true,
      message: `${token.symbol} approved. The issuer can now deploy it.`,
      data: token,
    };
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  async reject(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: RejectTokenDto,
    @CurrentUser() admin: JwtPayload,
  ) {
    const token = await this.tokenService.rejectCreation(
      id,
      admin?.sub ?? null,
      dto.rejection_reason,
    );
    return {
      success: true,
      message: `${token.symbol} rejected. The issuer will see your reason.`,
      data: token,
    };
  }
}
