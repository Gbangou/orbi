import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class DriverOnboardingExportQueryDto {
  @ApiPropertyOptional({
    enum: ['all', 'approve', 'review', 'resubmit'],
    default: 'all',
  })
  @IsOptional()
  @IsIn(['all', 'approve', 'review', 'resubmit'])
  guidanceFilter?: 'all' | 'approve' | 'review' | 'resubmit';

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  searchQuery?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
