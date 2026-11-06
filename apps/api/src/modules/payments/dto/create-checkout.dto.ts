import { IsUUID, IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateCheckoutDto {
  @IsString()
  @IsNotEmpty()
  token_id: string;

  @IsString()
  @IsNotEmpty()
  token_amount: string;

  @IsString()
  @IsOptional()
  currency: string = 'USD';

  @IsString()
  @IsOptional()
  wallet_address?: string;
}
