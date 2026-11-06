import { IsUUID, IsString, IsNotEmpty, IsOptional, Matches } from 'class-validator';

export class CheckTransferDto {
  @IsUUID('4', { message: 'token_id must be a valid UUID' })
  token_id: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^0x[a-fA-F0-9]{40}$/, { message: 'from_address must be a valid Ethereum address' })
  from_address: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^0x[a-fA-F0-9]{40}$/, { message: 'to_address must be a valid Ethereum address' })
  to_address: string;

  @IsString()
  @IsNotEmpty()
  amount: string;

  /** Optional: token's IdentityRegistry contract address for on-chain isVerified() check */
  @IsOptional()
  @IsString()
  @Matches(/^0x[a-fA-F0-9]{40}$/, { message: 'identity_registry_address must be a valid Ethereum address' })
  identity_registry_address?: string;

  /** Optional: token's ModularCompliance contract address for on-chain canTransfer() module check */
  @IsOptional()
  @IsString()
  @Matches(/^0x[a-fA-F0-9]{40}$/, { message: 'compliance_address must be a valid Ethereum address' })
  compliance_address?: string;
}
