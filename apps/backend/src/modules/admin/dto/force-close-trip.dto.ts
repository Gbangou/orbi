import { IsString, MaxLength, MinLength } from 'class-validator';

export class ForceCloseTripDto {
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason!: string;
}
