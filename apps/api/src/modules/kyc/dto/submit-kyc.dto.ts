import {
  IsString,
  IsNotEmpty,
  IsDateString,
  IsOptional,
  IsEnum,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { InvestorType, AccreditationStatus } from '../entities/kyc-submission.entity';

export class SubmitKycDto {
  @IsUUID()
  @IsNotEmpty()
  token_id: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(255)
  full_name: string;

  @IsDateString()
  @IsNotEmpty()
  date_of_birth: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  nationality: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  country: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  address_line1: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  address_line2?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  city: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  postal_code: string;

  @IsEnum(InvestorType)
  @IsOptional()
  investor_type?: InvestorType;

  @IsEnum(AccreditationStatus)
  @IsOptional()
  accreditation?: AccreditationStatus;

  @IsOptional()
  terms_agreed?: boolean;
}
