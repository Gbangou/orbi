import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

const mobileErrorCodes = [
  'MOB-AUTH-SESSION',
  'MOB-BOOKING-DISPATCH',
  'MOB-PAYMENT-PROVIDER',
  'MOB-REALTIME-DEGRADED',
  'MOB-SAFETY-INCIDENT',
  'MOB-NETWORK-OFFLINE',
  'MOB-VALIDATION-INPUT',
  'MOB-GENERIC-API',
] as const;

const mobileErrorSurfaces = [
  'auth',
  'booking',
  'payments',
  'active-trip',
  'safety',
  'profile',
  'driver-availability',
  'network',
  'unknown',
] as const;

class MobileErrorClassificationDto {
  @IsIn(mobileErrorCodes)
  code!: (typeof mobileErrorCodes)[number];

  @IsIn(mobileErrorSurfaces)
  surface!: (typeof mobileErrorSurfaces)[number];

  @IsIn(['low', 'medium', 'high', 'critical'])
  severity!: 'low' | 'medium' | 'high' | 'critical';

  @IsIn(['engineering', 'ops', 'support', 'finance'])
  owner!: 'engineering' | 'ops' | 'support' | 'finance';

  @IsString()
  @MaxLength(128)
  retryPolicy!: string;

  @IsString()
  @MaxLength(240)
  userMessage!: string;

  @IsBoolean()
  shouldClearSessionToken!: boolean;

  @IsBoolean()
  shouldNavigateToAuth!: boolean;

  @IsBoolean()
  reportable!: boolean;
}

class MobileErrorReportDto {
  @IsString()
  @MaxLength(96)
  id!: string;

  @IsISO8601()
  occurredAt!: string;

  @IsIn(['rider', 'driver'])
  appRole!: 'rider' | 'driver';

  @IsOptional()
  @IsString()
  @MaxLength(48)
  appVersion?: string;

  @ValidateNested()
  @Type(() => MobileErrorClassificationDto)
  classification!: MobileErrorClassificationDto;

  @IsString()
  @MaxLength(80)
  fingerprint!: string;

  @IsString()
  @MaxLength(80)
  errorName!: string;

  @IsString()
  @MaxLength(220)
  errorMessage!: string;

  @IsOptional()
  @IsObject()
  context?: Record<string, string | number | boolean | null>;
}

export class SubmitMobileErrorReportsDto {
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => MobileErrorReportDto)
  reports!: MobileErrorReportDto[];
}
