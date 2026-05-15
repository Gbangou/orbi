import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../core/prisma/prisma.module';
import { DocumentLinksModule } from '../document-links/document-links.module';
import { JobQueueService } from './job-queue.service';
import { JobQueueWorkerService } from './job-queue-worker.service';
import { NotificationDeliveryService } from './notification-delivery.service';
import { DocumentSafetyScannerService } from './document-safety-scanner.service';

@Module({
  imports: [ConfigModule, DocumentLinksModule, PrismaModule],
  providers: [
    JobQueueService,
    JobQueueWorkerService,
    NotificationDeliveryService,
    DocumentSafetyScannerService,
  ],
  exports: [JobQueueService, JobQueueWorkerService],
})
export class JobQueueModule {}
