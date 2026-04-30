import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class SignOutDto {
  @ApiPropertyOptional({
    description:
      'Session ID to revoke. If omitted, the current session is revoked.',
  })
  @IsOptional()
  @IsString()
  sessionId?: string;
}
