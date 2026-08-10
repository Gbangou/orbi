import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
} from 'class-validator';
import { MOBILE_MONEY_NETWORKS, PAYMENT_CHANNELS } from '../payments.constants';

export class CreateCheckoutIntentDto {
  @ApiProperty({ example: 'ride-request-123' })
  @IsString()
  @MaxLength(64)
  rideRequestId!: string;

  @ApiProperty({ enum: PAYMENT_CHANNELS, example: 'MOBILE_MONEY' })
  @IsIn(PAYMENT_CHANNELS)
  channel!: (typeof PAYMENT_CHANNELS)[number];

  @ApiPropertyOptional({ example: 2400 })
  @IsOptional()
  @IsNumber()
  @IsInt()
  @Min(100)
  amount?: number;

  @ApiPropertyOptional({ enum: MOBILE_MONEY_NETWORKS, example: 'ORANGE_MONEY' })
  @IsOptional()
  @IsIn(MOBILE_MONEY_NETWORKS)
  mobileMoneyNetwork?: (typeof MOBILE_MONEY_NETWORKS)[number];

  @ApiPropertyOptional({ example: '+22670112233' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  customerPhoneNumber?: string;

  @ApiPropertyOptional({ example: 'https://orbi.app/payments/return' })
  @IsOptional()
  @IsUrl()
  redirectUrl?: string;
}
