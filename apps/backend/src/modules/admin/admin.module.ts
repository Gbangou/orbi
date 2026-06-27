import { Module } from '@nestjs/common';
import { DocumentLinksModule } from '../../common/document-links/document-links.module';
import { JobQueueModule } from '../../common/job-queue/job-queue.module';
import { HealthModule } from '../health/health.module';
import { DriversModule } from '../drivers/drivers.module';
import { PaymentsModule } from '../payments/payments.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminPromoCodesService } from './admin-promo-codes.service';
import { AdminSupportService } from './admin-support.service';
import { AdminUsersService } from './admin-users.service';
import { AdminPaymentWebhooksService } from './admin-payment-webhooks.service';
import { AdminDriverPayoutsService } from './admin-driver-payouts.service';
import { AdminDriverOnboardingService } from './admin-driver-onboarding.service';

/**
 * AdminModule — Orchestrateur des sous-services ops.
 *
 * Architecture en sous-services (Single Responsibility):
 *   - AdminPromoCodesService : cycle de vie des codes promo
 *   - AdminSupportService    : gestion tickets + notifications passager
 *   - AdminUsersService      : listing/suspension riders & drivers
 *   - AdminService           : façade + tous les autres domaines
 *
 * Évolution prévue: extraire progressivement AdminService vers:
 *   AdminPaymentWebhooksService, AdminDriverPayoutsService,
 *   AdminDriverOnboardingService, AdminOverviewService
 */
@Module({
  imports: [
    DocumentLinksModule,
    JobQueueModule,
    HealthModule,
    DriversModule,
    PaymentsModule,
    NotificationsModule,
  ],
  controllers: [AdminController],
  providers: [
    AdminService,
    AdminPromoCodesService,
    AdminSupportService,
    AdminUsersService,
    AdminPaymentWebhooksService,
    AdminDriverPayoutsService,
    AdminDriverOnboardingService,
  ],
  exports: [
    AdminPromoCodesService,
    AdminSupportService,
    AdminUsersService,
    AdminPaymentWebhooksService,
    AdminDriverPayoutsService,
    AdminDriverOnboardingService,
  ],
})
export class AdminModule {}
