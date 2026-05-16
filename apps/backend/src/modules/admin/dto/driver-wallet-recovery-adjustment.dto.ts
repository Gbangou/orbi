import { Type } from 'class-transformer';
import { IsNumber, IsString, Matches, MaxLength, Min } from 'class-validator';

export class DriverWalletRecoveryAdjustmentDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  amount!: number;

  @IsString()
  @MaxLength(500)
  notes!: string;

  @IsString()
  @MaxLength(128)
  @Matches(/^[a-z0-9._-]{8,128}$/i, {
    message: 'idempotencyKey must be 8 to 128 URL-safe characters.',
  })
  idempotencyKey!: string;
}
