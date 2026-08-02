import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, RefreshControl, SafeAreaView, ScrollView, Text, View, StyleSheet } from 'react-native';
import { preventSensitiveScreenCapture, restoreSensitiveScreenCapture } from '../../lib/privacy/screen-capture';
import {
  fetchDriverEarnings,
  fetchDriverProfile,
  fetchMyTrips,
  type DriverEarningsResponse,
  type MyTripsResponse,
} from '@orbi/api';
import { formatOperationalStatus, type OrbiTheme } from '@orbi/ui';
import {
  OrbiButton,
  OrbiMetricTile,
  OrbiStatusBanner,
  OrbiSurface,
  useOrbiTheme,
} from '@orbi/ui/native';
import { restoreDriverSession } from '../../lib/auth';
import { resolveDriverAppError } from '../../lib/session-feedback';
import { OrbiLogo } from '../../lib/orbi-logo';
import {
  buildDriverEarningsStatusLabel,
  resolveDriverActiveFlow,
} from '../../lib/driver-active-flow';
import {
  buildDriverEarningsTrustSummary,
  buildDriverDailyOperatingCompass,
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
    payoutRateBps: 0,
    payoutRate: 0,
    payoutRateMin: 0,
    payoutRateMax: 0,
    recentTripCount: 0,
    recentGrossFare: 0,
    recentNetPayout: 0,
    recentPlatformFee: 0,
    state: 'RECONCILED',
    anomalies: [],
    calculatedAt: new Date('2026-04-19T00:00:00.000Z').toISOString(),
  },
  adjustments: {
    currency: 'XOF',
    cancellationCompensationToday: 0,
    cancellationCompensationWeek: 0,
    cancellationCompensationMonth: 0,
    recent: [],
  },
  recentTrips: [],
};

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

function DriverOperatingCompassCard({
  earnings,
}: {
  earnings: DriverEarningsResponse;
}) {
  const theme = useOrbiTheme();
  const styles = useMemo(() => makeCompassStyles(theme), [theme]);
  const compass = useMemo(
    () => buildDriverDailyOperatingCompass(earnings),
    [earnings],
  );

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>Boussole économique</Text>
          <Text style={styles.title}>{compass.headline}</Text>
        </View>
        <View style={styles.progressBadge}>
          <Text style={styles.progressText}>{compass.progressPercent}%</Text>
        </View>
      </View>
      <View style={styles.progressTrack}>
        <View
          style={[
            styles.progressFill,
            { width: `${compass.progressPercent}%` as `${number}%` },
          ]}
        />
      </View>
      <Text style={styles.actionText}>{compass.primaryAction}</Text>
      <View style={styles.indicatorGrid}>
        {compass.indicators.map((indicator) => (
          <View key={indicator.label} style={styles.indicator}>
            <Text style={styles.indicatorLabel}>{indicator.label}</Text>
            <Text style={styles.indicatorValue} numberOfLines={1}>
              {indicator.value}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const makeCompassStyles = (theme: OrbiTheme) => StyleSheet.create({
  card: {
    backgroundColor: '#071311',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(0,201,167,0.26)',
    padding: 16,
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    fontFamily: 'Inter_700Bold',
    color: theme.colors.teal,
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    fontFamily: 'Raleway_800ExtraBold',
    color: '#FFFFFF',
  },
  progressBadge: {
    minWidth: 54,
    borderRadius: 999,
    backgroundColor: 'rgba(0,201,167,0.14)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignItems: 'center',
  },
  progressText: {
    color: theme.colors.teal,
    fontSize: 13,
    fontWeight: '800',
    fontFamily: 'Inter_700Bold',
  },
  progressTrack: {
    height: 7,
    borderRadius: 99,
    backgroundColor: 'rgba(255,255,255,0.10)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 99,
    backgroundColor: theme.colors.teal,
  },
  actionText: {
    color: '#D8E7E2',
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'Inter_400Regular',
  },
  indicatorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  indicator: {
    width: '48%',
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.07)',
    padding: 10,
    gap: 2,
  },
  indicatorLabel: {
    color: '#9FB2AC',
    fontSize: 11,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
  },
  indicatorValue: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    fontFamily: 'Inter_700Bold',
  },
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
        </View>

        {flow.operationalStatus === 'SUSPENDED' ? (
          <OrbiStatusBanner
            title="Compte suspendu"
            message="Historique et revenus restent consultables pendant la revue."
            tone="danger"
          />
        ) : null}

        {/* Metrics row */}
        <View style={styles.metricsRow}>
          <OrbiMetricTile
            style={styles.metricTile}
            tone="amber"
            label={td('earningsWeek')}
            value={formatDriverEarningsAmount(earnings.summary.week)}
            helper={`${formatDriverEarningsCount(earnings.summary.completedTrips)} courses`}
          />
          <OrbiMetricTile
            style={styles.metricTile}
            tone="amber"
            label={td('earningsMonth')}
            value={formatDriverEarningsAmount(earnings.summary.month)}
            helper="vision long terme"
          />
          <OrbiMetricTile
            style={styles.metricTile}
            tone="amber"
            label={td('earningsAverage')}
            value={formatDriverEarningsAmount(earnings.summary.averagePayout)}
            helper="par course"
          />
        </View>

        {/* Graphique hebdomadaire — gains par jour (7 derniers jours) */}
        <WeeklyEarningsChart recentTrips={earnings.recentTrips} />

        <DriverOperatingCompassCard earnings={earnings} />

        {/* Settlement */}
        <OrbiSurface style={styles.settlementCard}>
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
        </OrbiSurface>

        {earnings.adjustments?.recent.length ? (
          <OrbiSurface tone="teal" style={styles.adjustmentsCard}>
            <View style={styles.adjustmentsHeader}>
              <View>
                <Text style={styles.sectionTitle}>Ajustements justes</Text>
                <Text style={styles.adjustmentsMeta}>
                  Indemnités d'annulation créditées
                </Text>
              </View>
              <Text style={styles.adjustmentsAmount}>
                +{formatDriverEarningsAmount(
                  earnings.adjustments.cancellationCompensationWeek,
                )}
              </Text>
            </View>
            {earnings.adjustments.recent.map((adjustment) => (
              <View key={adjustment.id} style={styles.adjustmentRow}>
                <View style={styles.tripLeft}>
                  <Text style={styles.tripRoute} numberOfLines={1}>
                    Indemnisation annulation
                  </Text>
                  <Text style={styles.tripDate}>
                    {formatDriverTripCompletedAt(adjustment.createdAt)}
                  </Text>
                </View>
                <Text style={styles.tripPayout}>
                  +{formatDriverEarningsAmount(adjustment.amount)}
                </Text>
              </View>
            ))}
          </OrbiSurface>
        ) : null}

        {/* Refresh button — accessible for tests */}
        <OrbiButton
          label={isRefreshing ? td('refreshing') : td('refresh')}
          onPress={() => void loadEarnings()}
          disabled={isRefreshing}
          loading={isRefreshing}
          variant="secondary"
          tone="amber"
          style={styles.refreshBtn}
        />

        {/* Recent trips */}
        <View style={styles.tripsSection}>
          <Text style={styles.sectionTitle}>{td('recentTrips')}</Text>
          {earnings.recentTrips.length === 0 ? (
            <OrbiSurface style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>Aucune course comptabilisée</Text>
              <Text style={styles.emptyMeta}>
                Passez en ligne et acceptez vos premières offres.
              </Text>
            </OrbiSurface>
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
  safe: { flex: 1, backgroundColor: '#FFFFFF' },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E8E8E8',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    fontFamily: 'Raleway_800ExtraBold',
    color: '#111111',
  },

  content: {
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 14,
  },

  // Hero
  heroCard: {
    backgroundColor: '#111111',
    borderWidth: 1.5,
    borderColor: '#111111',
    borderRadius: 4,
    padding: 20,
    gap: 6,
  },
  heroEyebrow: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
    color: '#FFFFFF',
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
    color: '#D8D8D8',
    fontFamily: 'Inter_400Regular',
  },
  heroStatusText: {
    fontSize: 12,
    color: '#D8D8D8',
    fontFamily: 'Inter_400Regular',
    lineHeight: 17,
  },
  transitionBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0,122,255,0.10)',
    borderRadius: 4,
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
  // Metrics
  metricsRow: { flexDirection: 'row', gap: 10 },
  metricTile: { flex: 1 },

  // Payout date banner — Bolt-style
  payoutDateBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F7F7F7',
    borderRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#E8E8E8',
  },
  payoutDateLeft: {
    gap: 2,
    flex: 1,
  },
  payoutDateLabel: {
    fontSize: 11,
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
    color: '#111111',
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  payoutDateValue: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
    color: '#111111',
    textTransform: 'capitalize',
  },
  payoutDateBadge: {
    backgroundColor: '#111111',
    borderRadius: 4,
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
    backgroundColor: '#F7F7F7',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#E8E8E8',
    padding: 16,
    gap: 10,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
    color: '#111111',
  },
  settlementRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#E8E8E8',
  },
  settlementKey: {
    fontSize: 13,
    color: '#525252',
    fontFamily: 'Inter_400Regular',
  },
  settlementVal: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
    color: '#111111',
  },
  settlementNote: {
    fontSize: 12,
    color: '#6B6B6B',
    fontFamily: 'Inter_400Regular',
    lineHeight: 18,
  },

  adjustmentsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#E8E8E8',
    padding: 16,
    gap: 10,
  },
  adjustmentsHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  adjustmentsMeta: {
    fontSize: 12,
    color: theme.colors.textMuted,
    fontFamily: 'Inter_400Regular',
    marginTop: 2,
  },
  adjustmentsAmount: {
    fontSize: 16,
    fontWeight: '800',
    fontFamily: 'Inter_700Bold',
    color: theme.colors.teal,
  },
  adjustmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
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
    paddingHorizontal: 18,
  },
});
