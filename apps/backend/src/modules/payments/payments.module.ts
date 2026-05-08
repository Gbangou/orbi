import { Module } from '@nestjs/common';
import { JobQueueModule } from '../../common/job-queue/job-queue.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  imports: [JobQueueModule],
  controllers: [PaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
