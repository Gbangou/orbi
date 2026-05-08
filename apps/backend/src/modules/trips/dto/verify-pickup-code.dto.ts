import { IsString, Length, Matches } from 'class-validator';

export class VerifyPickupCodeDto {
  @IsString()
  @Length(4, 4)
  @Matches(/^[0-9]{4}$/, {
    message: 'Pickup code must contain exactly 4 digits.',
  })
  pickupCode!: string;
}
