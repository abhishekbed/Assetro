import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  Headers,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { WhitelistService } from '../services/whitelist.service';
import { AddToWhitelistDto, BatchWhitelistDto } from '../dto/whitelist.dto';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../auth/entities/user.entity';

@Controller('compliance/whitelist')
export class WhitelistController {
  constructor(private readonly whitelistService: WhitelistService) {}

  @Roles(UserRole.ISSUER, UserRole.ADMIN)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async addToWhitelist(
    @Body() dto: AddToWhitelistDto,
    @Headers('x-tenant-id') tenantId?: string,
  ) {
    const entry = await this.whitelistService.addToWhitelist(dto, tenantId);
    return { success: true, data: entry };
  }

  @Roles(UserRole.ISSUER, UserRole.ADMIN)
  @Post('batch')
  @HttpCode(HttpStatus.CREATED)
  async batchWhitelist(
    @Body() dto: BatchWhitelistDto,
    @Headers('x-tenant-id') tenantId?: string,
  ) {
    const result = await this.whitelistService.batchWhitelist(dto, tenantId);
    return { success: true, data: result };
  }

  @Roles(UserRole.ISSUER, UserRole.ADMIN)
  @Get()
  async getWhitelist(
    @Query('token_id', new ParseUUIDPipe()) tokenId: string,
    @Headers('x-tenant-id') tenantId?: string,
    @Query('page') page = 1,
    @Query('limit') limit = 50,
  ) {
    const result = await this.whitelistService.getWhitelist(tokenId, page, limit, tenantId);
    return { success: true, ...result };
  }

  @Get('check')
  async isWhitelisted(
    @Query('token_id', new ParseUUIDPipe()) tokenId: string,
    @Query('wallet_address') walletAddress: string,
  ) {
    const whitelisted = await this.whitelistService.isWhitelisted(tokenId, walletAddress);
    return { success: true, data: { whitelisted } };
  }

  @Roles(UserRole.ISSUER, UserRole.ADMIN)
  @Delete(':tokenId/:walletAddress')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeFromWhitelist(
    @Param('tokenId', new ParseUUIDPipe()) tokenId: string,
    @Param('walletAddress') walletAddress: string,
    @Headers('x-tenant-id') tenantId?: string,
  ) {
    await this.whitelistService.removeFromWhitelist(tokenId, walletAddress, tenantId);
  }
}
