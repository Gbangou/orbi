import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type Coordinate = { latitude: number; longitude: number };

type RouteResult = {
  distanceKm: number;
  durationMinutes: number;
  source: 'osrm' | 'haversine_estimate';
};

type OsrmRouteResponse = {
  code: string;
  routes?: Array<{
    distance: number;  // metres
    duration: number;  // seconds
  }>;
};

const CONNECT_TIMEOUT_MS = 3_000;
const ROAD_DETOUR_FACTOR = 1.3;

function haversineKm(from: Coordinate, to: Coordinate): number {
  const R = 6371;
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(to.latitude - from.latitude);
  const dLon = toRad(to.longitude - from.longitude);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(from.latitude)) *
      Math.cos(toRad(to.latitude)) *
      Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function peakHourFactor(hour: number): number {
  if ((hour >= 7 && hour < 9) || (hour >= 17 && hour < 20)) return 1.3;
  if (hour >= 12 && hour < 14) return 1.15;
  return 1;
}

function estimateFromHaversine(
  from: Coordinate,
  to: Coordinate,
): Omit<RouteResult, 'source'> {
  const straight = haversineKm(from, to);
  const roadKm = straight * ROAD_DETOUR_FACTOR;
  const speedKmh = 22 / peakHourFactor(new Date().getHours());
  const durationMinutes = Math.max(4, Math.round((roadKm / speedKmh) * 60 + 4));
  return { distanceKm: Math.round(roadKm * 10) / 10, durationMinutes };
}

@Injectable()
export class RoutingService {
  private readonly logger = new Logger(RoutingService.name);
  private readonly osrmBaseUrl: string | null;

  constructor(@Optional() private readonly configService?: ConfigService) {
    this.osrmBaseUrl =
      this.configService?.get<string>('OSRM_BASE_URL') ?? null;
  }

  async getRoute(from: Coordinate, to: Coordinate): Promise<RouteResult> {
    if (this.osrmBaseUrl) {
      try {
        return await this.fetchOsrmRoute(from, to);
      } catch (error) {
        this.logger.warn(
          `OSRM routing failed — falling back to Haversine: ${String(error)}`,
        );
      }
    }

    return {
      ...estimateFromHaversine(from, to),
      source: 'haversine_estimate',
    };
  }

  private async fetchOsrmRoute(
    from: Coordinate,
    to: Coordinate,
  ): Promise<RouteResult> {
    const url = `${this.osrmBaseUrl}/route/v1/driving/${from.longitude},${from.latitude};${to.longitude},${to.latitude}?overview=false&alternatives=false`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CONNECT_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`OSRM HTTP ${response.status}`);
      }

      const body = (await response.json()) as OsrmRouteResponse;

      if (body.code !== 'Ok' || !body.routes?.length) {
        throw new Error(`OSRM code: ${body.code}`);
      }

      const route = body.routes[0];
      const distanceKm = Math.round((route.distance / 1000) * 10) / 10;
      const durationMinutes = Math.max(
        4,
        Math.round(route.duration / 60 * peakHourFactor(new Date().getHours())),
      );

      return { distanceKm, durationMinutes, source: 'osrm' };
    } finally {
      clearTimeout(timeout);
    }
  }
}
