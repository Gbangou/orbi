import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Version,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { Auth } from '../auth/auth.decorator';
import type { RequestAuthContext } from '../auth/auth.types';
import {
  ScheduledRidesService,
  type CreateScheduledRideDto,
} from './scheduled-rides.service';

@Controller('scheduled-rides')
@AuthGuard()
export class ScheduledRidesController {
  constructor(private readonly service: ScheduledRidesService) {}

  @Post()
  @Version('1')
  create(@Auth() auth: RequestAuthContext, @Body() dto: CreateScheduledRideDto) {
    return this.service.createScheduledRide(auth, dto);
  }

  @Get('mine')
  @Version('1')
  listMine(@Auth() auth: RequestAuthContext) {
    return this.service.listMyScheduledRides(auth);
  }

  @Delete(':id')
  @Version('1')
  cancel(
    @Auth() auth: RequestAuthContext,
    @Param('id') id: string,
    @Body('reason') reason?: string,
  ) {
    return this.service.cancelScheduledRide(auth, id, reason);
  }
}
