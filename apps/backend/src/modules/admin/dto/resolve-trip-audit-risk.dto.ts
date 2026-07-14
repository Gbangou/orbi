import { IsString, MinLength, MaxLength } from 'class-validator';

export class ResolveTripAuditRiskDto {
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason!: string;
}
