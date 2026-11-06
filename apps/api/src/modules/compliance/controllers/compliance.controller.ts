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
} from '@nestjs/common';
import { ComplianceService } from '../services/compliance.service';
import { TransferValidatorService } from '../services/transfer-validator.service';
import { CreateRuleDto, UpdateRuleDto } from '../dto/create-rule.dto';
import { CheckTransferDto } from '../dto/check-transfer.dto';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../auth/entities/user.entity';
import { TenantScope } from '../../auth/decorators/tenant-scope.decorator';

@Controller('compliance')
export class ComplianceController {
  constructor(
    private readonly complianceService: ComplianceService,
    private readonly transferValidatorService: TransferValidatorService,
  ) {}

  @Roles(UserRole.ISSUER, UserRole.ADMIN)
  @Post('rules')
  @HttpCode(HttpStatus.CREATED)
  async createRule(
    @Body() dto: CreateRuleDto,
    @Headers('x-user-id') userId?: string,
    @TenantScope() tenantId?: string,
  ) {
    const rule = await this.complianceService.createRule(dto, userId, tenantId);
    return { success: true, data: rule };
  }

  @Get('rules')
  async getRules(
    @Query('token_id', new ParseUUIDPipe()) tokenId: string,
    @TenantScope() tenantId?: string,
    @Query('active_only') activeOnly?: boolean,
  ) {
    const rules = await this.complianceService.getRules(tokenId, tenantId, activeOnly);
    return { success: true, data: rules };
  }

  @Get('rules/:id')
  async getRule(
    @Param('id', new ParseUUIDPipe()) id: string,
    @TenantScope() tenantId?: string,
  ) {
    const rule = await this.complianceService.findRuleById(id, tenantId);
    return { success: true, data: rule };
  }

  @Roles(UserRole.ISSUER, UserRole.ADMIN)
  @Patch('rules/:id')
  async updateRule(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateRuleDto,
    @TenantScope() tenantId?: string,
  ) {
    const rule = await this.complianceService.updateRule(id, dto, tenantId);
    return { success: true, data: rule };
  }

  @Roles(UserRole.ISSUER, UserRole.ADMIN)
  @Delete('rules/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteRule(
    @Param('id', new ParseUUIDPipe()) id: string,
    @TenantScope() tenantId?: string,
  ) {
    await this.complianceService.deleteRule(id, tenantId);
  }

  @Post('check-transfer')
  async checkTransfer(
    @Body() dto: CheckTransferDto,
    @TenantScope() tenantId?: string,
  ) {
    // Auto-resolve compliance address from DB token record when not provided
    let complianceAddr = dto.compliance_address;
    let irAddr = dto.identity_registry_address;
    if (!complianceAddr || !irAddr) {
      try {
        const token = await this.complianceService.getTokenAddresses(dto.token_id);
        if (!complianceAddr && token?.complianceAddress) complianceAddr = token.complianceAddress;
        if (!irAddr && token?.identityRegistryAddress) irAddr = token.identityRegistryAddress;
      } catch {
        // continue without auto-resolved addresses
      }
    }

    const result = await this.transferValidatorService.validateTransfer(
      dto.token_id,
      dto.from_address,
      dto.to_address,
      dto.amount,
      tenantId,
      irAddr,
      complianceAddr,
    );
    return { success: true, data: result };
  }
}
