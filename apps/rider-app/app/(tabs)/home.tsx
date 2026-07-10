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
  createTripShareLinkWithApi,
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
  type OrbiTheme,
} from '@orbi/ui';
import { OfflineBanner, OrbiSurface, safeHaptics, useOrbiTheme, VehicleIllustration } from '@orbi/ui/native';
import { createRiderPublicClient, restoreRiderSession } from '../../lib/auth';
import { useTranslation } from '../../lib/i18n';
import { useLiveRefresh } from '../../lib/use-live-refresh';
import { useRiderRealtimeStream } from '../../lib/use-rider-realtime-stream';
import { resolveOrbiApiBaseUrlForRuntime } from '@orbi/config';
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
const SHEET_PEEK = 300;
const SHEET_ACTIVE_TRIP = 282;

function ForwardGlyph({ color }: { color: string }) {
  return (
    <View style={homeIcon.forwardWrap}>
      <View style={[homeIcon.forwardLine, homeIcon.forwardLineTop, { backgroundColor: color }]} />
      <View style={[homeIcon.forwardLine, homeIcon.forwardLineBottom, { backgroundColor: color }]} />
    </View>
  );
}

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

// ── Skeleton row (shimmer loading placeholder) ────────────────────────────────

const SkeletonServiceRow = memo(function SkeletonServiceRow() {
  const theme = useOrbiTheme();
  const skeletonStyles = useMemo(() => makeSkeletonStyles(theme), [theme]);
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 900, useNativeDriver: false }),
        Animated.timing(shimmer, { toValue: 0, duration: 900, useNativeDriver: false }),
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

const makeSkeletonStyles = (theme: OrbiTheme) => StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  icon: { width: 44, height: 44, borderRadius: 12, backgroundColor: theme.colors.backgroundDim },
  info: { flex: 1, gap: 6 },
  titleBar: { height: 13, width: '60%', borderRadius: 6, backgroundColor: theme.colors.backgroundDim },
  metaBar: { height: 10, width: '40%', borderRadius: 5, backgroundColor: theme.colors.backgroundDim },
  fareBar: { height: 13, width: 52, borderRadius: 6, backgroundColor: theme.colors.backgroundDim },
});

// ── Vehicle mini icon ─────────────────────────────────────────────────────────

const ServiceVehicleIcon = memo(function ServiceVehicleIcon({ tier }: { tier: string }) {
  return <VehicleIllustration tier={tier} width={40} height={30} />;
});

// ── Service option row ────────────────────────────────────────────────────────

const ServiceRow = memo(function ServiceRow({ option, onPress }: { option: RideOption; onPress: () => void }) {
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
        <View style={[styles.serviceIcon, { backgroundColor: isMoto ? theme.colors.accentLight : 'rgba(255, 149, 0, 0.10)' }]}>
          <ServiceVehicleIcon tier={option.tier} />
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
  const [realNearbyCount, setRealNearbyCount] = useState(0);
  const [userName, setUserName] = useState('');
  const [flowTransitionLabel, setFlowTransitionLabel] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [isSosBusy, setIsSosBusy] = useState(false);
  const [isShareBusy, setIsShareBusy] = useState(false);
  const [matchedAnim] = useState(() => new Animated.Value(0));
  const [showMatchCard, setShowMatchCard] = useState(false);
  const previousFlowStateRef = useRef<string | null>(null);

  const riderPosition = useRiderPosition({ enabled: true });

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
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1, justifyContent: 'flex-end' }}>
            {/* Surge badge — visible quand demande élevée */}
            {options.some(o => o.surgeActive) ? (
              <View style={[styles.surgeBadge, { flexShrink: 1 }]}>
                <Text style={styles.surgeBadgeText} numberOfLines={1} ellipsizeMode="tail">
                  Forte demande: {options.find(o => o.surgeActive)?.surgeLabel}
                </Text>
              </View>
            ) : null}
            <Pressable
              style={[styles.nearbyBadge, { flexShrink: 1 }]}
              onPress={() => router.push('/book')}
            >
              <StatusDot active={isRealtimeSyncing} />
              <Text style={styles.nearbyText} numberOfLines={1} ellipsizeMode="tail">
                {realNearbyCount > 0
                  ? `${realNearbyCount} chauffeur${realNearbyCount > 1 ? 's' : ''} proche${realNearbyCount > 1 ? 's' : ''}`
                  : 'Recherche'}
              </Text>
            </Pressable>
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
          <>
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
                <ForwardGlyph color={theme.colors.textInverse} />
              </View>
            </Pressable>

            {activeTrip ? (
              <View style={styles.tripQuickActions}>
                <Pressable
                  accessibilityLabel="home-share-trip"
                  disabled={isShareBusy}
                  onPress={() => void handleShareTrip(activeTrip.id)}
                  style={({ pressed }) => [
                    styles.tripQuickAction,
                    pressed ? styles.tripQuickActionPressed : null,
                    isShareBusy ? styles.tripQuickActionDisabled : null,
                  ]}
                >
                  <Text style={styles.tripQuickActionLabel}>
                    {isShareBusy ? 'Creation...' : 'Partager'}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityLabel="home-sos-trip"
                  disabled={isSosBusy}
                  onPress={() => handleSos(activeTrip.id)}
                  style={({ pressed }) => [
                    styles.tripQuickAction,
                    styles.tripQuickActionDanger,
                    pressed ? styles.tripQuickActionPressed : null,
                    isSosBusy ? styles.tripQuickActionDisabled : null,
                  ]}
                >
                  <Text style={[styles.tripQuickActionLabel, styles.tripQuickActionDangerLabel]}>
                    {isSosBusy ? 'SOS...' : 'SOS securite'}
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </>
        ) : (
          /* ── Default: search bar + services ── */
          <>
            {/* Search prompt with fare estimator */}
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
              <View style={styles.searchDot}>
                <View style={styles.searchDotCore} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.searchKicker}>Course maintenant</Text>
                <Text style={styles.searchPlaceholder}>{t('home.whereToGo')}</Text>
                {options.length > 0 ? (
                  <Text style={styles.fareHint}>
                    À partir de {formatXof(options[0].fare)} · {options[0].etaMinutes} min
                  </Text>
                ) : null}
              </View>
              <View style={styles.searchIconWrap}>
                <ForwardGlyph color="#FFFFFF" />
              </View>
            </Pressable>

            {/* Quick services */}
            {options.length > 0 ? (
              <View style={styles.servicesBlock}>
                <View style={styles.servicesHeader}>
                  <Text style={styles.servicesTitle}>Choisir une option</Text>
                  <Text style={styles.servicesHint}>{realNearbyCount > 0 ? `${realNearbyCount} proches` : 'Temps reel'}</Text>
                </View>
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
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
    gap: 10,
  },
  greetingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.colors.surface,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    paddingRight: 14,
    paddingLeft: 4,
    paddingVertical: 4,
    maxWidth: SCREEN_W * 0.55,
    ...theme.shadows.float,
  },
  avatarCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: theme.colors.accentDark,
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
    backgroundColor: theme.colors.surface,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxWidth: SCREEN_W * 0.4,
    ...theme.shadows.float,
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
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    paddingHorizontal: 18,
    paddingBottom: 32,
    paddingTop: 12,
    ...theme.shadows.sheet,
  },
  handle: {
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#D3DEE2',
    alignSelf: 'center',
    marginBottom: 16,
  },

  // Search bar
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#07111F',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    marginBottom: 12,
    ...theme.shadows.card,
  },
  searchBarPressed: {
    transform: [{ scale: 0.985 }],
    opacity: 0.96,
  },
  searchDot: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 194, 168, 0.14)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0, 194, 168, 0.34)',
  },
  searchDotCore: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: theme.colors.teal,
  },
  searchKicker: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.64)',
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  searchPlaceholder: {
    flex: 1,
    fontSize: 17,
    color: '#FFFFFF',
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
  },
  searchIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: theme.colors.teal,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Service rows
  servicesBlock: {
    gap: 8,
  },
  servicesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  servicesTitle: {
    fontSize: 13,
    fontWeight: '800',
    fontFamily: 'Inter_700Bold',
    color: theme.colors.text,
  },
  servicesHint: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
    color: theme.colors.teal,
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
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: theme.colors.backgroundAlt,
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
  },
  serviceRowPrimary: {
    borderColor: 'rgba(0, 194, 168, 0.18)',
  },
  serviceRowWarm: {
    borderColor: 'rgba(255, 149, 0, 0.16)',
  },
  serviceRowPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.988 }],
  },
  serviceIcon: {
    width: 42,
    height: 42,
    borderRadius: 10,
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
    color: theme.colors.text,
  },
  serviceMeta: {
    fontSize: 13,
    color: theme.colors.textMuted,
    fontFamily: 'Inter_400Regular',
  },
  serviceFare: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
    color: theme.colors.text,
  },
  servicesPlaceholder: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  servicesPlaceholderText: {
    fontSize: 13,
    color: theme.colors.textMuted,
  },

  // Active trip card
  tripCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.backgroundAlt,
    borderRadius: 16,
    padding: 14,
    gap: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
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
    backgroundColor: theme.colors.teal,
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
    color: theme.colors.text,
  },
  tripCardSub: {
    fontSize: 13,
    color: theme.colors.textSoft,
  },
  tripCardStatus: {
    fontSize: 12,
    color: theme.colors.teal,
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
  },
  tripCardStatusArrived: {
    color: theme.colors.amber,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
  },
  tripCardCode: {
    fontSize: 13,
    color: theme.colors.textSoft,
    marginTop: 2,
  },
  tripCardCodeValue: {
    color: theme.colors.text,
    fontWeight: '800',
    letterSpacing: 0,
  },
  tripTransition: {
    fontSize: 12,
    color: theme.colors.sky,
    fontWeight: '600',
    marginTop: 2,
  },
  tripCardArrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.colors.text,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  tripQuickActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  tripQuickAction: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.backgroundAlt,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 10,
  },
  tripQuickActionDanger: {
    backgroundColor: '#E53935',
    borderColor: '#E53935',
  },
  tripQuickActionPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.988 }],
  },
  tripQuickActionDisabled: {
    opacity: 0.58,
  },
  tripQuickActionLabel: {
    fontSize: 13,
    fontWeight: '800',
    fontFamily: 'Inter_700Bold',
    color: theme.colors.text,
    textAlign: 'center',
  },
  tripQuickActionDangerLabel: {
    color: '#FFFFFF',
  },

  // ── Surge badge ───────────────────────────────────────────────────────────
  surgeBadge: {
    backgroundColor: 'rgba(242, 169, 0, 0.92)',
    borderRadius: 10,
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
    color: theme.colors.amber,
  },

  // ── Fare estimator hint ────────────────────────────────────────────────────
  fareHint: {
    fontSize: 11,
    color: theme.colors.teal,
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

  // ── Match card — slides up from bottom when driver matched ───────────────
  matchCard: {
    position: 'absolute',
    bottom: 260,
    left: 16,
    right: 16,
    backgroundColor: theme.colors.surface,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 12,
    zIndex: 60,
  },
  matchCardDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: theme.colors.teal,
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
    borderRadius: 10,
    backgroundColor: theme.colors.teal,
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
    marginTop: 60,
    width: 54,
    height: 46,
    borderRadius: 14,
    backgroundColor: '#E53935',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#E53935',
    shadowOpacity: 0.5,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 10,
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
