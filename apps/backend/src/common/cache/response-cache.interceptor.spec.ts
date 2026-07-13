import { ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { ResponseCacheInterceptor } from './response-cache.interceptor';

function createContext(input: {
  method?: string;
  ifNoneMatch?: string;
  headersSent?: boolean;
}) {
  const request = {
    method: input.method ?? 'GET',
    headers: input.ifNoneMatch ? { 'if-none-match': input.ifNoneMatch } : {},
  };
  const response = {
    headersSent: input.headersSent ?? false,
    setHeader: jest.fn(),
    status: jest.fn().mockReturnThis(),
  };
  const context = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext;

  return { context, request, response };
}

describe('ResponseCacheInterceptor', () => {
  it('sets ETag and Cache-Control on GET responses', async () => {
    const interceptor = new ResponseCacheInterceptor();
    const { context, response } = createContext({});

    const result = await lastValueFrom(
      interceptor.intercept(context, { handle: () => of({ ok: true }) }),
    );

    expect(result).toEqual({ ok: true });
    expect(response.setHeader).toHaveBeenCalledWith(
      'ETag',
      expect.stringMatching(/^"[a-f0-9]{32}"$/),
    );
    expect(response.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache');
    expect(response.status).not.toHaveBeenCalled();
  });

  it('marks matching GET responses as 304 without ending the response manually', async () => {
    const interceptor = new ResponseCacheInterceptor();
    const first = createContext({});

    await lastValueFrom(
      interceptor.intercept(first.context, { handle: () => of({ ok: true }) }),
    );
    const etag = first.response.setHeader.mock.calls.find(
      ([name]) => name === 'ETag',
    )?.[1] as string;
    const second = createContext({ ifNoneMatch: etag });

    const result = await lastValueFrom(
      interceptor.intercept(second.context, { handle: () => of({ ok: true }) }),
    );

    expect(result).toBeUndefined();
    expect(second.response.status).toHaveBeenCalledWith(304);
    expect('end' in second.response).toBe(false);
  });

  it('passes non-GET responses through without cache headers', async () => {
    const interceptor = new ResponseCacheInterceptor();
    const { context, response } = createContext({ method: 'POST' });

    const result = await lastValueFrom(
      interceptor.intercept(context, { handle: () => of({ ok: true }) }),
    );

    expect(result).toEqual({ ok: true });
    expect(response.setHeader).not.toHaveBeenCalled();
  });
});
