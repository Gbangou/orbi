import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class SignOutDto {
  @ApiPropertyOptional({
    description:
      'Session ID to revoke. If omitted, the current session is revoked.',
  })
  @IsOptional()
  @IsString()
  sessionId?: string;

  @ApiPropertyOptional({
    description:
      'When true, all active sessions for the current user are revoked.',
  })
  @IsOptional()
  @IsBoolean()
  allDevices?: boolean;
}
