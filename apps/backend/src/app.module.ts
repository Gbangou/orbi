import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration';
import { validateEnvironment } from './config/environment.validation';
import { PrismaModule } from './core/prisma/prisma.module';
import { RealtimeModule } from './core/realtime/realtime.module';
import { RuntimeModule } from './core/runtime/runtime.module';
import { RateLimitModule } from './common/rate-limit/rate-limit.module';
import { DocumentLinksModule } from './common/document-links/document-links.module';
import { AdminModule } from './modules/admin/admin.module';
import { AuthModule } from './modules/auth/auth.module';
import { DriversModule } from './modules/drivers/drivers.module';
import { HealthModule } from './modules/health/health.module';
import { PricingModule } from './modules/pricing/pricing.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { RideRequestsModule } from './modules/ride-requests/ride-requests.module';
import { RidersModule } from './modules/riders/riders.module';
import { TripsModule } from './modules/trips/trips.module';
import { UsersModule } from './modules/users/users.module';
import { VehiclesModule } from './modules/vehicles/vehicles.module';
import { VoiceModule } from './modules/voice/voice.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: validateEnvironment,
      envFilePath: ['.env', 'prisma/.env'],
    }),
    RuntimeModule,
    RateLimitModule,
    DocumentLinksModule,
    PrismaModule,
    RealtimeModule,
    HealthModule,
    AuthModule,
    UsersModule,
    RidersModule,
    DriversModule,
    VehiclesModule,
    RideRequestsModule,
    TripsModule,
    PricingModule,
    PaymentsModule,
    AdminModule,
    VoiceModule,
  ],
})
export class AppModule {}
