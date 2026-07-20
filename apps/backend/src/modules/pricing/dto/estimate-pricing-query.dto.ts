import { Type } from 'class-transformer';
import {
  IsBooleanString,
  IsIn,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import {
  apiDemandLevels,
  apiDistrictProfiles,
  apiMarketZones,
  apiPaymentMethods,
  apiPricingCities,
  apiRoadConditions,
  apiServiceTiers,
  apiTrafficLevels,
  apiVehicleTypes,
  apiWeatherConditions,
} from '@orbi/domain';

class BasePricingQueryDto {
  @IsOptional()
  @IsIn(apiServiceTiers)
  serviceTier?: (typeof apiServiceTiers)[number];

  @Type(() => Number)
  @IsNumber()
  @Min(0.1)
  @Max(500)
  distanceKm!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(1440)
  durationMinutes!: number;

  @IsOptional()
  @IsIn(apiPaymentMethods)
  paymentMethod?: (typeof apiPaymentMethods)[number];

  @IsOptional()
  @IsIn(apiMarketZones)
  zone?: (typeof apiMarketZones)[number];

  @IsOptional()
  @IsIn(apiPricingCities)
  city?: (typeof apiPricingCities)[number];

  @IsOptional()
  @IsIn(apiDistrictProfiles)
  districtProfile?: (typeof apiDistrictProfiles)[number];

  @IsOptional()
  @IsIn(apiDemandLevels)
  demandLevel?: (typeof apiDemandLevels)[number];

  @IsOptional()
  @IsIn(apiTrafficLevels)
  trafficLevel?: (typeof apiTrafficLevels)[number];

  @IsOptional()
  @IsIn(apiWeatherConditions)
  weatherCondition?: (typeof apiWeatherConditions)[number];

  @IsOptional()
  @IsIn(apiRoadConditions)
  roadCondition?: (typeof apiRoadConditions)[number];

  @IsOptional()
  @IsBooleanString()
  isPeakHour?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100000)
  activeDriverCount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100000)
  openRequestCount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(3650)
  driverOnboardingDays?: number;

  // Optional coordinates — enables OSRM road routing for accurate ETA/distance
  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  pickupLatitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  pickupLongitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  destinationLatitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  destinationLongitude?: number;
}

export class EstimatePricingQueryDto extends BasePricingQueryDto {
  @IsIn(apiVehicleTypes)
  vehicleType!: (typeof apiVehicleTypes)[number];
}

export class RideOptionsPricingQueryDto extends BasePricingQueryDto {
  @IsOptional()
  @IsIn(apiVehicleTypes)
  vehicleType?: (typeof apiVehicleTypes)[number];
}
