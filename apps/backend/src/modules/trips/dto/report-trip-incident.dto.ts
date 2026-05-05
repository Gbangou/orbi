import {
  IsInt,
  IsIn,
  IsOptional,
  IsString,
  Max,
  Min,
  MaxLength,
  IsBoolean,
} from 'class-validator';

export class ReportTripIncidentDto {
  @IsString()
  @MaxLength(64)
  incidentType!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  details?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3)
  priority?: number;

  @IsOptional()
  @IsBoolean()
  evidenceConsent?: boolean;

  @IsOptional()
  @IsIn(['AUDIO', 'PHOTO', 'VIDEO', 'TEXT_NOTE'])
  evidenceType?: 'AUDIO' | 'PHOTO' | 'VIDEO' | 'TEXT_NOTE';

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(72)
  evidenceRetentionHours?: number;
}
