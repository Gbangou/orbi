import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateTrustedContactEntryDto {
  @ApiPropertyOptional({
    example: 'Mere',
  })
  @IsOptional()
  @MaxLength(40)
  label?: string;

  @ApiPropertyOptional({
    example: '+22670000001',
  })
  @IsOptional()
  @Matches(/^\+226[0-9]{8}$/)
  phoneNumber?: string;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: 3,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3)
  priority?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
