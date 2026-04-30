import { IsString, Length } from 'class-validator';

export class VerifyPickupCodeDto {
  @IsString()
  @Length(4, 4)
  pickupCode!: string;
}
