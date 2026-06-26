import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { createHash } from 'crypto';
import type { Request, Response } from 'express';

/**
 * ETag + Cache-Control interceptor for read-only GET endpoints.
 *
 * Usage:
 *   @UseInterceptors(ResponseCacheInterceptor)
 *   @Get('pricing/ride-options')
 *
 * Sends:
 *   Cache-Control: no-cache (forces revalidation — never stores stale data)
 *   ETag: "<sha256-of-body>" (enables 304 Not Modified on unchanged responses)
 *
 * Mobile clients send If-None-Match on subsequent requests; if content
 * hasn't changed the server returns 304 with no body, saving bandwidth.
 */
@Injectable()
export class ResponseCacheInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const ctx = context.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();

    if (req.method !== 'GET') {
      return next.handle();
    }

    return next.handle().pipe(
      map((data) => {
        if (res.headersSent) return data;

        const body = JSON.stringify(data);
        const etag = `"${createHash('sha256').update(body).digest('hex').slice(0, 32)}"`;

        res.setHeader('ETag', etag);
        res.setHeader('Cache-Control', 'no-cache');

        const ifNoneMatch = req.headers['if-none-match'];
        if (ifNoneMatch && ifNoneMatch === etag) {
          res.status(304).end();
          return null;
        }

        return data;
      }),
    );
  }
}
