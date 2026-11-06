import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Request,
  Req,
  BadRequestException,
  UseInterceptors,
  UploadedFile,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Request as ExpressRequest } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { IssuerLeadsService } from '../services/issuer-leads.service';
import { CreateIssuerLeadDto } from '../dto/create-issuer-lead.dto';
import { ApproveLeadDto, RejectLeadDto } from '../dto/review-lead.dto';
import { Public } from '../../auth/decorators/public.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../auth/entities/user.entity';
import { IssuerLeadStatus } from '../entities/issuer-lead.entity';

@Controller()
export class IssuerLeadsController {
  constructor(private readonly service: IssuerLeadsService) {}

  // ─── Public endpoints ──────────────────────────────────────────

  // Only a signed-in issuer files an application, so only they upload documents.
  @Roles(UserRole.ISSUER, UserRole.ADMIN)
  @Post('issuer-leads/upload')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 15 * 1024 * 1024 } }))
  async uploadDocument(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: ExpressRequest,
  ) {
    if (!file) throw new BadRequestException('No file provided');

    // The extension comes from the validated mime type, never the client's
    // filename, so an .html file can't be stored under an image content type.
    const extByMime: Record<string, string> = {
      'application/pdf': 'pdf',
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'application/msword': 'doc',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    };
    if (!extByMime[file.mimetype]) {
      throw new BadRequestException('Invalid file type. Allowed formats: PDF, PNG, JPG, WEBP, DOC, DOCX');
    }

    const { path: nodePath, fs: nodeFs } = await import('path').then((p) => ({
      path: p,
      fs: require('fs') as typeof import('fs'),
    }));
    const uploadsRoot = process.env.UPLOADS_PATH ?? nodePath.join(process.cwd(), 'uploads');
    const dir = nodePath.join(uploadsRoot, 'issuer-documents');
    nodeFs.mkdirSync(dir, { recursive: true });

    const ext = extByMime[file.mimetype];
    const safeBase = file.originalname
      .replace(/\.[^/.]+$/, '')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 40);
    const fileName = `${Date.now()}-${safeBase}.${ext}`;
    nodeFs.writeFileSync(nodePath.join(dir, fileName), file.buffer);

    const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'http';
    const host = (req.headers['x-forwarded-host'] as string) || req.get('host') || `localhost:${process.env.PORT ?? 3000}`;
    const baseUrl = process.env.API_BASE_URL
      ? process.env.API_BASE_URL.replace(/\/+$/, '')
      : `${proto}://${host}`;
    const relativePath = `/api/v1/uploads/issuer-documents/${fileName}`;
    const url = `${baseUrl}${relativePath}`;

    return {
      success: true,
      data: {
        url,
        relativePath,
        fileName: file.originalname,
      },
    };
  }

  /** Issuer files the application after signing up and verifying their email. */
  @Roles(UserRole.ISSUER)
  @Post('issuer-leads')
  async submit(@Body() dto: CreateIssuerLeadDto, @Request() req: { user: { sub: string } }) {
    const lead = await this.service.submit(dto, req.user.sub);
    return {
      success: true,
      message: 'Your application has been submitted successfully. Our compliance team will review your request.',
      data: { id: lead.id, status: lead.status, createdAt: lead.createdAt },
    };
  }

  /** Approval status shown on the issuer dashboard. */
  @Roles(UserRole.ISSUER)
  @Get('issuer-leads/me')
  async myStatus(@Request() req: { user: { sub: string } }) {
    return { success: true, data: await this.service.getMyStatus(req.user.sub) };
  }

  @Public()
  @Get('issuer-leads/status/:id')
  async getStatus(@Param('id', ParseUUIDPipe) id: string) {
    const result = await this.service.getStatusById(id);
    return { success: true, data: result };
  }

  // ─── Admin endpoints ───────────────────────────────────────────

  @Roles(UserRole.ADMIN)
  @Get('admin/issuer-leads')
  async findAll(
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('status') status?: IssuerLeadStatus,
    @Query('search') search?: string,
  ) {
    const result = await this.service.findAll(
      Number(page),
      Number(limit),
      status,
      search,
    );
    return { success: true, ...result };
  }

  @Roles(UserRole.ADMIN)
  @Get('admin/issuer-leads/stats')
  async getStats() {
    const stats = await this.service.getStats();
    return { success: true, data: stats };
  }

  @Roles(UserRole.ADMIN)
  @Get('admin/issuer-leads/:id')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const lead = await this.service.findById(id);
    return { success: true, data: lead };
  }

  @Roles(UserRole.ADMIN)
  @Post('admin/issuer-leads/:id/approve')
  @HttpCode(HttpStatus.OK)
  async approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveLeadDto,
    @Request() req: { user?: { sub?: string } },
  ) {
    const adminId = req.user?.sub ?? null;
    const { lead, tempPassword } = await this.service.approve(id, adminId, dto.plan, dto.slug, dto.customDomain);
    return {
      success: true,
      // The issuer chose their password at signup.
      message: `Issuer approved. ${lead.email} can now sign in with the password they chose at signup.`,
      data: {
        lead,
        credentials: {
          email: lead.email,
          temporaryPassword: tempPassword,
          loginUrl: this.service.issuerLoginUrl(),
        },
      },
    };
  }

  @Roles(UserRole.ADMIN)
  @Post('admin/issuer-leads/:id/reject')
  @HttpCode(HttpStatus.OK)
  async reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectLeadDto,
    @Request() req: { user?: { sub?: string } },
  ) {
    const adminId = req.user?.sub ?? null;
    const lead = await this.service.reject(id, adminId, dto.rejection_reason);
    return {
      success: true,
      message: 'Issuer application rejected.',
      data: lead,
    };
  }
}
