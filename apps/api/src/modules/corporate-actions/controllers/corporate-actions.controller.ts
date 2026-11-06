import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { CorporateActionsService, CreateCorporateActionDto } from '../services/corporate-actions.service';
import { CorporateActionType } from '../entities/corporate-action.entity';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../auth/entities/user.entity';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { JwtPayload } from '../../auth/services/jwt.service';
import { ownerTenantFor } from '../../auth/interceptors/trusted-identity.interceptor';

@Controller('corporate-actions')
export class CorporateActionsController {
  constructor(private readonly service: CorporateActionsService) {}

  @Roles(UserRole.ISSUER, UserRole.ADMIN)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateCorporateActionDto,
    @Headers('x-user-id') userId?: string,
    @Headers('x-tenant-id') tenantId?: string,
    @CurrentUser() user?: JwtPayload,
  ) {
    const action = await this.service.create({
      ...dto,
      tenant_id: tenantId,
      created_by: userId,
    }, ownerTenantFor(user));
    return { success: true, data: action };
  }

  @Get()
  async findAll(@Headers('x-tenant-id') tenantId?: string) {
    const data = await this.service.findAll(tenantId);
    return { success: true, data };
  }

  @Get(':id')
  async findById(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    const data = await this.service.findById(id, ownerTenantFor(user));
    return { success: true, data };
  }

  @Roles(UserRole.ISSUER, UserRole.ADMIN)
  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: Partial<CreateCorporateActionDto>,
    @CurrentUser() user: JwtPayload,
  ) {
    const data = await this.service.update(id, body, ownerTenantFor(user));
    return { success: true, data };
  }

  @Roles(UserRole.ISSUER, UserRole.ADMIN)
  @Post(':id/activate')
  async activate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    const data = await this.service.activate(id, ownerTenantFor(user));
    return { success: true, data };
  }

  @Roles(UserRole.ISSUER, UserRole.ADMIN)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async cancel(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    await this.service.cancel(id, ownerTenantFor(user));
  }

  @Roles(UserRole.ISSUER, UserRole.ADMIN)
  @Post(':id/execute')
  async execute(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('x-user-id') userId?: string,
    @CurrentUser() user?: JwtPayload,
  ) {
    const result = await this.service.execute(id, userId, ownerTenantFor(user));
    return { success: true, data: result };
  }

  // ── Voting ──────────────────────────────────────────────────────────────────

  @Post(':id/vote')
  async castVote(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { option: string; investor_address: string; weight: string },
    @Headers('x-user-id') userId: string,
  ) {
    const vote = await this.service.castVote(id, userId, body.investor_address, body.option, body.weight);
    return { success: true, data: vote };
  }

  @Get(':id/voting-results')
  async getVotingResults(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.service.getVotingResults(id);
    return { success: true, data };
  }

  // ── Buyback ─────────────────────────────────────────────────────────────────

  @Post(':id/sell-request')
  @HttpCode(HttpStatus.CREATED)
  async submitSellRequest(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { token_amount: string; investor_address: string },
    @Headers('x-user-id') userId: string,
  ) {
    const req = await this.service.submitSellRequest(id, userId, body.investor_address, body.token_amount);
    return { success: true, data: req };
  }

  @Get(':id/sell-requests')
  async getSellRequests(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.service.getSellRequests(id);
    return { success: true, data };
  }

  @Roles(UserRole.ISSUER, UserRole.ADMIN)
  @Post(':id/sell-requests/:reqId/accept')
  async acceptSellRequest(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('reqId', ParseUUIDPipe) reqId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    const data = await this.service.acceptSellRequest(reqId, id, ownerTenantFor(user));
    return { success: true, data };
  }

  @Roles(UserRole.ISSUER, UserRole.ADMIN)
  @Post(':id/sell-requests/:reqId/reject')
  async rejectSellRequest(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('reqId', ParseUUIDPipe) reqId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    const data = await this.service.rejectSellRequest(reqId, id, ownerTenantFor(user));
    return { success: true, data };
  }

  // ── CSV Export ───────────────────────────────────────────────────────────────

  @Roles(UserRole.ISSUER, UserRole.ADMIN)
  @Get(':id/export-csv')
  async exportCsv(
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
    @CurrentUser() user: JwtPayload,
  ) {
    const csv = await this.service.exportDividendCsv(id, ownerTenantFor(user));
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="dividend-${id}.csv"`);
    res.send(csv);
  }
}
