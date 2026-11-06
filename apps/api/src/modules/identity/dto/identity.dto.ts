import { IsString, IsEthereumAddress, IsOptional, IsInt, IsBoolean, Min, Max } from 'class-validator';

export class DeployIdentityDto {
  @IsEthereumAddress()
  wallet_address: string;
}

export class RegisterInTokenDto {
  @IsString()
  token_id: string;

  @IsEthereumAddress()
  identity_registry_address: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(999)
  country_code?: number;
}

export class IssueClaimsDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  country_code?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3)
  investor_classification?: number;

  @IsOptional()
  @IsBoolean()
  is_accredited?: boolean;
}
