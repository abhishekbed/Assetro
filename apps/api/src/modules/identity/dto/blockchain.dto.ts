import {
  IsString,
  IsEthereumAddress,
  IsUUID,
  IsOptional,
  IsInt,
  IsBoolean,
  Min,
  Max,
} from 'class-validator';

export class CreateOnchainIdDto {
  /** Investor wallet address — the identity will be linked to this wallet */
  @IsEthereumAddress()
  wallet_address: string;

  /**
   * Target user ID.
   * Issuers/agents may specify another user's ID; investors must omit this
   * (their own sub is used automatically).
   */
  @IsOptional()
  @IsUUID()
  user_id?: string;
}

export class IssueClaimsApiDto {
  /**
   * Target user ID.
   * Issuers/agents may specify another user's ID.
   */
  @IsOptional()
  @IsUUID()
  user_id?: string;

  /** Numeric country code (e.g. 356 = India, 840 = USA) */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(999)
  country_code?: number;

  /** Whether the investor holds accredited investor status */
  @IsOptional()
  @IsBoolean()
  is_accredited?: boolean;
}

export class RegisterIdentityApiDto {
  /**
   * Target user ID.
   * Issuers/agents may specify another user's ID.
   */
  @IsOptional()
  @IsUUID()
  user_id?: string;

  /** Token whose IdentityRegistry the investor should be registered in */
  @IsUUID()
  token_id: string;

  /** IdentityRegistry contract address for the token */
  @IsEthereumAddress()
  identity_registry_address: string;

  /** Numeric country code registered in IdentityRegistry */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(999)
  country_code?: number;
}
