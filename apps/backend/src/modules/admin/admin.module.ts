import { Module } from '@nestjs/common';
import { DocumentLinksModule } from '../../common/document-links/document-links.module';
import { HealthModule } from '../health/health.module';
import { DriversModule } from '../drivers/drivers.module';
import { PaymentsModule } from '../payments/payments.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [DocumentLinksModule, HealthModule, DriversModule, PaymentsModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
