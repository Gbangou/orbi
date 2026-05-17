import { Module } from '@nestjs/common';
import { RealtimeModule } from '../../core/realtime/realtime.module';
import { MobileErrorCollectorService } from './mobile-error-collector.service';
import { MobileObservabilityController } from './mobile-observability.controller';
import { MobileObservabilityService } from './mobile-observability.service';

@Module({
  imports: [RealtimeModule],
  controllers: [MobileObservabilityController],
  providers: [MobileObservabilityService, MobileErrorCollectorService],
})
export class MobileObservabilityModule {}
