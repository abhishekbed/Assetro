import {
  IsUUID,
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsArray,
  ValidateNested,
  Matches,
  ArrayMinSize,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { InvestorType } from '../entities/whitelist.entity';

export class AddToWhitelistDto {
  @IsUUID('4', { message: 'token_id must be a valid UUID' })
  token_id: string;

  @IsOptional()
  @IsUUID('4')
  user_id?: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^0x[a-fA-F0-9]{40}$/, { message: 'wallet_address must be a valid Ethereum address' })
  wallet_address: string;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  country?: string;

  @IsOptional()
  @IsEnum(InvestorType, {
    message: `investor_type must be one of: ${Object.values(InvestorType).join(', ')}`,
  })
  investor_type?: InvestorType;
}

export class WhitelistEntry {
  @IsOptional()
  @IsUUID('4')
  user_id?: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^0x[a-fA-F0-9]{40}$/, { message: 'wallet_address must be a valid Ethereum address' })
  wallet_address: string;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  country?: string;

  @IsOptional()
  @IsEnum(InvestorType)
  investor_type?: InvestorType;
}

export class BatchWhitelistDto {
  @IsUUID('4', { message: 'token_id must be a valid UUID' })
  token_id: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => WhitelistEntry)
  entries: WhitelistEntry[];
}
