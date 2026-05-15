import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View, StyleSheet } from 'react-native';
import {
  fetchDriverEarnings,
  fetchDriverProfile,
  fetchMyTrips,
  type DriverEarningsResponse,
  type MyTripsResponse,
} from '@mobilis/api';
import { formatOperationalStatus, mobilisTheme } from '@mobilis/ui';
import { restoreDriverSession } from '../lib/auth';
import { resolveDriverAppError } from '../lib/session-feedback';
import {
  buildDriverEarningsStatusLabel,
  resolveDriverActiveFlow,
} from '../lib/driver-active-flow';
import {
  buildDriverEarningsDeltaLabel,
  formatDriverEarningsAmount,
  formatDriverEarningsCount,
} from '../lib/driver-earnings-signal';
import {
  InsightBadge,
  LiveStatusBanner,
  MetricTile,
  SectionCard,
  SectionHeading,
} from '../lib/realtime-widgets';
import { DriverJourneySection } from '../lib/driver-journey';
import { useLiveRefresh } from '../lib/use-live-refresh';

const fallbackEarnings: DriverEarningsResponse = {
  summary: {
    currency: 'XOF',
    today: 0,
    week: 0,
    month: 0,
    completedTrips: 0,
    averagePayout: 0,
  },
  recentTrips: [],
};

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

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <Text style={styles.eyebrow}>Mobilis Chauffeur</Text>
      <Text style={styles.title}>Revenus et performance</Text>
      <Text style={styles.body}>
        Le recap financier reste branche au meme tunnel que le cockpit, le dispatch et le dossier chauffeur.
      </Text>
      <View style={[styles.heroCard, earningsTransitionLabel ? styles.heroCardHighlight : null]}>
        <LiveStatusBanner
          label="Finance live"
          message={status}
          secondaryMessage={
            earningsTransitionLabel
              ? earningsTransitionLabel
              : flow.activeTrip && flow.primaryRouteLabel
                ? `Mission active: ${flow.primaryRouteLabel}.`
                : flow.operationalStatus === 'SUSPENDED'
                  ? 'Le compte reste suspendu. Les gains historiques restent consultables, mais le direct est coupe.'
                  : flow.availabilityStatus === 'ONLINE'
                    ? 'Le recap se rafraichit regulierement pour garder une lecture fiable du jour, de la semaine et du mois.'
                    : 'Le recap reste disponible meme quand le chauffeur est hors ligne.'
          }
          tone={earningsTransitionLabel ? 'sky' : flow.operationalStatus === 'SUSPENDED' ? 'rose' : 'amber'}
        />
        <View style={styles.heroMetrics}>
          <MetricTile
            label="Mission"
            value={flow.primaryStatusLabel}
            helper={flow.primaryRouteLabel ?? 'aucune mission active'}
          />
          <MetricTile
            label="Profil"
            value={formatOperationalStatus(driverProfileStatus)}
            helper={flow.availabilityStatus === 'ONLINE' ? 'disponible pour le dispatch' : 'hors ligne ou bloque'}
          />
          <MetricTile
            label="Semaine"
            value={formatDriverEarningsAmount(earnings.summary.week)}
            helper={`${formatDriverEarningsCount(earnings.summary.completedTrips)} courses bouclees`}
          />
          <MetricTile
            label="Paiement moyen"
            value={formatDriverEarningsAmount(earnings.summary.averagePayout)}
            helper="gain net moyen par course"
          />
        </View>
        {flow.activeTrip ? (
          <Text style={styles.activeRouteMeta}>
            Mission active: {flow.primaryRouteLabel}
          </Text>
        ) : null}
        {flow.operationalStatus === 'SUSPENDED' ? (
          <Text style={styles.warningMeta}>
            Le cockpit operations doit revalider le compte avant reprise des nouvelles courses.
          </Text>
        ) : null}
        {freshTripIds.length ? (
          <Text style={styles.transitionMeta}>
            {freshTripIds.length > 1
              ? `${freshTripIds.length} payouts frais viennent d entrer dans l historique.`
              : 'Un payout frais vient d entrer dans l historique.'}
          </Text>
        ) : null}
        <View style={styles.heroTopRow}>
          <View style={styles.heroHeading}>
            <Text style={styles.heroLabel}>Cap du jour</Text>
            <Text style={styles.heroValue}>{formatDriverEarningsAmount(earnings.summary.today)}</Text>
          </View>
          <InsightBadge
            label="Courses"
            value={formatDriverEarningsCount(earnings.summary.completedTrips)}
            tone="amber"
          />
        </View>
        <Pressable
          onPress={() => void loadEarnings()}
          disabled={isRefreshing}
          style={[styles.refreshButton, isRefreshing ? styles.refreshButtonDisabled : null]}
        >
          <Text style={styles.refreshButtonLabel}>
            {isRefreshing ? 'Actualisation...' : 'Actualiser les revenus'}
          </Text>
        </Pressable>
      </View>

      <View style={styles.metricsGrid}>
        <View style={styles.card}>
          <Text style={styles.label}>Cette semaine</Text>
          <Text style={styles.value}>{formatDriverEarningsAmount(earnings.summary.week)}</Text>
          <Text style={styles.meta}>{formatDriverEarningsCount(earnings.summary.completedTrips)} courses bouclees</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.label}>Ce mois</Text>
          <Text style={styles.value}>{formatDriverEarningsAmount(earnings.summary.month)}</Text>
          <Text style={styles.meta}>vision long terme de votre activite</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.label}>Moyenne</Text>
          <Text style={styles.value}>{formatDriverEarningsAmount(earnings.summary.averagePayout)}</Text>
          <Text style={styles.meta}>cap de rentabilite par trajet</Text>
        </View>
      </View>

      <DriverJourneySection
        currentStep="revenus"
        description="Le suivi financier partage maintenant le meme tunnel que l acces, le cockpit, le dispatch et le dossier operations."
      />

      <SectionCard tone="sky">
        <SectionHeading
          eyebrow="Historique recent"
          title="Courses recentes"
          description="Lecture chronologique des derniers payouts enregistres par le flux protege."
        />
      </SectionCard>
      {earnings.recentTrips.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Aucune course comptabilisee</Text>
          <Text style={styles.emptyMeta}>
            Passez en ligne et acceptez vos premieres offres pour voir vos gains apparaitre ici.
          </Text>
        </View>
      ) : null}
      {earnings.recentTrips.map((trip) => (
        <View
          key={trip.id}
          style={[styles.tripCard, freshTripIds.includes(trip.id) ? styles.tripCardFresh : null]}
        >
          {freshTripIds.includes(trip.id) ? (
            <Text style={styles.tripBadge}>Nouveau payout live</Text>
          ) : null}
          <View style={styles.tripHeader}>
            <Text style={styles.tripRoute}>{trip.route}</Text>
            <Text style={styles.tripPayout}>{formatDriverEarningsAmount(trip.payout)}</Text>
          </View>
          <Text style={styles.meta}>{formatOperationalStatus(trip.status)}</Text>
          <Text style={styles.tripDate}>
            {trip.completedAt
              ? new Date(trip.completedAt).toLocaleString('fr-FR', {
                  day: '2-digit',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : 'En attente de cloture'}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingTop: 88,
    paddingHorizontal: 24,
    paddingBottom: 40,
    backgroundColor: mobilisTheme.colors.background,
    gap: 14,
  },
  eyebrow: {
    color: mobilisTheme.colors.amber,
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  title: {
    color: mobilisTheme.colors.text,
    fontSize: 32,
    fontWeight: '800',
  },
  body: {
    color: mobilisTheme.colors.muted,
    lineHeight: 22,
  },
  heroCard: {
    backgroundColor: mobilisTheme.colors.panel,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: mobilisTheme.colors.border,
    padding: 20,
    gap: 14,
  },
  heroCardHighlight: {
    borderColor: 'rgba(56, 189, 248, 0.42)',
    backgroundColor: 'rgba(56, 189, 248, 0.08)',
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  heroHeading: {
    flex: 1,
    gap: 6,
  },
  heroLabel: {
    color: mobilisTheme.colors.muted,
    textTransform: 'uppercase',
    fontSize: 12,
    letterSpacing: 1.5,
  },
  heroValue: {
    color: mobilisTheme.colors.amber,
    fontSize: 36,
    fontWeight: '800',
  },
  transitionMeta: {
    color: mobilisTheme.colors.sky,
    fontWeight: '700',
    lineHeight: 19,
  },
  activeRouteMeta: {
    color: mobilisTheme.colors.text,
    fontWeight: '700',
    lineHeight: 20,
  },
  warningMeta: {
    color: mobilisTheme.colors.amber,
    lineHeight: 20,
  },
  heroMetrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  refreshButton: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: mobilisTheme.colors.backgroundAlt,
    borderWidth: 1,
    borderColor: mobilisTheme.colors.border,
  },
  refreshButtonDisabled: {
    opacity: 0.65,
  },
  refreshButtonLabel: {
    color: mobilisTheme.colors.text,
    fontWeight: '700',
    fontSize: 13,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  card: {
    flexGrow: 1,
    minWidth: 150,
    backgroundColor: mobilisTheme.colors.panel,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: mobilisTheme.colors.border,
    padding: 18,
    gap: 6,
  },
  label: {
    color: mobilisTheme.colors.muted,
  },
  value: {
    color: mobilisTheme.colors.amber,
    fontSize: 24,
    fontWeight: '800',
  },
  meta: {
    color: mobilisTheme.colors.muted,
    fontWeight: '600',
  },
  emptyCard: {
    backgroundColor: mobilisTheme.colors.backgroundAlt,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: mobilisTheme.colors.border,
    padding: 18,
    gap: 6,
  },
  emptyTitle: {
    color: mobilisTheme.colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  emptyMeta: {
    color: mobilisTheme.colors.muted,
    lineHeight: 20,
  },
  tripCard: {
    backgroundColor: mobilisTheme.colors.backgroundAlt,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: mobilisTheme.colors.border,
    padding: 18,
    gap: 8,
  },
  tripCardFresh: {
    borderColor: 'rgba(56, 189, 248, 0.4)',
    backgroundColor: 'rgba(56, 189, 248, 0.07)',
  },
  tripBadge: {
    alignSelf: 'flex-start',
    color: mobilisTheme.colors.sky,
    fontWeight: '800',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  tripHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  tripRoute: {
    flex: 1,
    color: mobilisTheme.colors.text,
    fontWeight: '700',
    fontSize: 16,
  },
  tripPayout: {
    color: mobilisTheme.colors.amber,
    fontWeight: '800',
    fontSize: 18,
  },
  tripDate: {
    color: mobilisTheme.colors.textSoft,
    fontSize: 12,
  },
});
