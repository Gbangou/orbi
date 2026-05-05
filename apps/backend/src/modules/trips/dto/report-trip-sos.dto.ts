import { IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class ReportTripSosDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  details?: string;

  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(5000)
  accuracyMeters?: number;
}
