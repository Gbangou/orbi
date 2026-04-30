import {
  Body,
  Controller,
  Get,
  MessageEvent,
  Param,
  Patch,
  Post,
  Query,
  Sse,
  UseGuards,
  Version,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { ApiBearerAuth } from '@nestjs/swagger';
import { Observable } from 'rxjs';
import { PageQueryDto } from '../../common/dto/page-query.dto';
import { RealtimeService } from '../../core/realtime/realtime.service';
import { CurrentAuth } from '../auth/current-auth.decorator';
import type { RequestAuthContext } from '../auth/auth.types';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { UpdateDriverOnboardingReviewDto } from './dto/update-driver-onboarding-review.dto';
import { UpdateDispatchLearningSettingsDto } from './dto/update-dispatch-learning-settings.dto';
import { PaymentWebhookEventsQueryDto } from './dto/payment-webhook-events-query.dto';
import { UpdateSupportTicketDto } from './dto/update-support-ticket.dto';
import { AdminService } from './admin.service';

@Controller('admin')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly realtimeService: RealtimeService,
  ) {}

  @Get('preview')
  @Version('1')
  preview() {
    return this.adminService.previewOverview();
  }

  @Get('overview')
  @Version('1')
  @ApiBearerAuth('session-token')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.OPS, UserRole.SUPPORT)
  overview() {
    return this.adminService.overview();
  }

  @Get('live-ops')
  @Version('1')
  @ApiBearerAuth('session-token')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.OPS, UserRole.SUPPORT)
  liveOps() {
    return this.adminService.liveOps();
  }

  @Sse('stream')
  @Version('1')
  @ApiBearerAuth('session-token')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.OPS, UserRole.SUPPORT)
  stream(@CurrentAuth() auth: RequestAuthContext): Observable<MessageEvent> {
    return this.realtimeService.stream({
      role: auth.user.role,
      actorId: auth.user.id,
      riderId: null,
      driverId: null,
    });
  }

  @Get('support-tickets')
  @Version('1')
  @ApiBearerAuth('session-token')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.OPS, UserRole.SUPPORT)
  supportTickets(@Query() query: PageQueryDto) {
    return this.adminService.supportTickets(query);
  }

  @Get('driver-onboarding-queue')
  @Version('1')
  @ApiBearerAuth('session-token')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.OPS, UserRole.SUPPORT)
  driverOnboardingQueue(@Query() query: PageQueryDto) {
    return this.adminService.driverOnboardingQueue(query);
  }

  @Get('feature-flags')
  @Version('1')
  @ApiBearerAuth('session-token')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.OPS, UserRole.SUPPORT)
  featureFlags() {
    return this.adminService.featureFlags();
  }

  @Get('dispatch-settings')
  @Version('1')
  @ApiBearerAuth('session-token')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.OPS, UserRole.SUPPORT)
  dispatchSettings() {
    return this.adminService.dispatchSettings();
  }

  @Get('pricing-calibration')
  @Version('1')
  @ApiBearerAuth('session-token')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.OPS, UserRole.SUPPORT)
  pricingCalibration() {
    return this.adminService.pricingCalibration();
  }

  @Get('payment-webhook-events')
  @Version('1')
  @ApiBearerAuth('session-token')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.OPS, UserRole.SUPPORT)
  paymentWebhookEvents(@Query() query: PaymentWebhookEventsQueryDto) {
    return this.adminService.paymentWebhookEvents(query);
  }

  @Get('payment-webhook-events/:eventId')
  @Version('1')
  @ApiBearerAuth('session-token')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.OPS, UserRole.SUPPORT)
  paymentWebhookEventDetail(@Param('eventId') eventId: string) {
    return this.adminService.paymentWebhookEventDetail(eventId);
  }

  @Post('payment-webhook-events/:eventId/investigation')
  @Version('1')
  @ApiBearerAuth('session-token')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.OPS, UserRole.SUPPORT)
  startPaymentWebhookInvestigation(
    @Param('eventId') eventId: string,
    @CurrentAuth() auth: RequestAuthContext,
  ) {
    return this.adminService.startPaymentWebhookInvestigation(eventId, auth);
  }

  @Patch('dispatch-settings')
  @Version('1')
  @ApiBearerAuth('session-token')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.OPS)
  updateDispatchSettings(
    @Body() payload: UpdateDispatchLearningSettingsDto,
    @CurrentAuth() auth: RequestAuthContext,
  ) {
    return this.adminService.updateDispatchSettings(payload, auth);
  }

  @Patch('support-tickets/:ticketId')
  @Version('1')
  @ApiBearerAuth('session-token')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.OPS, UserRole.SUPPORT)
  updateSupportTicket(
    @Param('ticketId') ticketId: string,
    @Body() payload: UpdateSupportTicketDto,
    @CurrentAuth() auth: RequestAuthContext,
  ) {
    return this.adminService.updateSupportTicket(ticketId, payload, auth);
  }

  @Patch('driver-onboarding/:driverId/review')
  @Version('1')
  @ApiBearerAuth('session-token')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.OPS, UserRole.SUPPORT)
  updateDriverOnboardingReview(
    @Param('driverId') driverId: string,
    @Body() payload: UpdateDriverOnboardingReviewDto,
    @CurrentAuth() auth: RequestAuthContext,
  ) {
    return this.adminService.updateDriverOnboardingReview(
      driverId,
      payload,
      auth,
    );
  }

  @Patch('health-incidents/:incidentId/acknowledge')
  @Version('1')
  @ApiBearerAuth('session-token')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.OPS, UserRole.SUPPORT)
  acknowledgeHealthIncident(
    @Param('incidentId') incidentId: string,
    @CurrentAuth() auth: RequestAuthContext,
  ) {
    return this.adminService.acknowledgeHealthIncident(incidentId, auth);
  }

  @Patch('health-incidents/:incidentId/mute')
  @Version('1')
  @ApiBearerAuth('session-token')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.OPS, UserRole.SUPPORT)
  muteHealthIncident(
    @Param('incidentId') incidentId: string,
    @CurrentAuth() auth: RequestAuthContext,
  ) {
    return this.adminService.muteHealthIncident(incidentId, auth);
  }

  @Get('driver-onboarding/:driverId/documents/:documentId/view-link')
  @Version('1')
  @ApiBearerAuth('session-token')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.OPS, UserRole.SUPPORT)
  driverOnboardingDocumentViewLink(
    @Param('driverId') driverId: string,
    @Param('documentId') documentId: string,
    @CurrentAuth() auth: RequestAuthContext,
  ) {
    return this.adminService.getDriverDocumentViewLink(
      driverId,
      documentId,
      auth,
    );
  }
}
