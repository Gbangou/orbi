import { Body, Controller, Post, Version } from '@nestjs/common';
import { UseGuards } from '@nestjs/common';
import { RateLimit } from '../../common/rate-limit/rate-limit.decorator';
import { RateLimitGuard } from '../../common/rate-limit/rate-limit.guard';
import { VoiceLocationIntentDto } from './dto/voice-location-intent.dto';
import { VoiceService } from './voice.service';

@Controller('voice')
export class VoiceController {
  constructor(private readonly voiceService: VoiceService) {}

  @Post('location-intent')
  @Version('1')
  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 20, windowMs: 60_000 })
  locationIntent(@Body() payload: VoiceLocationIntentDto) {
    return this.voiceService.resolveLocationIntent(payload);
  }
}
