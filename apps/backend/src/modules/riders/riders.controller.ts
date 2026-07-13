import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
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
import { CreateSavedPlaceDto } from './dto/create-saved-place.dto';
import { CreateTrustedContactDto } from './dto/create-trusted-contact.dto';
import { UpdateTrustedContactEntryDto } from './dto/update-trusted-contact-entry.dto';
import { UpdateTrustedContactDto } from './dto/update-trusted-contact.dto';
import { UpdateSavedPlaceDto } from './dto/update-saved-place.dto';
import { RidersService } from './riders.service';
import { WalletTopUpService } from './wallet-topup.service';
import { InitiateWalletTopUpDto } from './dto/initiate-wallet-topup.dto';

@Controller('riders')
@ApiBearerAuth('session-token')
@UseGuards(SessionAuthGuard, RolesGuard, ProfileAccessGuard)
export class RidersController {
  constructor(
    private readonly ridersService: RidersService,
    private readonly walletTopUpService: WalletTopUpService,
  ) {}

  @Get('me')
  @Version('1')
  @Roles(UserRole.RIDER)
  @RequireProfile('rider')
  me(@CurrentAuth() auth: RequestAuthContext) {
    return this.ridersService.getMe(auth);
  }

  @Post('saved-places')
  @Version('1')
  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 20, windowMs: 60_000, scope: 'user' })
  @Roles(UserRole.RIDER)
  @RequireProfile('rider')
  createSavedPlace(
    @CurrentAuth() auth: RequestAuthContext,
    @Body() payload: CreateSavedPlaceDto,
  ) {
    return this.ridersService.createSavedPlace(auth, payload);
  }

  @Patch('trusted-contact')
  @Version('1')
  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 10, windowMs: 60_000, scope: 'user' })
  @Roles(UserRole.RIDER)
  @RequireProfile('rider')
  updateTrustedContact(
    @CurrentAuth() auth: RequestAuthContext,
    @Body() payload: UpdateTrustedContactDto,
  ) {
    return this.ridersService.updateTrustedContact(auth, payload);
  }

  @Post('trusted-contacts')
  @Version('1')
  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 10, windowMs: 60_000, scope: 'user' })
  @Roles(UserRole.RIDER)
  @RequireProfile('rider')
  createTrustedContact(
    @CurrentAuth() auth: RequestAuthContext,
    @Body() payload: CreateTrustedContactDto,
  ) {
    return this.ridersService.createTrustedContact(auth, payload);
  }

  @Patch('trusted-contacts/:trustedContactId')
  @Version('1')
  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 10, windowMs: 60_000, scope: 'user' })
  @Roles(UserRole.RIDER)
  @RequireProfile('rider')
  updateTrustedContactEntry(
    @CurrentAuth() auth: RequestAuthContext,
    @Param('trustedContactId', new OpaqueIdPipe('trustedContactId'))
    trustedContactId: string,
    @Body() payload: UpdateTrustedContactEntryDto,
  ) {
    return this.ridersService.updateTrustedContactEntry(
      auth,
      trustedContactId,
      payload,
    );
  }

  @Delete('trusted-contacts/:trustedContactId')
  @Version('1')
  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 10, windowMs: 60_000, scope: 'user' })
  @Roles(UserRole.RIDER)
  @RequireProfile('rider')
  deleteTrustedContact(
    @CurrentAuth() auth: RequestAuthContext,
    @Param('trustedContactId', new OpaqueIdPipe('trustedContactId'))
    trustedContactId: string,
  ) {
    return this.ridersService.deleteTrustedContact(auth, trustedContactId);
  }

  @Patch('saved-places/:savedPlaceId')
  @Version('1')
  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 20, windowMs: 60_000, scope: 'user' })
  @Roles(UserRole.RIDER)
  @RequireProfile('rider')
  updateSavedPlace(
    @CurrentAuth() auth: RequestAuthContext,
    @Param('savedPlaceId', new OpaqueIdPipe('savedPlaceId'))
    savedPlaceId: string,
    @Body() payload: UpdateSavedPlaceDto,
  ) {
    return this.ridersService.updateSavedPlace(auth, savedPlaceId, payload);
  }

  @Delete('saved-places/:savedPlaceId')
  @Version('1')
  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 10, windowMs: 60_000, scope: 'user' })
  @Roles(UserRole.RIDER)
  @RequireProfile('rider')
  deleteSavedPlace(
    @CurrentAuth() auth: RequestAuthContext,
    @Param('savedPlaceId', new OpaqueIdPipe('savedPlaceId'))
    savedPlaceId: string,
  ) {
    return this.ridersService.deleteSavedPlace(auth, savedPlaceId);
  }

  @Get('overview')
  @Version('1')
  @Roles(UserRole.RIDER, UserRole.ADMIN, UserRole.OPS, UserRole.SUPPORT)
  overview() {
    return this.ridersService.overview();
  }

  // ── Wallet top-up — rechargement via PawaPay Mobile Money ────────────────────

  @Get('me/wallet')
  @Version('1')
  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 30, windowMs: 60_000, scope: 'user' })
  @Roles(UserRole.RIDER)
  @RequireProfile('rider')
  walletBalance(@CurrentAuth() auth: RequestAuthContext) {
    return this.walletTopUpService.getWalletBalance(auth);
  }

  @Get('me/wallet/topup-history')
  @Version('1')
  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 20, windowMs: 60_000, scope: 'user' })
  @Roles(UserRole.RIDER)
  @RequireProfile('rider')
  walletTopUpHistory(@CurrentAuth() auth: RequestAuthContext) {
    return this.walletTopUpService.getTopUpHistory(auth);
  }

  @Post('me/wallet/topup')
  @Version('1')
  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 5, windowMs: 60_000, scope: 'user' })
  @Roles(UserRole.RIDER)
  @RequireProfile('rider')
  initiateWalletTopUp(
    @CurrentAuth() auth: RequestAuthContext,
    @Body() payload: InitiateWalletTopUpDto,
  ) {
    return this.walletTopUpService.initiateTopUp(auth, payload);
  }
}
