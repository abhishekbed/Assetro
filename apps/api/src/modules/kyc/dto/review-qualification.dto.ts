import {
  IsIn,
  IsOptional,
  IsString,
  IsArray,
  IsInt,
  MaxLength,
} from 'class-validator';
import { QualificationStatus } from '../entities/issuer-investor-qualification.entity';

const REVIEWABLE_STATUSES = [
  QualificationStatus.UNDER_REVIEW,
  QualificationStatus.APPROVED,
  QualificationStatus.REJECTED,
] as const;

export class ReviewQualificationDto {
  @IsIn(REVIEWABLE_STATUSES)
  status: QualificationStatus;

  @IsString()
  @IsOptional()
  @MaxLength(2000)
  review_notes?: string;

  @IsString()
  @IsOptional()
  @MaxLength(2000)
  rejected_reason?: string;

  @IsArray()
  @IsInt({ each: true })
  @IsOptional()
  additional_claims_required?: number[];
}
