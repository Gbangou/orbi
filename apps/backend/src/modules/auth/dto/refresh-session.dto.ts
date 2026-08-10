import { IsString, Matches } from 'class-validator';

export class RefreshSessionDto {
  @IsString()
  @Matches(/^[A-Za-z0-9._~-]{32,256}$/)
  refreshToken!: string;
}
