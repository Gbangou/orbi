import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class PaymentAttemptRefundDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9._-]{8,128}$/, {
    message: 'idempotencyKey must be 8 to 128 URL-safe characters.',
  })
  idempotencyKey?: string;
}
