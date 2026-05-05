import { IsOptional, IsString, MaxLength } from 'class-validator';

export class PaymentAttemptRefundDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
