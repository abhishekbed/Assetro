import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Headers,
  Res,
  ParseUUIDPipe,
} from '@nestjs/common';
import { Response } from 'express';
import { CapTableService } from '../services/cap-table.service';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../auth/entities/user.entity';

@Roles(UserRole.ISSUER, UserRole.ADMIN)
@Controller('tokens/cap-table/tokens')
export class CapTableController {
  constructor(private readonly capTableService: CapTableService) {}

  @Get(':tokenId')
  async getCapTable(
    @Param('tokenId', new ParseUUIDPipe()) tokenId: string,
    @Headers('x-tenant-id') tenantId?: string,
    @Query('page') page = 1,
    @Query('limit') limit = 50,
  ) {
    const result = await this.capTableService.getCapTable(tokenId, page, limit, tenantId);
    return { success: true, ...result };
  }

  @Get(':tokenId/export')
  async exportCsv(
    @Param('tokenId', new ParseUUIDPipe()) tokenId: string,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Res() res: Response,
  ) {
    const csv = await this.capTableService.exportCsv(tokenId, tenantId);

    res.set({
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="cap-table-${tokenId}.csv"`,
    });
    res.send(csv);
  }

  @Post(':tokenId/sync')
  async syncFromBlockchain(
    @Param('tokenId', new ParseUUIDPipe()) tokenId: string,
    @Headers('x-tenant-id') tenantId?: string,
  ) {
    const result = await this.capTableService.syncFromBlockchain(tokenId, tenantId);
    return { success: true, data: result };
  }
}
