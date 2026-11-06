import {
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateIssuerLeadDto {
  @IsString()
  @IsOptional()
  @MaxLength(100)
  first_name?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  last_name?: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  full_name?: string;

  @IsEmail()
  @IsOptional()
  @Transform(({ value }) => value?.toLowerCase?.())
  email: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  company_name: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  job_title?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  company_type?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  phone_number?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  website?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  country: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  registered_address?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  address_line_2?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  city?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  state_province?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  postal_code?: string;

  @IsBoolean()
  @IsOptional()
  is_operating_address_same?: boolean;

  @IsString()
  @IsOptional()
  operating_address?: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  authorized_representative_name?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  nationality?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  identity_document_type?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  identity_document_number?: string;

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  proof_of_identity_url?: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  proof_of_identity_name?: string;

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  authorization_letter_url?: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  authorization_letter_name?: string;

  @IsString()
  @IsOptional()
  @MaxLength(2000)
  comments?: string;
}
