import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  ParseUUIDPipe,
  ParseIntPipe,
  DefaultValuePipe,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { JwtPayload } from '../../auth/services/jwt.service';
import { UserRole } from '../../auth/entities/user.entity';
import { IssuerQualificationService } from '../services/issuer-qualification.service';
import { QualificationStatus } from '../entities/issuer-investor-qualification.entity';

@Controller('admin/kyc')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminKycController {
  constructor(
    private readonly qualificationService: IssuerQualificationService,
  ) {}

  @Get()
  async list(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('status') status?: QualificationStatus,
    @Query('search') search?: string,
  ) {
    const result = await this.qualificationService.listAllForAdmin(page, limit, status, search);
    return { success: true, ...result };
  }

  @Get('stats')
  async stats() {
    const stats = await this.qualificationService.getAdminStats();
    return { success: true, data: stats };
  }

  @Get(':id')
  async getOne(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.qualificationService.getQualification(id);
    return { success: true, data };
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  async approve(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() admin: JwtPayload,
    @Body('review_notes') reviewNotes?: string,
  ) {
    const result = await this.qualificationService.reviewQualification(
      id,
      admin.sub,
      UserRole.ADMIN,
      {
        status: QualificationStatus.APPROVED,
        review_notes: reviewNotes,
      },
    );
    return { success: true, data: result };
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  async reject(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() admin: JwtPayload,
    @Body('rejected_reason') rejectedReason: string,
    @Body('review_notes') reviewNotes?: string,
  ) {
    if (!rejectedReason) {
      throw new BadRequestException('rejected_reason is required');
    }
    const result = await this.qualificationService.reviewQualification(
      id,
      admin.sub,
      UserRole.ADMIN,
      {
        status: QualificationStatus.REJECTED,
        rejected_reason: rejectedReason,
        review_notes: reviewNotes,
      },
    );
    return { success: true, data: result };
  }

  /** Withdraw an investor's platform KYC (blocks them with every issuer). */
  @Post('investors/:investorId/revoke')
  @HttpCode(HttpStatus.OK)
  async revokeInvestor(
    @Param('investorId', ParseUUIDPipe) investorId: string,
    @CurrentUser() admin: JwtPayload,
    @Body('reason') reason: string,
  ) {
    if (!reason || !reason.trim()) {
      throw new BadRequestException('A reason is required to revoke KYC.');
    }
    const profile = await this.qualificationService.revokeAdminKyc(investorId, admin.sub, reason.trim());
    return { success: true, data: { admin_kyc_status: profile.adminKycStatus } };
  }

  @Post(':id/retry-pipeline')
  @HttpCode(HttpStatus.OK)
  async retryPipeline(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() admin: JwtPayload,
  ) {
    const identityAddress = await this.qualificationService.retryBlockchainPipeline(
      id,
      admin.sub,
      UserRole.ADMIN,
    );
    return {
      success: true,
      data: { identity_address: identityAddress, message: 'Blockchain pipeline re-queued.' },
    };
  }
}
