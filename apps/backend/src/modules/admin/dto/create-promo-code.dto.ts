import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreatePromoCodeDto {
  @IsString()
  @MinLength(3)
  @MaxLength(32)
  code!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @IsInt()
  @Min(1)
  @Max(10000)
  discountBps!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100_000)
  maxUses?: number;

  @IsDateString()
  validFrom!: string;

  @IsDateString()
  validTo!: string;

  @IsOptional()
  @IsBoolean()
  firstTripOnly?: boolean;
}
