/**
 * Pricing API — Tests d'intégration E2E
 *
 * Vérifie que l'API HTTP `/api/v1/pricing/*` répond correctement,
 * valide les DTOs, et retourne les structures attendues.
 * La base de données est mockée : ces tests portent sur la couche HTTP.
 */
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { WsAdapter } from '@nestjs/platform-ws';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/core/prisma/prisma.service';

function buildPrismaFallbackMock() {
  return {
    $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    $disconnect: jest.fn().mockResolvedValue(undefined),
    enableShutdownHooks: jest.fn(),
    pricingRule: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) },
    driverProfile: { count: jest.fn().mockResolvedValue(4) },
    rideRequest: { count: jest.fn().mockResolvedValue(2) },
  };
}

async function createTestApp(prisma: ReturnType<typeof buildPrismaFallbackMock>) {
  process.env.NODE_ENV = 'test';
  process.env.SKIP_DB_CONNECT = 'true';
  process.env.DRIVER_RESERVATION_EXPIRY_SWEEP_INTERVAL_MS = '0';
  process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5433/orbi?schema=public';

  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue(prisma)
    .compile();

  const app = module.createNestApplication<INestApplication<App>>();
  app.useWebSocketAdapter(new WsAdapter(app));
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
  await app.init();
  return app;
}

describe('Pricing API (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: ReturnType<typeof buildPrismaFallbackMock>;

  beforeEach(async () => {
    prisma = buildPrismaFallbackMock();
    app = await createTestApp(prisma);
  });

  afterEach(async () => { await app.close(); });

  // ── GET /pricing/ride-options ───────────────────────────────────────────────

  describe('GET /api/v1/pricing/ride-options', () => {
    it('retourne 200 avec un catalogue d\'options valide', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/pricing/ride-options')
        .query({ distanceKm: 5.8, durationMinutes: 16 })
        .expect(200);

      expect(res.body).toHaveProperty('options');
      expect(Array.isArray(res.body.options)).toBe(true);
      expect(res.body.options.length).toBeGreaterThan(0);
    });

    it('chaque option expose fare, driverPayout, surgeActive, marketplace', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/pricing/ride-options')
        .query({ distanceKm: 5.8, durationMinutes: 16 })
        .expect(200);

      for (const option of res.body.options) {
        expect(option.fare).toBeGreaterThan(0);
        expect(option.driverPayout).toBeGreaterThan(0);
        expect(typeof option.surgeActive).toBe('boolean');
        expect(option.marketplace).toBeDefined();
        expect(['LIVE', 'ESTIMATED', 'DEGRADED']).toContain(
          option.marketplace.etaSource,
        );
        expect(['LIVE', 'ESTIMATED', 'DEGRADED']).toContain(
          option.marketplace.supplySource,
        );
        expect(typeof option.marketplace.signalLabel).toBe('string');
        expect(typeof option.marketplace.reliabilityNote).toBe('string');
        expect(option.safetyNote).toBeDefined();
      }
    });

    it('retourne 400 si distanceKm manquant', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/pricing/ride-options')
        .query({ durationMinutes: 16 })
        .expect(400);
    });

    it('retourne 400 si durationMinutes manquant', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/pricing/ride-options')
        .query({ distanceKm: 5.8 })
        .expect(400);
    });

    it('retourne 400 si distanceKm est négatif', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/pricing/ride-options')
        .query({ distanceKm: -1, durationMinutes: 16 })
        .expect(400);
    });

    it('reflète le surge dans la réponse quand demandLevel=PEAK', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/pricing/ride-options')
        .query({ distanceKm: 5.8, durationMinutes: 16, demandLevel: 'PEAK', isPeakHour: 'true' })
        .expect(200);

      const surgedOptions = res.body.options.filter((o: { surgeActive: boolean }) => o.surgeActive);
      expect(surgedOptions.length).toBeGreaterThan(0);
      for (const opt of surgedOptions) {
        expect(opt.surgeLabel).not.toBeNull();
        expect(opt.badge).toContain('Forte demande');
      }
    });

    it('cache ETag — requêtes identiques retournent le même ETag', async () => {
      const res1 = await request(app.getHttpServer())
        .get('/api/v1/pricing/ride-options')
        .query({ distanceKm: 5.8, durationMinutes: 16 })
        .expect(200);

      const etag = res1.headers['etag'];
      expect(etag).toBeDefined();

      const res2 = await request(app.getHttpServer())
        .get('/api/v1/pricing/ride-options')
        .query({ distanceKm: 5.8, durationMinutes: 16 })
        .set('If-None-Match', etag)
        .expect(304);

      expect(res2.headers['etag']).toBe(etag);
    });
  });

  // ── GET /pricing/estimate ───────────────────────────────────────────────────

  describe('GET /api/v1/pricing/estimate', () => {
    it('retourne 200 avec estimatedFare, driverEconomics, fareBreakdown', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/pricing/estimate')
        .query({
          vehicleType: 'MOTORCYCLE',
          distanceKm: 5.8,
          durationMinutes: 16,
          paymentMethod: 'MOBILE_MONEY',
          zone: 'URBAN_CORE',
          city: 'OUAGADOUGOU',
          districtProfile: 'UNIVERSITY',
        })
        .expect(200);

      expect(res.body.estimatedFare).toBeGreaterThan(0);
      expect(res.body.driverEconomics.driverPayout).toBeGreaterThan(0);
      expect(res.body.fareBreakdown).toBeDefined();
      expect(res.body.trustAndPolicy.pickupCodeRequired).toBe(false);
    });

    it('CAR renvoie un tarif supérieur à MOTORCYCLE sur le même trajet', async () => {
      const base = { distanceKm: 5.8, durationMinutes: 16, zone: 'URBAN_CORE', city: 'OUAGADOUGOU', districtProfile: 'UNIVERSITY' };
      const moto = await request(app.getHttpServer()).get('/api/v1/pricing/estimate').query({ ...base, vehicleType: 'MOTORCYCLE' }).expect(200);
      const car = await request(app.getHttpServer()).get('/api/v1/pricing/estimate').query({ ...base, vehicleType: 'CAR' }).expect(200);
      expect(car.body.estimatedFare).toBeGreaterThan(moto.body.estimatedFare);
    });
  });

  // ── GET /pricing/rules ──────────────────────────────────────────────────────

  describe('GET /api/v1/pricing/rules', () => {
    it('retourne 200 avec tableau de règles (peut être vide en test)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/pricing/rules')
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('ETag présent sur /rules', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/pricing/rules').expect(200);
      expect(res.headers['etag']).toBeDefined();
    });
  });
});

// ── Health E2E ─────────────────────────────────────────────────────────────────

describe('Health API (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const prisma = buildPrismaFallbackMock();
    app = await createTestApp(prisma);
  });

  afterEach(async () => { await app.close(); });

  it('GET /api/v1/health retourne status ok', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('orbi-backend');
    expect(res.body.dependencies.database).toBe('up');
  });

  it('GET /api/v1/health/live retourne 200', async () => {
    await request(app.getHttpServer()).get('/api/v1/health/live').expect(200);
  });
});
