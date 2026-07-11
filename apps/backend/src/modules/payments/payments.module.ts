import { Module } from '@nestjs/common';
import { JobQueueModule } from '../../common/job-queue/job-queue.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PawaPayService } from './pawapay.service';
import { PaymentAttemptReconciliationSweepService } from './payment-attempt-reconciliation-sweep.service';

@Module({
  imports: [JobQueueModule],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    PawaPayService,
    PaymentAttemptReconciliationSweepService,
  ],
  exports: [
    PaymentsService,
    PawaPayService,
    PaymentAttemptReconciliationSweepService,
  ],
})
export class PaymentsModule {}
