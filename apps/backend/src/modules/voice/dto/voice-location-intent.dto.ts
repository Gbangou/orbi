import { IsString, MaxLength, MinLength } from 'class-validator';

export class VoiceLocationIntentDto {
  @IsString()
  @MinLength(2)
  @MaxLength(500)
  transcript!: string;
}
