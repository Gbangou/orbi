import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

const supportedReviewStatuses = [
  'UNDER_REVIEW',
  'APPROVED',
  'REJECTED',
  'CHANGES_REQUESTED',
] as const;

const supportedDocumentStatuses = [
  'PENDING',
  'APPROVED',
  'REJECTED',
  'EXPIRED',
] as const;

class DriverDocumentDecisionDto {
  @ApiProperty()
  @IsString()
  documentId!: string;

  @ApiProperty({ enum: supportedDocumentStatuses })
  @IsEnum(supportedDocumentStatuses)
  status!: (typeof supportedDocumentStatuses)[number];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  rejectionReason?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

export class UpdateDriverOnboardingReviewDto {
  @ApiProperty({ enum: supportedReviewStatuses })
  @IsEnum(supportedReviewStatuses)
  status!: (typeof supportedReviewStatuses)[number];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notesInternal?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  decisionReason?: string;

  @ApiProperty({ required: false, minimum: 1, maximum: 3 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3)
  supportPriority?: number;

  @ApiProperty({ required: false, type: [DriverDocumentDecisionDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DriverDocumentDecisionDto)
  documentDecisions?: DriverDocumentDecisionDto[];
}
