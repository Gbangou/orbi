import { Module } from '@nestjs/common';
import { JobQueueModule } from '../../common/job-queue/job-queue.module';
import { DocumentLinksModule } from '../../common/document-links/document-links.module';
import { PricingModule } from '../pricing/pricing.module';
import { DriverReservationExpiryService } from './driver-reservation-expiry.service';
import { DispatchCoordinator } from './dispatch-coordinator.service';
import { DriverOfferProjector } from './driver-offer-projector';
import { DriversController } from './drivers.controller';
import { DriversService } from './drivers.service';

@Module({
  imports: [DocumentLinksModule, JobQueueModule, PricingModule],
  controllers: [DriversController],
  providers: [
    DriversService,
    DispatchCoordinator,
    DriverOfferProjector,
    DriverReservationExpiryService,
  ],
  exports: [
    DriverReservationExpiryService,
    DispatchCoordinator,
    DriversService,
  ],
})
export class DriversModule {}
