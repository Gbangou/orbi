import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class SetRiderStatusDto {
  @ApiProperty({ description: 'true = activer, false = suspendre' })
  @IsBoolean()
  isActive!: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(400)
  reason?: string;
}
