import { ApiProperty } from '@nestjs/swagger';
import {
  IsIn,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

const requestedVehicleTypes = ['MOTORCYCLE', 'CAR'] as const;
const requestedServiceTiers = [
  'MOTO_STANDARD',
  'MOTO_PLUS',
  'CAR_STANDARD',
  'CAR_COMFORT',
  'CAR_XL',
] as const;
const paymentMethods = ['MOBILE_MONEY', 'CASH', 'WALLET'] as const;
const pickupAreaTypes = ['URBAN_CORE', 'URBAN_EDGE', 'SEMI_URBAN'] as const;
const pricingCities = [
  'OUAGADOUGOU',
  'BOBO_DIOULASSO',
  'KOUDOUGOU',
  'BANFORA',
  'OUAHIGOUYA',
] as const;
const districtProfiles = [
  'CBD',
  'UNIVERSITY',
  'GOVERNMENT',
  'AIRPORT',
  'RESIDENTIAL_STANDARD',
  'RESIDENTIAL_PERIPHERAL',
  'MARKET_DENSE',
  'INDUSTRIAL',
  'INTERCITY_GATE',
] as const;

export class CreateRideRequestDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  riderId!: string;

  @ApiProperty()
  @IsString()
  pickupAddress!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsLatitude()
  pickupLatitude?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsLongitude()
  pickupLongitude?: number;

  @ApiProperty()
  @IsString()
  destinationAddress!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsLatitude()
  destinationLatitude?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsLongitude()
  destinationLongitude?: number;

  @ApiProperty({ enum: requestedVehicleTypes })
  @IsIn(requestedVehicleTypes)
  requestedVehicleType!: (typeof requestedVehicleTypes)[number];

  @ApiProperty({ enum: requestedServiceTiers, required: false })
  @IsOptional()
  @IsIn(requestedServiceTiers)
  requestedServiceTier?: (typeof requestedServiceTiers)[number];

  @ApiProperty()
  @IsNumber()
  @Min(0.1)
  estimatedDistanceKm!: number;

  @ApiProperty()
  @IsNumber()
  @Min(1)
  estimatedDurationMinutes!: number;

  @ApiProperty({ enum: paymentMethods, required: false })
  @IsOptional()
  @IsIn(paymentMethods)
  paymentMethod?: (typeof paymentMethods)[number];

  @ApiProperty({ enum: pickupAreaTypes, required: false })
  @IsOptional()
  @IsIn(pickupAreaTypes)
  pickupAreaType?: (typeof pickupAreaTypes)[number];

  @ApiProperty({ enum: pricingCities, required: false })
  @IsOptional()
  @IsIn(pricingCities)
  city?: (typeof pricingCities)[number];

  @ApiProperty({ enum: districtProfiles, required: false })
  @IsOptional()
  @IsIn(districtProfiles)
  districtProfile?: (typeof districtProfiles)[number];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string;
}
