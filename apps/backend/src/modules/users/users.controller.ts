import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
  Version,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { PageQueryDto } from '../../common/dto/page-query.dto';
import { UserRole } from '@prisma/client';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { CurrentAuth } from '../auth/current-auth.decorator';
import type { RequestAuthContext } from '../auth/auth.types';
import { UsersService } from './users.service';
import { PushTokenService } from '../notifications/push-token.service';
import { RegisterPushTokenDto } from './dto/register-push-token.dto';

@Controller('users')
@ApiBearerAuth('session-token')
@UseGuards(SessionAuthGuard, RolesGuard)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly pushTokenService: PushTokenService,
  ) {}

  @Get()
  @Version('1')
  @Roles(UserRole.ADMIN, UserRole.SUPPORT, UserRole.OPS)
  findAll(@Query() query: PageQueryDto) {
    return this.usersService.findAll(query);
  }

  @Post('me/push-token')
  @Version('1')
  @HttpCode(HttpStatus.NO_CONTENT)
  registerPushToken(
    @CurrentAuth() auth: RequestAuthContext,
    @Body() body: RegisterPushTokenDto,
  ) {
    this.pushTokenService.register(auth.user.id, body.token);
  }
}
