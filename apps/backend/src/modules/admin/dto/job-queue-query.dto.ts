import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { PageQueryDto } from '../../../common/dto/page-query.dto';

export class JobQueueQueryDto extends PageQueryDto {
  @ApiPropertyOptional({
    enum: ['PAYMENT_WEBHOOK', 'DRIVER_DOCUMENT', 'NOTIFICATION'],
  })
  @IsOptional()
  @IsIn(['PAYMENT_WEBHOOK', 'DRIVER_DOCUMENT', 'NOTIFICATION'])
  kind?: 'PAYMENT_WEBHOOK' | 'DRIVER_DOCUMENT' | 'NOTIFICATION';

  @ApiPropertyOptional({
    enum: ['PENDING', 'RUNNING', 'SUCCEEDED', 'DEAD_LETTER'],
  })
  @IsOptional()
  @IsIn(['PENDING', 'RUNNING', 'SUCCEEDED', 'DEAD_LETTER'])
  status?: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'DEAD_LETTER';
}
