import { useRouter } from 'expo-router';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  Linking,
  Pressable,
  SafeAreaView,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  cancelRideRequestWithApi,
  canRiderCancelTrip,
  canRiderStopTrip,
  createTripShareLinkWithApi,
  fetchMyTrips,
  fetchRideOptionsPreview,
  triggerTripSafetySosWithApi,
  updateTripStatusWithApi,
  type NearbyDriverMarker,
  type MyTripsResponse,
  type RideOption,
} from '@orbi/api';
import {
  describeRealtimeEvent,
  describeRealtimeConnection,
  type OrbiTheme,
} from '@orbi/ui';
import { OfflineBanner, OrbiSurface, safeHaptics, useOrbiTheme, VehicleIllustration } from '@orbi/ui/native';
import { createRiderPublicClient, restoreRiderSession } from '../../lib/auth';
import { useTranslation } from '../../lib/i18n';
import { useLiveRefresh } from '../../lib/use-live-refresh';
import { useRiderRealtimeStream } from '../../lib/use-rider-realtime-stream';
import { resolveOrbiApiBaseUrlForRuntime } from '@orbi/config';
import { resolveRiderAppError } from '../../lib/session-feedback';
import { formatRiderMoneyAmount } from '../../lib/rider-display-format';
import {
  buildRiderFlowTransitionLabel,
  buildRiderHomeStatusLabel,
  resolveRiderActiveFlow,
} from '../../lib/rider-active-flow';
import { normalizeRiderTripsResponse } from '../../lib/rider-trips-normalizer';
import { useRiderPosition } from '../../lib/use-rider-position';
import { HomeMapView } from '../../lib/home-map-view';
import { RiderTripStatusCard } from '../../lib/rider-trip-status-card';

const { height: SCREEN_H, width: SCREEN_W } = Dimensions.get('window');

// Bottom sheet heights
const SHEET_PEEK = 332;
const SHEET_ACTIVE_TRIP = 292;

type NearbyDriverCounts = {
  total: number;
  motorcycle: number;
  car: number;
};

const emptyNearbyDriverCounts: NearbyDriverCounts = {
  total: 0,
  motorcycle: 0,
  car: 0,
};

function countNearbyDriversByVehicle(drivers: NearbyDriverMarker[]): NearbyDriverCounts {
  return drivers.reduce<NearbyDriverCounts>(
    (counts, driver) => {
      if (driver.status !== 'ONLINE') {
        return counts;
      }

      const vehicleType = String(driver.vehicleType ?? '').toUpperCase();
      if (vehicleType === 'MOTORCYCLE' || vehicleType === 'MOTO') {
        return {
          ...counts,
          total: counts.total + 1,
          motorcycle: counts.motorcycle + 1,
        };
      }

      if (vehicleType === 'CAR') {
        return {
          ...counts,
          total: counts.total + 1,
          car: counts.car + 1,
        };
      }

      return counts;
    },
    emptyNearbyDriverCounts,
  );
}

function ForwardGlyph({ color }: { color: string }) {
  return (
    <View style={homeIcon.forwardWrap}>
      <View style={[homeIcon.forwardLine, homeIcon.forwardLineTop, { backgroundColor: color }]} />
      <View style={[homeIcon.forwardLine, homeIcon.forwardLineBottom, { backgroundColor: color }]} />
    </View>
  );
}

// ── Dot indicator for real-time status ───────────────────────────────────────

const StatusDot = memo(function StatusDot({ active }: { active: boolean }) {
  const theme = useOrbiTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!active) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.5, duration: 700, useNativeDriver: false }),
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: false }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, pulse]);

  return (
    <Animated.View
      style={[
        styles.statusDot,
        { backgroundColor: active ? theme.colors.teal : '#BBBBBB' },
        active ? { transform: [{ scale: pulse }] } : null,
      ]}
    />
  );
});

// ── Vehicle mini icon ─────────────────────────────────────────────────────────

const ServiceVehicleIcon = memo(function ServiceVehicleIcon({ tier }: { tier: string }) {
  return <VehicleIllustration tier={tier} width={40} height={30} />;
});

const fallbackServices = [
  {
    id: 'fallback-moto',
    title: 'Moto',
    meta: 'Trajets courts',
    tier: 'moto-standard',
  },
  {
    id: 'fallback-go',
    title: 'Orbi Go',
    meta: 'Voiture standard',
    tier: 'car-standard',
  },
  {
    id: 'fallback-comfort',
    title: 'Confort',
    meta: 'Plus d espace',
    tier: 'car-comfort',
  },
] as const;

const ServicePreviewRow = memo(function ServicePreviewRow({
  service,
  onPress,
}: {
  service: (typeof fallbackServices)[number];
  onPress: () => void;
}) {
  const theme = useOrbiTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.servicePressable,
        pressed && styles.serviceRowPressed,
      ]}
    >
      <OrbiSurface style={styles.serviceRow}>
        <View style={[styles.serviceIcon, { backgroundColor: theme.colors.backgroundAlt }]}>
          <ServiceVehicleIcon tier={service.tier} />
        </View>
        <View style={styles.serviceInfo}>
          <Text style={styles.serviceTitle}>{service.title}</Text>
          <Text style={styles.serviceMeta} numberOfLines={1} ellipsizeMode="tail">
            {service.meta}
          </Text>
        </View>
        <Text style={styles.serviceFareHint}>Voir prix</Text>
      </OrbiSurface>
    </Pressable>
  );
});

function buildServiceMeta(option: RideOption) {
  return `${option.etaMinutes} min · ${option.capacity}`;
}

// ── Service option row ────────────────────────────────────────────────────────

const ServiceRow = memo(function ServiceRow({
  option,
  onPress,
}: {
  option: RideOption;
  onPress: () => void;
}) {
  const theme = useOrbiTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const isMoto = option.category === 'motorcycle';
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.servicePressable,
        pressed && styles.serviceRowPressed,
      ]}
    >
      <OrbiSurface
        style={[
          styles.serviceRow,
          isMoto ? styles.serviceRowPrimary : styles.serviceRowWarm,
        ]}
      >
        <View style={[styles.serviceIcon, { backgroundColor: theme.colors.backgroundAlt }]}>
          <ServiceVehicleIcon tier={option.tier} />
        </View>
        <View style={styles.serviceInfo}>
          <Text style={styles.serviceTitle}>{option.title}</Text>
          <Text style={styles.serviceMeta} numberOfLines={1} ellipsizeMode="tail">
            {buildServiceMeta(option)}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 2 }}>
          <Text style={styles.serviceFare}>{formatRiderMoneyAmount(option.fare)}</Text>
          {option.surgeActive ? (
            <Text style={styles.serviceSurge}>{option.surgeLabel}</Text>
          ) : null}
        </View>
      </OrbiSurface>
    </Pressable>
  );
});

// ── Main screen ───────────────────────────────────────────────────────────────

export default function RiderHomeScreen() {
  const router = useRouter();
  const theme = useOrbiTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { t } = useTranslation();
  const [options, setOptions] = useState<RideOption[]>([]);
  const [history, setHistory] = useState<MyTripsResponse | null>(null);
  const [isRealtimeSyncing, setIsRealtimeSyncing] = useState(false);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [nearbyDriverCounts, setNearbyDriverCounts] = useState<NearbyDriverCounts>(emptyNearbyDriverCounts);
  const [userName, setUserName] = useState('');
  const [flowTransitionLabel, setFlowTransitionLabel] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [isSosBusy, setIsSosBusy] = useState(false);
  const [isShareBusy, setIsShareBusy] = useState(false);
  const [isFlowActionBusy, setIsFlowActionBusy] = useState(false);
  const [matchedAnim] = useState(() => new Animated.Value(0));
  const [showMatchCard, setShowMatchCard] = useState(false);
  const previousFlowStateRef = useRef<string | null>(null);

  const riderPosition = useRiderPosition({ enabled: true });

  const handleDriversUpdate = useCallback((drivers: NearbyDriverMarker[]) => {
    setNearbyDriverCounts(countNearbyDriversByVehicle(drivers));
  }, []);

  // Stable handler reference — prevents ServiceRow remounts
  const navigateToBook = useCallback(() => {
    safeHaptics.impact('light');
    router.push('/book');
  }, [router]);

  const navigateToActivity = useCallback(() => router.push('/activity'), [router]);

  const handleSos = useCallback((tripId: string) => {
    safeHaptics.notify('error');
    Alert.alert(
      'Alerte SOS',
      'Déclencher une alerte d\'urgence ? L\'équipe Orbi et les secours locaux seront notifiés.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Déclencher le SOS',
          style: 'destructive',
          onPress: async () => {
            if (isSosBusy) return;
            setIsSosBusy(true);
            try {
              const { authClient } = await restoreRiderSession();
              const response = await triggerTripSafetySosWithApi(authClient, tripId, {
                details: 'SOS déclenché depuis l\'écran d\'accueil passager.',
              });
              const emergencyNumber = response.sos.localEmergencyNumber;
              if (emergencyNumber) {
                void Linking.openURL(`tel:${emergencyNumber}`);
              }
            } catch {
              // SOS silently fails — user is redirected to activity for full handling
              router.push('/activity');
            } finally {
              setIsSosBusy(false);
            }
          },
        },
      ],
    );
  }, [isSosBusy, router]);

  const handleShareTrip = useCallback(async (tripId: string) => {
    if (isShareBusy) {
      return;
    }

    setIsShareBusy(true);

    try {
      const { authClient } = await restoreRiderSession();
      const response = await createTripShareLinkWithApi(authClient, tripId);
      const shareUrl = new URL(
        response.share.path,
        resolveOrbiApiBaseUrlForRuntime(),
      ).toString();

      await Share.share({
        message: `Suivi securise de ma course Orbi: ${shareUrl}`,
        url: shareUrl,
      });
    } catch (error) {
      const feedback = await resolveRiderAppError(error, {
        surface: 'safety',
        fallback: "Le lien de partage n'a pas pu etre cree.",
      });

      Alert.alert('Partage indisponible', feedback.message);
    } finally {
      setIsShareBusy(false);
    }
  }, [isShareBusy]);

  const loadHomeContext = useCallback(async (silent = false) => {
    const client = createRiderPublicClient();

    try {
      const { authClient, me, session } = await restoreRiderSession();
      setSessionToken(session.sessionToken);
      setUserName(me.user.fullName?.split(' ')[0] ?? '');

      const [response, historyResponse] = await Promise.all([
        fetchRideOptionsPreview(client, {
          distanceKm: 5.8,
          durationMinutes: 16,
          vehicleType: 'MOTORCYCLE',
          paymentMethod: 'CASH',
          zone: 'URBAN_CORE',
        }),
        fetchMyTrips(authClient),
      ]);

      const normalizedHistory = normalizeRiderTripsResponse(historyResponse);
      const safeOptions =
        response && typeof response === 'object' && Array.isArray(response.options)
          ? response.options
          : [];
      setOptions(safeOptions);
      setHistory(normalizedHistory);
      setIsOffline(false);

      if (!silent) {
        const flow = resolveRiderActiveFlow(normalizedHistory);
        buildRiderHomeStatusLabel({
          flow,
          fullName: me.user.fullName,
          optionCount: safeOptions.length,
        });
      }
    } catch (error) {
      const isNetworkError =
        error instanceof TypeError &&
        (error.message.includes('Network request failed') ||
          error.message.includes('fetch failed') ||
          error.message.includes('Failed to fetch'));
      setIsOffline(isNetworkError);

      const feedback = await resolveRiderAppError(error, {
        network: 'Connexion instable. Réessai automatique en cours.',
      });
      if (feedback.shouldClearSessionToken) setSessionToken(null);
      if (!isNetworkError) {
        setOptions([]);
        setHistory(null);
      }
    } finally {
      if (silent) setIsRealtimeSyncing(false);
    }
  }, []);

  const cancelPendingRequest = useCallback(async (rideRequestId: string) => {
    if (isFlowActionBusy) return;
    setIsFlowActionBusy(true);
    try {
      const { authClient } = await restoreRiderSession();
      await cancelRideRequestWithApi(authClient, rideRequestId);
      await loadHomeContext(true);
    } catch (error) {
      const feedback = await resolveRiderAppError(error, {
        surface: 'booking',
        fallback: "L'annulation de la demande a echoue.",
      });
      Alert.alert('Annulation indisponible', feedback.message);
    } finally {
      setIsFlowActionBusy(false);
    }
  }, [isFlowActionBusy, loadHomeContext]);

  const cancelTripBeforeDeparture = useCallback(async (tripId: string) => {
    if (isFlowActionBusy) return;
    setIsFlowActionBusy(true);
    try {
      const { authClient } = await restoreRiderSession();
      await updateTripStatusWithApi(
        authClient,
        tripId,
        'CANCELLED',
        'Annulation demandee depuis accueil passager',
      );
      await loadHomeContext(true);
    } catch (error) {
      const feedback = await resolveRiderAppError(error, {
        surface: 'active-trip',
        fallback: "L'annulation de la course a echoue.",
      });
      Alert.alert('Annulation indisponible', feedback.message);
    } finally {
      setIsFlowActionBusy(false);
    }
  }, [isFlowActionBusy, loadHomeContext]);

  const stopTripInProgress = useCallback(async (tripId: string) => {
    if (isFlowActionBusy) return;
    setIsFlowActionBusy(true);
    try {
      const { authClient } = await restoreRiderSession();
      const response = await updateTripStatusWithApi(
        authClient,
        tripId,
        'COMPLETED',
        'Arret demande depuis accueil passager',
      );
      await loadHomeContext(true);
      router.push({
        pathname: '/receipt',
        params: { tripId: response.trip.id },
      });
    } catch (error) {
      const feedback = await resolveRiderAppError(error, {
        surface: 'active-trip',
        fallback: "L'arret de la course a echoue.",
      });
      Alert.alert('Arret indisponible', feedback.message);
    } finally {
      setIsFlowActionBusy(false);
    }
  }, [isFlowActionBusy, loadHomeContext, router]);

  const handleCancelActiveFlow = useCallback(() => {
    const flow = resolveRiderActiveFlow(history);
    if (flow.activeRequest) {
      Alert.alert(
        'Annuler la demande',
        'Annuler cette recherche de chauffeur ?',
        [
          { text: 'Garder la demande', style: 'cancel' },
          {
            text: 'Annuler',
            style: 'destructive',
            onPress: () => void cancelPendingRequest(flow.activeRequest!.id),
          },
        ],
      );
      return;
    }

    if (flow.activeTrip && canRiderCancelTrip(flow.activeTrip.status)) {
      Alert.alert(
        'Annuler la course',
        'Annuler avant de monter ? Si le chauffeur est deja mobilise, Orbi peut ouvrir une revue pour proteger son temps.',
        [
          { text: 'Ne pas annuler', style: 'cancel' },
          {
            text: 'Annuler',
            style: 'destructive',
            onPress: () => void cancelTripBeforeDeparture(flow.activeTrip!.id),
          },
        ],
      );
    }
  }, [cancelPendingRequest, cancelTripBeforeDeparture, history]);

  const handleStopActiveTrip = useCallback(() => {
    const flow = resolveRiderActiveFlow(history);
    if (!flow.activeTrip || !canRiderStopTrip(flow.activeTrip.status)) return;

    Alert.alert(
      'Terminer ma course maintenant',
      'Confirmez si vous descendez ici. Orbi cloture la course, calcule le montant du trajet deja effectue, puis ouvre le recu pour payer.',
      [
        { text: 'Continuer', style: 'cancel' },
        {
          text: 'Arreter et voir le montant',
          style: 'destructive',
          onPress: () => void stopTripInProgress(flow.activeTrip!.id),
        },
      ],
    );
  }, [history, stopTripInProgress]);

  useLiveRefresh(() => loadHomeContext(true), 25000);

  useRiderRealtimeStream(
    sessionToken,
    (eventType) => {
      setIsRealtimeSyncing(true);
      describeRealtimeEvent('rider', eventType);
      void loadHomeContext(true);
    },
    {
      onHeartbeat: () => describeRealtimeConnection('rider', 'active'),
      onOpen: () => { setIsRealtimeSyncing(false); },
      onError: () => { setIsRealtimeSyncing(false); },
    },
  );

  const flow = resolveRiderActiveFlow(history);
  const { activeTrip, activeRequest, activeFlowState, primaryStatusLabel } = flow;

  useEffect(() => {
    const prev = previousFlowStateRef.current;
    setFlowTransitionLabel(
      buildRiderFlowTransitionLabel(prev, activeFlowState, 'home'),
    );

    // Uber-style match animation: trigger when driver is first matched
    if (prev !== 'MATCHED' && activeFlowState === 'MATCHED') {
      safeHaptics.notify('success');
      setShowMatchCard(true);
      matchedAnim.setValue(0);
      Animated.spring(matchedAnim, {
        toValue: 1,
        tension: 60,
        friction: 10,
        useNativeDriver: false,
      }).start();
      const dismiss = setTimeout(() => setShowMatchCard(false), 6000);
      return () => clearTimeout(dismiss);
    }

    previousFlowStateRef.current = activeFlowState;
  }, [activeFlowState, matchedAnim]);

  useEffect(() => {
    if (!flowTransitionLabel) return;
    const t = setTimeout(() => setFlowTransitionLabel(null), 5000);
    return () => clearTimeout(t);
  }, [flowTransitionLabel]);

  const hasActiveFlow = Boolean(activeTrip || activeRequest);
  const sheetH = hasActiveFlow ? SHEET_ACTIVE_TRIP : SHEET_PEEK;

  return (
    <View style={styles.root}>
      {/* ── Full-screen map ── */}
      <HomeMapView
        riderLat={riderPosition.latestPosition?.latitude}
        riderLng={riderPosition.latestPosition?.longitude}
        style={styles.map}
        onDriversUpdate={handleDriversUpdate}
        showNearbyDrivers={!activeTrip}
      />

      {/* ── Offline banner ── */}
      {isOffline ? (
        <SafeAreaView style={styles.offlineSafe} pointerEvents="none">
          <View style={styles.offlineBanner}>
            <View style={styles.offlineDot} />
            <Text style={styles.offlineText} numberOfLines={1}>
              Hors ligne · dernier état
            </Text>
          </View>
        </SafeAreaView>
      ) : null}

      {/* ── SOS Button — always visible, Uber-style top-right ── */}
      <SafeAreaView style={styles.sosSafe} pointerEvents="box-none">
        <Pressable
          onPress={() => activeTrip ? handleSos(activeTrip.id) : router.push('/activity')}
          disabled={isSosBusy}
          style={styles.sosBtnFixed}
          accessibilityLabel="Bouton SOS urgence"
          accessibilityRole="button"
        >
          <Text style={styles.sosBtnText}>SOS</Text>
        </Pressable>
      </SafeAreaView>

      {/* ── Floating top bar ── */}
      <SafeAreaView style={styles.topBarSafe} pointerEvents="box-none">
        <View style={styles.topBar}>
          <View style={styles.greetingPill}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarInitial}>
                {userName ? userName.charAt(0).toUpperCase() : 'O'}
              </Text>
            </View>
            {userName ? (
              <Text style={styles.greetingText} numberOfLines={1}>
                Bonjour, {userName}
              </Text>
            ) : (
              <Text style={styles.greetingText}>Orbi</Text>
            )}
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1, justifyContent: 'flex-end' }}>
            {!activeTrip ? (
              <Pressable
                style={[styles.nearbyBadge, { flexShrink: 1 }]}
                onPress={() => router.push('/book')}
              >
                <StatusDot active={isRealtimeSyncing} />
                <Text style={styles.nearbyText} numberOfLines={1} ellipsizeMode="tail">
                  {nearbyDriverCounts.total > 0
                    ? `${nearbyDriverCounts.total} dispo proche${nearbyDriverCounts.total > 1 ? 's' : ''}`
                    : 'Recherche'}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </SafeAreaView>

      {/* ── Match card — Uber-style slide-up when driver found ── */}
      {showMatchCard && activeTrip ? (
        <Animated.View
          style={[
            styles.matchCard,
            {
              transform: [
                {
                  translateY: matchedAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [120, 0],
                  }),
                },
              ],
              opacity: matchedAnim,
            },
          ]}
        >
          <View style={styles.matchCardDot} />
          <View style={{ flex: 1 }}>
            <Text style={styles.matchCardTitle}>Chauffeur confirmé !</Text>
            <Text style={styles.matchCardSub} numberOfLines={1}>
              {activeTrip.counterpartyName ?? 'Votre chauffeur'} · en route vers vous
            </Text>
          </View>
          <View style={styles.matchCardCheck}>
            <Text style={styles.matchCardCheckText}>OK</Text>
          </View>
        </Animated.View>
      ) : null}

      {/* ── Bottom sheet ── */}
      <View style={[styles.sheet, { height: sheetH }]}>
        {/* Handle bar */}
        <View style={styles.handle} />

        {hasActiveFlow ? (
          /* ── Active trip state ── */
          <RiderTripStatusCard
            activeTrip={activeTrip}
            activeRequest={activeRequest}
            flowTransitionLabel={flowTransitionLabel}
            isShareBusy={isShareBusy}
            isSosBusy={isSosBusy}
            onOpenActivity={navigateToActivity}
            onShare={() => activeTrip && void handleShareTrip(activeTrip.id)}
            onSos={() => activeTrip && handleSos(activeTrip.id)}
            onCancel={handleCancelActiveFlow}
            onStop={handleStopActiveTrip}
          />
        ) : (
          /* ── Default: search bar + services ── */
          <ScrollView
            style={styles.sheetScroll}
            contentContainerStyle={styles.sheetScrollContent}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
          >
            {/* Search prompt */}
            <Pressable
              style={({ pressed }) => [
                styles.searchBar,
                pressed && styles.searchBarPressed,
              ]}
              onPress={() => {
                safeHaptics.impact('light');
                router.push('/book');
              }}
            >
              <View style={styles.routeGlyph}>
                <View style={styles.routePickupDot} />
                <View style={styles.routeStem} />
                <View style={styles.routeDestinationDot} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.searchPlaceholder}>{t('home.whereToGo')}</Text>
                {options.length > 0 ? (
                  <Text style={styles.fareHint}>
                    À partir de {formatRiderMoneyAmount(options[0].fare)} · {options[0].etaMinutes} min
                  </Text>
                ) : null}
              </View>
              <View style={styles.searchIconWrap}>
                <ForwardGlyph color="#FFFFFF" />
              </View>
            </Pressable>

            <View style={styles.quickActionRow}>
              <Pressable style={styles.quickAction} onPress={navigateToBook}>
                <Text style={styles.quickActionTitle}>Maintenant</Text>
                <Text style={styles.quickActionMeta}>Départ immédiat</Text>
              </Pressable>
              <Pressable style={styles.quickAction} onPress={navigateToActivity}>
                <Text style={styles.quickActionTitle}>Activité</Text>
                <Text style={styles.quickActionMeta}>Courses et reçus</Text>
              </Pressable>
            </View>

            {/* Quick services */}
            {options.length > 0 ? (
              <View style={styles.servicesBlock}>
                <Text style={styles.servicesTitle}>Suggestions</Text>
                <View style={styles.services}>
                  {options.slice(0, 3).map((opt) => (
                  <ServiceRow
                    key={opt.id}
                    option={opt}
                    onPress={navigateToBook}
                  />
                  ))}
                </View>
              </View>
            ) : (
              <View style={styles.servicesBlock}>
                <Text style={styles.servicesTitle}>Choisir une course</Text>
                <View style={styles.services}>
                  {fallbackServices.map((service) => (
                    <ServicePreviewRow
                      key={service.id}
                      service={service}
                      onPress={navigateToBook}
                    />
                  ))}
                </View>
              </View>
            )}
          </ScrollView>
        )}
      </View>
    </View>
  );
}

const makeStyles = (theme: OrbiTheme) => StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.colors.backgroundDim,
  },

  // Map — covers everything
  map: {
    ...StyleSheet.absoluteFillObject,
    // leave space for bottom sheet so map isn't fully obscured
    bottom: 0,
  },

  // Top floating bar
  topBarSafe: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingTop: 7,
    paddingBottom: 4,
    gap: 10,
  },
  greetingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    paddingRight: 13,
    paddingLeft: 4,
    paddingVertical: 4,
    maxWidth: SCREEN_W * 0.55,
  },
  avatarCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#111111',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  greetingText: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
    color: theme.colors.text,
  },
  nearbyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxWidth: SCREEN_W * 0.4,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  nearbyText: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
    color: theme.colors.text,
    flexShrink: 1,
  },

  // Bottom sheet
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    borderWidth: 0,
    paddingHorizontal: 16,
    paddingBottom: 28,
    paddingTop: 10,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 999,
    backgroundColor: theme.colors.border,
    alignSelf: 'center',
    marginBottom: 14,
  },
  sheetScroll: {
    flex: 1,
  },
  sheetScrollContent: {
    paddingBottom: 20,
  },

  // Search bar
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F3F3',
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 13,
    gap: 12,
    borderWidth: 1,
    borderColor: '#E8E8E8',
    marginBottom: 10,
  },
  searchBarPressed: {
    transform: [{ scale: 0.985 }],
    opacity: 0.96,
  },
  routeGlyph: {
    width: 24,
    height: 42,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  routePickupDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#111111',
    marginTop: 5,
  },
  routeStem: {
    width: 1,
    flex: 1,
    backgroundColor: '#BDBDBD',
    marginVertical: 4,
  },
  routeDestinationDot: {
    width: 8,
    height: 8,
    borderRadius: 2,
    backgroundColor: '#111111',
    marginBottom: 5,
  },
  searchPlaceholder: {
    flex: 1,
    fontSize: 17,
    color: theme.colors.text,
    fontWeight: '800',
    fontFamily: 'Inter_700Bold',
  },
  searchIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#111111',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickActionRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  quickAction: {
    flex: 1,
    minHeight: 58,
    borderRadius: 8,
    backgroundColor: '#F7F7F7',
    borderWidth: 1,
    borderColor: '#ECECEC',
    paddingHorizontal: 12,
    paddingVertical: 10,
    justifyContent: 'center',
  },
  quickActionTitle: {
    fontSize: 14,
    fontWeight: '800',
    fontFamily: 'Inter_700Bold',
    color: '#111111',
  },
  quickActionMeta: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: '600',
    color: '#6B6B6B',
  },
  // Service rows
  servicesBlock: { gap: 8 },
  servicesTitle: {
    fontSize: 14,
    fontWeight: '800',
    fontFamily: 'Inter_700Bold',
    color: '#111111',
  },
  services: {
    gap: 2,
  },
  servicePressable: {
    marginBottom: 5,
  },
  serviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 0,
    borderBottomWidth: 1,
    borderColor: '#EFEFEF',
  },
  serviceRowPrimary: {
    borderColor: '#EFEFEF',
  },
  serviceRowWarm: {
    borderColor: '#EFEFEF',
  },
  serviceRowPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.988 }],
  },
  serviceIcon: {
    width: 50,
    height: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  serviceInfo: {
    flex: 1,
    gap: 2,
  },
  serviceTitle: {
    fontSize: 16,
    fontWeight: '800',
    fontFamily: 'Inter_600SemiBold',
    color: theme.colors.text,
  },
  serviceMeta: {
    fontSize: 12,
    color: theme.colors.textMuted,
    fontFamily: 'Inter_400Regular',
  },
  serviceTrustNote: {
    fontSize: 11,
    color: theme.colors.textMuted,
    fontFamily: 'Inter_400Regular',
  },
  serviceFare: {
    fontSize: 15,
    fontWeight: '800',
    fontFamily: 'Inter_700Bold',
    color: theme.colors.text,
  },
  serviceFareHint: {
    fontSize: 12,
    fontWeight: '800',
    fontFamily: 'Inter_700Bold',
    color: '#111111',
  },
  servicesPlaceholder: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  servicesPlaceholderText: {
    fontSize: 13,
    color: theme.colors.textMuted,
  },

  // ── Surge badge ───────────────────────────────────────────────────────────
  serviceSurge: {
    fontSize: 10,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
    color: theme.colors.textMuted,
  },

  // ── Fare estimator hint ────────────────────────────────────────────────────
  fareHint: {
    fontSize: 11,
    color: theme.colors.textMuted,
    fontFamily: 'Inter_600SemiBold',
    fontWeight: '600',
    marginTop: 2,
  },

  // ── Offline banner ─────────────────────────────────────────────────────────
  offlineSafe: {
    position: 'absolute',
    top: 54,
    left: 0,
    right: 0,
    zIndex: 45,
  },
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(17,17,17,0.88)',
    marginLeft: 16,
    marginRight: 84,
    marginTop: 0,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  offlineDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: theme.colors.text,
  },
  offlineText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
    color: '#FFFFFF',
  },

  // ── Match card — slides up from bottom when driver matched ───────────────
  matchCard: {
    position: 'absolute',
    bottom: 286,
    left: 16,
    right: 16,
    backgroundColor: theme.colors.surface,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: '#E8E8E8',
    zIndex: 60,
  },
  matchCardDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#111111',
  },
  matchCardTitle: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
    color: theme.colors.text,
  },
  matchCardSub: {
    fontSize: 12,
    color: theme.colors.textMuted,
    fontFamily: 'Inter_400Regular',
    marginTop: 1,
  },
  matchCardCheck: {
    width: 34,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#111111',
    alignItems: 'center',
    justifyContent: 'center',
  },
  matchCardCheckText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0,
  },

  // ── SOS floating button — always visible, Uber-style ─────────────────────
  sosSafe: {
    position: 'absolute',
    top: 0,
    right: 16,
    zIndex: 50,
  },
  sosBtnFixed: {
    marginTop: 58,
    width: 50,
    height: 42,
    borderRadius: 8,
    backgroundColor: '#111111',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sosBtnText: {
    fontSize: 12,
    fontWeight: '800',
    fontFamily: 'Inter_700Bold',
    color: '#FFFFFF',
    letterSpacing: 0,
  },
});

const homeIcon = StyleSheet.create({
  forwardWrap: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  forwardLine: {
    position: 'absolute',
    width: 10,
    height: 2.5,
    borderRadius: 999,
    right: 3,
  },
  forwardLineTop: {
    transform: [{ rotate: '45deg' }, { translateY: -3 }],
  },
  forwardLineBottom: {
    transform: [{ rotate: '-45deg' }, { translateY: 3 }],
  },
});
