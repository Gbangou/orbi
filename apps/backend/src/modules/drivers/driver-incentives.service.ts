/**
 * DriverIncentivesService — Objectifs et bonus chauffeurs
 *
 * Système d'incentives similaire à Bolt/Yango pour maximiser la rétention:
 *   - Objectifs quotidiens (Quest): "Faites X courses pour gagner Y XOF de bonus"
 *   - Zones bonus: zones géographiques avec multiplicateur de payout
 *   - Streak: bonus de régularité (7 jours consécutifs actifs)
 *   - Bonus de bienvenue: première semaine à commission réduite (déjà implémenté)
 *
 * Les incentives sont calculés en temps réel à partir de l'historique
 * Prisma — aucune table dédiée nécessaire pour le MVP.
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';

export type DailyQuestStatus = {
  questId: string;
  title: string;
  description: string;
  targetTrips: number;
  completedTrips: number;
  bonusXof: number;
  progressPercent: number;
  isCompleted: boolean;
  expiresAt: string; // ISO — minuit heure locale
};

export type BonusZone = {
  id: string;
  name: string;
  multiplier: number; // 1.2 = +20% payout
  city: string;
  districtProfile: string;
  activeUntil: string; // ISO
  reason: string; // "Forte demande — Centre-ville Ouaga"
};

export type DriverIncentivesSummary = {
  dailyQuests: DailyQuestStatus[];
  activeBonusZones: BonusZone[];
  streakDays: number;
  streakBonusXof: number;
  estimatedBonusToday: number;
};

// Objectifs par palier de courses complétées aujourd'hui
const DAILY_QUESTS: Array<{
  id: string;
  title: string;
  description: string;
  targetTrips: number;
  bonusXof: number;
}> = [
  {
    id: 'quest-5',
    title: '5 courses ce soir',
    description: 'Complétez 5 courses avant minuit',
    targetTrips: 5,
    bonusXof: 500,
  },
  {
    id: 'quest-10',
    title: 'Objectif Expert',
    description: 'Complétez 10 courses dans la journée',
    targetTrips: 10,
    bonusXof: 1_500,
  },
  {
    id: 'quest-20',
    title: 'Champion du jour',
    description: 'Complétez 20 courses — objectif élite',
    targetTrips: 20,
    bonusXof: 4_000,
  },
];

// Zones à forte demande — mises à jour par l'équipe ops via admin
const ACTIVE_BONUS_ZONES: BonusZone[] = [
  {
    id: 'zone-cbd',
    name: 'Centre-ville Ouagadougou',
    multiplier: 1.15,
    city: 'OUAGADOUGOU',
    districtProfile: 'CBD',
    activeUntil: new Date(Date.now() + 2 * 24 * 60 * 60_000).toISOString(),
    reason: 'Zone à forte demande — +15% sur vos gains',
  },
  {
    id: 'zone-airport',
    name: 'Aéroport Thomas Sankara',
    multiplier: 1.25,
    city: 'OUAGADOUGOU',
    districtProfile: 'AIRPORT',
    activeUntil: new Date(Date.now() + 24 * 60 * 60_000).toISOString(),
    reason: 'Zone aéroport — +25% sur vos gains',
  },
];

@Injectable()
export class DriverIncentivesService {
  constructor(private readonly prisma: PrismaService) {}

  async getIncentivesSummary(driverProfileId: string): Promise<DriverIncentivesSummary> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60_000);

    // Courses complétées aujourd'hui
    const todayTrips = await this.prisma.trip.count({
      where: {
        driverId: driverProfileId,
        status: 'COMPLETED',
        completedAt: { gte: today, lt: tomorrow },
      },
    });

    // Streak: combien de jours consécutifs avec au moins 1 course complétée
    const streak = await this.computeStreak(driverProfileId);

    // Calcul des objectifs
    const dailyQuests: DailyQuestStatus[] = DAILY_QUESTS.map((quest) => ({
      questId: quest.id,
      title: quest.title,
      description: quest.description,
      targetTrips: quest.targetTrips,
      completedTrips: Math.min(todayTrips, quest.targetTrips),
      bonusXof: quest.bonusXof,
      progressPercent: Math.min(
        100,
        Math.round((todayTrips / quest.targetTrips) * 100),
      ),
      isCompleted: todayTrips >= quest.targetTrips,
      expiresAt: tomorrow.toISOString(),
    }));

    // Bonus streak (7 jours = 2 000 XOF, 14 jours = 5 000 XOF, 30 jours = 15 000 XOF)
    const streakBonusXof =
      streak >= 30 ? 15_000 :
      streak >= 14 ? 5_000 :
      streak >= 7 ? 2_000 : 0;

    // Total bonus estimé
    const completedQuestsBonus = dailyQuests
      .filter((q) => q.isCompleted)
      .reduce((sum, q) => sum + q.bonusXof, 0);
    const estimatedBonusToday = completedQuestsBonus + streakBonusXof;

    return {
      dailyQuests,
      activeBonusZones: ACTIVE_BONUS_ZONES.filter(
        (z) => new Date(z.activeUntil) > new Date(),
      ),
      streakDays: streak,
      streakBonusXof,
      estimatedBonusToday,
    };
  }

  /**
   * Applique le multiplicateur de zone bonus au payout chauffeur.
   * Appelé lors du calcul de tarif pour une zone active.
   */
  getBonusMultiplierForZone(districtProfile: string, city: string): number {
    const activeZone = ACTIVE_BONUS_ZONES.find(
      (z) =>
        z.districtProfile === districtProfile &&
        z.city === city &&
        new Date(z.activeUntil) > new Date(),
    );
    return activeZone?.multiplier ?? 1.0;
  }

  private async computeStreak(driverProfileId: string): Promise<number> {
    // Récupère les 30 derniers jours avec au moins 1 course
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60_000);

    const tripsPerDay = await this.prisma.trip.groupBy({
      by: ['completedAt'],
      where: {
        driverId: driverProfileId,
        status: 'COMPLETED',
        completedAt: { gte: thirtyDaysAgo },
      },
      _count: true,
    });

    if (tripsPerDay.length === 0) return 0;

    // Identifier les jours uniques avec courses
    const activeDays = new Set(
      tripsPerDay
        .filter((r) => r.completedAt && r._count > 0)
        .map((r) => {
          const d = new Date(r.completedAt!);
          return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
        }),
    );

    // Compter les jours consécutifs depuis hier
    let streak = 0;
    const today = new Date();
    for (let i = 1; i <= 30; i++) {
      const d = new Date(today.getTime() - i * 24 * 60 * 60_000);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (activeDays.has(key)) {
        streak++;
      } else {
        break;
      }
    }

    return streak;
  }
}
