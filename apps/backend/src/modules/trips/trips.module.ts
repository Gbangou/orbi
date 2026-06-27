import { Module } from '@nestjs/common';
import { DocumentLinksModule } from '../../common/document-links/document-links.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TripsController } from './trips.controller';
import { TripsService } from './trips.service';
import { TripQueryService } from './trip-query.service';
import { TripSafetyService } from './trip-safety.service';

@Module({
  imports: [DocumentLinksModule, NotificationsModule],
  controllers: [TripsController],
  providers: [TripsService, TripQueryService, TripSafetyService],
  exports: [TripsService, TripQueryService],
})
export class TripsModule {}
