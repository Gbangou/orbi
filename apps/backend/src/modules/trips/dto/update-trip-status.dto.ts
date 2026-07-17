import { IsEnum, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { TripStatus } from '@prisma/client';

const safeTripStatusTextPattern = new RegExp('^[^\\p{Cc}<>{}\\[\\]\\\\]+$', 'u');

export class UpdateTripStatusDto {
  @IsEnum(TripStatus)
  status!: TripStatus;

  @IsOptional()
  @IsString()
  @MaxLength(280)
  @Matches(safeTripStatusTextPattern, {
    message: 'Cancellation reason contains unsafe characters.',
  })
  cancellationReason?: string;
}
