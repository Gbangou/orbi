import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

export class UpdateDispatchLearningSettingsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(6)
  @Max(336)
  lookbackHours?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(168)
  halfLifeHours?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(240)
  declineCooldownMinutes?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(8)
  @Max(200)
  historyLimit?: number;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  resetToDefaults?: boolean;
}
