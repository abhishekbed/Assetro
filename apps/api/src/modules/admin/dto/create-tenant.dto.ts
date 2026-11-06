import {
  IsEmail,
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsObject,
  Matches,
  MaxLength,
} from 'class-validator';
import { TenantPlan } from '../entities/tenant.entity';

export class CreateTenantDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'Slug must be lowercase alphanumeric with hyphens only',
  })
  slug: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  domain?: string;

  @IsEnum(TenantPlan)
  plan: TenantPlan;

  @IsObject()
  @IsOptional()
  settings?: Record<string, unknown>;
}

export class UpdateTenantDto {
  @IsString()
  @IsOptional()
  @MaxLength(255)
  name?: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  domain?: string;

  @IsEnum(TenantPlan)
  @IsOptional()
  plan?: TenantPlan;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  logoUrl?: string;

  @IsString()
  @IsOptional()
  @MaxLength(7)
  primaryColor?: string;

  @IsObject()
  @IsOptional()
  settings?: Record<string, unknown>;
}

export class CreateTenantIssuerDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @IsEmail()
  email: string;
}

export class UpdateTenantStatusDto {
  @IsEnum(['active', 'suspended', 'deactivated'])
  status: 'active' | 'suspended' | 'deactivated';
}
