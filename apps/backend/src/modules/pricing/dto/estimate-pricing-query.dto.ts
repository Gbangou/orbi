import { Type } from 'class-transformer';
import {
  IsBooleanString,
  IsIn,
  IsNumber,
  IsOptional,
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

export class EstimatePricingQueryDto {
  @IsIn(apiVehicleTypes)
  vehicleType!: (typeof apiVehicleTypes)[number];

  @IsOptional()
  @IsIn(apiServiceTiers)
  serviceTier?: (typeof apiServiceTiers)[number];

  @Type(() => Number)
  @IsNumber()
  @Min(0.1)
  distanceKm!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
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
  activeDriverCount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  openRequestCount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  driverOnboardingDays?: number;
}
