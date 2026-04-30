import { Module } from '@nestjs/common';
import { PricingModule } from '../pricing/pricing.module';
import { RideRequestsController } from './ride-requests.controller';
import { RideRequestProjector } from './ride-request.projector';
import { RideRequestsService } from './ride-requests.service';

@Module({
  imports: [PricingModule],
  controllers: [RideRequestsController],
  providers: [RideRequestsService, RideRequestProjector],
})
export class RideRequestsModule {}
