import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const safeTripFeedbackPattern = new RegExp('^[^\\p{Cc}<>{}\\[\\]\\\\]+$', 'u');

export class RateTripDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  score!: number;

  @IsOptional()
  @IsString()
  @MaxLength(280)
  @Matches(safeTripFeedbackPattern, {
    message: 'Comment contains unsafe characters.',
  })
  comment?: string;
}
