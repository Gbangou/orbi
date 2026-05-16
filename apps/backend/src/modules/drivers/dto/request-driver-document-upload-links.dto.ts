import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
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
const safeLeafFileNamePattern = /^[^\p{Cc}<>:"/\\|?*]+$/u;

class DriverDocumentUploadRequestDto {
  @ApiProperty({ enum: supportedDriverDocumentTypes })
  @IsEnum(supportedDriverDocumentTypes)
  type!: (typeof supportedDriverDocumentTypes)[number];

  @ApiProperty()
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  @Matches(safeLeafFileNamePattern, {
    message:
      'File name must be a safe leaf name without path separators or control characters.',
  })
  fileName!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Matches(/^[a-z0-9][a-z0-9.+-]*\/[a-z0-9][a-z0-9.+-]*$/i, {
    message: 'MIME type must use a valid type/subtype format.',
  })
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
