import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { RATE_LIMIT_KEY, type RateLimitOptions } from './rate-limit.decorator';
import { RateLimitService } from './rate-limit.service';

type AuthenticatedRequest = Request & {
  auth?: {
    user?: {
      id?: string;
    };
  };
};

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rateLimitService: RateLimitService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const options = this.reflector.getAllAndOverride<RateLimitOptions>(
      RATE_LIMIT_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!options) {
      return true;
    }

    const http = context.switchToHttp();
    const request = http.getRequest<AuthenticatedRequest>();
    const response = http.getResponse<Response>();
    const identifier = this.resolveIdentifier(request, options.scope ?? 'ip');
    const routeKey = request.originalUrl || request.url;
    const key = `${request.method}:${routeKey}:${identifier}`;
    const result = await this.rateLimitService.consume(
      key,
      options.limit,
      options.windowMs,
    );

    response.setHeader('X-RateLimit-Limit', String(options.limit));
    response.setHeader('X-RateLimit-Remaining', String(result.remaining));
    response.setHeader('X-RateLimit-Reset', String(result.resetAt));

    if (!result.allowed) {
      throw new HttpException(
        'Too many requests. Please retry in a moment.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }

  private resolveIdentifier(
    request: AuthenticatedRequest,
    scope: NonNullable<RateLimitOptions['scope']>,
  ) {
    if (scope === 'user' && request.auth?.user?.id) {
      return `user:${request.auth.user.id}`;
    }

    const forwardedFor = request.headers['x-forwarded-for'];
    const forwardedValue = Array.isArray(forwardedFor)
      ? forwardedFor[0]
      : forwardedFor;
    const firstForwardedIp = forwardedValue?.split(',')[0]?.trim();

    return `ip:${firstForwardedIp ?? request.ip ?? 'unknown'}`;
  }
}
