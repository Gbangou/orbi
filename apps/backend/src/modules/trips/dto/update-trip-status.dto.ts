import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { TripStatus } from '@prisma/client';

export class UpdateTripStatusDto {
  @IsEnum(TripStatus)
  status!: TripStatus;

  @IsOptional()
  @IsString()
  @MaxLength(280)
  cancellationReason?: string;
}
