import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
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
const safeLeafFileNamePattern = /^[^\p{Cc}<>:"/\\|?*]+$/u;
const safeVehicleTextPattern = new RegExp('^[^\\p{Cc}<>{}\\[\\]\\\\]+$', 'u');
const safeStorageKeyPattern =
  /^[A-Za-z0-9][A-Za-z0-9_.:-]*(\/[A-Za-z0-9][A-Za-z0-9_.:-]*)+$/;

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
  @Matches(/^[A-Z0-9][A-Z0-9 -]{2,31}$/i, {
    message:
      'Plate number must contain only letters, numbers, spaces or hyphens.',
  })
  plateNumber!: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  @Matches(safeVehicleTextPattern, {
    message: 'Vehicle make contains unsafe characters.',
  })
  make!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  @Matches(safeVehicleTextPattern, {
    message: 'Vehicle model contains unsafe characters.',
  })
  model!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(32)
  @Matches(safeVehicleTextPattern, {
    message: 'Vehicle color contains unsafe characters.',
  })
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
  @Matches(safeLeafFileNamePattern, {
    message:
      'File name must be a safe leaf name without path separators or control characters.',
  })
  fileName!: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  @MaxLength(256)
  @Matches(safeStorageKeyPattern, {
    message: 'Storage key must be a normalized provider object key.',
  })
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

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5_000_000)
  sizeBytes?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @Matches(/^[a-f0-9]{64}$/i, {
    message: 'SHA-256 digest must be a 64 character hexadecimal string.',
  })
  sha256?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  @Matches(/^[a-z0-9_.:-]{2,40}$/i, {
    message: 'Upload source must be a compact client or storage identifier.',
  })
  uploadSource?: string;
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
  @Matches(/^[A-Za-z0-9][A-Za-z0-9 ._-]{3,31}$/, {
    message: 'License number contains unsafe characters.',
  })
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
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => DriverDocumentArtifactDto)
  documentArtifacts?: DriverDocumentArtifactDto[];

  @ApiProperty({ type: [DriverVehicleOnboardingDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(3)
  @ValidateNested({ each: true })
  @Type(() => DriverVehicleOnboardingDto)
  vehicles!: DriverVehicleOnboardingDto[];
}
