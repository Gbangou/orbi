import { Module } from '@nestjs/common';
import { PrismaModule } from '../../core/prisma/prisma.module';
import { JobQueueService } from './job-queue.service';

@Module({
  imports: [PrismaModule],
  providers: [JobQueueService],
  exports: [JobQueueService],
})
export class JobQueueModule {}
