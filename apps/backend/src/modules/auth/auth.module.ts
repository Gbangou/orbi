import { Global, Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { ProfileAccessGuard } from './profile-access.guard';
import { RolesGuard } from './roles.guard';
import { SessionAuthGuard } from './session-auth.guard';
import { NotificationsModule } from '../notifications/notifications.module';

@Global()
@Module({
  imports: [NotificationsModule],
  controllers: [AuthController],
  providers: [AuthService, SessionAuthGuard, RolesGuard, ProfileAccessGuard],
  exports: [AuthService, SessionAuthGuard, RolesGuard, ProfileAccessGuard],
})
export class AuthModule {}
