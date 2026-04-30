import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { SupportTicketStatus } from '@prisma/client';

export class UpdateSupportTicketDto {
  @IsOptional()
  @IsEnum(SupportTicketStatus)
  status?: SupportTicketStatus;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3)
  priority?: number;
}
