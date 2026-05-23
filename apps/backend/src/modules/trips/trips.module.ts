import { Module } from '@nestjs/common';
import { DocumentLinksModule } from '../../common/document-links/document-links.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TripsController } from './trips.controller';
import { TripsService } from './trips.service';

@Module({
  imports: [DocumentLinksModule, NotificationsModule],
  controllers: [TripsController],
  providers: [TripsService],
})
export class TripsModule {}
