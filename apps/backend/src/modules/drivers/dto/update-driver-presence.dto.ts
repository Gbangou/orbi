import { ApiProperty } from '@nestjs/swagger';
import { IsLatitude, IsLongitude } from 'class-validator';

export class UpdateDriverPresenceDto {
  @ApiProperty({
    description: 'Current driver latitude used for dispatch prioritization.',
  })
  @IsLatitude()
  latitude!: number;

  @ApiProperty({
    description: 'Current driver longitude used for dispatch prioritization.',
  })
  @IsLongitude()
  longitude!: number;
}
