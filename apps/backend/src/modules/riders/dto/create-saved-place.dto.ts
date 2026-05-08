import { ApiProperty } from '@nestjs/swagger';
import {
  IsLatitude,
  IsLongitude,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const safePlaceTextPattern = /^[^<>{}[\]\\\x00-\x1F\x7F]+$/;

export class CreateSavedPlaceDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  @Matches(safePlaceTextPattern, {
    message: 'Saved place label contains unsafe characters.',
  })
  label!: string;

  @ApiProperty()
  @IsString()
  @MinLength(4)
  @MaxLength(160)
  @Matches(safePlaceTextPattern, {
    message: 'Saved place address contains unsafe characters.',
  })
  address!: string;

  @ApiProperty()
  @IsLatitude()
  latitude!: number;

  @ApiProperty()
  @IsLongitude()
  longitude!: number;
}
