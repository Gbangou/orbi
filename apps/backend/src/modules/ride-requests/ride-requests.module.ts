import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { PricingModule } from '../pricing/pricing.module';
import { DriversModule } from '../drivers/drivers.module';
import { RideRequestsController } from './ride-requests.controller';
import { RideRequestProjector } from './ride-request.projector';
import { RideRequestsService } from './ride-requests.service';

@Module({
  imports: [PricingModule, NotificationsModule, DriversModule],
  controllers: [RideRequestsController],
  providers: [RideRequestsService, RideRequestProjector],
})
export class RideRequestsModule {}
