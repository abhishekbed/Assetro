import { Controller, Get } from '@nestjs/common';
import { AnalyticsService } from '../services/analytics.service';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../auth/entities/user.entity';

@Roles(UserRole.ADMIN)
@Controller('admin/analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('dashboard')
  async getDashboard() {
    return this.analyticsService.getPlatformStats();
  }
}
