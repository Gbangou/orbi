import { Type } from 'class-transformer';
import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const safeStructuredTextPattern = new RegExp(
  '^[^\\p{Cc}<>{}\\[\\]\\\\]+$',
  'u',
);
const strictUtcDateTimePattern =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{3}))?Z$/;
const vehicleTypes = ['MOTORCYCLE', 'CAR'] as const;
const paymentMethods = ['MOBILE_MONEY', 'CASH', 'WALLET'] as const;
const cities = [
  'OUAGADOUGOU',
  'BOBO_DIOULASSO',
  'KOUDOUGOU',
  'BANFORA',
  'OUAHIGOUYA',
] as const;

export class CreateScheduledRideDto {
  @IsString()
  @MinLength(4)
  @MaxLength(160)
  @Matches(safeStructuredTextPattern, {
    message: 'Pickup address contains unsafe characters.',
  })
  pickupAddress!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(-90)
  @Max(90)
  pickupLatitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(-180)
  @Max(180)
  pickupLongitude?: number;

  @IsString()
  @MinLength(4)
  @MaxLength(160)
  @Matches(safeStructuredTextPattern, {
    message: 'Destination address contains unsafe characters.',
  })
  destinationAddress!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(-90)
  @Max(90)
  destinationLatitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(-180)
  @Max(180)
  destinationLongitude?: number;

  @IsString()
  @Matches(strictUtcDateTimePattern, {
    message: 'scheduledFor must be a UTC ISO 8601 instant.',
  })
  scheduledFor!: string;

  @IsOptional()
  @IsIn(vehicleTypes)
  vehicleType?: (typeof vehicleTypes)[number];

  @IsOptional()
  @IsIn(paymentMethods)
  paymentMethod?: (typeof paymentMethods)[number];

  @IsOptional()
  @IsIn(cities)
  city?: (typeof cities)[number];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Matches(safeStructuredTextPattern, {
    message: 'Notes contain unsafe characters.',
  })
  notes?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(32)
  @Matches(/^[A-Z0-9]+$/, {
    message: 'Promo code must be alphanumeric uppercase.',
  })
  promoCode?: string;
}

export class CancelScheduledRideDto {
  @IsOptional()
  @IsString()
  @MaxLength(240)
  @Matches(safeStructuredTextPattern, {
    message: 'Cancellation reason contains unsafe characters.',
  })
  reason?: string;
}
