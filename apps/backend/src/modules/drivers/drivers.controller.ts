import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  Version,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { ApiBearerAuth } from '@nestjs/swagger';
import { RateLimit } from '../../common/rate-limit/rate-limit.decorator';
import { RateLimitGuard } from '../../common/rate-limit/rate-limit.guard';
import { OpaqueIdPipe } from '../../common/pipes/opaque-id.pipe';
import { CurrentAuth } from '../auth/current-auth.decorator';
import type { RequestAuthContext } from '../auth/auth.types';
import { ProfileAccessGuard } from '../auth/profile-access.guard';
import { RequireProfile } from '../auth/profile-access.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { RequestDriverDocumentUploadLinksDto } from './dto/request-driver-document-upload-links.dto';
import { UpdateDriverAvailabilityDto } from './dto/update-driver-availability.dto';
import { UpdateDriverPresenceDto } from './dto/update-driver-presence.dto';
import { UpsertDriverOnboardingDto } from './dto/upsert-driver-onboarding.dto';
import { DriversService } from './drivers.service';
import { DriverIncentivesService } from './driver-incentives.service';

const strictDecimalPattern = /^-?(?:\d+|\d+\.\d+|\.\d+)$/;

export function resolveNearbyQueryNumber(
  value: string | undefined,
  min: number,
  max: number,
  fallback: number,
) {
  const normalized = value?.trim() ?? '';

  if (!strictDecimalPattern.test(normalized)) {
    return fallback;
  }

  const parsed = Number(normalized);

  return Number.isFinite(parsed)
    ? Math.min(Math.max(parsed, min), max)
    : fallback;
}

@Controller('drivers')
export class DriversController {
  constructor(
    private readonly driversService: DriversService,
    private readonly incentivesService: DriverIncentivesService,
  ) {}

  @Get('nearby')
  @Version('1')
  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 60, windowMs: 60_000 })
  nearby(
    @Query('lat') lat: string,
    @Query('lng') lng: string,
    @Query('radius') radius?: string,
  ) {
    const latNum = resolveNearbyQueryNumber(lat, -90, 90, 12.3647);
    const lngNum = resolveNearbyQueryNumber(lng, -180, 180, -1.5332);
    const radiusKm = resolveNearbyQueryNumber(radius, 0.1, 50, 5);
    return this.driversService.getNearbyDrivers(latNum, lngNum, radiusKm);
  }

  @Get('preview-offers')
  @Version('1')
  previewOffers() {
    return this.driversService.previewOffers();
  }

  @Get('overview')
  @Version('1')
  @ApiBearerAuth('session-token')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(UserRole.DRIVER, UserRole.ADMIN, UserRole.OPS, UserRole.SUPPORT)
  overview() {
    return this.driversService.overview();
  }

  @Get('me')
  @Version('1')
  @ApiBearerAuth('session-token')
  @UseGuards(SessionAuthGuard, RolesGuard, ProfileAccessGuard)
  @Roles(UserRole.DRIVER)
  @RequireProfile('driver')
  me(@CurrentAuth() auth: RequestAuthContext) {
    return this.driversService.getMe(auth);
  }

  @Get('earnings')
  @Version('1')
  @ApiBearerAuth('session-token')
  @UseGuards(SessionAuthGuard, RolesGuard, ProfileAccessGuard)
  @Roles(UserRole.DRIVER)
  @RequireProfile('driver')
  earnings(@CurrentAuth() auth: RequestAuthContext) {
    return this.driversService.getEarnings(auth);
  }

  @Get('offers')
  @Version('1')
  @ApiBearerAuth('session-token')
  @UseGuards(SessionAuthGuard, RolesGuard, ProfileAccessGuard)
  @Roles(UserRole.DRIVER, UserRole.ADMIN, UserRole.OPS)
  @RequireProfile('driver')
  offers(@CurrentAuth() auth: RequestAuthContext) {
    return this.driversService.getOffers(auth);
  }

  @Get('dispatch-readiness')
  @Version('1')
  @ApiBearerAuth('session-token')
  @UseGuards(SessionAuthGuard, RolesGuard, ProfileAccessGuard)
  @Roles(UserRole.DRIVER, UserRole.ADMIN, UserRole.OPS)
  @RequireProfile('driver')
  dispatchReadiness(@CurrentAuth() auth: RequestAuthContext) {
    return this.driversService.getDispatchReadiness(auth);
  }

  @Post('offers/:rideRequestId/decline')
  @Version('1')
  @ApiBearerAuth('session-token')
  @UseGuards(SessionAuthGuard, RolesGuard, ProfileAccessGuard, RateLimitGuard)
  @RateLimit({ limit: 30, windowMs: 60_000, scope: 'user' })
  @Roles(UserRole.DRIVER)
  @RequireProfile('driver')
  declineOffer(
    @CurrentAuth() auth: RequestAuthContext,
    @Param('rideRequestId', new OpaqueIdPipe('rideRequestId'))
    rideRequestId: string,
  ) {
    return this.driversService.declineOffer(auth, rideRequestId);
  }

  @Patch('availability')
  @Version('1')
  @ApiBearerAuth('session-token')
  @UseGuards(SessionAuthGuard, RolesGuard, ProfileAccessGuard, RateLimitGuard)
  @RateLimit({ limit: 20, windowMs: 60_000, scope: 'user' })
  @Roles(UserRole.DRIVER)
  @RequireProfile('driver')
  updateAvailability(
    @CurrentAuth() auth: RequestAuthContext,
    @Body() payload: UpdateDriverAvailabilityDto,
  ) {
    return this.driversService.updateAvailability(auth, payload.status);
  }

  @Patch('presence')
  @Version('1')
  @ApiBearerAuth('session-token')
  @UseGuards(SessionAuthGuard, RolesGuard, ProfileAccessGuard, RateLimitGuard)
  @RateLimit({ limit: 60, windowMs: 60_000, scope: 'user' })
  @Roles(UserRole.DRIVER)
  @RequireProfile('driver')
  updatePresence(
    @CurrentAuth() auth: RequestAuthContext,
    @Body() payload: UpdateDriverPresenceDto,
  ) {
    return this.driversService.updatePresence(auth, payload);
  }

  @Get('onboarding')
  @Version('1')
  @ApiBearerAuth('session-token')
  @UseGuards(SessionAuthGuard, RolesGuard, ProfileAccessGuard)
  @Roles(UserRole.DRIVER)
  @RequireProfile('driver')
  onboarding(@CurrentAuth() auth: RequestAuthContext) {
    return this.driversService.getOnboarding(auth);
  }

  @Patch('onboarding')
  @Version('1')
  @ApiBearerAuth('session-token')
  @UseGuards(SessionAuthGuard, RolesGuard, ProfileAccessGuard, RateLimitGuard)
  @RateLimit({ limit: 10, windowMs: 60_000, scope: 'user' })
  @Roles(UserRole.DRIVER)
  @RequireProfile('driver')
  upsertOnboarding(
    @CurrentAuth() auth: RequestAuthContext,
    @Body() payload: UpsertDriverOnboardingDto,
  ) {
    return this.driversService.upsertOnboarding(auth, payload);
  }

  @Patch('onboarding/document-upload-links')
  @Version('1')
  @ApiBearerAuth('session-token')
  @UseGuards(SessionAuthGuard, RolesGuard, ProfileAccessGuard, RateLimitGuard)
  @RateLimit({ limit: 5, windowMs: 60_000, scope: 'user' })
  @Roles(UserRole.DRIVER)
  @RequireProfile('driver')
  documentUploadLinks(
    @CurrentAuth() auth: RequestAuthContext,
    @Body() payload: RequestDriverDocumentUploadLinksDto,
  ) {
    return this.driversService.createDocumentUploadLinks(auth, payload);
  }

  /**
   * Objectifs journaliers et zones bonus — système d'incentives Bolt-style
   * GET /api/v1/drivers/me/incentives
   */
  @Get('me/incentives')
  @Version('1')
  @ApiBearerAuth('session-token')
  @UseGuards(SessionAuthGuard, RolesGuard, ProfileAccessGuard)
  @Roles(UserRole.DRIVER)
  @RequireProfile('driver')
  async getIncentives(@CurrentAuth() auth: RequestAuthContext) {
    const driverProfile = auth.user.driverProfile;
    if (!driverProfile?.id) {
      return { dailyQuests: [], activeBonusZones: [], streakDays: 0, streakBonusXof: 0, estimatedBonusToday: 0 };
    }
    return this.incentivesService.getIncentivesSummary(driverProfile.id);
  }
}
