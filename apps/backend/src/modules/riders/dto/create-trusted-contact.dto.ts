import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Matches, Max, MaxLength, Min } from 'class-validator';

export class CreateTrustedContactDto {
  @ApiPropertyOptional({
    example: 'Mere',
  })
  @IsOptional()
  @MaxLength(40)
  label?: string;

  @ApiPropertyOptional({
    example: '+22670000001',
  })
  @Matches(/^\+226[0-9]{8}$/)
  phoneNumber!: string;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: 3,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3)
  priority?: number;
}
