import { Module } from '@nestjs/common';
import { JobQueueModule } from '../../common/job-queue/job-queue.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PawaPayService } from './pawapay.service';
import { PaymentReconciliationService } from './payment-reconciliation.service';

@Module({
  imports: [JobQueueModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, PawaPayService, PaymentReconciliationService],
  exports: [PaymentsService, PawaPayService, PaymentReconciliationService],
})
export class PaymentsModule {}
