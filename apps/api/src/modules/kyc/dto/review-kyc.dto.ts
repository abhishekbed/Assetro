import { IsString, IsNotEmpty, IsEnum, IsOptional, MaxLength } from 'class-validator';

export enum ReviewDecision {
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

export class ReviewKycDto {
  @IsEnum(ReviewDecision)
  @IsNotEmpty()
  status: ReviewDecision;

  @IsString()
  @IsOptional()
  @MaxLength(2000)
  review_notes?: string;
}
