import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Linking, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from '../../lib/i18n';
import {
  fetchDriverEarnings,
  fetchDriverDispatchReadiness,
  fetchDriverOffers,
  fetchDriverProfile,
  fetchMyTrips,
  type DriverDispatchReadinessResponse,
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
  type OrbiTheme,
} from '@orbi/ui';
import {
  OrbiButton,
  OrbiStatusBanner,
  PersonBadge,
  safeHaptics,
  useOrbiTheme,
  VehicleIllustration,
} from '@orbi/ui/native';
import { restoreDriverSession } from '../../lib/auth';
import {
  formatDriverEarningsAmount,
  formatDriverEarningsRatioPercent,
} from '../../lib/driver-earnings-signal';
import { resolveDriverAppError } from '../../lib/session-feedback';
import {
  useReservationExpiryRefresh,
  useReservationClock,
} from '../../lib/offer-reservation';
import {
  formatDriverRestUntilTime,
  getDriverTimeLeftMs,
} from '../../lib/driver-date-format';
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
import {
  formatDriverOfferDistance,
  formatDriverOfferMoney,
  formatDriverOfferMinutes,
  toFiniteOfferNumber,
} from '../../lib/offer-signal';
import { normalizeDriverProfileResponse } from '../../lib/driver-profile-normalizer';
import { buildDriverDispatchReadinessNote } from '../../lib/driver-dispatch-readiness';

const touchHitSlop = { top: 8, right: 8, bottom: 8, left: 8 };

function ForwardGlyph() {
  return (
    <View style={driverHomeIcon.forwardWrap}>
      <View style={[driverHomeIcon.forwardLine, driverHomeIcon.forwardLineTop]} />
      <View style={[driverHomeIcon.forwardLine, driverHomeIcon.forwardLineBottom]} />
    </View>
  );
}

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
  const theme = useOrbiTheme();
  const chip = useMemo(() => makeChipStyles(theme), [theme]);
  const isMoto = offer.category === 'motorcycle';
  const pickupDistance = formatDriverOfferDistance(
    offer.pickupDistanceKm,
    formatDriverOfferMinutes(offer.etaToPickupMinutes, 'ETA indisponible'),
  );
  return (
    <View style={chip.wrap}>
      <VehicleIllustration tier={isMoto ? 'moto-standard' : 'car-standard'} width={30} height={22} />
      <Text style={chip.name}>{buildInitials(offer.riderName)}</Text>
      <Text style={chip.dist}>{pickupDistance}</Text>
      <Text style={chip.fare}>{formatDriverEarningsAmount(offer.driverPayout ?? offer.fare)}</Text>
    </View>
  );
}

const makeChipStyles = (theme: OrbiTheme) => StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
  },
  name: { fontSize: 13, fontWeight: '700', color: theme.colors.text },
  dist: { fontSize: 12, color: theme.colors.textMuted, flex: 1 },
  fare: { fontSize: 13, fontWeight: '800', color: theme.colors.text },
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
  const theme = useOrbiTheme();
  const modal = useMemo(() => makeModalStyles(theme), [theme]);
  const TOTAL = (() => {
    if (offer.reservationExpiresAt) {
      const timeLeftMs = getDriverTimeLeftMs(offer.reservationExpiresAt, Date.now());
      const rem = timeLeftMs !== null ? Math.round(timeLeftMs / 1000) : 0;
      if (rem > 2 && rem <= 60) return rem;
    }
    return 30;
  })();

  const [secondsLeft, setSecondsLeft] = useState(TOTAL);
  const [accepting, setAccepting] = useState(false);
  const progressAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    safeHaptics.notify('success');

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
  const pickupDistanceLabel = formatDriverOfferDistance(
    offer.pickupDistanceKm,
    formatDriverOfferMinutes(offer.etaToPickupMinutes, 'Pickup indisponible'),
  );
  const fareAmt = toFiniteOfferNumber(offer.driverPayout)
    ?? toFiniteOfferNumber(offer.fare);

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
            <View style={modal.headerVehicle}>
              <VehicleIllustration tier={isMoto ? 'moto-standard' : 'car-standard'} width={66} height={48} />
            </View>
            <View style={modal.headerCopy}>
              <View style={[modal.categoryTag, { backgroundColor: accent + '20', borderColor: accent + '50' }]}>
                <Text style={[modal.categoryTagText, { color: accent }]}>
                  {isMoto ? 'MOTO' : 'CONFORT AUTO'}
                </Text>
              </View>
              <Text style={modal.offerTitle}>Nouvelle course</Text>
              <Text style={modal.offerSub} numberOfLines={1}>
                {pickupDistanceLabel} pour rejoindre le client
              </Text>
            </View>
            <View style={[modal.countdownCircle, { borderColor: accent }]}>
              <Text style={[modal.countdownNum, { color: accent }]}>{secondsLeft}</Text>
              <Text style={[modal.countdownUnit, { color: accent + 'AA' }]}>s</Text>
            </View>
          </View>

          {/* Rider */}
          <PersonBadge name={offer.riderName} subtitle="Passager Orbi" size={44} style={modal.riderRow} />

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
              <Text style={modal.statVal}>
                {formatDriverOfferDistance(offer.distanceKm, 'ND')}
              </Text>
              <Text style={modal.statKey}>Trajet</Text>
            </View>
            <View style={modal.statSep} />
            <View style={modal.stat}>
              <Text style={modal.statVal}>{pickupDistanceLabel}</Text>
              <Text style={modal.statKey}>Jusqu'à vous</Text>
            </View>
            <View style={modal.statSep} />
            <View style={modal.stat}>
              <Text style={modal.statVal}>
                {formatDriverOfferMinutes(offer.etaToPickupMinutes, 'ND')}
              </Text>
              <Text style={modal.statKey}>ETA pickup</Text>
            </View>
          </View>

          {/* Fare */}
          <View style={[modal.fareBlock, { backgroundColor: accent + '12', borderColor: accent + '40' }]}>
            <View>
              <Text style={modal.fareLabel}>Votre gain estimé</Text>
              <Text style={modal.fareSub}>Prix visible avant acceptation</Text>
            </View>
            <Text style={[modal.fareAmt, { color: accent }]}>
              {formatDriverOfferMoney(fareAmt)}
            </Text>
          </View>

          {/* CTA buttons */}
          <View style={modal.btnRow}>
            <Pressable
              disabled={accepting}
              onPress={() => {
                safeHaptics.impact('light');
                onDecline();
              }}
              style={({ pressed }) => [
                modal.declineBtn,
                pressed && { opacity: 0.72, transform: [{ scale: 0.985 }] },
              ]}
            >
              <Text style={modal.declineTxt}>REFUSER</Text>
            </Pressable>
            <Pressable
              disabled={accepting}
              onPress={() => {
                setAccepting(true);
                safeHaptics.notify('success');
                onAccept();
              }}
              style={({ pressed }) => [
                modal.acceptBtn,
                { backgroundColor: accent },
                (pressed || accepting) && { opacity: 0.86, transform: [{ scale: 0.985 }] },
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
  const theme = useOrbiTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { t } = useTranslation();
  const td = (key: string, opts?: Record<string, unknown>): string => String(t(`driver.${key}`, opts as never));
  const [offers, setOffers] = useState<DriverOffer[]>([]);
  const [history, setHistory] = useState<MyTripsResponse | null>(null);
  const [earnings, setEarnings] = useState<DriverEarningsResponse | null>(null);
  const [dispatchReadiness, setDispatchReadiness] =
    useState<DriverDispatchReadinessResponse['readiness'] | null>(null);
  const [acceptanceRate, setAcceptanceRate] = useState<number | null>(null);
  const [statusNote, setStatusNote] = useState('Synchronisation terrain en cours...');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isRealtimeSyncing, setIsRealtimeSyncing] = useState(false);
  const [freshOfferIds, setFreshOfferIds] = useState<string[]>([]);
  const [recentlyExpiredCount, setRecentlyExpiredCount] = useState(0);
  const [activeTripTransitionLabel, setActiveTripTransitionLabel] = useState<string | null>(null);
  const [driverProfileStatus, setDriverProfileStatus] = useState<string>('OFFLINE');
  const [driverProfileId, setDriverProfileId] = useState<string | null>(null);
  const [driverVerificationStatus, setDriverVerificationStatus] =
    useState<string>('PENDING');
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
      const [
        offersResponse,
        historyResponse,
        earningsResponse,
        profileResponse,
      ] = await Promise.all([
        fetchDriverOffers(authClient),
        fetchMyTrips(authClient),
        fetchDriverEarnings(authClient),
        fetchDriverProfile(authClient),
      ]);
      let dispatchReadinessResponse: DriverDispatchReadinessResponse | null =
        null;
      try {
        dispatchReadinessResponse = await fetchDriverDispatchReadiness(authClient);
      } catch {
        dispatchReadinessResponse = null;
      }
      const normalizedProfile = normalizeDriverProfileResponse(profileResponse);
      setOffers(offersResponse);
      setHistory(historyResponse);
      setEarnings(earningsResponse);
      setDispatchReadiness(dispatchReadinessResponse?.readiness ?? null);
      setDriverProfileId(normalizedProfile.profile.id);
      setDriverProfileStatus(normalizedProfile.profile.status);
      setDriverVerificationStatus(normalizedProfile.profile.verificationStatus);
      setDriverFatigue(normalizedProfile.profile.fatigue);
      setVehicleCount(normalizedProfile.profile.vehicles.length);
      setAcceptanceRate(normalizedProfile.profile.dispatchSignal?.acceptanceRate ?? null);
      const flow = resolveDriverActiveFlow({
        history: historyResponse,
        offers: offersResponse,
        reservationNow: Date.now(),
        driverProfileStatus: normalizedProfile.profile.status,
        driverVerificationStatus: normalizedProfile.profile.verificationStatus,
      });
      if (!silent) {
        setStatusNote(
          flow.canReceiveOffers && !flow.visibleOffers.length
            ? buildDriverDispatchReadinessNote(dispatchReadinessResponse?.readiness ?? null)
            : buildDriverHomeStatusLabel({ flow, fullName: me.user.fullName }),
        );
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
      setDriverProfileId(null);
      setDriverProfileStatus('OFFLINE');
      setDriverVerificationStatus('PENDING');
      setDispatchReadiness(null);
      setVehicleCount(null);
      if (!silent) setStatusNote(feedback.message);
    } finally {
      if (silent) setIsRealtimeSyncing(false);
      if (!silent) setIsRefreshing(false);
    }
  }, []);

  useLiveRefresh(() => loadDriverHome(true), 5000);

  useDriverRealtimeStream(
    sessionToken,
    driverProfileId,
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
  const flow = resolveDriverActiveFlow({
    history,
    offers,
    reservationNow,
    driverProfileStatus,
    driverVerificationStatus,
  });
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
    if (!flow.canReceiveOffers || modalShowingRef.current || modalOffer) {
      return;
    }

    const firstOffer = visibleOffers[0] ?? null;
    if (firstOffer) {
      modalShowingRef.current = true;
      setFreshOfferIds((current) =>
        current.includes(firstOffer.id) ? current : [firstOffer.id, ...current],
      );
      setModalOffer(firstOffer);
    }
  }, [flow.canReceiveOffers, modalOffer, visibleOffers]);

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
    safeHaptics.impact('medium');
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
      const reservedOfferCount = response.availability.reservedOfferCount ?? 0;
      setStatusNote(
        response.availability.status === 'ONLINE'
          ? reservedOfferCount > 0
            ? `${reservedOfferCount} demande${reservedOfferCount > 1 ? 's' : ''} compatible${reservedOfferCount > 1 ? 's' : ''} reservee${reservedOfferCount > 1 ? 's' : ''}.`
            : 'Vous etes maintenant visible pour les nouvelles demandes.'
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
  // Le statut brut passe a BUSY des qu'une mission est acceptee — sans ce cas
  // a part, le badge retombe sur "Hors ligne" alors que le chauffeur est bien
  // en ligne, juste occupe (constate en direct avec une vraie mission active).
  const isOnDuty = isOnline || Boolean(activeTrip);
  const statusLabel = activeTrip
    ? 'En mission'
    : isOnline && !flow.accountCanReceiveOffers
      ? 'Dossier en revue'
      : isOnline
        ? 'En ligne'
        : 'Hors ligne';
  const sheetH = activeTrip ? 244 : isOnline ? 246 : 226;

  return (
    <View style={styles.root}>
      {/* Full-screen map */}
      <DriverHomeMapView
        driverLat={driverPosition?.latitude}
        driverLng={driverPosition?.longitude}
        offers={visibleOffers}
        style={styles.map}
      />

      {/* Floating top bar */}
      <SafeAreaView style={styles.topBarSafe} pointerEvents="box-none">
        <View style={styles.topBar}>
          <View style={styles.earningsBadge}>
            <Text style={styles.earningsLabel}>Aujourd'hui</Text>
            <Text style={styles.earningsValue}>
              {earnings ? formatDriverEarningsAmount(earnings.summary.today) : '0 XOF'}
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
                {formatDriverEarningsRatioPercent(acceptanceRate)} acceptées
              </Text>
            </View>
          ) : null}

          <View style={styles.statusPill}>
            <View style={[styles.statusDot, { backgroundColor: isOnDuty ? theme.colors.teal : '#BBBBBB' }]} />
            <Text style={[styles.statusPillText, { color: isOnDuty ? theme.colors.teal : theme.colors.textMuted }]}>
              {statusLabel}
            </Text>
          </View>
        </View>
      </SafeAreaView>

      {/* Big Bolt-style toggle (floating, shown when no active trip) */}
      {!activeTrip ? (
        <View style={styles.toggleFloat} pointerEvents="box-none">
          <OrbiButton
            hitSlop={touchHitSlop}
            onPress={() => void handleToggleAvailability()}
            label={isOnline ? td('goOffline') : td('goOnline')}
            loading={isTogglingAvailability}
            disabled={flow.availabilityLocked}
            variant={isOnline ? 'secondary' : 'primary'}
            tone="teal"
            style={styles.toggleBtn}
            labelStyle={styles.toggleLabel}
          />
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
                <ForwardGlyph />
              </View>
            </Pressable>
            {activeTrip.pickupAddress ? (
              <OrbiButton
                onPress={handleNavigateToPickup}
                accessibilityLabel="Ouvrir la navigation vers le point de prise en charge"
                label={td('navigateToPickup')}
                tone="teal"
                style={styles.navBtn}
              />
            ) : null}
          </View>
        ) : isOnline ? (
          <View style={styles.onlineSheet}>
            <View style={styles.onlineRow}>
              <View>
                <Text style={styles.onlineTitle}>
                  {!flow.accountCanReceiveOffers
                    ? 'Dossier chauffeur en validation'
                    : visibleOffers.length > 0
                    ? td(visibleOffers.length > 1 ? 'offersAvailable_plural' : 'offersAvailable', { count: visibleOffers.length })
                    : td('waitingForOffers')}
                </Text>
                {!flow.accountCanReceiveOffers ? (
                  <Text style={styles.statusNoteText} numberOfLines={2}>
                    {buildDriverDispatchReadinessNote(dispatchReadiness)}
                  </Text>
                ) : null}
              </View>
              {flow.accountCanReceiveOffers && visibleOffers.length > 0 ? (
                <OrbiButton
                  onPress={() => router.push('/offres')}
                  label="Voir"
                  tone="teal"
                  style={styles.viewOffersBtn}
                  labelStyle={styles.compactButtonLabel}
                />
              ) : null}
            </View>
            {visibleOffers.slice(0, 2).map((o) => (
              <OfferChip key={o.id} offer={o} />
            ))}
            {vehicleCount === 0 ? (
              <OrbiButton
                onPress={() => router.push('/onboarding')}
                label="Configurer un véhicule"
                tone="teal"
                style={styles.setupBtn}
                labelStyle={styles.compactButtonLabel}
              />
            ) : null}
          </View>
        ) : (
          <View style={styles.offlineSheet}>
            <View style={styles.offlineHeroRow}>
              <View style={styles.offlinePulse}>
                <View style={styles.offlinePulseDot} />
              </View>
              <View style={styles.offlineHeroCopy}>
                <Text style={styles.offlineTitle}>Vous êtes hors ligne</Text>
                <Text style={styles.offlineSub} numberOfLines={2}>
                  Activez le direct pour apparaître dans le dispatch.
                </Text>
              </View>
            </View>
            <View style={styles.offlineMetricRow}>
              <View style={styles.offlineMetric}>
                <Text style={styles.offlineMetricValue}>
                  {vehicleCount === 0 ? 'À configurer' : 'Prêt'}
                </Text>
                <Text style={styles.offlineMetricLabel}>Véhicule</Text>
              </View>
              <View style={styles.offlineMetricDivider} />
              <View style={styles.offlineMetric}>
                <Text style={styles.offlineMetricValue}>
                  {driverFatigue.state === 'clear' ? 'OK' : 'Pause'}
                </Text>
                <Text style={styles.offlineMetricLabel}>Fatigue</Text>
              </View>
              <View style={styles.offlineMetricDivider} />
              <View style={styles.offlineMetric}>
                <Text style={styles.offlineMetricValue}>
                  {formatDriverEarningsRatioPercent(acceptanceRate)}
                </Text>
                <Text style={styles.offlineMetricLabel}>Accept.</Text>
              </View>
            </View>
            {vehicleCount === 0 ? (
              <OrbiButton
                onPress={() => router.push('/onboarding')}
                label="Configurer un véhicule"
                tone="teal"
                style={styles.setupBtn}
                labelStyle={styles.compactButtonLabel}
              />
            ) : null}
          </View>
        )}

        {/* Fatigue warning banner */}
        {driverFatigue.state !== 'clear' ? (
          <OrbiStatusBanner
            tone={driverFatigue.state === 'blocked' ? 'danger' : 'amber'}
            title={driverFatigue.state === 'blocked' ? 'Pause obligatoire' : 'Pause conseillée'}
            message={
              driverFatigue.state === 'blocked' && driverFatigue.restUntil
                ? `${shiftReadiness.note} Reprise recommandée après ${formatDriverRestUntilTime(driverFatigue.restUntil, 'heure indisponible')}.`
                : shiftReadiness.note
            }
          />
        ) : null}

        {/* Status note (operational feedback) */}
        {statusNote ? (
          <Text style={styles.statusNoteText} numberOfLines={2}>{statusNote}</Text>
        ) : null}

        {/* Refresh — accessible for tests */}
        <OrbiButton
          onPress={() => void loadDriverHome(false)}
          loading={isRefreshing}
          accessibilityLabel="Actualiser le direct"
          label={td('refresh')}
          variant="secondary"
          tone="teal"
          style={styles.refreshDirectBtn}
          labelStyle={styles.refreshDirectBtnLabel}
        />
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

const makeStyles = (theme: OrbiTheme) => StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.colors.backgroundDim,
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
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    paddingHorizontal: 15,
    paddingVertical: 9,
    ...theme.shadows.float,
  },
  earningsLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  earningsValue: {
    fontSize: 14,
    fontWeight: '800',
    color: theme.colors.text,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: theme.colors.surface,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    paddingHorizontal: 13,
    paddingVertical: 9,
    ...theme.shadows.float,
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
    color: theme.colors.teal,
  },
  acceptanceLabelLow: { color: '#FF9500' },

  // Navigation button
  navBtn: {
    borderRadius: 12,
    minHeight: 46,
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
    minWidth: 204,
    paddingHorizontal: 30,
    minHeight: 56,
  },
  toggleLabel: { fontSize: 16, fontWeight: '800', fontFamily: 'Inter_700Bold' },

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
    paddingHorizontal: 16,
    paddingBottom: 24,
    paddingTop: 10,
    ...theme.shadows.sheet,
  },
  handle: {
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#D3DEE2',
    alignSelf: 'center',
    marginBottom: 12,
  },

  // Active trip
  tripCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: 18,
    padding: 13,
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(0, 194, 168, 0.26)',
    ...theme.shadows.card,
  },
  tripStatusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.colors.teal,
    flexShrink: 0,
  },
  tripInfo: { flex: 1, gap: 2 },
  tripTitle: { fontSize: 14, fontWeight: '700', color: theme.colors.text },
  tripRoute: { fontSize: 13, color: theme.colors.textSoft },
  tripStatus: { fontSize: 12, color: theme.colors.teal, fontWeight: '600' },
  tripTransition: { fontSize: 12, color: theme.colors.sky, fontWeight: '600' },
  tripArrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.colors.teal,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  // Online sheet
  onlineSheet: { gap: 8 },
  onlineRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  onlineTitle: { fontSize: 16, fontWeight: '800', color: theme.colors.text },
  onlineSub: { fontSize: 13, color: theme.colors.textMuted, marginTop: 2 },
  viewOffersBtn: {
    borderRadius: 10,
    minHeight: 38,
    paddingHorizontal: 14,
  },
  compactButtonLabel: { fontSize: 13 },

  // Offline sheet
  offlineSheet: { gap: 10 },
  offlineHeroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  offlinePulse: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,201,167,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(0,201,167,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  offlinePulseDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: theme.colors.teal,
    shadowColor: theme.colors.teal,
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  offlineHeroCopy: {
    flex: 1,
    minWidth: 0,
  },
  offlineTitle: { fontSize: 16, fontWeight: '700', color: theme.colors.text },
  offlineSub: { fontSize: 13, color: theme.colors.textMuted, lineHeight: 18 },
  offlineMetricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.backgroundAlt,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  offlineMetric: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  offlineMetricValue: {
    fontSize: 13,
    fontWeight: '800',
    color: theme.colors.text,
  },
  offlineMetricLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: theme.colors.textMuted,
  },
  offlineMetricDivider: {
    width: 1,
    height: 24,
    backgroundColor: theme.colors.borderSoft,
  },

  // Setup
  setupBtn: {
    alignSelf: 'flex-start',
    borderRadius: 10,
    minHeight: 38,
    paddingHorizontal: 12,
    marginTop: 4,
  },
  refreshDirectBtn: {
    alignSelf: 'center',
    borderRadius: 999,
    minHeight: 30,
    paddingHorizontal: 12,
    marginTop: 2,
  },
  refreshDirectBtnLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.colors.textMuted,
  },
  statusNoteText: {
    fontSize: 11,
    color: theme.colors.textMuted,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    paddingHorizontal: 8,
    paddingTop: 2,
  },
});

// ── Modal styles ───────────────────────────────────────────────────────────────
const makeModalStyles = (theme: OrbiTheme) => StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(4,12,10,0.86)',
    justifyContent: 'flex-end',
    paddingBottom: 18,
    paddingHorizontal: 12,
  },
  card: {
    backgroundColor: '#091814',
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
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 10,
    gap: 12,
  },
  headerVehicle: {
    flexShrink: 0,
  },
  headerCopy: {
    flex: 1,
    gap: 4,
  },
  categoryTag: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  categoryTagText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0,
  },
  offerTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#F2FFF8',
    letterSpacing: 0,
  },
  offerSub: {
    fontSize: 12,
    color: '#8DAA9E',
    fontWeight: '600',
  },
  countdownCircle: {
    width: 62,
    height: 62,
    borderRadius: 31,
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
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  routeCard: {
    marginHorizontal: 16,
    backgroundColor: 'rgba(255,255,255,0.055)',
    borderRadius: 14,
    padding: 13,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.075)',
    marginBottom: 12,
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
    marginHorizontal: 16,
    backgroundColor: 'rgba(255,255,255,0.055)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.075)',
    paddingVertical: 11,
    marginBottom: 12,
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
    marginHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 13,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    gap: 12,
  },
  fareLabel: {
    fontSize: 11,
    color: '#9CB7AB',
    fontWeight: '700',
    letterSpacing: 0,
  },
  fareSub: {
    fontSize: 10.5,
    color: '#577767',
    marginTop: 2,
  },
  fareAmt: {
    fontSize: 23,
    fontWeight: '800',
    flexShrink: 0,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 18,
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
    letterSpacing: 0,
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
    letterSpacing: 0,
  },
});

const driverHomeIcon = StyleSheet.create({
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
    backgroundColor: '#FFFFFF',
    right: 3,
  },
  forwardLineTop: {
    transform: [{ rotate: '45deg' }, { translateY: -3 }],
  },
  forwardLineBottom: {
    transform: [{ rotate: '-45deg' }, { translateY: 3 }],
  },
});
