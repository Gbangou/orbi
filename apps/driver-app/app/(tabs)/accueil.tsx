import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
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

export default function DriverHomeScreen() {
  const router = useRouter();
  const [offers, setOffers] = useState<DriverOffer[]>([]);
  const [history, setHistory] = useState<MyTripsResponse | null>(null);
  const [earnings, setEarnings] = useState<DriverEarningsResponse | null>(null);
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

  void buildDriverShiftReadiness({ flow, fatigue: driverFatigue, earningsToday: earnings?.summary.today });

  const { latestPosition: driverPosition } = useDriverPresence(
    flow.availabilityStatus === 'ONLINE' || Boolean(activeTrip),
  );
  useReservationExpiryRefresh(visibleOffers, () => loadDriverHome(true), flow.canReceiveOffers);

  useEffect(() => {
    const previousVisibleOfferIds = previousVisibleOfferIdsRef.current;
    const nextVisibleOfferIds = visibleOffers.map((o) => o.id);
    if (previousVisibleOfferIds && flow.canReceiveOffers) {
      const { freshOfferIds: next, expiredOfferIds } =
        resolveDriverReservationChangeSet(previousVisibleOfferIds, nextVisibleOfferIds);
      if (next.length > 0) setFreshOfferIds(next);
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

  // suppress unused state warnings for vars managed by callbacks
  void statusNote; void isRefreshing; void isRealtimeSyncing; void recentlyExpiredCount;

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
              {isTogglingAvailability ? '...' : isOnline ? 'Passer hors ligne' : 'Passer en ligne'}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {/* Bottom sheet */}
      <View style={[styles.sheet, { height: sheetH }]}>
        <View style={styles.handle} />

        {activeTrip ? (
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
        ) : isOnline ? (
          <View style={styles.onlineSheet}>
            <View style={styles.onlineRow}>
              <View>
                <Text style={styles.onlineTitle}>
                  {visibleOffers.length > 0
                    ? `${visibleOffers.length} offre${visibleOffers.length > 1 ? 's' : ''} disponible${visibleOffers.length > 1 ? 's' : ''}`
                    : 'En attente de courses…'}
                </Text>
                <Text style={styles.onlineSub}>Ouagadougou — zone urbaine</Text>
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
      </View>
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
});
