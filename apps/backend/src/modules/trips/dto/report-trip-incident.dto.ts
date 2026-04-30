import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MaxLength,
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
}
