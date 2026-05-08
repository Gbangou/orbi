import { Module } from '@nestjs/common';
import { JobQueueModule } from '../../common/job-queue/job-queue.module';
import { PrismaModule } from '../../core/prisma/prisma.module';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [PrismaModule, JobQueueModule],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
