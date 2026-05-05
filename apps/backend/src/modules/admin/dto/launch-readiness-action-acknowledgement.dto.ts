import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class LaunchReadinessActionAcknowledgementDto {
  @IsIn(['ops', 'engineering', 'support', 'finance'])
  owner!: 'ops' | 'engineering' | 'support' | 'finance';

  @IsString()
  @MaxLength(500)
  notes!: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  idempotencyKey?: string;
}
