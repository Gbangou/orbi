import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

const supportedDriverDocumentTypes = [
  'IDENTITY_DOCUMENT',
  'DRIVER_LICENSE',
  'VEHICLE_REGISTRATION',
  'INSURANCE_PROOF',
  'SELFIE_VERIFICATION',
] as const;

class DriverDocumentUploadRequestDto {
  @ApiProperty({ enum: supportedDriverDocumentTypes })
  @IsEnum(supportedDriverDocumentTypes)
  type!: (typeof supportedDriverDocumentTypes)[number];

  @ApiProperty()
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  fileName!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  mimeType?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

export class RequestDriverDocumentUploadLinksDto {
  @ApiProperty({ type: [DriverDocumentUploadRequestDto] })
  @IsArray()
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => DriverDocumentUploadRequestDto)
  documents!: DriverDocumentUploadRequestDto[];
}
