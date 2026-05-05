import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, Matches, MaxLength } from 'class-validator';

export class UpdateTrustedContactDto {
  @ApiPropertyOptional({
    example: '+22670000001',
  })
  @IsOptional()
  @Matches(/^\+226[0-9]{8}$/)
  phoneNumber?: string;

  @ApiPropertyOptional({
    enum: ['MANUAL', 'NIGHT', 'ALL_TRIPS'],
  })
  @IsOptional()
  @IsIn(['MANUAL', 'NIGHT', 'ALL_TRIPS'])
  shareMode?: 'MANUAL' | 'NIGHT' | 'ALL_TRIPS';

  @ApiPropertyOptional()
  @IsOptional()
  @MaxLength(120)
  notes?: string;
}
