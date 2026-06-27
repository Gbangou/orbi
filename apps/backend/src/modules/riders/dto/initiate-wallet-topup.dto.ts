import { IsIn, IsNumber, IsString, MaxLength, Min } from 'class-validator';
import { PAWAPAY_NETWORKS } from '../../payments/payments.constants';

export class InitiateWalletTopUpDto {
  @IsNumber()
  @Min(500)
  amountXof!: number;

  @IsString()
  @IsIn(PAWAPAY_NETWORKS)
  mobileMoneyNetwork!: string;

  @IsString()
  @MaxLength(16)
  customerPhoneNumber!: string;
}
