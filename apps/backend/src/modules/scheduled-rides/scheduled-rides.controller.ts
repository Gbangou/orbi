import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
  Version,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { ApiBearerAuth } from '@nestjs/swagger';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentAuth } from '../auth/current-auth.decorator';
import type { RequestAuthContext } from '../auth/auth.types';
import { OpaqueIdPipe } from '../../common/pipes/opaque-id.pipe';
import { ScheduledRidesService } from './scheduled-rides.service';
import {
  CancelScheduledRideDto,
  CreateScheduledRideDto,
} from './dto/create-scheduled-ride.dto';

@Controller('scheduled-rides')
@ApiBearerAuth('session-token')
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles(UserRole.RIDER)
export class ScheduledRidesController {
  constructor(private readonly service: ScheduledRidesService) {}

  @Post()
  @Version('1')
  create(
    @CurrentAuth() auth: RequestAuthContext,
    @Body() dto: CreateScheduledRideDto,
  ) {
    return this.service.createScheduledRide(auth, dto);
  }

  @Get('mine')
  @Version('1')
  listMine(@CurrentAuth() auth: RequestAuthContext) {
    return this.service.listMyScheduledRides(auth);
  }

  @Delete(':id')
  @Version('1')
  cancel(
    @CurrentAuth() auth: RequestAuthContext,
    @Param('id', new OpaqueIdPipe('scheduledRideId')) id: string,
    @Body() payload?: CancelScheduledRideDto,
  ) {
    return this.service.cancelScheduledRide(auth, id, payload?.reason);
  }
}
