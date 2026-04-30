import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
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
  fileName!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  mimeType?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

export class RequestDriverDocumentUploadLinksDto {
  @ApiProperty({ type: [DriverDocumentUploadRequestDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DriverDocumentUploadRequestDto)
  documents!: DriverDocumentUploadRequestDto[];
}
