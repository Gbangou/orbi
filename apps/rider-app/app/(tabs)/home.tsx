import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  fetchMyTrips,
  fetchRideOptionsPreview,
  riderRideOptions,
  type MyTripsResponse,
  type RideOption,
} from '@orbi/api';
import {
  describeRealtimeEvent,
  describeRealtimeConnection,
  formatRealtimeBadgeLabel,
  formatXof,
  orbiCopy,
  orbiTheme,
} from '@orbi/ui';
import {
  DashboardMetricCard,
  MetricTile,
  QuickActionCard,
  RouteSignalCard,
} from '../../lib/realtime-widgets';
import { restoreRiderSession } from '../../lib/auth';
import { useLiveRefresh } from '../../lib/use-live-refresh';
import { OrbiLogo } from '../../lib/orbi-logo';
import { useRiderRealtimeStream } from '../../lib/use-rider-realtime-stream';
import { createOrbiApiClient } from '@orbi/api';
import {
  orbiRuntimeConfig,
  resolveOrbiApiBaseUrlForRuntime,
} from '@orbi/config';
import { resolveRiderAppError } from '../../lib/session-feedback';
import {
  buildRiderFlowTransitionLabel,
  buildRiderHomeStatusLabel,
  resolveRiderActiveFlow,
} from '../../lib/rider-active-flow';
import { useRiderPosition } from '../../lib/use-rider-position';
import { HomeMapView } from '../../lib/home-map-view';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const MAP_HEIGHT = Math.round(SCREEN_HEIGHT * 0.42);

function buildRideOptionInsights(option: RideOption): Array<{
  label: string;
  value: string;
  tone?: 'teal' | 'amber' | 'sky' | 'rose';
}> {
  return [
    {
      label: 'Vehicule',
      value: option.category === 'motorcycle' ? 'Moto' : 'Voiture',
      tone: option.category === 'motorcycle' ? 'teal' : 'amber',
    },
    {
      label: 'Capacite',
      value: option.capacity,
      tone: 'sky',
    },
    {
      label: 'Arrivee',
      value: `${option.etaMinutes} min`,
      tone: 'teal',
    },
  ];
}

function buildRideOptionDetailLines(option: RideOption) {
  const lines = [
    option.paymentMethods?.length
      ? `Paiement: ${option.paymentMethods.join(', ')}`
      : null,
    option.fareBreakdown
      ? `Base ${formatXof(option.fareBreakdown.baseFare)} + frais ${formatXof(option.fareBreakdown.bookingFee)}`
      : null,
    option.safetyNote ?? null,
  ];
  return lines.filter((line): line is string => Boolean(line));
}

export default function RiderHomeScreen() {
  const router = useRouter();
  const [options, setOptions] = useState<RideOption[]>(riderRideOptions);
  const [history, setHistory] = useState<MyTripsResponse | null>(null);
  const [statusLabel, setStatusLabel] = useState(
    'Connexion du compte passager...',
  );
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isRealtimeSyncing, setIsRealtimeSyncing] = useState(false);
  const [flowTransitionLabel, setFlowTransitionLabel] = useState<string | null>(
    null,
  );
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [realNearbyCount, setRealNearbyCount] = useState(0);
  const previousFlowStateRef = useRef<string | null>(null);

  const riderPosition = useRiderPosition({ enabled: true });

  const loadHomeContext = useCallback(async (silent = false) => {
    const client = createOrbiApiClient(resolveOrbiApiBaseUrlForRuntime(), {
      version: orbiRuntimeConfig.apiVersion,
    });

    if (!silent) setIsRefreshing(true);

    try {
      const { authClient, me, session } = await restoreRiderSession();
      setSessionToken(session.sessionToken);
      const [response, historyResponse] = await Promise.all([
        fetchRideOptionsPreview(client, {
          distanceKm: 5.8,
          durationMinutes: 16,
          vehicleType: 'MOTORCYCLE',
          paymentMethod: 'CASH',
          zone: 'URBAN_CORE',
          isPeakHour: true,
          activeDriverCount: 8,
          openRequestCount: 11,
        }),
        fetchMyTrips(authClient),
      ]);

      setOptions(response.options);
      setHistory(historyResponse);
      const flow = resolveRiderActiveFlow(historyResponse);

      if (!silent) {
        setStatusLabel(
          buildRiderHomeStatusLabel({
            flow,
            fullName: me.user.fullName,
            optionCount: response.options.length,
          }),
        );
      }
    } catch (error) {
      const feedback = await resolveRiderAppError(error, {
        network: 'Preview locale active en attendant la connexion API.',
      });
      if (feedback.shouldClearSessionToken) setSessionToken(null);
      if (!silent) setStatusLabel(feedback.message);
    } finally {
      if (silent) setIsRealtimeSyncing(false);
      if (!silent) setIsRefreshing(false);
    }
  }, []);

  useLiveRefresh(() => loadHomeContext(true), 25000);
  useRiderRealtimeStream(
    sessionToken,
    (eventType) => {
      setIsRealtimeSyncing(true);
      setStatusLabel(describeRealtimeEvent('rider', eventType));
      void loadHomeContext(true);
    },
    {
      onHeartbeat: () =>
        setStatusLabel(describeRealtimeConnection('rider', 'active')),
      onOpen: () => {
        setIsRealtimeSyncing(false);
        setStatusLabel(describeRealtimeConnection('rider', 'connected'));
      },
      onError: () => {
        setIsRealtimeSyncing(false);
        setStatusLabel(describeRealtimeConnection('rider', 'reconnecting'));
      },
    },
  );

  const flow = resolveRiderActiveFlow(history);
  const { activeTrip, activeRequest, activeFlowState, primaryStatusLabel } =
    flow;

  useEffect(() => {
    const previousFlowState = previousFlowStateRef.current;
    setFlowTransitionLabel(
      buildRiderFlowTransitionLabel(previousFlowState, activeFlowState, 'home'),
    );
    previousFlowStateRef.current = activeFlowState;
  }, [activeFlowState]);

  useEffect(() => {
    if (!flowTransitionLabel) return;
    const timeout = setTimeout(() => setFlowTransitionLabel(null), 5000);
    return () => clearTimeout(timeout);
  }, [flowTransitionLabel]);

  return (
    <View style={styles.root}>
      {/* Carte plein-largeur avec chauffeurs proches */}
      <View style={[styles.mapContainer, { height: MAP_HEIGHT }]}>
        <HomeMapView
          riderLat={riderPosition.latestPosition?.latitude}
          riderLng={riderPosition.latestPosition?.longitude}
          style={styles.map}
          onDriversUpdate={setRealNearbyCount}
        />

        {/* Badge realtime sur la carte */}
        <View style={styles.mapBadge}>
          <View
            style={[
              styles.mapBadgeDot,
              { backgroundColor: isRealtimeSyncing ? orbiTheme.colors.sky : orbiTheme.colors.teal },
            ]}
          />
          <Text style={styles.mapBadgeText}>
            {formatRealtimeBadgeLabel(
              realNearbyCount > 0
                ? `${realNearbyCount} chauffeur${realNearbyCount > 1 ? 's' : ''} proche${realNearbyCount > 1 ? 's' : ''}`
                : 'Carte live',
              isRealtimeSyncing,
            )}
          </Text>
        </View>

        {/* Overlay de reservation en bas de la carte */}
        <View style={styles.mapOverlay}>
          {activeTrip || activeRequest ? (
            <Pressable
              style={[styles.bookButton, styles.bookButtonActive]}
              onPress={() => router.push('/activity')}
            >
              <Text style={styles.bookButtonLabel}>
                {activeTrip
                  ? `Course en cours — ${activeTrip.pickupAddress}`
                  : `Demande active — ${activeRequest?.pickupAddress}`}
              </Text>
              <Text style={styles.bookButtonSub}>Suivre le trajet →</Text>
            </Pressable>
          ) : (
            <Pressable
              style={styles.bookButton}
              onPress={() => router.push('/book')}
            >
              <Text style={styles.bookButtonLabel}>Ou allez-vous ?</Text>
              <Text style={styles.bookButtonSub}>
                Moto, voiture — trajet immediat
              </Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* Contenu scrollable en dessous de la carte */}
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <OrbiLogo size="sm" />
        <Text style={styles.title}>{orbiCopy.riderHeadline}</Text>

        {/* Statut de connexion */}
        <View style={styles.statusRow}>
          <Text style={styles.statusText} numberOfLines={2}>
            {statusLabel}
          </Text>
          {flowTransitionLabel ? (
            <Text style={styles.transitionText}>{flowTransitionLabel}</Text>
          ) : null}
        </View>

        {/* Code de prise en charge si course active */}
        {activeTrip?.pickupCode ? (
          <View style={styles.pickupCodeCard}>
            <Text style={styles.pickupCodeLabel}>Code de prise en charge</Text>
            <Text style={styles.pickupCode}>{activeTrip.pickupCode}</Text>
            <Text style={styles.pickupCodeNote}>
              A communiquer au chauffeur avant le depart.
            </Text>
          </View>
        ) : null}

        {/* Metriques rapides */}
        <View style={styles.metricsRow}>
          <DashboardMetricCard
            label="Actif"
            value={String(history?.stats.activeTrips ?? 0)}
            helper="trajet ou demande"
            tone="teal"
          />
          <DashboardMetricCard
            label="Completes"
            value={String(history?.stats.completedTrips ?? 0)}
            helper="courses terminees"
            tone="sky"
          />
          <DashboardMetricCard
            label="Chauffeurs"
            value={String(realNearbyCount)}
            helper="disponibles près de vous"
            tone="amber"
          />
        </View>

        {/* Actions primaires */}
        <View style={styles.primaryActions}>
          <QuickActionCard
            eyebrow="Reservation"
            title="Reserver maintenant"
            description={
              flow.hasOpenFlow
                ? 'Consulter le flux actif avant de creer une nouvelle demande.'
                : 'Choisir un trajet, un service et un paiement.'
            }
            tone="teal"
            emphasis="primary"
            onPress={() => router.push('/book')}
          />
          <QuickActionCard
            eyebrow="Suivi"
            title="Voir l activite"
            description="Suivre la course, la timeline et les incidents."
            tone="sky"
            onPress={() => router.push('/activity')}
          />
        </View>

        {/* Flux actif */}
        {(activeTrip || activeRequest) ? (
          <View style={styles.activeFlowCard}>
            <Text style={styles.activeFlowEyebrow}>Flux actif</Text>
            <Text style={styles.activeFlowTitle}>
              {activeTrip
                ? `${activeTrip.pickupAddress} vers ${activeTrip.destinationAddress}`
                : `${activeRequest?.pickupAddress} vers ${activeRequest?.destinationAddress}`}
            </Text>
            <MetricTile label="Etat" value={primaryStatusLabel} />
          </View>
        ) : null}

        {/* Services recommandes */}
        <Text style={styles.sectionTitle}>Services disponibles</Text>
        {options.map((option) => (
          <RouteSignalCard
            key={option.id}
            eyebrow="Service disponible"
            badgeLabel={option.badge ?? null}
            badgeTone={option.category === 'motorcycle' ? 'teal' : 'amber'}
            title={option.title}
            titleAside={formatXof(option.fare)}
            titleAsideColor={option.accent}
            description={`${option.category === 'motorcycle' ? 'Moto' : 'Voiture'} disponible rapidement depuis votre zone.`}
            insights={buildRideOptionInsights(option)}
            detailLines={buildRideOptionDetailLines(option)}
            note={option.marketplace?.pricePromise ?? option.safetyNote}
            noteTone="teal"
          />
        ))}

        <View style={styles.actions}>
          <QuickActionCard
            eyebrow="Compte"
            title="Profil et lieux enregistres"
            description="Gerer vos informations, domiciles et points favoris."
            tone="teal"
            onPress={() => router.push('/account')}
          />
        </View>

        <Pressable
          onPress={() => void loadHomeContext()}
          style={[
            styles.refreshButton,
            isRefreshing ? styles.refreshButtonDisabled : null,
          ]}
          disabled={isRefreshing}
        >
          <Text style={styles.refreshButtonLabel}>
            {isRefreshing ? 'Actualisation...' : 'Actualiser les donnees'}
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: orbiTheme.colors.background,
  },
  mapContainer: {
    position: 'relative',
    width: '100%',
  },
  map: {
    flex: 1,
    borderRadius: 0,
  },
  mapBadge: {
    position: 'absolute',
    top: 52,
    left: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(10,12,14,0.82)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: orbiTheme.colors.border,
  },
  mapBadgeDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  mapBadgeText: {
    color: orbiTheme.colors.text,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  mapOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  bookButton: {
    backgroundColor: orbiTheme.colors.teal,
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 8,
  },
  bookButtonActive: {
    backgroundColor: orbiTheme.colors.sky,
  },
  bookButtonLabel: {
    color: '#0a0c0e',
    fontWeight: '800',
    fontSize: 16,
  },
  bookButtonSub: {
    color: 'rgba(10,12,14,0.7)',
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  scroll: {
    paddingTop: 20,
    paddingHorizontal: 18,
    paddingBottom: 40,
    gap: 14,
  },
  title: {
    color: orbiTheme.colors.text,
    fontSize: 32,
    lineHeight: 34,
    fontWeight: '800',
  },
  statusRow: {
    gap: 4,
  },
  statusText: {
    color: orbiTheme.colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  transitionText: {
    color: orbiTheme.colors.sky,
    fontSize: 12,
    fontWeight: '600',
  },
  pickupCodeCard: {
    backgroundColor: orbiTheme.colors.backgroundAlt,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: orbiTheme.colors.teal,
    gap: 4,
  },
  pickupCodeLabel: {
    color: orbiTheme.colors.teal,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  pickupCode: {
    color: orbiTheme.colors.text,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: 4,
  },
  pickupCodeNote: {
    color: orbiTheme.colors.muted,
    fontSize: 11,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  primaryActions: {
    gap: 10,
  },
  activeFlowCard: {
    backgroundColor: orbiTheme.colors.backgroundAlt,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: orbiTheme.colors.sky,
    gap: 6,
  },
  activeFlowEyebrow: {
    color: orbiTheme.colors.sky,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  activeFlowTitle: {
    color: orbiTheme.colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  sectionTitle: {
    color: orbiTheme.colors.text,
    fontSize: 18,
    fontWeight: '700',
    marginTop: 4,
  },
  actions: {
    gap: 10,
  },
  refreshButton: {
    alignSelf: 'center',
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 10,
    backgroundColor: orbiTheme.colors.backgroundAlt,
    borderWidth: 1,
    borderColor: orbiTheme.colors.border,
    marginTop: 4,
  },
  refreshButtonDisabled: {
    opacity: 0.55,
  },
  refreshButtonLabel: {
    color: orbiTheme.colors.text,
    fontWeight: '700',
    fontSize: 13,
  },
});
