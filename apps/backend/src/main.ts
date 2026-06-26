import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WsAdapter } from '@nestjs/platform-ws';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import {
  json,
  urlencoded,
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from 'express';
import { AppModule } from './app.module';
import { applyApiSecurityHeaders } from './common/security/security-headers';
import { PrismaService } from './core/prisma/prisma.service';
import { AppLifecycleService } from './core/runtime/app-lifecycle.service';

process.stderr.write('[orbi] main.ts loaded\n');

process.on('uncaughtException', (err) => {
  process.stderr.write(`[orbi] uncaughtException: ${String(err?.stack ?? err)}\n`);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  process.stderr.write(`[orbi] unhandledRejection: ${String((reason as Error)?.stack ?? reason)}\n`);
});

async function bootstrap() {
  process.stderr.write('[orbi] bootstrap() called\n');
  const app = await NestFactory.create(AppModule);
  // WebSocket adapter — nécessaire pour les @WebSocketGateway
  app.useWebSocketAdapter(new WsAdapter(app));
  process.stderr.write('[orbi] NestFactory.create() completed\n');
  const configService = app.get(ConfigService);
  const prismaService = app.get(PrismaService);
  const appLifecycleService = app.get(AppLifecycleService);
  const frontendOrigins =
    configService.get<string[]>('app.frontendOrigins') ?? [];
  const trustProxy =
    configService.get<boolean>('security.trustedProxy') ?? false;
  const enableSwagger =
    configService.get<boolean>('security.enableDocs') ?? true;
  const requestBodyLimit =
    configService.get<string>('http.requestBodyLimit') ?? '256kb';
  const gracefulShutdownTimeoutMs =
    configService.get<number>('operations.gracefulShutdownTimeoutMs') ?? 15000;
  const httpAdapter = app.getHttpAdapter().getInstance() as Express & {
    disable: (name: string) => void;
    set: (name: string, value: unknown) => void;
  };
  let shutdownStarted = false;

  httpAdapter.disable('x-powered-by');
  httpAdapter.set('trust proxy', trustProxy);
  app.use(
    json({
      limit: requestBodyLimit,
      verify: (request: Request & { rawBody?: string }, _response, buffer) => {
        request.rawBody = buffer.toString('utf8');
      },
    }),
  );
  app.use(
    urlencoded({
      extended: true,
      limit: requestBodyLimit,
      verify: (request: Request & { rawBody?: string }, _response, buffer) => {
        request.rawBody = buffer.toString('utf8');
      },
    }),
  );
  // Gzip compression for all JSON/text responses (-60-80% payload size)
  app.use(compression({ threshold: 1024 }));

  app.use((request: Request, response: Response, next: NextFunction) => {
    if (
      request.path !== '/api/v1/health' &&
      request.path !== '/api/v1/health/live' &&
      request.path !== '/api/v1/health/ready' &&
      !appLifecycleService.isReady()
    ) {
      response.status(503).json({
        statusCode: 503,
        message:
          'Service is temporarily unavailable while the instance is starting or draining.',
        lifecycle: appLifecycleService.snapshot(),
      });
      return;
    }

    applyApiSecurityHeaders(request, response);
    next();
  });

  app.enableCors({
    origin(
      origin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void,
    ) {
      if (!origin || frontendOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      if (
        configService.get<string>('app.environment') !== 'production' &&
        isLocalDevelopmentOrigin(origin)
      ) {
        callback(null, true);
        return;
      }

      callback(new Error('Origin is not allowed by Orbi CORS policy.'));
    },
    credentials: true,
  });
  app.setGlobalPrefix('api');
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
    }),
  );
  prismaService.enableShutdownHooks(app);

  if (enableSwagger) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Orbi API')
      .setDescription(
        'Backend API for rider, driver, dispatch, and admin workflows.',
      )
      .setVersion('1.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'SessionToken',
          description:
            'Opaque session token returned by /auth/sign-in or /auth/sign-up.',
        },
        'session-token',
      )
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document);
  }

  const port = configService.get<number>('app.port') ?? 3000;
  const host = configService.get<string>('app.host') ?? '0.0.0.0';
  process.stderr.write(`[orbi] listening on ${host}:${port}\n`);
  await app.listen(port, host);
  appLifecycleService.markReady();
  const server = app.getHttpServer() as {
    keepAliveTimeout?: number;
    headersTimeout?: number;
  };
  server.keepAliveTimeout =
    configService.get<number>('http.keepAliveTimeoutMs') ?? 65000;
  server.headersTimeout =
    configService.get<number>('http.headersTimeoutMs') ?? 66000;

  const beginShutdown = () => {
    if (shutdownStarted) {
      return;
    }

    shutdownStarted = true;
    appLifecycleService.startDraining('shutdown_signal');

    setTimeout(() => {
      void app.close().finally(() => {
        appLifecycleService.markStopped();
      });
    }, gracefulShutdownTimeoutMs).unref();
  };

  process.once('SIGTERM', beginShutdown);
  process.once('SIGINT', beginShutdown);
}
void bootstrap();

function isLocalDevelopmentOrigin(origin: string) {
  try {
    const url = new URL(origin);
    return (
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) &&
      ['http:', 'https:'].includes(url.protocol)
    );
  } catch {
    return false;
  }
}
