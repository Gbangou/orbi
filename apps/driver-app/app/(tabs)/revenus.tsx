import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, SafeAreaView, ScrollView, Text, View, StyleSheet } from 'react-native';
import { preventSensitiveScreenCapture, restoreSensitiveScreenCapture } from '../../lib/privacy/screen-capture';
import {
  fetchDriverEarnings,
  fetchDriverProfile,
  fetchMyTrips,
  type DriverEarningsResponse,
  type MyTripsResponse,
} from '@orbi/api';
import { formatOperationalStatus, type OrbiTheme } from '@orbi/ui';
import { useOrbiTheme } from '@orbi/ui/native';
import { restoreDriverSession } from '../../lib/auth';
import { resolveDriverAppError } from '../../lib/session-feedback';
import { OrbiLogo } from '../../lib/orbi-logo';
import {
  buildDriverEarningsStatusLabel,
  resolveDriverActiveFlow,
} from '../../lib/driver-active-flow';
import {
  buildDriverEarningsTrustSummary,
  buildDriverEarningsDeltaLabel,
  formatDriverEarningsAmount,
  formatDriverEarningsCount,
  formatDriverTripCompletedAt,
  toFiniteEarningsNumber,
} from '../../lib/driver-earnings-signal';
import { useLiveRefresh } from '../../lib/use-live-refresh';
import { useTranslation } from '../../lib/i18n';
import { normalizeDriverProfileResponse } from '../../lib/driver-profile-normalizer';

const fallbackEarnings: DriverEarningsResponse = {
  summary: {
    currency: 'XOF',
    today: 0,
    week: 0,
    month: 0,
    completedTrips: 0,
    averagePayout: 0,
  },
  settlement: {
    currency: 'XOF',
    source: 'COMPLETED_TRIPS',
    payoutRateBps: 8200,
    payoutRate: 0.82,
    recentTripCount: 0,
    recentGrossFare: 0,
    recentNetPayout: 0,
    recentPlatformFee: 0,
    state: 'RECONCILED',
    anomalies: [],
    calculatedAt: new Date('2026-04-19T00:00:00.000Z').toISOString(),
  },
  recentTrips: [],
};

const touchHitSlop = { top: 8, right: 8, bottom: 8, left: 8 };

// ── Graphique hebdomadaire — gains par jour ───────────────────────────────────

const DAY_LABELS_FR = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

function WeeklyEarningsChart({
  recentTrips,
}: {
  recentTrips: DriverEarningsResponse['recentTrips'];
}) {
  const theme = useOrbiTheme();
  const weeklyStyles = useMemo(() => makeWeeklyStyles(theme), [theme]);
  // Group trips by day of week for the last 7 days
  const today = new Date();
  const dayBuckets: { label: string; total: number; dayIndex: number }[] = [];

  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    dayBuckets.push({
      label: i === 0 ? 'Auj.' : DAY_LABELS_FR[d.getDay()],
      total: 0,
      dayIndex: d.getDay(),
    });
  }

  for (const trip of recentTrips) {
    const completedAt = trip.completedAt ? new Date(trip.completedAt) : null;
    if (!completedAt) continue;
    const diffDays = Math.floor(
      (today.getTime() - completedAt.getTime()) / (1000 * 60 * 60 * 24),
    );
    if (diffDays >= 0 && diffDays <= 6) {
      const bucketIndex = 6 - diffDays;
      if (dayBuckets[bucketIndex]) {
        dayBuckets[bucketIndex].total += toFiniteEarningsNumber(trip.payout) ?? 0;
      }
    }
  }

  const maxTotal = Math.max(...dayBuckets.map((b) => b.total), 1);
  const hasData = dayBuckets.some((b) => b.total > 0);
  const todayIndex = 6;

  if (!hasData) return null;

  return (
    <View style={weeklyStyles.card}>
      <Text style={weeklyStyles.title}>Gains — 7 j</Text>
      <View style={weeklyStyles.bars}>
        {dayBuckets.map((bucket, i) => {
          const barH = Math.max(4, Math.round((bucket.total / maxTotal) * 72));
          const isToday = i === todayIndex;
          return (
            <View key={i} style={weeklyStyles.barWrap}>
              {bucket.total > 0 ? (
                <Text style={weeklyStyles.barValue}>
                  {bucket.total >= 1000
                    ? `${Math.round(bucket.total / 1000)}k`
                    : String(Math.round(bucket.total))}
                </Text>
              ) : null}
              <View
                style={[
                  weeklyStyles.bar,
                  { height: barH },
                  isToday && weeklyStyles.barToday,
                  bucket.total === 0 && weeklyStyles.barEmpty,
                ]}
              />
              <Text style={[weeklyStyles.dayLabel, isToday && weeklyStyles.dayLabelToday]}>
                {bucket.label}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const makeWeeklyStyles = (theme: OrbiTheme) => StyleSheet.create({
  card: {
    backgroundColor: theme.colors.backgroundAlt,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 16,
    gap: 12,
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  bars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 96,
    gap: 4,
  },
  barWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
  },
  bar: {
    width: '80%',
    borderRadius: 4,
    backgroundColor: theme.colors.amber,
    opacity: 0.55,
  },
  barToday: { opacity: 1 },
  barEmpty: { backgroundColor: theme.colors.backgroundDim, opacity: 1 },
  barValue: {
    fontSize: 9,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
    color: theme.colors.amber,
  },
  dayLabel: {
    fontSize: 10,
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
    color: theme.colors.textMuted,
  },
  dayLabelToday: { color: theme.colors.text, fontWeight: '800' },
});

const DRIVER_MILESTONES = [
  { trips: 10, badge: 'Debutant', level: 'L1' },
  { trips: 50, badge: 'Confirme', level: 'L2' },
  { trips: 200, badge: 'Expert', level: 'L3' },
] as const;

// ── Incentives card — objectifs quotidiens Bolt-style ─────────────────────────

type DailyQuest = {
  questId: string;
  title: string;
  description: string;
  targetTrips: number;
  completedTrips: number;
  bonusXof: number;
  progressPercent: number;
  isCompleted: boolean;
};

function DriverIncentivesCard({
  quests,
  streakDays,
  streakBonusXof,
}: {
  quests: DailyQuest[];
  streakDays: number;
  streakBonusXof: number;
}) {
  const theme = useOrbiTheme();
  const incentStyles = useMemo(() => makeIncentStyles(theme), [theme]);
  return (
    <View style={incentStyles.card}>
      <View style={incentStyles.header}>
        <Text style={incentStyles.title}>Objectifs du jour</Text>
        {streakDays > 0 ? (
          <View style={incentStyles.streakBadge}>
            <Text style={incentStyles.streakText}>{streakDays} j</Text>
          </View>
        ) : null}
      </View>
      {quests.map((quest) => (
        <View key={quest.questId} style={incentStyles.quest}>
          <View style={incentStyles.questHeader}>
            <Text style={[incentStyles.questTitle, quest.isCompleted && incentStyles.questTitleDone]}>
              {quest.isCompleted ? 'Termine - ' : ''}{quest.title}
            </Text>
            <Text style={[incentStyles.questBonus, quest.isCompleted && { color: theme.colors.teal }]}>
              +{formatDriverEarningsAmount(quest.bonusXof)}
            </Text>
          </View>
          <View style={incentStyles.progressTrack}>
            <View style={[
              incentStyles.progressFill,
              {
                width: `${quest.progressPercent}%` as `${number}%`,
                backgroundColor: quest.isCompleted ? theme.colors.teal : theme.colors.amber,
              },
            ]} />
          </View>
          <Text style={incentStyles.progressMeta}>
            {quest.completedTrips}/{quest.targetTrips} courses
          </Text>
        </View>
      ))}
      {streakBonusXof > 0 ? (
        <View style={incentStyles.streakBonus}>
          <Text style={incentStyles.streakBonusText}>
            Bonus régularité {streakDays} jours : +{formatDriverEarningsAmount(streakBonusXof)}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const makeIncentStyles = (theme: OrbiTheme) => StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 16,
    gap: 12,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 15, fontWeight: '700', fontFamily: 'Inter_700Bold', color: theme.colors.text },
  streakBadge: { backgroundColor: theme.colors.backgroundAlt, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  streakText: { fontSize: 12, fontWeight: '700', fontFamily: 'Inter_700Bold', color: theme.colors.amber },
  quest: { gap: 6 },
  questHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  questTitle: { fontSize: 13, fontWeight: '600', fontFamily: 'Inter_600SemiBold', color: theme.colors.text, flex: 1 },
  questTitleDone: { color: theme.colors.teal },
  questBonus: { fontSize: 13, fontWeight: '700', fontFamily: 'Inter_700Bold', color: theme.colors.amber },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: 'rgba(0,0,0,0.07)', overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  progressMeta: { fontSize: 11, color: theme.colors.textMuted, fontFamily: 'Inter_400Regular' },
  streakBonus: { backgroundColor: 'rgba(0,201,167,0.08)', borderRadius: 10, padding: 10 },
  streakBonusText: { fontSize: 12, fontWeight: '600', fontFamily: 'Inter_600SemiBold', color: theme.colors.teal },
});

// ── Driver milestone (existing) ───────────────────────────────────────────────

function DriverMilestoneCard({ completedTrips }: { completedTrips: number }) {
  const theme = useOrbiTheme();
  const milestoneStyles = useMemo(() => makeMilestoneStyles(theme), [theme]);
  const earned = DRIVER_MILESTONES.filter((m) => completedTrips >= m.trips);
  const next = DRIVER_MILESTONES.find((m) => completedTrips < m.trips);
  const progress = next
    ? Math.min(Math.round((completedTrips / next.trips) * 100), 100)
    : 100;

  return (
    <View style={milestoneStyles.card}>
      <View style={milestoneStyles.header}>
        <Text style={milestoneStyles.eyebrow}>Niveau chauffeur</Text>
        {earned.length > 0 ? (
          <View style={milestoneStyles.badgeRow}>
            {earned.map((m) => (
              <View key={m.badge} style={milestoneStyles.earnedBadge}>
                <Text style={milestoneStyles.earnedBadgeText}>{m.level} {m.badge}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
      {next ? (
        <>
          <Text style={milestoneStyles.nextLabel}>
            {next.level} {next.badge} - encore {next.trips - completedTrips} course(s)
          </Text>
          <View style={milestoneStyles.progressTrack}>
            <View style={[milestoneStyles.progressFill, { width: `${progress}%` as `${number}%` }]} />
          </View>
          <Text style={milestoneStyles.progressMeta}>{completedTrips} / {next.trips} courses</Text>
        </>
      ) : (
        <Text style={milestoneStyles.nextLabel}>Niveau maximum - vous etes un Expert Orbi.</Text>
      )}
    </View>
  );
}

const makeMilestoneStyles = (theme: OrbiTheme) => StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 14,
    padding: 16,
    gap: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0,
    color: theme.colors.amber,
  },
  badgeRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  earnedBadge: {
    backgroundColor: 'rgba(251,191,36,0.14)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  earnedBadgeText: { fontSize: 12, fontWeight: '700', color: theme.colors.amber },
  nextLabel: { fontSize: 13, color: theme.colors.text, fontWeight: '600' },
  progressTrack: {
    height: 6,
    borderRadius: 99,
    backgroundColor: 'rgba(251,191,36,0.12)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 99,
    backgroundColor: theme.colors.amber,
  },
  progressMeta: { fontSize: 11, color: theme.colors.muted, fontWeight: '600' },
});

export default function RevenusScreen() {
  const theme = useOrbiTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { t } = useTranslation();
  const td = (key: string, opts?: Record<string, unknown>): string => String(t(`driver.${key}`, opts as never));
  const [earnings, setEarnings] = useState<DriverEarningsResponse>(fallbackEarnings);
  const [history, setHistory] = useState<MyTripsResponse | null>(null);
  const [driverProfileStatus, setDriverProfileStatus] = useState('OFFLINE');
  const [status, setStatus] = useState('Chargement des revenus...');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [earningsTransitionLabel, setEarningsTransitionLabel] = useState<string | null>(null);
  const [freshTripIds, setFreshTripIds] = useState<string[]>([]);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [incentives, setIncentives] = useState<{
    dailyQuests: DailyQuest[];
    streakDays: number;
    streakBonusXof: number;
  } | null>(null);
  const previousSummaryRef = useRef<DriverEarningsResponse['summary'] | null>(null);
  const previousTripIdsRef = useRef<string[] | null>(null);

  const loadEarnings = useCallback(async (silent = false) => {
    if (!silent) {
      setIsRefreshing(true);
    }

    try {
      const { authClient, session } = await restoreDriverSession();
      setSessionToken(session.sessionToken);
      const [earningsResponse, historyResponse, profileResponse] = await Promise.all([
        fetchDriverEarnings(authClient),
        fetchMyTrips(authClient),
        fetchDriverProfile(authClient),
      ]);
      const normalizedProfile = normalizeDriverProfileResponse(profileResponse);
      // Charger les incentives (best-effort, jamais bloquant)
      void (async () => {
        try {
          if (typeof (authClient as { request?: unknown }).request === 'function') {
            const data = await (authClient as { request: <T>(path: string) => Promise<T> })
              .request<{ dailyQuests: DailyQuest[]; streakDays: number; streakBonusXof: number }>(
              '/drivers/me/incentives',
            );
            setIncentives(data);
          }
        } catch { /* non bloquant — incentives sont optionnels */ }
      })();
      setEarnings(earningsResponse);
      setHistory(historyResponse);
      setDriverProfileStatus(normalizedProfile.profile.status);
      const flow = resolveDriverActiveFlow({
        history: historyResponse,
        offers: [],
        reservationNow: Date.now(),
        driverProfileStatus: normalizedProfile.profile.status,
      });
      setStatus(buildDriverEarningsStatusLabel({ flow }));
    } catch (error) {
      const feedback = await resolveDriverAppError(error, {
        network: 'Vue locale vide en attendant la connexion API.',
        fallback: 'Vue locale vide en attendant la connexion API.',
      });

      if (feedback.shouldClearSessionToken) {
        setSessionToken(null);
      }

      if (!silent) {
        setStatus(feedback.message);
      }
    } finally {
      if (!silent) {
        setIsRefreshing(false);
      }
    }
  }, []);

  useLiveRefresh(() => loadEarnings(true), 30000);

  useEffect(() => {
    preventSensitiveScreenCapture();
    return () => {
      restoreSensitiveScreenCapture();
    };
  }, []);

  useEffect(() => {
    const previousSummary = previousSummaryRef.current;

    if (previousSummary) {
      const deltaLabel = buildDriverEarningsDeltaLabel(
        previousSummary.today,
        earnings.summary.today,
      );

      if (deltaLabel) {
        setEarningsTransitionLabel(deltaLabel);
      } else if (earnings.summary.completedTrips > previousSummary.completedTrips) {
        setEarningsTransitionLabel('Une course supplementaire vient d etre cloturee.');
      } else if (earnings.summary.week !== previousSummary.week) {
        setEarningsTransitionLabel('Le recap hebdomadaire a ete resynchronise.');
      }
    }

    previousSummaryRef.current = earnings.summary;
  }, [earnings.summary]);

  useEffect(() => {
    const previousTripIds = previousTripIdsRef.current;
    const nextTripIds = earnings.recentTrips.map((trip) => trip.id);

    if (previousTripIds) {
      const nextFreshTripIds = nextTripIds.filter((tripId) => !previousTripIds.includes(tripId));

      if (nextFreshTripIds.length > 0) {
        setFreshTripIds(nextFreshTripIds);
      }
    }

    previousTripIdsRef.current = nextTripIds;
  }, [earnings.recentTrips]);

  useEffect(() => {
    if (!earningsTransitionLabel) {
      return;
    }

    const timeout = setTimeout(() => {
      setEarningsTransitionLabel(null);
    }, 5000);

    return () => clearTimeout(timeout);
  }, [earningsTransitionLabel]);

  useEffect(() => {
    if (!freshTripIds.length) {
      return;
    }

    const timeout = setTimeout(() => {
      setFreshTripIds([]);
    }, 5000);

    return () => clearTimeout(timeout);
  }, [freshTripIds]);

  const flow = resolveDriverActiveFlow({
    history,
    offers: [],
    reservationNow: 0,
    driverProfileStatus,
  });
  const earningsTrustSummary = buildDriverEarningsTrustSummary(earnings);

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{td("earnings")}</Text>
        {isRefreshing ? (
          <ActivityIndicator size="small" color={theme.colors.amber} />
        ) : null}
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => void loadEarnings()}
            tintColor={theme.colors.amber}
            colors={[theme.colors.amber]}
          />
        }
      >
        {/* Hero — cap du jour */}
        <View style={styles.heroCard}>
          <Text style={styles.heroEyebrow}>Cap du jour</Text>
          <Text style={styles.heroAmount}>
            {formatDriverEarningsAmount(earnings.summary.today)}
          </Text>
          <Text style={styles.heroMeta}>
            {formatDriverEarningsCount(earnings.summary.completedTrips)} course(s)
            {flow.primaryStatusLabel ? ` · ${flow.primaryStatusLabel}` : ''}
          </Text>
          {status && !status.includes('Chargement') ? (
            <Text style={styles.heroStatusText}>{status}</Text>
          ) : null}
          {earningsTransitionLabel ? (
            <View style={styles.transitionBadge}>
              <Text style={styles.transitionBadgeText}>{earningsTransitionLabel}</Text>
            </View>
          ) : null}
          {flow.operationalStatus === 'SUSPENDED' ? (
            <View style={[styles.transitionBadge, styles.transitionBadgeDanger]}>
              <Text style={styles.transitionBadgeDangerText}>
                Compte suspendu — historique consultable
              </Text>
            </View>
          ) : null}
        </View>

        {/* Metrics row */}
        <View style={styles.metricsRow}>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>{td('earningsWeek')}</Text>
            <Text
              style={styles.metricValue}
              numberOfLines={1}
            >
              {formatDriverEarningsAmount(earnings.summary.week)}
            </Text>
            <Text style={styles.metricMeta}>
              {formatDriverEarningsCount(earnings.summary.completedTrips)} courses
            </Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>{td('earningsMonth')}</Text>
            <Text
              style={styles.metricValue}
              numberOfLines={1}
            >
              {formatDriverEarningsAmount(earnings.summary.month)}
            </Text>
            <Text style={styles.metricMeta}>vision long terme</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>{td('earningsAverage')}</Text>
            <Text
              style={styles.metricValue}
              numberOfLines={1}
            >
              {formatDriverEarningsAmount(earnings.summary.averagePayout)}
            </Text>
            <Text style={styles.metricMeta}>par course</Text>
          </View>
        </View>

        {/* Graphique hebdomadaire — gains par jour (7 derniers jours) */}
        <WeeklyEarningsChart recentTrips={earnings.recentTrips} />

        {/* Incentives — objectifs quotidiens */}
        {incentives && incentives.dailyQuests.length > 0 ? (
          <DriverIncentivesCard
            quests={incentives.dailyQuests}
            streakDays={incentives.streakDays}
            streakBonusXof={incentives.streakBonusXof}
          />
        ) : null}

        {/* Milestone card */}
        <DriverMilestoneCard completedTrips={earnings.summary.completedTrips} />

        {/* Settlement */}
        <View style={styles.settlementCard}>
          <Text style={styles.sectionTitle}>{td("payoutControl")}</Text>

          {/* Payout date — Bolt-style */}
          <View style={styles.payoutDateBanner}>
            <View style={styles.payoutDateLeft}>
              <Text style={styles.payoutDateLabel}>Prochain virement</Text>
              <Text style={styles.payoutDateValue}>
                {(() => {
                  const next = new Date();
                  next.setDate(next.getDate() + (7 - next.getDay()) % 7 || 7);
                  return next.toLocaleDateString('fr-BF', { weekday: 'long', day: 'numeric', month: 'long' });
                })()}
              </Text>
            </View>
            <View style={styles.payoutDateBadge}>
              <Text style={styles.payoutDateBadgeText}>Mobile Money</Text>
            </View>
          </View>

          <View style={styles.settlementRow}>
            <Text style={styles.settlementKey}>Statut</Text>
            <Text style={styles.settlementVal}>{earningsTrustSummary.settlementStateLabel}</Text>
          </View>
          <View style={styles.settlementRow}>
            <Text style={styles.settlementKey}>Part chauffeur</Text>
            <Text style={styles.settlementVal}>{earningsTrustSummary.payoutRateLabel}</Text>
          </View>
          <View style={styles.settlementRow}>
            <Text style={styles.settlementKey}>Net récent</Text>
            <Text style={styles.settlementVal}>{earningsTrustSummary.recentNetPayoutLabel}</Text>
          </View>
          <View style={styles.settlementRow}>
            <Text style={styles.settlementKey}>Plateforme estimee</Text>
            <Text style={styles.settlementVal}>{earningsTrustSummary.estimatedPlatformFeeLabel}</Text>
          </View>
          {earningsTrustSummary.note ? (
            <Text style={styles.settlementNote}>{earningsTrustSummary.note}</Text>
          ) : null}
        </View>

        {/* Refresh button — accessible for tests */}
        <Pressable
          onPress={() => void loadEarnings()}
          disabled={isRefreshing}
          style={[styles.refreshBtn, isRefreshing && styles.refreshBtnDisabled]}
        >
          <Text style={styles.refreshBtnLabel}>
            {isRefreshing ? td('refreshing') : td('refresh')}
          </Text>
        </Pressable>

        {/* Recent trips */}
        <View style={styles.tripsSection}>
          <Text style={styles.sectionTitle}>{td('recentTrips')}</Text>
          {earnings.recentTrips.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>Aucune course comptabilisée</Text>
              <Text style={styles.emptyMeta}>
                Passez en ligne et acceptez vos premières offres.
              </Text>
            </View>
          ) : (
            earnings.recentTrips.map((trip) => (
              <View
                key={trip.id}
                style={[
                  styles.tripRow,
                  freshTripIds.includes(trip.id) && styles.tripRowFresh,
                ]}
              >
                <View style={styles.tripLeft}>
                  {freshTripIds.includes(trip.id) ? (
                    <Text style={styles.tripFreshBadge}>Nouveau payout</Text>
                  ) : null}
                  <Text style={styles.tripRoute} numberOfLines={1}>
                    {trip.route}
                  </Text>
                  <Text style={styles.tripDate}>
                    {formatDriverTripCompletedAt(trip.completedAt)}
                  </Text>
                </View>
                <Text style={styles.tripPayout}>
                  {formatDriverEarningsAmount(trip.payout)}
                </Text>
              </View>
            ))
          )}
        </View>

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (theme: OrbiTheme) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.driverBackground },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    fontFamily: 'Raleway_800ExtraBold',
    color: theme.colors.text,
  },

  content: {
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 14,
  },

  // Hero
  heroCard: {
    backgroundColor: '#071311',
    borderWidth: 1.5,
    borderColor: 'rgba(242,169,0,0.35)',
    borderRadius: 16,
    padding: 20,
    gap: 6,
  },
  heroEyebrow: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
    color: theme.colors.amber,
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  heroAmount: {
    fontSize: 40,
    fontWeight: '800',
    fontFamily: 'Raleway_800ExtraBold',
    color: '#FFFFFF',
    letterSpacing: 0,
  },
  heroMeta: {
    fontSize: 13,
    color: '#C9D8D3',
    fontFamily: 'Inter_400Regular',
  },
  heroStatusText: {
    fontSize: 12,
    color: '#C9D8D3',
    fontFamily: 'Inter_400Regular',
    lineHeight: 17,
  },
  transitionBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0,122,255,0.10)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginTop: 4,
  },
  transitionBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
    color: theme.colors.sky,
  },
  transitionBadgeDanger: { backgroundColor: 'rgba(255,59,48,0.08)' },
  transitionBadgeDangerText: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
    color: theme.colors.danger,
  },

  // Metrics
  metricsRow: { flexDirection: 'row', gap: 10 },
  metricCard: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 14,
    gap: 2,
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  metricValue: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
    color: theme.colors.amber,
  },
  metricMeta: {
    fontSize: 10,
    color: theme.colors.textMuted,
    fontFamily: 'Inter_400Regular',
  },

  // Payout date banner — Bolt-style
  payoutDateBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.accentLight,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: theme.colors.teal + '33',
  },
  payoutDateLeft: {
    gap: 2,
    flex: 1,
  },
  payoutDateLabel: {
    fontSize: 11,
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
    color: theme.colors.teal,
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  payoutDateValue: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
    color: theme.colors.text,
    textTransform: 'capitalize',
  },
  payoutDateBadge: {
    backgroundColor: theme.colors.teal,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  payoutDateBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
    color: '#FFFFFF',
  },

  // Settlement
  settlementCard: {
    backgroundColor: theme.colors.backgroundAlt,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 16,
    gap: 10,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
    color: theme.colors.text,
  },
  settlementRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  settlementKey: {
    fontSize: 13,
    color: theme.colors.textSoft,
    fontFamily: 'Inter_400Regular',
  },
  settlementVal: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
    color: theme.colors.text,
  },
  settlementNote: {
    fontSize: 12,
    color: theme.colors.textMuted,
    fontFamily: 'Inter_400Regular',
    lineHeight: 18,
  },

  // Trips
  tripsSection: { gap: 8 },
  emptyCard: {
    backgroundColor: theme.colors.backgroundAlt,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 18,
    gap: 4,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
    color: theme.colors.text,
  },
  emptyMeta: {
    fontSize: 13,
    color: theme.colors.textMuted,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
  },
  tripRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  tripRowFresh: {
    backgroundColor: theme.colors.accentLight,
    borderRadius: 10,
    paddingHorizontal: 10,
    borderBottomWidth: 0,
    borderWidth: 1,
    borderColor: 'rgba(0,201,167,0.22)',
  },
  tripLeft: { flex: 1, gap: 2 },
  tripFreshBadge: {
    fontSize: 10,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
    color: theme.colors.teal,
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  tripRoute: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
    color: theme.colors.text,
  },
  tripDate: {
    fontSize: 12,
    color: theme.colors.textMuted,
    fontFamily: 'Inter_400Regular',
  },
  tripPayout: {
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
    color: theme.colors.amber,
  },

  // Refresh button
  refreshBtn: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: theme.colors.backgroundAlt,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  refreshBtnDisabled: { opacity: 0.65 },
  refreshBtnLabel: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
    color: theme.colors.text,
  },
});
