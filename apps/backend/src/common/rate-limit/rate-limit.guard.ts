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
    const routeKey = this.resolveRouteKey(request);
    const scopes = options.scopes?.length ? options.scopes : [options.scope ?? 'ip'];
    const results = await Promise.all(
      scopes.map((scope) => {
        const identifier = this.resolveIdentifier(request, scope, options);
        const key = `${request.method}:${routeKey}:${identifier}`;
        return this.rateLimitService.consume(key, options.limit, options.windowMs);
      }),
    );
    const result = results.reduce((mostLimited, current) =>
      current.remaining < mostLimited.remaining ? current : mostLimited,
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
    options: RateLimitOptions,
  ) {
    if (scope === 'user' && request.auth?.user?.id) {
      return `user:${request.auth.user.id}`;
    }

    if (scope === 'body') {
      const value = this.resolveBodyField(request.body, options.bodyField);
      if (value) {
        return `body:${options.bodyField}:${value}`;
      }
    }

    if (scope === 'device') {
      const deviceId = request.headers['x-orbi-device-id'];
      if (typeof deviceId === 'string' && /^[A-Za-z0-9._:-]{8,128}$/.test(deviceId)) {
        return `device:${deviceId}`;
      }
      const userAgent = request.headers['user-agent'];
      return `device:${request.ip ?? 'unknown'}:${userAgent ?? 'unknown'}`;
    }

    return `ip:${request.ip ?? 'unknown'}`;
  }

  private resolveBodyField(body: unknown, field?: string) {
    if (!field || !body || typeof body !== 'object') {
      return null;
    }

    const value = (body as Record<string, unknown>)[field];
    if (typeof value !== 'string') {
      return null;
    }

    return value.trim().toLowerCase().replace(/[^a-z0-9+@._:-]/gi, '').slice(0, 160);
  }

  private resolveRouteKey(request: Request) {
    const path = request.path || request.originalUrl || request.url || '/';

    return path.split('?')[0] || '/';
  }
}
