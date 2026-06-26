import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';

/**
 * Détection de fraude légère — velocity checks sans ML.
 *
 * Protège contre:
 * 1. Comptes multiples créés rapidement depuis le même email/téléphone
 * 2. Demandes de course excessives (>5 en 10 min par passager)
 * 3. Tentatives de paiement répétées (>3 en 30 min par trajet)
 * 4. Chauffeurs qui changent de coordonnées trop rapidement (GPS spoofing)
 *
 * Intégration:
 *   @UseGuards(FraudDetectionGuard)  sur les endpoints sensibles
 *   Ou appel direct: await fraudService.checkRideRequestVelocity(riderId)
 */
@Injectable()
export class FraudDetectionService {
  private readonly logger = new Logger(FraudDetectionService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Vérifie que le passager ne crée pas trop de demandes de course
   * en peu de temps (abus possible, bot, test de tarification).
   * Retourne true si la demande est suspecte.
   */
  async isRideRequestVelocityExceeded(riderId: string): Promise<boolean> {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60_000);

    const recentCount = await this.prisma.rideRequest.count({
      where: {
        riderId,
        createdAt: { gte: tenMinutesAgo },
      },
    });

    if (recentCount >= 5) {
      this.logger.warn(`Velocity check: rider ${riderId} created ${recentCount} requests in 10 min`);
      return true;
    }

    return false;
  }

  /**
   * Vérifie les tentatives de paiement répétées sur un même trajet.
   * Protège contre le card testing et les doubles paiements accidentels.
   */
  async isPaymentVelocityExceeded(
    rideRequestId: string,
    windowMinutes = 30,
    maxAttempts = 4,
  ): Promise<boolean> {
    const windowStart = new Date(Date.now() - windowMinutes * 60_000);

    const recentAttempts = await this.prisma.paymentAttempt.count({
      where: {
        rideRequestId,
        createdAt: { gte: windowStart },
      },
    });

    if (recentAttempts >= maxAttempts) {
      this.logger.warn(
        `Payment velocity: ${recentAttempts} attempts on request ${rideRequestId} in ${windowMinutes}min`,
      );
      return true;
    }

    return false;
  }

  /**
   * Détecte la création de comptes en masse depuis le même domaine email.
   * Un email professionnel (gmail, yahoo, etc.) qui génère >5 comptes
   * en 1h est suspect.
   */
  async isBulkAccountCreationSuspected(email: string): Promise<boolean> {
    const domain = email.split('@')[1]?.toLowerCase();
    if (!domain) return false;

    // Domaines standards grand public — pas de blocage
    const allowedDomains = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'orange.bf', 'fasonet.bf'];
    if (allowedDomains.includes(domain)) return false;

    const oneHourAgo = new Date(Date.now() - 60 * 60_000);
    const count = await this.prisma.user.count({
      where: {
        email: { endsWith: `@${domain}` },
        createdAt: { gte: oneHourAgo },
      },
    });

    if (count >= 5) {
      this.logger.warn(`Bulk account creation suspected: domain ${domain}, ${count} accounts in 1h`);
      return true;
    }

    return false;
  }

  /**
   * Détecte le GPS spoofing basique — un chauffeur ne peut pas
   * se déplacer de plus de 200 km/h entre deux positions.
   */
  async isGpsSpoofingSuspected(
    driverProfileId: string,
    newLat: number,
    newLng: number,
  ): Promise<boolean> {
    const profile = await this.prisma.driverProfile.findUnique({
      where: { id: driverProfileId },
      select: {
        currentLatitude: true,
        currentLongitude: true,
        updatedAt: true,
      },
    });

    if (!profile?.currentLatitude || !profile.currentLongitude) return false;

    const prevLat = Number(profile.currentLatitude);
    const prevLng = Number(profile.currentLongitude);
    const elapsedMs = Date.now() - profile.updatedAt.getTime();
    const elapsedHours = elapsedMs / 3_600_000;

    if (elapsedHours <= 0) return false;

    // Distance approximative en km (formule haversine simplifiée)
    const dLat = (newLat - prevLat) * Math.PI / 180;
    const dLng = (newLng - prevLng) * Math.PI / 180;
    const a = Math.sin(dLat/2) ** 2 + Math.cos(prevLat * Math.PI/180) * Math.cos(newLat * Math.PI/180) * Math.sin(dLng/2) ** 2;
    const distanceKm = 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    const speedKmh = distanceKm / elapsedHours;

    if (speedKmh > 200) {
      this.logger.warn(
        `GPS spoofing suspected: driver ${driverProfileId} moved ${distanceKm.toFixed(1)}km in ${(elapsedMs/60000).toFixed(1)}min (${speedKmh.toFixed(0)} km/h)`,
      );
      return true;
    }

    return false;
  }
}
