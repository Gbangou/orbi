import { IsString, MinLength } from 'class-validator';

export class VoiceLocationIntentDto {
  @IsString()
  @MinLength(2)
  transcript!: string;
}
