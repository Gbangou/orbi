import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedRequest } from './auth.request';
import {
  PROFILE_ACCESS_KEY,
  type ProfileAccessRequirement,
} from './profile-access.decorator';

@Injectable()
export class ProfileAccessGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext) {
    const requirement =
      this.reflector.getAllAndOverride<ProfileAccessRequirement>(
        PROFILE_ACCESS_KEY,
        [context.getHandler(), context.getClass()],
      );

    if (!requirement) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const auth = request.auth;

    if (!auth) {
      throw new ForbiddenException(
        'An authenticated session is required to access this resource.',
      );
    }

    const hasRequiredProfile =
      requirement === 'rider'
        ? Boolean(auth.user.riderProfile)
        : Boolean(auth.user.driverProfile);

    if (!hasRequiredProfile) {
      throw new ForbiddenException(
        requirement === 'rider'
          ? 'This account does not have an active rider profile.'
          : 'This account does not have an active driver profile.',
      );
    }

    return true;
  }
}
