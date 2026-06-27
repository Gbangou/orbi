import { Module } from '@nestjs/common';
import { JobQueueModule } from '../../common/job-queue/job-queue.module';
import { ScheduledRidesController } from './scheduled-rides.controller';
import { ScheduledRidesService } from './scheduled-rides.service';

@Module({
  imports: [JobQueueModule],
  controllers: [ScheduledRidesController],
  providers: [ScheduledRidesService],
  exports: [ScheduledRidesService],
})
export class ScheduledRidesModule {}
