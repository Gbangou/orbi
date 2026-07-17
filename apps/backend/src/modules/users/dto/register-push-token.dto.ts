import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

export class RegisterPushTokenDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  @Matches(/^(Expo|Exponent)PushToken\[[A-Za-z0-9_-]{8,256}\]$/)
  token!: string;
}
