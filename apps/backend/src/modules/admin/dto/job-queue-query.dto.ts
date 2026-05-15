import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { PageQueryDto } from '../../../common/dto/page-query.dto';

export class JobQueueQueryDto extends PageQueryDto {
  @ApiPropertyOptional({
    enum: [
      'PAYMENT_WEBHOOK',
      'PAYMENT_REFUND_VERIFICATION',
      'DRIVER_DOCUMENT',
      'NOTIFICATION',
      'DRIVER_RESERVATION_EXPIRY',
    ],
  })
  @IsOptional()
  @IsIn([
    'PAYMENT_WEBHOOK',
    'PAYMENT_REFUND_VERIFICATION',
    'DRIVER_DOCUMENT',
    'NOTIFICATION',
    'DRIVER_RESERVATION_EXPIRY',
  ])
  kind?:
    | 'PAYMENT_WEBHOOK'
    | 'PAYMENT_REFUND_VERIFICATION'
    | 'DRIVER_DOCUMENT'
    | 'NOTIFICATION'
    | 'DRIVER_RESERVATION_EXPIRY';

  @ApiPropertyOptional({
    enum: ['PENDING', 'RUNNING', 'SUCCEEDED', 'DEAD_LETTER'],
  })
  @IsOptional()
  @IsIn(['PENDING', 'RUNNING', 'SUCCEEDED', 'DEAD_LETTER'])
  status?: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'DEAD_LETTER';
}
