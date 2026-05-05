import { IsOptional, IsString, MaxLength } from 'class-validator';

export class DriverPayoutApprovalDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
