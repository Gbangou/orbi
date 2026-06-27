import { Module } from '@nestjs/common';
import { ScheduledRidesController } from './scheduled-rides.controller';
import { ScheduledRidesService } from './scheduled-rides.service';

@Module({
  controllers: [ScheduledRidesController],
  providers: [ScheduledRidesService],
  exports: [ScheduledRidesService],
})
export class ScheduledRidesModule {}
