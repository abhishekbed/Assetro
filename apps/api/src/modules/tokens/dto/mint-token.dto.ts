import {
  IsString,
  IsNotEmpty,
  IsUUID,
  IsArray,
  IsOptional,
  ValidateNested,
  Matches,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';

export class MintTokenDto {
  @IsUUID('4', { message: 'token_id must be a valid UUID' })
  token_id: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^0x[a-fA-F0-9]{40}$/, { message: 'to_address must be a valid Ethereum address' })
  to_address: string;

  @IsString()
  @IsNotEmpty()
  amount: string;

  @IsOptional()
  @IsUUID('4', { message: 'user_id must be a valid UUID' })
  user_id?: string;
}

export class BatchMintRecipient {
  @IsString()
  @IsNotEmpty()
  @Matches(/^0x[a-fA-F0-9]{40}$/, { message: 'address must be a valid Ethereum address' })
  address: string;

  @IsString()
  @IsNotEmpty()
  amount: string;
}

export class BatchMintDto {
  @IsUUID('4', { message: 'token_id must be a valid UUID' })
  token_id: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BatchMintRecipient)
  recipients: BatchMintRecipient[];
}
