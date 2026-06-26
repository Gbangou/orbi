import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
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
  type MyTripsResponse,
  type RideOption,
} from '@orbi/api';
import {
  describeRealtimeEvent,
  describeRealtimeConnection,
  formatXof,
  orbiTheme,
} from '@orbi/ui';
import { restoreRiderSession } from '../../lib/auth';
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

// ── Dot indicator for real-time status ───────────────────────────────────────

function StatusDot({ active }: { active: boolean }) {
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
}

// ── Skeleton row (shimmer loading placeholder) ────────────────────────────────

function SkeletonServiceRow() {
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
}

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

function ServiceVehicleIcon({ isMoto }: { isMoto: boolean }) {
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
}

// ── Service option row ────────────────────────────────────────────────────────

function ServiceRow({ option, onPress }: { option: RideOption; onPress: () => void }) {
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
      <Text style={styles.serviceFare}>{formatXof(option.fare)}</Text>
    </Pressable>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function RiderHomeScreen() {
  const router = useRouter();
  const [options, setOptions] = useState<RideOption[]>([]);
  const [history, setHistory] = useState<MyTripsResponse | null>(null);
  const [isRealtimeSyncing, setIsRealtimeSyncing] = useState(false);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [realNearbyCount, setRealNearbyCount] = useState(0);
  const [userName, setUserName] = useState('');
  const [flowTransitionLabel, setFlowTransitionLabel] = useState<string | null>(null);
  const previousFlowStateRef = useRef<string | null>(null);

  const riderPosition = useRiderPosition({ enabled: true });

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

      if (!silent) {
        const flow = resolveRiderActiveFlow(historyResponse);
        buildRiderHomeStatusLabel({
          flow,
          fullName: me.user.fullName,
          optionCount: response.options.length,
        });
      }
    } catch (error) {
      const feedback = await resolveRiderAppError(error, {
        network: 'Connexion instable. Réessai automatique en cours.',
      });
      if (feedback.shouldClearSessionToken) setSessionToken(null);
      setOptions([]);
      setHistory(null);
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

          {/* Right: nearby count + realtime dot */}
          <Pressable
            style={styles.nearbyBadge}
            onPress={() => router.push('/book')}
          >
            <StatusDot active={isRealtimeSyncing} />
            <Text style={styles.nearbyText}>
              {realNearbyCount > 0
                ? `${realNearbyCount} chauffeur${realNearbyCount > 1 ? 's' : ''}`
                : 'Carte live'}
            </Text>
          </Pressable>
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
                {primaryStatusLabel ? (
                  <Text style={styles.tripCardStatus}>{primaryStatusLabel}</Text>
                ) : null}
                {activeTrip?.pickupCode ? (
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
            {/* Search prompt */}
            <Pressable
              style={styles.searchBar}
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push('/book');
              }}
            >
              <View style={styles.searchDot} />
              <Text style={styles.searchPlaceholder}>Où allez-vous ?</Text>
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
                    onPress={() => router.push('/book')}
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
});
