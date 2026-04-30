import { Module } from '@nestjs/common';
import { DriversModule } from '../drivers/drivers.module';
import { HealthController } from './health.controller';
import { HealthIncidentJournalService } from './health-incident-journal.service';
import { HealthService } from './health.service';
import { HealthWatchdogService } from './health-watchdog.service';

@Module({
  imports: [DriversModule],
  controllers: [HealthController],
  providers: [
    HealthIncidentJournalService,
    HealthService,
    HealthWatchdogService,
  ],
  exports: [HealthIncidentJournalService],
})
export class HealthModule {}
