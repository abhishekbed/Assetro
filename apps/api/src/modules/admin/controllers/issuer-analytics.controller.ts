import { Controller, Get, Query, Headers } from '@nestjs/common';
import { IssuerAnalyticsService } from '../services/issuer-analytics.service';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../auth/entities/user.entity';

@Roles(UserRole.ISSUER, UserRole.ADMIN)
@Controller('analytics')
export class IssuerAnalyticsController {
  constructor(private readonly service: IssuerAnalyticsService) {}

  @Get('overview')
  async overview(@Headers('x-tenant-id') tenantId?: string) {
    return { success: true, data: await this.service.getOverview(tenantId) };
  }

  @Get('revenue-by-day')
  async revenueByDay(
    @Headers('x-tenant-id') tenantId?: string,
    @Query('days') days?: string,
  ) {
    return { success: true, data: await this.service.getRevenueByDay(tenantId, Number(days ?? 30)) };
  }

  @Get('holders-by-day')
  async holdersByDay(
    @Headers('x-tenant-id') tenantId?: string,
    @Query('days') days?: string,
  ) {
    return { success: true, data: await this.service.getHolderCountByDay(tenantId, Number(days ?? 30)) };
  }

  @Get('payment-volume-by-day')
  async paymentVolumeByDay(
    @Headers('x-tenant-id') tenantId?: string,
    @Query('days') days?: string,
  ) {
    return { success: true, data: await this.service.getPaymentVolumeByDay(tenantId, Number(days ?? 30)) };
  }

  @Get('revenue-by-token')
  async revenueByToken(@Headers('x-tenant-id') tenantId?: string) {
    return { success: true, data: await this.service.getRevenueByToken(tenantId) };
  }

  @Get('investor-breakdown')
  async investorBreakdown(@Headers('x-tenant-id') tenantId?: string) {
    return { success: true, data: await this.service.getInvestorBreakdown(tenantId) };
  }

  @Get('country-breakdown')
  async countryBreakdown(@Headers('x-tenant-id') tenantId?: string) {
    return { success: true, data: await this.service.getCountryBreakdown(tenantId) };
  }
}
