import {
  IsUUID,
  IsEnum,
  IsObject,
  IsBoolean,
  IsOptional,
  IsString,
  IsInt,
  Min,
} from 'class-validator';
import { RuleType } from '../entities/compliance-rule.entity';

export class CreateRuleDto {
  @IsUUID('4', { message: 'token_id must be a valid UUID' })
  token_id: string;

  @IsEnum(RuleType, {
    message: `rule_type must be one of: ${Object.values(RuleType).join(', ')}`,
  })
  rule_type: RuleType;

  @IsObject()
  parameters: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  priority?: number;

  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateRuleDto {
  @IsOptional()
  @IsObject()
  parameters?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  priority?: number;

  @IsOptional()
  @IsString()
  description?: string;
}
