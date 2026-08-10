import { Type } from 'class-transformer';
import { IsISO8601, IsNumber, IsOptional, Max, Min } from 'class-validator';

export class RecordRoutePositionDto {
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(5000)
  accuracyMeters?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(250)
  speedKph?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1000)
  distanceToDestinationKm?: number;

  @IsOptional()
  @IsISO8601()
  observedAt?: string;
}
