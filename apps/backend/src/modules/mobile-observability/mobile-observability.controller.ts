import { Body, Controller, Post, UseGuards, Version } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { RateLimit } from '../../common/rate-limit/rate-limit.decorator';
import { RateLimitGuard } from '../../common/rate-limit/rate-limit.guard';
import { CurrentAuth } from '../auth/current-auth.decorator';
import type { RequestAuthContext } from '../auth/auth.types';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { SubmitMobileErrorReportsDto } from './dto/submit-mobile-error-reports.dto';
import { MobileObservabilityService } from './mobile-observability.service';

@Controller('mobile')
@ApiBearerAuth('session-token')
@UseGuards(SessionAuthGuard, RolesGuard)
export class MobileObservabilityController {
  constructor(
    private readonly mobileObservabilityService: MobileObservabilityService,
  ) {}

  @Post('error-reports')
  @Version('1')
  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 30, windowMs: 60_000, scope: 'user' })
  @Roles(UserRole.RIDER, UserRole.DRIVER)
  submitErrorReports(
    @CurrentAuth() auth: RequestAuthContext,
    @Body() payload: SubmitMobileErrorReportsDto,
  ) {
    return this.mobileObservabilityService.submitErrorReports(auth, payload);
  }
}
