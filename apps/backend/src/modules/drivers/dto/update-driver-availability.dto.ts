import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

export class UpdateDriverAvailabilityDto {
  @ApiProperty({
    enum: ['ONLINE', 'OFFLINE'],
    enumName: 'DriverAvailabilityStatus',
  })
  @IsIn(['ONLINE', 'OFFLINE'])
  status!: 'ONLINE' | 'OFFLINE';
}
