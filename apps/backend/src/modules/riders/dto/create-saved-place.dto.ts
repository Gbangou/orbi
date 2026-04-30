import { ApiProperty } from '@nestjs/swagger';
import { IsLatitude, IsLongitude, IsString, MinLength } from 'class-validator';

export class CreateSavedPlaceDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  label!: string;

  @ApiProperty()
  @IsString()
  @MinLength(4)
  address!: string;

  @ApiProperty()
  @IsLatitude()
  latitude!: number;

  @ApiProperty()
  @IsLongitude()
  longitude!: number;
}
