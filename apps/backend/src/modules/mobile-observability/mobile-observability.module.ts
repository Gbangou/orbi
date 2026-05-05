import { Module } from '@nestjs/common';
import { RealtimeModule } from '../../core/realtime/realtime.module';
import { MobileObservabilityController } from './mobile-observability.controller';
import { MobileObservabilityService } from './mobile-observability.service';

@Module({
  imports: [RealtimeModule],
  controllers: [MobileObservabilityController],
  providers: [MobileObservabilityService],
})
export class MobileObservabilityModule {}
