import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsISO8601, IsLatitude, IsLongitude, IsNumber, IsOptional, Max, Min } from 'class-validator';

export class UpdateDriverPresenceDto {
  @ApiProperty({
    description: 'Current driver latitude used for dispatch prioritization.',
  })
  @IsLatitude()
  latitude!: number;

  @ApiProperty({
    description: 'Current driver longitude used for dispatch prioritization.',
  })
  @IsLongitude()
  longitude!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1500)
  accuracyMeters?: number;

  @IsOptional()
  @IsISO8601()
  observedAt?: string;
}
