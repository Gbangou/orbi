import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, SafeAreaView, ScrollView, Text, View, StyleSheet } from 'react-native';
import {
  preventScreenCaptureAsync,
  allowScreenCaptureAsync,
} from 'expo-screen-capture';
import {
  fetchDriverEarnings,
  fetchDriverProfile,
  fetchMyTrips,
  type DriverEarningsResponse,
  type MyTripsResponse,
} from '@orbi/api';
import { formatOperationalStatus, orbiTheme } from '@orbi/ui';
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
} from '../../lib/driver-earnings-signal';
import { useLiveRefresh } from '../../lib/use-live-refresh';

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

const DRIVER_MILESTONES = [
  { trips: 10, badge: 'Debutant', emoji: '🌱' },
  { trips: 50, badge: 'Confirme', emoji: '⭐' },
  { trips: 200, badge: 'Expert', emoji: '🏆' },
] as const;

function DriverMilestoneCard({ completedTrips }: { completedTrips: number }) {
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
                <Text style={milestoneStyles.earnedBadgeText}>{m.emoji} {m.badge}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
      {next ? (
        <>
          <Text style={milestoneStyles.nextLabel}>
            {next.emoji} {next.badge} — encore {next.trips - completedTrips} course(s)
          </Text>
          <View style={milestoneStyles.progressTrack}>
            <View style={[milestoneStyles.progressFill, { width: `${progress}%` as `${number}%` }]} />
          </View>
          <Text style={milestoneStyles.progressMeta}>{completedTrips} / {next.trips} courses</Text>
        </>
      ) : (
        <Text style={milestoneStyles.nextLabel}>🎉 Niveau maximum — vous êtes un Expert Orbi !</Text>
      )}
    </View>
  );
}

const milestoneStyles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(251,191,36,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.2)',
    borderRadius: 16,
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
    letterSpacing: 1,
    color: orbiTheme.colors.amber,
  },
  badgeRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  earnedBadge: {
    backgroundColor: 'rgba(251,191,36,0.14)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  earnedBadgeText: { fontSize: 12, fontWeight: '700', color: orbiTheme.colors.amber },
  nextLabel: { fontSize: 13, color: orbiTheme.colors.text, fontWeight: '600' },
  progressTrack: {
    height: 6,
    borderRadius: 99,
    backgroundColor: 'rgba(251,191,36,0.12)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 99,
    backgroundColor: orbiTheme.colors.amber,
  },
  progressMeta: { fontSize: 11, color: orbiTheme.colors.muted, fontWeight: '600' },
});

export default function RevenusScreen() {
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
      setEarnings(earningsResponse);
      setHistory(historyResponse);
      setDriverProfileStatus(profileResponse.profile.status);
      const flow = resolveDriverActiveFlow({
        history: historyResponse,
        offers: [],
        reservationNow: Date.now(),
        driverProfileStatus: profileResponse.profile.status,
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
    void preventScreenCaptureAsync();
    return () => {
      void allowScreenCaptureAsync();
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
        <Text style={styles.headerTitle}>Revenus</Text>
        {isRefreshing ? (
          <ActivityIndicator size="small" color={orbiTheme.colors.amber} />
        ) : null}
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => void loadEarnings()}
            tintColor={orbiTheme.colors.amber}
            colors={[orbiTheme.colors.amber]}
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
            <Text style={styles.metricLabel}>Semaine</Text>
            <Text style={styles.metricValue}>
              {formatDriverEarningsAmount(earnings.summary.week)}
            </Text>
            <Text style={styles.metricMeta}>
              {formatDriverEarningsCount(earnings.summary.completedTrips)} courses
            </Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Mois</Text>
            <Text style={styles.metricValue}>
              {formatDriverEarningsAmount(earnings.summary.month)}
            </Text>
            <Text style={styles.metricMeta}>vision long terme</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Moyenne</Text>
            <Text style={styles.metricValue}>
              {formatDriverEarningsAmount(earnings.summary.averagePayout)}
            </Text>
            <Text style={styles.metricMeta}>par course</Text>
          </View>
        </View>

        {/* Mini earnings chart — last 7 trips by payout */}
        {earnings.recentTrips.length > 0 ? (
          <View style={styles.chartCard}>
            <Text style={styles.sectionTitle}>Dernières courses</Text>
            <View style={styles.chartBars}>
              {(() => {
                const trips = earnings.recentTrips.slice(0, 7);
                const maxPayout = Math.max(...trips.map(t => t.payout), 1);
                return trips.map((trip, i) => {
                  const barH = Math.max(6, Math.round((trip.payout / maxPayout) * 60));
                  return (
                    <View key={trip.id} style={styles.chartBarWrap}>
                      <Text style={styles.chartBarValue}>
                        {Math.round(trip.payout / 1000)}k
                      </Text>
                      <View style={[styles.chartBar, { height: barH }]} />
                      <Text style={styles.chartBarLabel}>{i + 1}</Text>
                    </View>
                  );
                });
              })()}
            </View>
          </View>
        ) : null}

        {/* Milestone */}
        <DriverMilestoneCard completedTrips={earnings.summary.completedTrips} />

        {/* Settlement */}
        <View style={styles.settlementCard}>
          <Text style={styles.sectionTitle}>Controle payout</Text>
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
            {isRefreshing ? 'Actualisation...' : 'Actualiser les revenus'}
          </Text>
        </Pressable>

        {/* Recent trips */}
        <View style={styles.tripsSection}>
          <Text style={styles.sectionTitle}>Courses récentes</Text>
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

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: orbiTheme.colors.background },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: orbiTheme.colors.border,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    fontFamily: 'Raleway_800ExtraBold',
    color: orbiTheme.colors.text,
  },

  content: {
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 14,
  },

  // Hero
  heroCard: {
    backgroundColor: orbiTheme.colors.amber + '0D',
    borderWidth: 1.5,
    borderColor: orbiTheme.colors.amber + '44',
    borderRadius: 20,
    padding: 20,
    gap: 6,
  },
  heroEyebrow: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
    color: orbiTheme.colors.amber,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  heroAmount: {
    fontSize: 40,
    fontWeight: '800',
    fontFamily: 'Raleway_800ExtraBold',
    color: orbiTheme.colors.text,
    letterSpacing: -1,
  },
  heroMeta: {
    fontSize: 13,
    color: orbiTheme.colors.textSoft,
    fontFamily: 'Inter_400Regular',
  },
  heroStatusText: {
    fontSize: 12,
    color: orbiTheme.colors.textSoft,
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
    color: orbiTheme.colors.sky,
  },
  transitionBadgeDanger: { backgroundColor: 'rgba(255,59,48,0.08)' },
  transitionBadgeDangerText: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
    color: orbiTheme.colors.danger,
  },

  // Metrics
  metricsRow: { flexDirection: 'row', gap: 10 },
  metricCard: {
    flex: 1,
    backgroundColor: orbiTheme.colors.backgroundAlt,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: orbiTheme.colors.border,
    padding: 14,
    gap: 2,
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
    color: orbiTheme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  metricValue: {
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
    color: orbiTheme.colors.amber,
  },
  metricMeta: {
    fontSize: 10,
    color: orbiTheme.colors.textMuted,
    fontFamily: 'Inter_400Regular',
  },

  // Settlement
  settlementCard: {
    backgroundColor: orbiTheme.colors.backgroundAlt,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: orbiTheme.colors.border,
    padding: 16,
    gap: 10,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
    color: orbiTheme.colors.text,
  },
  settlementRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: orbiTheme.colors.border,
  },
  settlementKey: {
    fontSize: 13,
    color: orbiTheme.colors.textSoft,
    fontFamily: 'Inter_400Regular',
  },
  settlementVal: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
    color: orbiTheme.colors.text,
  },
  settlementNote: {
    fontSize: 12,
    color: orbiTheme.colors.textMuted,
    fontFamily: 'Inter_400Regular',
    lineHeight: 18,
  },

  // Trips
  tripsSection: { gap: 8 },
  emptyCard: {
    backgroundColor: orbiTheme.colors.backgroundAlt,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: orbiTheme.colors.border,
    padding: 18,
    gap: 4,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
    color: orbiTheme.colors.text,
  },
  emptyMeta: {
    fontSize: 13,
    color: orbiTheme.colors.textMuted,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
  },
  tripRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: orbiTheme.colors.border,
  },
  tripRowFresh: {
    backgroundColor: orbiTheme.colors.accentLight,
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
    color: orbiTheme.colors.teal,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  tripRoute: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
    color: orbiTheme.colors.text,
  },
  tripDate: {
    fontSize: 12,
    color: orbiTheme.colors.textMuted,
    fontFamily: 'Inter_400Regular',
  },
  tripPayout: {
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
    color: orbiTheme.colors.amber,
  },

  // Earnings chart
  chartCard: {
    backgroundColor: orbiTheme.colors.backgroundAlt,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: orbiTheme.colors.border,
    padding: 16,
    gap: 12,
  },
  chartBars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
    height: 80,
  },
  chartBarWrap: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  chartBar: {
    width: '100%',
    borderRadius: 4,
    backgroundColor: orbiTheme.colors.amber,
  },
  chartBarValue: {
    fontSize: 9,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
    color: orbiTheme.colors.textMuted,
  },
  chartBarLabel: {
    fontSize: 9,
    color: orbiTheme.colors.textMuted,
    fontFamily: 'Inter_400Regular',
  },

  // Refresh button
  refreshBtn: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: orbiTheme.colors.backgroundAlt,
    borderWidth: 1,
    borderColor: orbiTheme.colors.border,
  },
  refreshBtnDisabled: { opacity: 0.65 },
  refreshBtnLabel: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
    color: orbiTheme.colors.text,
  },

  // Legacy stubs
  screen: { gap: 14 },
  title: { fontSize: 32, fontWeight: '800', color: orbiTheme.colors.text },
  body: { color: orbiTheme.colors.muted },
  heroCardHighlight: { borderColor: orbiTheme.colors.teal },
  heroTopRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  heroHeading: { flex: 1, gap: 6 },
  heroLabel: { color: orbiTheme.colors.muted, fontSize: 12 },
  heroValue: { color: orbiTheme.colors.amber, fontSize: 36, fontWeight: '800' },
  transitionMeta: { color: orbiTheme.colors.sky, fontWeight: '700' },
  activeRouteMeta: { color: orbiTheme.colors.text, fontWeight: '700' },
  warningMeta: { color: orbiTheme.colors.amber },
  heroMetrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  refreshButton: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: orbiTheme.colors.backgroundAlt,
    borderWidth: 1,
    borderColor: orbiTheme.colors.border,
  },
  refreshButtonDisabled: { opacity: 0.65 },
  refreshButtonLabel: { color: orbiTheme.colors.text, fontWeight: '700', fontSize: 13 },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  settlementGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  card: {
    flexGrow: 1,
    minWidth: 150,
    backgroundColor: orbiTheme.colors.panel,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: orbiTheme.colors.border,
    padding: 18,
    gap: 6,
  },
  label: { color: orbiTheme.colors.muted },
  value: { color: orbiTheme.colors.amber, fontSize: 24, fontWeight: '800' },
  meta: { color: orbiTheme.colors.muted, fontWeight: '600' },
  tripCard: {
    backgroundColor: orbiTheme.colors.backgroundAlt,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: orbiTheme.colors.border,
    padding: 18,
    gap: 8,
  },
  tripCardFresh: { borderColor: orbiTheme.colors.teal, backgroundColor: orbiTheme.colors.accentLight },
  tripBadge: { alignSelf: 'flex-start', color: orbiTheme.colors.sky, fontWeight: '800', fontSize: 11 },
  tripHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  tripCardRoute: { flex: 1, color: orbiTheme.colors.text, fontWeight: '700', fontSize: 16 },
  tripCardPayout: { color: orbiTheme.colors.amber, fontWeight: '800', fontSize: 18 },
  tripCardDate: { color: orbiTheme.colors.textSoft, fontSize: 12 },
});
