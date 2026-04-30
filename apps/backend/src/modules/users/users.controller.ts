import { Controller, Get, Query, UseGuards, Version } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { PageQueryDto } from '../../common/dto/page-query.dto';
import { UserRole } from '@prisma/client';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { UsersService } from './users.service';

@Controller('users')
@ApiBearerAuth('session-token')
@UseGuards(SessionAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Version('1')
  @Roles(UserRole.ADMIN, UserRole.SUPPORT, UserRole.OPS)
  findAll(@Query() query: PageQueryDto) {
    return this.usersService.findAll(query);
  }
}
