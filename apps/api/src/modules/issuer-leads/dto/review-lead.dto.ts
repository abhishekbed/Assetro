import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class RejectLeadDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  rejection_reason: string;
}

export class ApproveLeadDto {
  @IsString()
  @IsOptional()
  @MaxLength(100)
  plan?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  @Matches(/^[a-z0-9-]+$/, { message: 'Slug must be lowercase letters, numbers and hyphens only' })
  slug?: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  customDomain?: string;
}
