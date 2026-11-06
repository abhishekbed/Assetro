import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  ParseUUIDPipe,
  DefaultValuePipe,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { TenantService } from '../services/tenant.service';
import { CreateTenantDto, CreateTenantIssuerDto, UpdateTenantDto, UpdateTenantStatusDto } from '../dto/create-tenant.dto';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../auth/entities/user.entity';

@Roles(UserRole.ADMIN)
@Controller('admin/tenants')
export class TenantController {
  constructor(private readonly tenantService: TenantService) {}

  @Get()
  async findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.tenantService.findAll(page, limit);
  }

  @Post()
  async create(@Body() dto: CreateTenantDto) {
    return this.tenantService.create(dto);
  }

  @Get(':id')
  async findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.tenantService.findById(id);
  }

  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTenantDto,
  ) {
    return this.tenantService.update(id, dto);
  }

  @Patch(':id/status')
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTenantStatusDto,
  ) {
    return this.tenantService.updateStatus(id, dto.status);
  }

  @Post(':id/issuer')
  @HttpCode(HttpStatus.CREATED)
  async createIssuer(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateTenantIssuerDto,
  ) {
    const result = await this.tenantService.createIssuer(id, dto);
    return {
      success: true,
      message: `Issuer account created for ${result.user.email}`,
      data: {
        user: result.user,
        credentials: {
          email: result.user.email,
          temporaryPassword: result.tempPassword,
          loginUrl: 'http://localhost:3002/login',
        },
      },
    };
  }

  @Get(':id/stats')
  async getStats(@Param('id', ParseUUIDPipe) id: string) {
    return this.tenantService.getStats(id);
  }
}
