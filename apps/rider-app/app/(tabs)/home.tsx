import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  Linking,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  createOrbiApiClient,
  fetchMyTrips,
  fetchRideOptionsPreview,
  triggerTripSafetySosWithApi,
  type MyTripsResponse,
  type RideOption,
} from '@orbi/api';
import {
  describeRealtimeEvent,
  describeRealtimeConnection,
  formatXof,
  orbiTheme,
} from '@orbi/ui';
import { OfflineBanner } from '@orbi/ui/src/native';
import { restoreRiderSession } from '../../lib/auth';
import { useTranslation } from '../../lib/i18n';
import { useLiveRefresh } from '../../lib/use-live-refresh';
import { useRiderRealtimeStream } from '../../lib/use-rider-realtime-stream';
import { orbiRuntimeConfig, resolveOrbiApiBaseUrlForRuntime } from '@orbi/config';
import { resolveRiderAppError } from '../../lib/session-feedback';
import {
  buildRiderFlowTransitionLabel,
  buildRiderHomeStatusLabel,
  resolveRiderActiveFlow,
} from '../../lib/rider-active-flow';
import { useRiderPosition } from '../../lib/use-rider-position';
import { HomeMapView } from '../../lib/home-map-view';

const { height: SCREEN_H, width: SCREEN_W } = Dimensions.get('window');

// Bottom sheet heights
const SHEET_PEEK = 230;
const SHEET_ACTIVE_TRIP = 200;

// ── Smart ETA label based on trip lifecycle status ────────────────────────────

function buildTripEtaLabel(status: string | undefined): string | null {
  switch (status) {
    case 'MATCHED':
      return 'Chauffeur confirmé · en route';
    case 'DRIVER_APPROACHING':
      return 'Votre chauffeur approche';
    case 'DRIVER_AT_PICKUP':
      return 'Votre chauffeur est arrivé';
    case 'IN_PROGRESS':
      return 'Trajet en cours';
    default:
      return null;
  }
}

// ── Dot indicator for real-time status ───────────────────────────────────────

const StatusDot = memo(function StatusDot({ active }: { active: boolean }) {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!active) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.5, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, pulse]);

  return (
    <Animated.View
      style={[
        styles.statusDot,
        { backgroundColor: active ? orbiTheme.colors.teal : '#BBBBBB' },
        active ? { transform: [{ scale: pulse }] } : null,
      ]}
    />
  );
});

// ── Skeleton row (shimmer loading placeholder) ────────────────────────────────

const SkeletonServiceRow = memo(function SkeletonServiceRow() {
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0, duration: 900, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [shimmer]);

  const opacity = shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.7] });

  return (
    <Animated.View style={[skeletonStyles.row, { opacity }]}>
      <View style={skeletonStyles.icon} />
      <View style={skeletonStyles.info}>
        <View style={skeletonStyles.titleBar} />
        <View style={skeletonStyles.metaBar} />
      </View>
      <View style={skeletonStyles.fareBar} />
    </Animated.View>
  );
});

const skeletonStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: orbiTheme.colors.border,
  },
  icon: { width: 44, height: 44, borderRadius: 12, backgroundColor: orbiTheme.colors.backgroundDim },
  info: { flex: 1, gap: 6 },
  titleBar: { height: 13, width: '60%', borderRadius: 6, backgroundColor: orbiTheme.colors.backgroundDim },
  metaBar: { height: 10, width: '40%', borderRadius: 5, backgroundColor: orbiTheme.colors.backgroundDim },
  fareBar: { height: 13, width: 52, borderRadius: 6, backgroundColor: orbiTheme.colors.backgroundDim },
});

// ── Vehicle mini icon ─────────────────────────────────────────────────────────

const ServiceVehicleIcon = memo(function ServiceVehicleIcon({ isMoto }: { isMoto: boolean }) {
  const color = isMoto ? orbiTheme.colors.teal : orbiTheme.colors.amber;
  if (isMoto) {
    return (
      <View style={{ width: 28, height: 22, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <View style={{ width: 9, height: 9, borderRadius: 5, borderWidth: 2, borderColor: color }} />
          <View style={{ width: 10, height: 4, borderRadius: 2, backgroundColor: color, opacity: 0.85 }} />
          <View style={{ width: 9, height: 9, borderRadius: 5, borderWidth: 2, borderColor: color }} />
        </View>
      </View>
    );
  }
  return (
    <View style={{ width: 28, height: 22, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: 14, height: 5, borderTopLeftRadius: 4, borderTopRightRadius: 4, backgroundColor: color, opacity: 0.7, alignSelf: 'center', marginBottom: -1 }} />
      <View style={{ width: 24, height: 9, borderRadius: 3, backgroundColor: color, opacity: 0.9 }} />
    </View>
  );
});

// ── Service option row ────────────────────────────────────────────────────────

const ServiceRow = memo(function ServiceRow({ option, onPress }: { option: RideOption; onPress: () => void }) {
  const isMoto = option.category === 'motorcycle';
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.serviceRow, pressed && styles.serviceRowPressed]}
    >
      <View style={[styles.serviceIcon, { backgroundColor: isMoto ? orbiTheme.colors.accentLight : 'rgba(255, 149, 0, 0.10)' }]}>
        <ServiceVehicleIcon isMoto={isMoto} />
      </View>
      <View style={styles.serviceInfo}>
        <Text style={styles.serviceTitle}>{option.title}</Text>
        <Text style={styles.serviceMeta}>
          {`${option.etaMinutes} min · ${option.capacity}`}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 2 }}>
        <Text style={styles.serviceFare}>{formatXof(option.fare)}</Text>
        {option.surgeActive ? (
          <Text style={styles.serviceSurge}>{option.surgeLabel}</Text>
        ) : null}
      </View>
    </Pressable>
  );
});

// ── Main screen ───────────────────────────────────────────────────────────────

export default function RiderHomeScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const [options, setOptions] = useState<RideOption[]>([]);
  const [history, setHistory] = useState<MyTripsResponse | null>(null);
  const [isRealtimeSyncing, setIsRealtimeSyncing] = useState(false);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [realNearbyCount, setRealNearbyCount] = useState(0);
  const [userName, setUserName] = useState('');
  const [flowTransitionLabel, setFlowTransitionLabel] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [isSosBusy, setIsSosBusy] = useState(false);
  const previousFlowStateRef = useRef<string | null>(null);

  const riderPosition = useRiderPosition({ enabled: true });

  // Stable handler reference — prevents ServiceRow remounts
  const navigateToBook = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/book');
  }, [router]);

  const navigateToActivity = useCallback(() => router.push('/activity'), [router]);

  const handleSos = useCallback((tripId: string) => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
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

  const loadHomeContext = useCallback(async (silent = false) => {
    const client = createOrbiApiClient(resolveOrbiApiBaseUrlForRuntime(), {
      version: orbiRuntimeConfig.apiVersion,
    });

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
          isPeakHour: true,
          activeDriverCount: 8,
          openRequestCount: 11,
        }),
        fetchMyTrips(authClient),
      ]);

      setOptions(response.options);
      setHistory(historyResponse);
      setIsOffline(false);

      if (!silent) {
        const flow = resolveRiderActiveFlow(historyResponse);
        buildRiderHomeStatusLabel({
          flow,
          fullName: me.user.fullName,
          optionCount: response.options.length,
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
    previousFlowStateRef.current = activeFlowState;
  }, [activeFlowState]);

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
        onDriversUpdate={setRealNearbyCount}
      />

      {/* ── Offline banner ── */}
      {isOffline ? (
        <SafeAreaView style={styles.offlineSafe} pointerEvents="none">
          <View style={styles.offlineBanner}>
            <View style={styles.offlineDot} />
            <Text style={styles.offlineText}>
              Hors ligne — affichage du dernier état connu
            </Text>
          </View>
        </SafeAreaView>
      ) : null}

      {/* ── SOS Button (floats above sheet, active trip only) ── */}
      {activeTrip ? (
        <Pressable
          onPress={() => handleSos(activeTrip.id)}
          disabled={isSosBusy}
          style={[styles.sosBtn, { bottom: sheetH + 16 }]}
          accessibilityLabel="Bouton SOS urgence"
          accessibilityRole="button"
        >
          <Text style={styles.sosBtnText}>SOS</Text>
        </Pressable>
      ) : null}

      {/* ── Floating top bar ── */}
      <SafeAreaView style={styles.topBarSafe} pointerEvents="box-none">
        <View style={styles.topBar}>
          {/* Left: greeting pill */}
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

          {/* Right: surge badge + nearby + realtime dot */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {/* Surge badge — visible quand demande élevée */}
            {options.some(o => o.surgeActive) ? (
              <View style={styles.surgeBadge}>
                <Text style={styles.surgeBadgeText}>
                  ⚡ {options.find(o => o.surgeActive)?.surgeLabel}
                </Text>
              </View>
            ) : null}
            <Pressable
              style={styles.nearbyBadge}
              onPress={() => router.push('/book')}
            >
              <StatusDot active={isRealtimeSyncing} />
              <Text style={styles.nearbyText}>
                {realNearbyCount > 0
                  ? `${realNearbyCount} chauffeur${realNearbyCount > 1 ? 's' : ''}`
                  : t('home.liveMap', { defaultValue: 'Carte live' })}
              </Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>

      {/* ── Bottom sheet ── */}
      <View style={[styles.sheet, { height: sheetH }]}>
        {/* Handle bar */}
        <View style={styles.handle} />

        {hasActiveFlow ? (
          /* ── Active trip state ── */
          <Pressable
            style={styles.tripCard}
            onPress={() => router.push('/activity')}
          >
            <View style={styles.tripCardLeft}>
              <View style={styles.tripStatusDot} />
              <View style={styles.tripCardText}>
                <Text style={styles.tripCardTitle}>
                  {activeTrip ? 'Course en cours' : 'Demande active'}
                </Text>
                <Text style={styles.tripCardSub} numberOfLines={1}>
                  {activeTrip
                    ? `${activeTrip.pickupAddress} → ${activeTrip.destinationAddress}`
                    : `${activeRequest?.pickupAddress} → ${activeRequest?.destinationAddress}`}
                </Text>
                {/* Smart ETA label */}
                {activeTrip ? (() => {
                  const eta = buildTripEtaLabel(activeTrip.status);
                  if (!eta) return null;
                  const isArrived = activeTrip.status === 'DRIVER_AT_PICKUP';
                  return (
                    <Text style={[styles.tripCardStatus, isArrived && styles.tripCardStatusArrived]}>
                      {eta}
                    </Text>
                  );
                })() : null}
                {activeTrip?.pickupCode && activeTrip.status === 'DRIVER_AT_PICKUP' ? (
                  <Text style={styles.tripCardCode}>
                    Code : <Text style={styles.tripCardCodeValue}>{activeTrip.pickupCode}</Text>
                  </Text>
                ) : null}
                {flowTransitionLabel ? (
                  <Text style={styles.tripTransition}>{flowTransitionLabel}</Text>
                ) : null}
              </View>
            </View>
            <View style={styles.tripCardArrow}>
              <Text style={styles.tripCardArrowText}>›</Text>
            </View>
          </Pressable>
        ) : (
          /* ── Default: search bar + services ── */
          <>
            {/* Search prompt with fare estimator */}
            <Pressable
              style={styles.searchBar}
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push('/book');
              }}
            >
              <View style={styles.searchDot} />
              <View style={{ flex: 1 }}>
                <Text style={styles.searchPlaceholder}>{t('home.whereToGo')}</Text>
                {options.length > 0 ? (
                  <Text style={styles.fareHint}>
                    À partir de {formatXof(options[0].fare)} · {options[0].etaMinutes} min
                  </Text>
                ) : null}
              </View>
              <View style={styles.searchIconWrap}>
                <Text style={styles.searchIconText}>›</Text>
              </View>
            </Pressable>

            {/* Quick services */}
            {options.length > 0 ? (
              <View style={styles.services}>
                {options.slice(0, 3).map((opt) => (
                  <ServiceRow
                    key={opt.id}
                    option={opt}
                    onPress={navigateToBook}
                  />
                ))}
              </View>
            ) : (
              <View style={styles.services}>
                <SkeletonServiceRow />
                <SkeletonServiceRow />
                <SkeletonServiceRow />
              </View>
            )}
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: orbiTheme.colors.backgroundDim,
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
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
    gap: 10,
  },
  greetingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    paddingRight: 14,
    paddingLeft: 4,
    paddingVertical: 4,
    maxWidth: SCREEN_W * 0.55,
    ...orbiTheme.shadows.float,
  },
  avatarCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: orbiTheme.colors.text,
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
    color: orbiTheme.colors.text,
  },
  nearbyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    ...orbiTheme.shadows.float,
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
    color: orbiTheme.colors.text,
  },

  // Bottom sheet
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 16,
    paddingBottom: 32,
    paddingTop: 10,
    ...orbiTheme.shadows.sheet,
  },
  handle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E0E0E0',
    alignSelf: 'center',
    marginBottom: 14,
  },

  // Search bar
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: orbiTheme.colors.backgroundAlt,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: orbiTheme.colors.border,
    marginBottom: 14,
  },
  searchDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: orbiTheme.colors.text,
  },
  searchPlaceholder: {
    flex: 1,
    fontSize: 16,
    color: orbiTheme.colors.textMuted,
    fontWeight: '500',
    fontFamily: 'Inter_500Medium',
  },
  searchIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: orbiTheme.colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchIconText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginTop: -2,
  },

  // Service rows
  services: {
    gap: 2,
  },
  serviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: orbiTheme.colors.border,
  },
  serviceRowPressed: {
    opacity: 0.7,
  },
  serviceIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  serviceInfo: {
    flex: 1,
    gap: 2,
  },
  serviceTitle: {
    fontSize: 15,
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
    color: orbiTheme.colors.text,
  },
  serviceMeta: {
    fontSize: 13,
    color: orbiTheme.colors.textMuted,
    fontFamily: 'Inter_400Regular',
  },
  serviceFare: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
    color: orbiTheme.colors.text,
  },
  servicesPlaceholder: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  servicesPlaceholderText: {
    fontSize: 13,
    color: orbiTheme.colors.textMuted,
  },

  // Active trip card
  tripCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: orbiTheme.colors.backgroundAlt,
    borderRadius: 16,
    padding: 14,
    gap: 12,
    borderWidth: 1,
    borderColor: orbiTheme.colors.border,
  },
  tripCardLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  tripStatusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: orbiTheme.colors.teal,
    marginTop: 4,
    flexShrink: 0,
  },
  tripCardText: {
    flex: 1,
    gap: 3,
  },
  tripCardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: orbiTheme.colors.text,
  },
  tripCardSub: {
    fontSize: 13,
    color: orbiTheme.colors.textSoft,
  },
  tripCardStatus: {
    fontSize: 12,
    color: orbiTheme.colors.teal,
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
  },
  tripCardStatusArrived: {
    color: orbiTheme.colors.amber,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
  },
  tripCardCode: {
    fontSize: 13,
    color: orbiTheme.colors.textSoft,
    marginTop: 2,
  },
  tripCardCodeValue: {
    color: orbiTheme.colors.text,
    fontWeight: '800',
    letterSpacing: 2,
  },
  tripTransition: {
    fontSize: 12,
    color: orbiTheme.colors.sky,
    fontWeight: '600',
    marginTop: 2,
  },
  tripCardArrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: orbiTheme.colors.text,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  tripCardArrowText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    marginTop: -2,
  },

  // ── Surge badge ───────────────────────────────────────────────────────────
  surgeBadge: {
    backgroundColor: 'rgba(255, 149, 0, 0.90)',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  surgeBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
    color: '#FFFFFF',
  },
  serviceSurge: {
    fontSize: 10,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
    color: orbiTheme.colors.amber,
  },

  // ── Fare estimator hint ────────────────────────────────────────────────────
  fareHint: {
    fontSize: 11,
    color: orbiTheme.colors.teal,
    fontFamily: 'Inter_600SemiBold',
    fontWeight: '600',
    marginTop: 2,
  },

  // ── Offline banner ─────────────────────────────────────────────────────────
  offlineSafe: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 99,
  },
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(17,17,17,0.88)',
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  offlineDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#FF9500',
  },
  offlineText: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
    color: '#FFFFFF',
  },

  // ── SOS floating button ────────────────────────────────────────────────────
  sosBtn: {
    position: 'absolute',
    right: 16,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: orbiTheme.colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: orbiTheme.colors.danger,
    shadowOpacity: 0.45,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 10,
  },
  sosBtnText: {
    fontSize: 13,
    fontWeight: '800',
    fontFamily: 'Inter_700Bold',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
});
