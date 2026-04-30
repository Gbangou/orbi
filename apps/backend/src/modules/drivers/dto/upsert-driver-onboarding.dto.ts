import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  Matches,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

const supportedCities = [
  'OUAGADOUGOU',
  'BOBO_DIOULASSO',
  'KOUDOUGOU',
  'BANFORA',
  'OUAHIGOUYA',
] as const;

const supportedVehicleTypes = ['MOTORCYCLE', 'CAR'] as const;
const supportedServiceTiers = [
  'MOTO_STANDARD',
  'MOTO_PLUS',
  'CAR_STANDARD',
  'CAR_COMFORT',
  'CAR_XL',
] as const;
const supportedDriverDocumentTypes = [
  'IDENTITY_DOCUMENT',
  'DRIVER_LICENSE',
  'VEHICLE_REGISTRATION',
  'INSURANCE_PROOF',
  'SELFIE_VERIFICATION',
] as const;

class DriverDocumentChecklistDto {
  @ApiProperty()
  @IsBoolean()
  identityDocumentProvided!: boolean;

  @ApiProperty()
  @IsBoolean()
  driverLicenseProvided!: boolean;

  @ApiProperty()
  @IsBoolean()
  vehicleRegistrationProvided!: boolean;

  @ApiProperty()
  @IsBoolean()
  insuranceProofProvided!: boolean;

  @ApiProperty()
  @IsBoolean()
  selfieMatchProvided!: boolean;
}

class DriverVehicleOnboardingDto {
  @ApiProperty()
  @IsString()
  @MinLength(3)
  @MaxLength(32)
  plateNumber!: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  make!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  model!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(32)
  color!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Min(1990)
  @Max(2100)
  year?: number;

  @ApiProperty({ enum: supportedVehicleTypes })
  @IsEnum(supportedVehicleTypes)
  type!: (typeof supportedVehicleTypes)[number];

  @ApiProperty({ enum: supportedServiceTiers })
  @IsEnum(supportedServiceTiers)
  tier!: (typeof supportedServiceTiers)[number];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(8)
  seats?: number;
}

class DriverDocumentArtifactDto {
  @ApiProperty({ enum: supportedDriverDocumentTypes })
  @IsEnum(supportedDriverDocumentTypes)
  type!: (typeof supportedDriverDocumentTypes)[number];

  @ApiProperty()
  @IsString()
  @MinLength(3)
  @MaxLength(160)
  fileName!: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  @MaxLength(256)
  storageKey!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Matches(/^[a-z0-9][a-z0-9.+-]*\/[a-z0-9][a-z0-9.+-]*$/i, {
    message: 'MIME type must use a valid type/subtype format.',
  })
  mimeType?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

export class UpsertDriverOnboardingDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  @Matches(/^\+?[1-9]\d{7,14}$/, {
    message: 'Phone number must use an international numeric format.',
  })
  phoneNumber?: string;

  @ApiProperty()
  @IsString()
  @MinLength(4)
  @MaxLength(32)
  licenseNumber!: string;

  @ApiProperty({ enum: supportedCities })
  @IsEnum(supportedCities)
  city!: (typeof supportedCities)[number];

  @ApiProperty()
  @IsInt()
  @Min(2)
  @Max(30)
  serviceRadiusKm!: number;

  @ApiProperty({ type: DriverDocumentChecklistDto })
  @ValidateNested()
  @Type(() => DriverDocumentChecklistDto)
  documents!: DriverDocumentChecklistDto;

  @ApiProperty({ required: false, type: [DriverDocumentArtifactDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DriverDocumentArtifactDto)
  documentArtifacts?: DriverDocumentArtifactDto[];

  @ApiProperty({ type: [DriverVehicleOnboardingDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DriverVehicleOnboardingDto)
  vehicles!: DriverVehicleOnboardingDto[];
}
