import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
  Version,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { OpaqueIdPipe } from '../../common/pipes/opaque-id.pipe';
import { CurrentAuth } from '../auth/current-auth.decorator';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import type { RequestAuthContext } from '../auth/auth.types';
import { CreateRideRequestDto } from './dto/create-ride-request.dto';
import { RideRequestsService } from './ride-requests.service';

@Controller('ride-requests')
@ApiBearerAuth('session-token')
@UseGuards(SessionAuthGuard, RolesGuard)
export class RideRequestsController {
  constructor(private readonly rideRequestsService: RideRequestsService) {}

  @Post()
  @Version('1')
  @Roles(UserRole.RIDER, UserRole.ADMIN, UserRole.OPS, UserRole.SUPPORT)
  create(
    @Body() payload: CreateRideRequestDto,
    @CurrentAuth() auth: RequestAuthContext,
  ) {
    const riderId =
      auth.user.role === UserRole.RIDER
        ? auth.user.riderProfile?.id
        : payload.riderId;

    if (!riderId) {
      throw new BadRequestException(
        'A rider profile is required to create a ride request.',
      );
    }

    return this.rideRequestsService.create({
      ...payload,
      riderId,
    });
  }

  @Get('active')
  @Version('1')
  @Roles(UserRole.ADMIN, UserRole.OPS, UserRole.SUPPORT, UserRole.DRIVER)
  findActive() {
    return this.rideRequestsService.findActive();
  }

  @Delete(':rideRequestId')
  @Version('1')
  @Roles(UserRole.RIDER, UserRole.ADMIN, UserRole.OPS, UserRole.SUPPORT)
  cancel(
    @Param('rideRequestId', new OpaqueIdPipe('rideRequestId'))
    rideRequestId: string,
    @CurrentAuth() auth: RequestAuthContext,
  ) {
    return this.rideRequestsService.cancel(auth, rideRequestId);
  }
}
