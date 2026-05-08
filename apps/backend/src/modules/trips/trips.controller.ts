import {
  Body,
  Controller,
  Get,
  MessageEvent,
  Param,
  Patch,
  Post,
  Sse,
  UseGuards,
  Version,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Observable } from 'rxjs';
import { OpaqueIdPipe } from '../../common/pipes/opaque-id.pipe';
import { RealtimeService } from '../../core/realtime/realtime.service';
import { CurrentAuth } from '../auth/current-auth.decorator';
import type { RequestAuthContext } from '../auth/auth.types';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { ReportTripIncidentDto } from './dto/report-trip-incident.dto';
import { ReportTripSosDto } from './dto/report-trip-sos.dto';
import { RecordRoutePositionDto } from './dto/record-route-position.dto';
import { VerifyPickupCodeDto } from './dto/verify-pickup-code.dto';
import { UpdateTripStatusDto } from './dto/update-trip-status.dto';
import { TripsService } from './trips.service';

@Controller('trips')
export class TripsController {
  constructor(
    private readonly tripsService: TripsService,
    private readonly realtimeService: RealtimeService,
  ) {}

  @Get('dashboard')
  @Version('1')
  @ApiBearerAuth('session-token')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.OPS, UserRole.SUPPORT)
  dashboard() {
    return this.tripsService.dashboard();
  }

  @Get('mine')
  @Version('1')
  @ApiBearerAuth('session-token')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(UserRole.RIDER, UserRole.DRIVER)
  mine(@CurrentAuth() auth: RequestAuthContext) {
    return this.tripsService.findMine(auth);
  }

  @Sse('stream')
  @Version('1')
  @ApiBearerAuth('session-token')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(
    UserRole.RIDER,
    UserRole.DRIVER,
    UserRole.ADMIN,
    UserRole.OPS,
    UserRole.SUPPORT,
  )
  stream(@CurrentAuth() auth: RequestAuthContext): Observable<MessageEvent> {
    return this.realtimeService.stream({
      role: auth.user.role,
      actorId: auth.user.id,
      riderId: auth.user.riderProfile?.id ?? null,
      driverId: auth.user.driverProfile?.id ?? null,
    });
  }

  @Get('shared/:shareToken')
  @Version('1')
  sharedTrip(
    @Param('shareToken', new OpaqueIdPipe('shareToken')) shareToken: string,
  ) {
    return this.tripsService.getSharedTrip(shareToken);
  }

  @Get(':tripId')
  @Version('1')
  @ApiBearerAuth('session-token')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(
    UserRole.RIDER,
    UserRole.DRIVER,
    UserRole.ADMIN,
    UserRole.OPS,
    UserRole.SUPPORT,
  )
  detail(
    @Param('tripId', new OpaqueIdPipe('tripId')) tripId: string,
    @CurrentAuth() auth: RequestAuthContext,
  ) {
    return this.tripsService.getTripDetail(auth, tripId);
  }

  @Post('accept/:rideRequestId')
  @Version('1')
  @ApiBearerAuth('session-token')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(UserRole.DRIVER)
  acceptRideRequest(
    @Param('rideRequestId', new OpaqueIdPipe('rideRequestId'))
    rideRequestId: string,
    @CurrentAuth() auth: RequestAuthContext,
  ) {
    return this.tripsService.acceptRideRequest(auth, rideRequestId);
  }

  @Post(':tripId/share-link')
  @Version('1')
  @ApiBearerAuth('session-token')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(UserRole.RIDER, UserRole.DRIVER, UserRole.ADMIN, UserRole.OPS)
  createShareLink(
    @Param('tripId', new OpaqueIdPipe('tripId')) tripId: string,
    @CurrentAuth() auth: RequestAuthContext,
  ) {
    return this.tripsService.createShareLink(auth, tripId);
  }

  @Post(':tripId/route-position')
  @Version('1')
  @ApiBearerAuth('session-token')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(UserRole.RIDER, UserRole.DRIVER, UserRole.ADMIN, UserRole.OPS)
  recordRoutePosition(
    @Param('tripId', new OpaqueIdPipe('tripId')) tripId: string,
    @Body() payload: RecordRoutePositionDto,
    @CurrentAuth() auth: RequestAuthContext,
  ) {
    return this.tripsService.recordRoutePosition(auth, tripId, payload);
  }

  @Post(':tripId/verify-pickup-code')
  @Version('1')
  @ApiBearerAuth('session-token')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(UserRole.DRIVER)
  verifyPickupCode(
    @Param('tripId', new OpaqueIdPipe('tripId')) tripId: string,
    @Body() payload: VerifyPickupCodeDto,
    @CurrentAuth() auth: RequestAuthContext,
  ) {
    return this.tripsService.verifyPickupCode(auth, tripId, payload.pickupCode);
  }

  @Post(':tripId/report-incident')
  @Version('1')
  @ApiBearerAuth('session-token')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(
    UserRole.RIDER,
    UserRole.DRIVER,
    UserRole.ADMIN,
    UserRole.OPS,
    UserRole.SUPPORT,
  )
  reportIncident(
    @Param('tripId', new OpaqueIdPipe('tripId')) tripId: string,
    @Body() payload: ReportTripIncidentDto,
    @CurrentAuth() auth: RequestAuthContext,
  ) {
    return this.tripsService.reportIncident(auth, tripId, payload);
  }

  @Post(':tripId/sos')
  @Version('1')
  @ApiBearerAuth('session-token')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(UserRole.RIDER, UserRole.DRIVER, UserRole.ADMIN, UserRole.OPS)
  triggerSafetySos(
    @Param('tripId', new OpaqueIdPipe('tripId')) tripId: string,
    @Body() payload: ReportTripSosDto,
    @CurrentAuth() auth: RequestAuthContext,
  ) {
    return this.tripsService.triggerSafetySos(auth, tripId, payload);
  }

  @Patch(':tripId/status')
  @Version('1')
  @ApiBearerAuth('session-token')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(UserRole.DRIVER, UserRole.RIDER, UserRole.ADMIN, UserRole.OPS)
  updateStatus(
    @Param('tripId', new OpaqueIdPipe('tripId')) tripId: string,
    @Body() payload: UpdateTripStatusDto,
    @CurrentAuth() auth: RequestAuthContext,
  ) {
    return this.tripsService.updateStatus(auth, tripId, payload.status);
  }
}
