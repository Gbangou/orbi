import { Type } from 'class-transformer';
import { IsNumber, IsString, MaxLength, Min } from 'class-validator';

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
  idempotencyKey!: string;
}
