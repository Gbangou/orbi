import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Linking, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from '../../lib/i18n';
import {
  fetchDriverEarnings,
  fetchDriverOffers,
  fetchDriverProfile,
  fetchMyTrips,
  type DriverFatigueStatus,
  type DriverEarningsResponse,
  type DriverOffer,
  type MyTripsResponse,
  updateDriverAvailabilityWithApi,
} from '@orbi/api';
import {
  describeRealtimeEvent,
  describeRealtimeConnection,
  orbiCopy,
  orbiTheme,
} from '@orbi/ui';
import { OfflineBanner } from '@orbi/ui/src/native';
import { MetricTile } from '../../lib/realtime-widgets';
import { restoreDriverSession } from '../../lib/auth';
import { formatDriverEarningsAmount } from '../../lib/driver-earnings-signal';
import { resolveDriverAppError } from '../../lib/session-feedback';
import {
  useReservationExpiryRefresh,
  useReservationClock,
} from '../../lib/offer-reservation';
import {
  buildDriverFlowTransitionLabel,
  buildDriverHomeStatusLabel,
  resolveDriverActiveFlow,
  resolveDriverReservationChangeSet,
} from '../../lib/driver-active-flow';
import { useDriverPresence } from '../../lib/use-driver-presence';
import { useDriverRealtimeStream } from '../../lib/use-driver-realtime-stream';
import { useLiveRefresh } from '../../lib/use-live-refresh';
import { buildDriverShiftReadiness } from '../../lib/driver-shift-readiness';
import { DriverHomeMapView } from '../../lib/driver-home-map-view';

const touchHitSlop = { top: 8, right: 8, bottom: 8, left: 8 };

const fallbackFatigue: DriverFatigueStatus = {
  state: 'clear',
  completedTrips: 0,
  drivingMinutes: 0,
  windowHours: 8,
  maxCompletedTrips: 8,
  maxDrivingMinutes: 300,
  restMinutes: 30,
  restUntil: null,
  reason: 'Aucun signal fatigue bloquant sur la fenetre recente.',
};

function buildInitials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('') || 'OR'
  );
}

// Mini offer preview — used inside the offer cards
function OfferChip({ offer }: { offer: DriverOffer }) {
  const isMoto = offer.category === 'motorcycle';
  return (
    <View style={chip.wrap}>
      <View style={[chip.dot, { backgroundColor: isMoto ? orbiTheme.colors.teal : orbiTheme.colors.amber }]} />
      <Text style={chip.name}>{buildInitials(offer.riderName)}</Text>
      <Text style={chip.dist}>
        {typeof offer.pickupDistanceKm === 'number'
          ? `${offer.pickupDistanceKm.toFixed(1)} km`
          : `${offer.etaToPickupMinutes} min`}
      </Text>
      <Text style={chip.fare}>{formatDriverEarningsAmount(offer.driverPayout ?? offer.fare)}</Text>
    </View>
  );
}

const chip = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: orbiTheme.colors.backgroundAlt,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: orbiTheme.colors.border,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  name: { fontSize: 13, fontWeight: '700', color: orbiTheme.colors.text },
  dist: { fontSize: 12, color: orbiTheme.colors.textMuted, flex: 1 },
  fare: { fontSize: 13, fontWeight: '700', color: orbiTheme.colors.text },
});

// ── Trip Request Modal — Bolt-style countdown overlay ─────────────────────────
function TripRequestModal({
  offer,
  onAccept,
  onDecline,
}: {
  offer: DriverOffer;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const TOTAL = (() => {
    if (offer.reservationExpiresAt) {
      const rem = Math.round(
        (new Date(offer.reservationExpiresAt).getTime() - Date.now()) / 1000,
      );
      if (rem > 2 && rem <= 60) return rem;
    }
    return 30;
  })();

  const [secondsLeft, setSecondsLeft] = useState(TOTAL);
  const [accepting, setAccepting] = useState(false);
  const progressAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    Animated.timing(progressAnim, {
      toValue: 0,
      duration: TOTAL * 1000,
      useNativeDriver: false,
    }).start();

    const iv = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(iv);
          onDecline();
          return 0;
        }
        return s - 1;
      });
    }, 1000);

    return () => clearInterval(iv);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const isMoto = offer.category === 'motorcycle';
  const isUrgent = secondsLeft <= 7;
  const isWarn = secondsLeft <= 14;
  const accent = isUrgent ? '#FF3B30' : isWarn ? '#FF9500' : '#00C9A7';
  const fareAmt = offer.driverPayout ?? offer.fare;

  return (
    <View style={modal.backdrop} pointerEvents="box-none">
      <View style={[modal.card, { borderColor: accent + '66' }]}>
          {/* Progress bar */}
          <View style={modal.progressTrack}>
            <Animated.View
              style={[
                modal.progressFill,
                {
                  backgroundColor: accent,
                  width: progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
                },
              ]}
            />
          </View>

          {/* Header */}
          <View style={modal.headerRow}>
            <View style={[modal.categoryTag, { backgroundColor: accent + '20', borderColor: accent + '50' }]}>
              <Text style={[modal.categoryTagText, { color: accent }]}>
                {isMoto ? 'MOTO' : 'CONFORT AUTO'}
              </Text>
            </View>
            <View style={[modal.countdownCircle, { borderColor: accent }]}>
              <Text style={[modal.countdownNum, { color: accent }]}>{secondsLeft}</Text>
              <Text style={[modal.countdownUnit, { color: accent + 'AA' }]}>s</Text>
            </View>
          </View>

          {/* Rider */}
          <View style={modal.riderRow}>
            <View style={[modal.avatar, { backgroundColor: accent + '20' }]}>
              <Text style={[modal.avatarText, { color: accent }]}>{buildInitials(offer.riderName)}</Text>
            </View>
            <View style={modal.riderMeta}>
              <Text style={modal.riderName}>{offer.riderName}</Text>
              <Text style={modal.riderSub}>Passager Orbi</Text>
            </View>
          </View>

          {/* Route */}
          <View style={modal.routeCard}>
            <View style={modal.routeRow}>
              <View style={[modal.routeDot, { backgroundColor: '#00C9A7' }]} />
              <Text style={modal.routeLabel} numberOfLines={2}>{offer.pickup}</Text>
            </View>
            <View style={modal.routeStem} />
            <View style={modal.routeRow}>
              <View style={[modal.routeDot, { backgroundColor: '#FF3B30' }]} />
              <Text style={modal.routeLabel} numberOfLines={2}>{offer.destination}</Text>
            </View>
          </View>

          {/* Stats */}
          <View style={modal.statsRow}>
            <View style={modal.stat}>
              <Text style={modal.statVal}>{offer.distanceKm.toFixed(1)} km</Text>
              <Text style={modal.statKey}>Trajet</Text>
            </View>
            <View style={modal.statSep} />
            <View style={modal.stat}>
              <Text style={modal.statVal}>
                {typeof offer.pickupDistanceKm === 'number'
                  ? `${offer.pickupDistanceKm.toFixed(1)} km`
                  : `${offer.etaToPickupMinutes} min`}
              </Text>
              <Text style={modal.statKey}>Jusqu'à vous</Text>
            </View>
            <View style={modal.statSep} />
            <View style={modal.stat}>
              <Text style={modal.statVal}>{offer.etaToPickupMinutes} min</Text>
              <Text style={modal.statKey}>ETA pickup</Text>
            </View>
          </View>

          {/* Fare */}
          <View style={[modal.fareBlock, { backgroundColor: accent + '12', borderColor: accent + '40' }]}>
            <Text style={modal.fareLabel}>VOTRE GAIN ESTIMÉ</Text>
            <Text style={[modal.fareAmt, { color: accent }]}>
              {fareAmt.toLocaleString('fr-BF')} XOF
            </Text>
          </View>

          {/* CTA buttons */}
          <View style={modal.btnRow}>
            <Pressable
              disabled={accepting}
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onDecline();
              }}
              style={({ pressed }) => [modal.declineBtn, pressed && { opacity: 0.7 }]}
            >
              <Text style={modal.declineTxt}>REFUSER</Text>
            </Pressable>
            <Pressable
              disabled={accepting}
              onPress={() => {
                setAccepting(true);
                void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                onAccept();
              }}
              style={({ pressed }) => [
                modal.acceptBtn,
                { backgroundColor: accent },
                (pressed || accepting) && { opacity: 0.8 },
              ]}
            >
              <Text style={modal.acceptTxt}>{accepting ? '...' : 'ACCEPTER'}</Text>
            </Pressable>
          </View>
      </View>
    </View>
  );
}

export default function DriverHomeScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const td = (key: string, opts?: Record<string, unknown>): string => String(t(`driver.${key}`, opts as never));
  const [offers, setOffers] = useState<DriverOffer[]>([]);
  const [history, setHistory] = useState<MyTripsResponse | null>(null);
  const [earnings, setEarnings] = useState<DriverEarningsResponse | null>(null);
  const [acceptanceRate, setAcceptanceRate] = useState<number | null>(null);
  const [statusNote, setStatusNote] = useState('Connexion du compte chauffeur...');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isRealtimeSyncing, setIsRealtimeSyncing] = useState(false);
  const [freshOfferIds, setFreshOfferIds] = useState<string[]>([]);
  const [recentlyExpiredCount, setRecentlyExpiredCount] = useState(0);
  const [activeTripTransitionLabel, setActiveTripTransitionLabel] = useState<string | null>(null);
  const [driverProfileStatus, setDriverProfileStatus] = useState<string>('OFFLINE');
  const [driverFatigue, setDriverFatigue] = useState<DriverFatigueStatus>(fallbackFatigue);
  const [isTogglingAvailability, setIsTogglingAvailability] = useState(false);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [vehicleCount, setVehicleCount] = useState<number | null>(null);
  const previousVisibleOfferIdsRef = useRef<string[] | null>(null);
  const previousFlowStateRef = useRef<string | null>(null);
  const [modalOffer, setModalOffer] = useState<DriverOffer | null>(null);
  const modalShowingRef = useRef(false);

  const loadDriverHome = useCallback(async (silent = false) => {
    if (!silent) setIsRefreshing(true);

    try {
      const { authClient, me, session } = await restoreDriverSession();
      setSessionToken(session.sessionToken);
      const [offersResponse, historyResponse, earningsResponse, profileResponse] = await Promise.all([
        fetchDriverOffers(authClient),
        fetchMyTrips(authClient),
        fetchDriverEarnings(authClient),
        fetchDriverProfile(authClient),
      ]);
      setOffers(offersResponse);
      setHistory(historyResponse);
      setEarnings(earningsResponse);
      setDriverProfileStatus(profileResponse.profile.status);
      setDriverFatigue(profileResponse.profile.fatigue);
      setVehicleCount(profileResponse.profile.vehicles.length);
      setAcceptanceRate(profileResponse.profile.dispatchSignal?.acceptanceRate ?? null);
      const flow = resolveDriverActiveFlow({
        history: historyResponse,
        offers: offersResponse,
        reservationNow: Date.now(),
        driverProfileStatus: profileResponse.profile.status,
      });
      if (!silent) {
        setStatusNote(buildDriverHomeStatusLabel({ flow, fullName: me.user.fullName }));
      }
    } catch (error) {
      const feedback = await resolveDriverAppError(error, {
        surface: 'profile',
        network: orbiCopy.driverNetworkUnavailable,
      });
      if (feedback.shouldClearSessionToken) setSessionToken(null);
      setOffers([]);
      setHistory(null);
      setEarnings(null);
      setDriverProfileStatus('OFFLINE');
      setVehicleCount(null);
      if (!silent) setStatusNote(feedback.message);
    } finally {
      if (silent) setIsRealtimeSyncing(false);
      if (!silent) setIsRefreshing(false);
    }
  }, []);

  useLiveRefresh(() => loadDriverHome(true), 25000);

  useDriverRealtimeStream(
    sessionToken,
    (eventType) => {
      setIsRealtimeSyncing(true);
      setStatusNote(describeRealtimeEvent('driver', eventType));
      void loadDriverHome(true);
    },
    {
      onHeartbeat: () => setStatusNote(describeRealtimeConnection('driver', 'active')),
      onOpen: () => { setIsRealtimeSyncing(false); setStatusNote(describeRealtimeConnection('driver', 'connected')); },
      onError: () => { setIsRealtimeSyncing(false); setStatusNote(describeRealtimeConnection('driver', 'reconnecting')); },
    },
  );

  const reservationNow = useReservationClock();
  const flow = resolveDriverActiveFlow({ history, offers, reservationNow, driverProfileStatus });
  const { activeTrip, activeFlowState, visibleOffers } = flow;

  const shiftReadiness = buildDriverShiftReadiness({ flow, fatigue: driverFatigue, earningsToday: earnings?.summary.today });

  const { latestPosition: driverPosition } = useDriverPresence(
    flow.availabilityStatus === 'ONLINE' || Boolean(activeTrip),
    activeTrip?.id ?? null,
  );
  useReservationExpiryRefresh(visibleOffers, () => loadDriverHome(true), flow.canReceiveOffers);

  useEffect(() => {
    const previousVisibleOfferIds = previousVisibleOfferIdsRef.current;
    const nextVisibleOfferIds = visibleOffers.map((o) => o.id);
    if (previousVisibleOfferIds && flow.canReceiveOffers) {
      const { freshOfferIds: next, expiredOfferIds } =
        resolveDriverReservationChangeSet(previousVisibleOfferIds, nextVisibleOfferIds);
      if (next.length > 0) {
        setFreshOfferIds(next);
        if (!modalShowingRef.current) {
          const firstFresh = visibleOffers.find((o) => next.includes(o.id));
          if (firstFresh) {
            modalShowingRef.current = true;
            setModalOffer(firstFresh);
          }
        }
      }
      if (expiredOfferIds.length > 0) setRecentlyExpiredCount(expiredOfferIds.length);
    }
    previousVisibleOfferIdsRef.current = nextVisibleOfferIds;
  }, [flow.canReceiveOffers, visibleOffers]);

  useEffect(() => {
    if (!freshOfferIds.length) return;
    const t = setTimeout(() => setFreshOfferIds([]), 5000);
    return () => clearTimeout(t);
  }, [freshOfferIds]);

  useEffect(() => {
    if (!recentlyExpiredCount) return;
    const t = setTimeout(() => setRecentlyExpiredCount(0), 5000);
    return () => clearTimeout(t);
  }, [recentlyExpiredCount]);

  useEffect(() => {
    const prev = previousFlowStateRef.current;
    setActiveTripTransitionLabel(
      buildDriverFlowTransitionLabel(prev, activeFlowState, 'home'),
    );
    previousFlowStateRef.current = activeFlowState;
  }, [activeFlowState]);

  useEffect(() => {
    if (!activeTripTransitionLabel) return;
    const t = setTimeout(() => setActiveTripTransitionLabel(null), 5000);
    return () => clearTimeout(t);
  }, [activeTripTransitionLabel]);

  async function handleToggleAvailability() {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsTogglingAvailability(true);
    const nextStatus = flow.availabilityStatus === 'ONLINE' ? 'OFFLINE' : 'ONLINE';
    setStatusNote(
      nextStatus === 'ONLINE'
        ? 'Passage en ligne du compte chauffeur...'
        : 'Passage hors ligne du compte chauffeur...',
    );
    try {
      const { authClient } = await restoreDriverSession();
      const response = await updateDriverAvailabilityWithApi(authClient, nextStatus);
      setDriverProfileStatus(response.availability.status);
      setStatusNote(
        response.availability.status === 'ONLINE'
          ? 'Vous etes maintenant visible pour les nouvelles demandes.'
          : 'Vous etes hors ligne et ne recevrez plus de nouvelles offres.',
      );
      await loadDriverHome(true);
    } catch (error) {
      const feedback = await resolveDriverAppError(error, {
        surface: 'driver-availability',
        fallback: "Le changement de disponibilite n'a pas pu etre applique.",
      });
      if (feedback.shouldClearSessionToken) setSessionToken(null);
      setStatusNote(feedback.message);
    } finally {
      setIsTogglingAvailability(false);
    }
  }

  function handleOfferAccepted() {
    setModalOffer(null);
    modalShowingRef.current = false;
    router.push('/offres');
  }

  function handleOfferDeclined() {
    setModalOffer(null);
    modalShowingRef.current = false;
  }

  function handleNavigateToPickup() {
    const trip = flow.activeTrip;
    if (!trip?.pickupAddress) return;
    const encoded = encodeURIComponent(trip.pickupAddress);
    const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encoded}&travelmode=driving`;
    void Linking.openURL(googleMapsUrl);
  }

  // suppress unused state warnings for vars managed by callbacks
  void isRealtimeSyncing; void recentlyExpiredCount;

  const isOnline = flow.availabilityStatus === 'ONLINE';
  const sheetH = activeTrip ? 250 : isOnline ? 220 : 190;

  return (
    <View style={styles.root}>
      {/* Full-screen map */}
      <DriverHomeMapView
        driverLat={driverPosition?.latitude}
        driverLng={driverPosition?.longitude}
        offers={visibleOffers}
        style={styles.map}
      />

      {/* Offline banner */}
      <OfflineBanner />

      {/* Floating top bar */}
      <SafeAreaView style={styles.topBarSafe} pointerEvents="box-none">
        <View style={styles.topBar}>
          <View style={styles.earningsBadge}>
            <Text style={styles.earningsLabel}>Aujourd'hui</Text>
            <Text style={styles.earningsValue}>
              {earnings?.summary.today
                ? `${earnings.summary.today.toLocaleString('fr-BF')} XOF`
                : '— XOF'}
            </Text>
          </View>

          {/* Acceptance rate badge — Bolt-style */}
          {acceptanceRate !== null ? (
            <View
              style={[
                styles.acceptanceBadge,
                acceptanceRate < 0.7 && styles.acceptanceBadgeLow,
              ]}
            >
              <Text style={[
                styles.acceptanceLabel,
                acceptanceRate < 0.7 && styles.acceptanceLabelLow,
              ]}>
                {Math.round(acceptanceRate * 100)}% acceptées
              </Text>
            </View>
          ) : null}

          <View style={styles.statusPill}>
            <View style={[styles.statusDot, { backgroundColor: isOnline ? orbiTheme.colors.teal : '#BBBBBB' }]} />
            <Text style={[styles.statusPillText, { color: isOnline ? orbiTheme.colors.teal : orbiTheme.colors.textMuted }]}>
              {isOnline ? 'En ligne' : 'Hors ligne'}
            </Text>
          </View>
        </View>
      </SafeAreaView>

      {/* Big Bolt-style toggle (floating, shown when no active trip) */}
      {!activeTrip ? (
        <View style={styles.toggleFloat} pointerEvents="box-none">
          <Pressable
            accessibilityRole="button"
            hitSlop={touchHitSlop}
            onPress={() => void handleToggleAvailability()}
            disabled={isTogglingAvailability || flow.availabilityLocked}
            style={({ pressed }) => [
              styles.toggleBtn,
              isOnline ? styles.toggleOnline : styles.toggleOffline,
              (isTogglingAvailability || flow.availabilityLocked) && styles.toggleDisabled,
              pressed && styles.togglePressed,
            ]}
          >
            <Text style={[styles.toggleLabel, { color: isOnline ? orbiTheme.colors.textSoft : '#FFFFFF' }]}>
              {isTogglingAvailability ? '...' : isOnline ? td('goOffline') : td('goOnline')}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {/* Bottom sheet */}
      <View style={[styles.sheet, { height: sheetH }]}>
        <View style={styles.handle} />

        {activeTrip ? (
          <View style={{ gap: 8 }}>
            <Pressable style={styles.tripCard} onPress={() => router.push('/offres')}>
              <View style={styles.tripStatusDot} />
              <View style={styles.tripInfo}>
                <Text style={styles.tripTitle}>Course active</Text>
                <Text style={styles.tripRoute} numberOfLines={1}>
                  {flow.primaryRouteLabel ?? 'Trajet en cours'}
                </Text>
                <Text style={styles.tripStatus}>{flow.primaryStatusLabel}</Text>
                {activeTripTransitionLabel ? (
                  <Text style={styles.tripTransition}>{activeTripTransitionLabel}</Text>
                ) : null}
              </View>
              <View style={styles.tripArrow}>
                <Text style={styles.tripArrowText}>›</Text>
              </View>
            </Pressable>
            {activeTrip.pickupAddress ? (
              <Pressable
                onPress={handleNavigateToPickup}
                style={({ pressed }) => [styles.navBtn, pressed && styles.navBtnPressed]}
                accessibilityLabel="Ouvrir la navigation vers le point de prise en charge"
              >
                <Text style={styles.navBtnLabel}>{td('navigateToPickup')}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : isOnline ? (
          <View style={styles.onlineSheet}>
            <View style={styles.onlineRow}>
              <View>
                <Text style={styles.onlineTitle}>
                  {visibleOffers.length > 0
                    ? td(visibleOffers.length > 1 ? 'offersAvailable_plural' : 'offersAvailable', { count: visibleOffers.length })
                    : td('waitingForOffers')}
                </Text>
              </View>
              {visibleOffers.length > 0 ? (
                <Pressable onPress={() => router.push('/offres')} style={styles.viewOffersBtn}>
                  <Text style={styles.viewOffersBtnLabel}>Voir</Text>
                </Pressable>
              ) : null}
            </View>
            {visibleOffers.slice(0, 2).map((o) => (
              <OfferChip key={o.id} offer={o} />
            ))}
            {vehicleCount === 0 ? (
              <Pressable onPress={() => router.push('/onboarding')} style={styles.setupBtn}>
                <Text style={styles.setupBtnLabel}>Configurer un véhicule →</Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <View style={styles.offlineSheet}>
            <Text style={styles.offlineTitle}>Vous êtes hors ligne</Text>
            <Text style={styles.offlineSub}>
              Appuyez sur "Passer en ligne" pour recevoir des courses.
            </Text>
            {vehicleCount === 0 ? (
              <Pressable onPress={() => router.push('/onboarding')} style={styles.setupBtn}>
                <Text style={styles.setupBtnLabel}>Configurer un véhicule d'abord →</Text>
              </Pressable>
            ) : null}
          </View>
        )}

        {/* Fatigue warning banner */}
        {driverFatigue.state !== 'clear' ? (
          <View
            style={[
              styles.fatigueBanner,
              driverFatigue.state === 'blocked' && styles.fatigueBannerBlocked,
            ]}
          >
            <Text style={[
              styles.fatigueText,
              driverFatigue.state === 'blocked' && styles.fatigueTextBlocked,
            ]}>
              {driverFatigue.state === 'blocked' ? '🔴 ' : '🟡 '}
              {shiftReadiness.note}
            </Text>
            {driverFatigue.state === 'blocked' && driverFatigue.restUntil ? (
              <Text style={styles.fatigueSubtext}>
                Reprise recommandée après{' '}
                {new Date(driverFatigue.restUntil).toLocaleTimeString('fr-BF', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </Text>
            ) : null}
          </View>
        ) : null}

        {/* Status note (operational feedback) */}
        {statusNote ? (
          <Text style={styles.statusNoteText}>{statusNote}</Text>
        ) : null}

        {/* Refresh — accessible for tests */}
        <Pressable
          onPress={() => void loadDriverHome(false)}
          disabled={isRefreshing}
          style={styles.refreshDirectBtn}
          accessibilityLabel="Actualiser le direct"
        >
          <Text style={styles.refreshDirectBtnLabel}>
            {isRefreshing ? td('refreshing') : td('refresh')}
          </Text>
        </Pressable>
      </View>

      {/* Trip request overlay — Bolt-style countdown */}
      {modalOffer !== null && flow.canReceiveOffers ? (
        <TripRequestModal
          offer={modalOffer}
          onAccept={handleOfferAccepted}
          onDecline={handleOfferDeclined}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: orbiTheme.colors.backgroundDim,
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },

  // Top bar
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
  earningsBadge: {
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    ...orbiTheme.shadows.float,
  },
  earningsLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: orbiTheme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  earningsValue: {
    fontSize: 14,
    fontWeight: '800',
    color: orbiTheme.colors.text,
  },
  statusPill: {
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
  statusPillText: {
    fontSize: 13,
    fontWeight: '600',
  },

  // Acceptance rate badge
  acceptanceBadge: {
    backgroundColor: 'rgba(0,201,167,0.12)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  acceptanceBadgeLow: { backgroundColor: 'rgba(255,149,0,0.12)' },
  acceptanceLabel: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
    color: orbiTheme.colors.teal,
  },
  acceptanceLabelLow: { color: '#FF9500' },

  // Fatigue warning
  fatigueBanner: {
    backgroundColor: 'rgba(255,149,0,0.10)',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,149,0,0.30)',
    gap: 4,
  },
  fatigueBannerBlocked: {
    backgroundColor: 'rgba(255,59,48,0.10)',
    borderColor: 'rgba(255,59,48,0.30)',
  },
  fatigueText: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
    color: '#FF9500',
    lineHeight: 16,
  },
  fatigueTextBlocked: { color: '#FF3B30' },
  fatigueSubtext: {
    fontSize: 11,
    color: orbiTheme.colors.textMuted,
    fontFamily: 'Inter_400Regular',
  },

  // Navigation button
  navBtn: {
    backgroundColor: orbiTheme.colors.text,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navBtnPressed: { opacity: 0.85 },
  navBtnLabel: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
  },

  // Toggle
  toggleFloat: {
    position: 'absolute',
    bottom: 260,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  toggleBtn: {
    borderRadius: 999,
    paddingHorizontal: 32,
    paddingVertical: 16,
    ...orbiTheme.shadows.button,
  },
  toggleOnline: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: orbiTheme.colors.border,
  },
  toggleOffline: {
    backgroundColor: orbiTheme.colors.text,
  },
  toggleDisabled: { opacity: 0.5 },
  togglePressed: { opacity: 0.8 },
  toggleLabel: { fontSize: 16, fontWeight: '700' },

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

  // Active trip
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
  tripStatusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: orbiTheme.colors.teal,
    flexShrink: 0,
  },
  tripInfo: { flex: 1, gap: 2 },
  tripTitle: { fontSize: 14, fontWeight: '700', color: orbiTheme.colors.text },
  tripRoute: { fontSize: 13, color: orbiTheme.colors.textSoft },
  tripStatus: { fontSize: 12, color: orbiTheme.colors.teal, fontWeight: '600' },
  tripTransition: { fontSize: 12, color: orbiTheme.colors.sky, fontWeight: '600' },
  tripArrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: orbiTheme.colors.text,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  tripArrowText: { color: '#FFFFFF', fontSize: 20, fontWeight: '700', marginTop: -2 },

  // Online sheet
  onlineSheet: { gap: 10 },
  onlineRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  onlineTitle: { fontSize: 16, fontWeight: '700', color: orbiTheme.colors.text },
  onlineSub: { fontSize: 13, color: orbiTheme.colors.textMuted, marginTop: 2 },
  viewOffersBtn: {
    backgroundColor: orbiTheme.colors.text,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    ...orbiTheme.shadows.button,
  },
  viewOffersBtnLabel: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },

  // Offline sheet
  offlineSheet: { gap: 8 },
  offlineTitle: { fontSize: 16, fontWeight: '700', color: orbiTheme.colors.text },
  offlineSub: { fontSize: 13, color: orbiTheme.colors.textMuted, lineHeight: 18 },

  // Setup
  setupBtn: {
    alignSelf: 'flex-start',
    backgroundColor: orbiTheme.colors.text,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 4,
  },
  setupBtnLabel: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  refreshDirectBtn: {
    alignSelf: 'center',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: orbiTheme.colors.backgroundAlt,
    borderWidth: 1,
    borderColor: orbiTheme.colors.border,
    marginTop: 6,
  },
  refreshDirectBtnLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: orbiTheme.colors.textMuted,
  },
  statusNoteText: {
    fontSize: 12,
    color: orbiTheme.colors.textMuted,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    paddingHorizontal: 8,
    paddingTop: 4,
  },
});

// ── Modal styles ───────────────────────────────────────────────────────────────
const modal = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(5,14,10,0.82)',
    justifyContent: 'flex-end',
    paddingBottom: 24,
    paddingHorizontal: 12,
  },
  card: {
    backgroundColor: '#0D1F18',
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
  },
  progressTrack: {
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  progressFill: {
    height: 3,
    borderRadius: 2,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 12,
  },
  categoryTag: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  categoryTagText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  countdownCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 1,
  },
  countdownNum: {
    fontSize: 22,
    fontWeight: '800',
    lineHeight: 26,
  },
  countdownUnit: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  riderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 18,
    paddingBottom: 14,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '800',
  },
  riderMeta: { flex: 1 },
  riderName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#F0FFF8',
    marginBottom: 2,
  },
  riderSub: {
    fontSize: 12,
    color: '#4E7B69',
  },
  routeCard: {
    marginHorizontal: 18,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    marginBottom: 14,
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  routeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 3,
    flexShrink: 0,
  },
  routeLabel: {
    flex: 1,
    fontSize: 13,
    color: '#C9E0D4',
    lineHeight: 19,
  },
  routeStem: {
    width: 1,
    height: 10,
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginLeft: 4.5,
    marginVertical: 3,
  },
  statsRow: {
    flexDirection: 'row',
    marginHorizontal: 18,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    paddingVertical: 12,
    marginBottom: 14,
  },
  stat: { flex: 1, alignItems: 'center', gap: 4 },
  statVal: {
    fontSize: 15,
    fontWeight: '700',
    color: '#F0FFF8',
  },
  statKey: {
    fontSize: 10.5,
    color: '#4E7B69',
    textAlign: 'center',
  },
  statSep: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginVertical: 4,
  },
  fareBlock: {
    marginHorizontal: 18,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  fareLabel: {
    fontSize: 10,
    color: '#4E7B69',
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  fareAmt: {
    fontSize: 22,
    fontWeight: '800',
  },
  btnRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 18,
    paddingBottom: 22,
  },
  declineBtn: {
    flex: 1,
    backgroundColor: 'rgba(255,59,48,0.12)',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,59,48,0.30)',
  },
  declineTxt: {
    color: '#FF3B30',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  acceptBtn: {
    flex: 2,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  acceptTxt: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});
