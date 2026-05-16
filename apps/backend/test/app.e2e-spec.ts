import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/core/prisma/prisma.service';

describe('Health (e2e)', () => {
  let app: INestApplication<App>;
  let prismaServiceMock: {
    $queryRaw: jest.Mock;
    $disconnect: jest.Mock;
    enableShutdownHooks: jest.Mock;
  };

  beforeEach(async () => {
    process.env.NODE_ENV = 'test';
    process.env.SKIP_DB_CONNECT = 'true';
    process.env.DRIVER_RESERVATION_EXPIRY_SWEEP_INTERVAL_MS = '0';
    process.env.DATABASE_URL =
      'postgresql://postgres:postgres@localhost:5433/orbi?schema=public';
    prismaServiceMock = {
      $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
      $disconnect: jest.fn().mockResolvedValue(undefined),
      enableShutdownHooks: jest.fn(),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaServiceMock)
      .compile();

    app = moduleFixture.createNestApplication();
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
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('/api/v1/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200)
      .expect((response) => {
        expect(response.body.status).toBe('ok');
        expect(response.body.service).toBe('orbi-backend');
        expect(response.body.dependencies.database).toBe('up');
      });
  });
});
