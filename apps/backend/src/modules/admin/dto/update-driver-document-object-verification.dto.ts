import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const supportedObjectVerificationStates = ['confirmed', 'failed'] as const;

export class UpdateDriverDocumentObjectVerificationDto {
  @ApiProperty({ enum: supportedObjectVerificationStates })
  @IsEnum(supportedObjectVerificationStates)
  state!: (typeof supportedObjectVerificationStates)[number];

  @ApiProperty()
  @IsString()
  @MaxLength(64)
  @Matches(/^[a-z0-9_.:-]{2,64}$/i, {
    message: 'Provider must be a compact storage provider identifier.',
  })
  provider!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  objectId?: string;

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
    message:
      'Provider SHA-256 digest must be a 64 character hexadecimal string.',
  })
  sha256?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(240)
  failureReason?: string;
}
