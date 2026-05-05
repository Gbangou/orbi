import { ApiPropertyOptional } from '@nestjs/swagger';
import { DriverPayoutStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

export class DriverPayoutSettlementQueryDto {
  @ApiPropertyOptional({ enum: DriverPayoutStatus })
  @IsOptional()
  @IsEnum(DriverPayoutStatus)
  status?: DriverPayoutStatus;
}
