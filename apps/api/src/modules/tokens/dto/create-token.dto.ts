import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsInt,
  IsOptional,
  IsNumber,
  IsUrl,
  IsArray,
  ValidateNested,
  IsObject,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AssetType } from '../entities/token.entity';

export class ComplianceRuleInput {
  @IsString()
  @IsNotEmpty()
  rule_type: string;

  @IsObject()
  parameters: Record<string, unknown>;
}

export class CreateTokenDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  symbol: string;

  @IsInt()
  @Min(0)
  @Max(18)
  decimals: number;

  @IsString()
  @IsNotEmpty()
  total_supply: string;

  @IsEnum(AssetType, {
    message: `asset_type must be one of: ${Object.values(AssetType).join(', ')}`,
  })
  asset_type: AssetType;

  @IsInt()
  chain_id: number;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsUrl({}, { message: 'document_uri must be a valid URL' })
  document_uri?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ComplianceRuleInput)
  compliance_rules?: ComplianceRuleInput[];

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  compliance_modules?: {
    country_restrict?: { enabled: boolean; restricted_countries?: number[] };
    max_holders?: { enabled: boolean; max?: number };
    transfer_window?: { enabled: boolean };
    supply_limit?: { enabled: boolean; limit?: string };
    max_balance?: { enabled: boolean; max?: string };
    day_month_limits?: { enabled: boolean; daily_limit?: string; monthly_limit?: string };
    exchange_monthly_limits?: {
      enabled: boolean;
      exchange_addresses?: string[];
      monthly_limit?: string;
    };
  };
}
