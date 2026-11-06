import {
  IsString,
  IsNotEmpty,
  IsDateString,
  IsOptional,
  IsEnum,
  IsBoolean,
  MaxLength,
  MinLength,
  Matches,
} from 'class-validator';
import { InvestorType, AccreditationStatus } from '../entities/kyc-submission.entity';

export class SubmitProfileDto {
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
  @MaxLength(10)
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

  @IsBoolean()
  @IsOptional()
  terms_agreed?: boolean;

  // ── Phase 3.2 new fields ──────────────────────────────────────────────────

  @IsString()
  @IsOptional()
  @MaxLength(20)
  phone?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  tax_id?: string;

  // Institutional investor fields
  @IsString()
  @IsOptional()
  @MaxLength(255)
  company_name?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  company_registration?: string;

  @IsString()
  @IsOptional()
  @MaxLength(2)
  @Matches(/^[A-Z]{0,2}$/, { message: 'company_country must be a 2-letter ISO code' })
  company_country?: string;
}
