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
import { OpaqueIdPipe } from '../../common/pipes/opaque-id.pipe';
import { CurrentAuth } from '../auth/current-auth.decorator';
import type { RequestAuthContext } from '../auth/auth.types';
import { ProfileAccessGuard } from '../auth/profile-access.guard';
import { RequireProfile } from '../auth/profile-access.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { CreateSavedPlaceDto } from './dto/create-saved-place.dto';
import { UpdateTrustedContactDto } from './dto/update-trusted-contact.dto';
import { UpdateSavedPlaceDto } from './dto/update-saved-place.dto';
import { RidersService } from './riders.service';

@Controller('riders')
@ApiBearerAuth('session-token')
@UseGuards(SessionAuthGuard, RolesGuard, ProfileAccessGuard)
export class RidersController {
  constructor(private readonly ridersService: RidersService) {}

  @Get('me')
  @Version('1')
  @Roles(UserRole.RIDER)
  @RequireProfile('rider')
  me(@CurrentAuth() auth: RequestAuthContext) {
    return this.ridersService.getMe(auth);
  }

  @Post('saved-places')
  @Version('1')
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
  @Roles(UserRole.RIDER)
  @RequireProfile('rider')
  updateTrustedContact(
    @CurrentAuth() auth: RequestAuthContext,
    @Body() payload: UpdateTrustedContactDto,
  ) {
    return this.ridersService.updateTrustedContact(auth, payload);
  }

  @Patch('saved-places/:savedPlaceId')
  @Version('1')
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
}
