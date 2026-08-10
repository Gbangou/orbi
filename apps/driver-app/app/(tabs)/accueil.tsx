import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  type DriverProfileResponse,
  type MyTripsResponse,
  updateDriverAvailabilityWithApi,
} from '@orbi/api';
import {
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
import { formatDriverEarningsAmount } from '../../lib/driver-earnings-signal';
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
  formatDriverOfferMinutes,
  resolveDriverOfferMoneyDisplay,
} from '../../lib/offer-signal';
import { normalizeDriverProfileResponse } from '../../lib/driver-profile-normalizer';

const touchHitSlop = { top: 8, right: 8, bottom: 8, left: 8 };
type DriverHomeAlertTone = 'teal' | 'amber' | 'danger' | 'sky';

type DriverHomeAccountSnapshot = {
  label: string;
  message: string;
  tone: DriverHomeAlertTone;
  importantAlert: {
    title: string;
    message: string;
    tone: DriverHomeAlertTone;
  } | null;
  documentAlert: string | null;
};

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
  reason: 'Aucun signal fatigue bloquant sur la fenêtre récente.',
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

function buildDriverHomeAccountSnapshot(
  profile: DriverProfileResponse['profile'] | null,
): DriverHomeAccountSnapshot {
  if (!profile) {
    return {
      label: 'Compte en vérification',
      message: 'Nous récupérons votre état de service.',
      tone: 'sky',
      importantAlert: null,
      documentAlert: null,
    };
  }

  const expiredDocument = profile.onboarding.documents.find(
    (document) => document.status === 'EXPIRED',
  );
  const expiringDocument = profile.onboarding.documents.find((document) => {
    if (!document.expiresAt || document.status === 'EXPIRED') return false;
    const expiresAt = new Date(document.expiresAt).getTime();
    return Number.isFinite(expiresAt) && expiresAt - Date.now() <= 30 * 24 * 60 * 60 * 1000;
  });

  if (profile.status === 'SUSPENDED') {
    return {
      label: 'Compte suspendu',
      message: 'Le support doit réactiver votre compte avant la reprise.',
      tone: 'danger',
      importantAlert: {
        title: 'Reprise bloquée',
        message: 'Contactez le support Orbi avant de tenter de passer en ligne.',
        tone: 'danger',
      },
      documentAlert: expiredDocument ? 'Un document doit être renouvelé.' : null,
    };
  }

  if (expiredDocument) {
    return {
      label: 'Document expiré',
      message: 'Renouvelez le document demandé avant de reprendre le service.',
      tone: 'danger',
      importantAlert: {
        title: 'Document à renouveler',
        message: 'La mise en ligne reste bloquée jusqu’à validation du renouvellement.',
        tone: 'danger',
      },
      documentAlert: 'Un document chauffeur est expiré.',
    };
  }

  if (profile.verificationStatus !== 'APPROVED') {
    return {
      label: 'Validation en attente',
      message: 'Votre dossier est visible, mais les courses attendent l’approbation.',
      tone: 'amber',
      importantAlert: {
        title: 'Compte en revue',
        message: 'Vous pourrez passer en ligne après validation du profil.',
        tone: 'amber',
      },
      documentAlert: null,
    };
  }

  if (profile.vehicles.length === 0) {
    return {
      label: 'Véhicule à compléter',
      message: 'Ajoutez un véhicule valide avant de recevoir des courses.',
      tone: 'amber',
      importantAlert: {
        title: 'Véhicule requis',
        message: 'Un véhicule actif est nécessaire pour passer en ligne.',
        tone: 'amber',
      },
      documentAlert: null,
    };
  }

  return {
    label: 'Compte approuvé',
    message: 'Votre profil est prêt pour le service.',
    tone: 'teal',
    importantAlert: null,
    documentAlert: expiringDocument ? 'Un document arrive bientôt à expiration.' : null,
  };
}

// Mini offer preview — used inside the offer cards
function OfferChip({ offer }: { offer: DriverOffer }) {
  const theme = useOrbiTheme();
  const chip = useMemo(() => makeChipStyles(theme), [theme]);
  const moneyDisplay = resolveDriverOfferMoneyDisplay(offer);
  const isMoto = offer.category === 'motorcycle';
  const pickupDistance = formatDriverOfferDistance(
    offer.pickupDistanceKm,
    formatDriverOfferMinutes(offer.etaToPickupMinutes, 'Approche à confirmer'),
  );
  return (
    <View style={chip.wrap}>
      <VehicleIllustration tier={isMoto ? 'moto-standard' : 'car-standard'} width={30} height={22} />
      <Text style={chip.name}>{buildInitials(offer.riderName)}</Text>
      <Text style={chip.dist}>{pickupDistance}</Text>
      <View style={chip.money}>
        <Text style={chip.fare}>{moneyDisplay.amountLabel}</Text>
        <Text style={chip.moneyLabel}>{moneyDisplay.label}</Text>
      </View>
    </View>
  );
}

const makeChipStyles = (theme: OrbiTheme) => StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.colors.surface,
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
  },
  name: { fontSize: 13, fontWeight: '700', color: theme.colors.text },
  dist: { fontSize: 12, color: theme.colors.textMuted, flex: 1 },
  money: { alignItems: 'flex-end', gap: 1 },
  fare: { fontSize: 13, fontWeight: '800', color: theme.colors.text },
  moneyLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
  },
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
  const accent = theme.colors.text;
  const pickupDistanceLabel = formatDriverOfferDistance(
    offer.pickupDistanceKm,
    formatDriverOfferMinutes(offer.etaToPickupMinutes, 'Approche à confirmer'),
  );
  const moneyDisplay = resolveDriverOfferMoneyDisplay(offer);

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
              <View style={modal.categoryTag}>
                <Text style={modal.categoryTagText}>
                  {isMoto ? 'MOTO' : 'CONFORT AUTO'}
                </Text>
              </View>
              <Text style={modal.offerTitle}>Nouvelle course</Text>
              <Text style={modal.offerSub} numberOfLines={1}>
                {pickupDistanceLabel} pour rejoindre le client
              </Text>
            </View>
            <View style={modal.countdownCircle}>
              <Text style={modal.countdownNum}>{secondsLeft}</Text>
              <Text style={modal.countdownUnit}>s</Text>
            </View>
          </View>

          {/* Rider */}
          <PersonBadge name={offer.riderName} subtitle="Passager Orbi" size={44} style={modal.riderRow} />

          {/* Route */}
          <View style={modal.routeCard}>
            <View style={modal.routeRow}>
              <View style={[modal.routeDot, { backgroundColor: theme.colors.teal }]} />
              <Text style={modal.routeLabel} numberOfLines={2}>{offer.pickup}</Text>
            </View>
            <View style={modal.routeStem} />
            <View style={modal.routeRow}>
              <View style={[modal.routeDot, { backgroundColor: theme.colors.text }]} />
              <Text style={modal.routeLabel} numberOfLines={2}>{offer.destination}</Text>
            </View>
          </View>

          {/* Stats */}
          <View style={modal.statsRow}>
            <View style={modal.stat}>
              <Text style={modal.statVal}>
                {formatDriverOfferDistance(offer.distanceKm, 'À confirmer')}
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
                {formatDriverOfferMinutes(offer.etaToPickupMinutes, 'À confirmer')}
              </Text>
              <Text style={modal.statKey}>Arrivée</Text>
            </View>
          </View>

          {/* Fare */}
          <View style={modal.fareBlock}>
            <View>
              <Text style={modal.fareLabel}>
                {moneyDisplay.isNet ? 'Votre gain net estimé' : 'Prix client'}
              </Text>
              <Text style={modal.fareSub}>{moneyDisplay.helper}</Text>
            </View>
            <Text style={modal.fareAmt}>
              {moneyDisplay.amountLabel}
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
  const [statusNote, setStatusNote] = useState('Mise à jour en cours...');
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
  const [accountSnapshot, setAccountSnapshot] = useState<DriverHomeAccountSnapshot>(
    buildDriverHomeAccountSnapshot(null),
  );
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
      const normalizedProfile = normalizeDriverProfileResponse(profileResponse);
      setOffers(offersResponse);
      setHistory(historyResponse);
      setEarnings(earningsResponse);
      setDriverProfileId(normalizedProfile.profile.id);
      setDriverProfileStatus(normalizedProfile.profile.status);
      setDriverVerificationStatus(normalizedProfile.profile.verificationStatus);
      setDriverFatigue(normalizedProfile.profile.fatigue);
      setVehicleCount(normalizedProfile.profile.vehicles.length);
      setAccountSnapshot(buildDriverHomeAccountSnapshot(normalizedProfile.profile));
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
            ? "Vous êtes prêt. Nous vous prévenons dès qu'une course arrive."
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
      setVehicleCount(null);
      setAccountSnapshot({
        label: 'Service indisponible',
        message: 'Impossible de confirmer votre état de service pour le moment.',
        tone: 'amber',
        importantAlert: {
          title: 'Connexion à reprendre',
          message: feedback.message,
          tone: 'amber',
        },
        documentAlert: null,
      });
      if (!silent) setStatusNote(feedback.message);
    } finally {
      if (silent) setIsRealtimeSyncing(false);
      if (!silent) setIsRefreshing(false);
    }
  }, []);

  useLiveRefresh(() => loadDriverHome(true), 2500);

  useDriverRealtimeStream(
    sessionToken,
    driverProfileId,
    (eventType) => {
      void eventType;
      setIsRealtimeSyncing(true);
      setStatusNote('Mise à jour du service...');
      void loadDriverHome(true);
    },
    {
      onHeartbeat: () => setStatusNote('Service à jour.'),
      onOpen: () => { setIsRealtimeSyncing(false); setStatusNote('Service connecté.'); },
      onError: () => { setIsRealtimeSyncing(false); setStatusNote('Réseau faible. Nouvelle tentative en cours.'); },
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

  const {
    latestPosition: driverPosition,
    presenceStatus,
    presenceNote,
  } = useDriverPresence(
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
            ? `${reservedOfferCount} course${reservedOfferCount > 1 ? 's' : ''} en attente.`
            : 'Vous êtes en ligne.'
          : 'Vous êtes hors ligne.',
      );
      await loadDriverHome(true);
    } catch (error) {
      const feedback = await resolveDriverAppError(error, {
        surface: 'driver-availability',
        fallback: "Votre disponibilité n'a pas pu être mise à jour.",
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
  // Le statut brut passe à BUSY dès qu'une mission est acceptée. Ce cas garde
  // le badge en service pendant une vraie mission active.
  const isOnDuty = isOnline || Boolean(activeTrip);
  const statusLabel = activeTrip
    ? 'En mission'
    : isOnline && !flow.accountCanReceiveOffers
      ? 'En validation'
      : isOnline
        ? 'En ligne'
        : 'Hors ligne';
  const sheetH = activeTrip ? 348 : isOnline ? 374 : 354;
  const locationAlert =
    presenceStatus === 'permission-denied'
      ? {
          title: 'Localisation refusée',
          message: 'Activez la localisation pour recevoir des courses plus proches.',
          tone: 'amber' as const,
        }
      : presenceStatus === 'unavailable'
        ? {
            title: 'GPS désactivé',
            message: 'Activez la localisation du téléphone avant de passer en ligne.',
            tone: 'amber' as const,
          }
        : driverPosition?.accuracyMeters !== null &&
            driverPosition?.accuracyMeters !== undefined &&
            driverPosition.accuracyMeters > 80
          ? {
              title: 'Position imprécise',
              message: 'Déplacez-vous dans une zone dégagée pour améliorer les offres.',
              tone: 'amber' as const,
            }
          : null;
  const primaryAlert =
    accountSnapshot.importantAlert ??
    (driverFatigue.state !== 'clear'
      ? {
          title: driverFatigue.state === 'blocked' ? 'Pause obligatoire' : 'Pause conseillée',
          message:
            driverFatigue.state === 'blocked' && driverFatigue.restUntil
              ? `${shiftReadiness.note} Reprise après ${formatDriverRestUntilTime(driverFatigue.restUntil, 'heure indisponible')}.`
              : shiftReadiness.note,
          tone: driverFatigue.state === 'blocked' ? ('danger' as const) : ('amber' as const),
        }
      : locationAlert);

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
            variant="primary"
            tone="teal"
            style={styles.toggleBtn}
            labelStyle={styles.toggleLabel}
          />
        </View>
      ) : null}

      {/* Bottom sheet */}
      <View style={[styles.sheet, { height: sheetH }]}>
        <View style={styles.handle} />
        <View style={styles.serviceHeader}>
          <View style={styles.serviceHeaderCopy}>
            <Text style={styles.serviceEyebrow}>État du compte</Text>
            <Text style={styles.serviceTitle}>{accountSnapshot.label}</Text>
            <Text style={styles.serviceMessage} numberOfLines={2}>
              {accountSnapshot.message}
            </Text>
          </View>
          <View
            style={[
              styles.serviceBadge,
              accountSnapshot.tone === 'danger'
                ? styles.serviceBadgeDanger
                : accountSnapshot.tone === 'amber'
                  ? styles.serviceBadgeAmber
                  : styles.serviceBadgeReady,
            ]}
          >
            <Text style={styles.serviceBadgeText}>
              {accountSnapshot.tone === 'teal' ? 'OK' : 'À vérifier'}
            </Text>
          </View>
        </View>

        {primaryAlert ? (
          <OrbiStatusBanner
            tone={primaryAlert.tone === 'danger' ? 'danger' : 'amber'}
            title={primaryAlert.title}
            message={primaryAlert.message}
          />
        ) : accountSnapshot.documentAlert ? (
          <OrbiStatusBanner
            tone="amber"
            title="Documents"
            message={accountSnapshot.documentAlert}
          />
        ) : null}

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
            <View style={styles.driverHandleCopy}>
              <Text style={styles.driverModeLabel}>Mode chauffeur</Text>
              <Text style={styles.driverModeTitle}>Vous êtes en ligne</Text>
            </View>
            <View style={styles.onlineRow}>
              <View>
                <Text style={styles.onlineTitle}>
                  {!flow.accountCanReceiveOffers
                    ? 'Profil en validation'
                    : visibleOffers.length > 0
                    ? td(visibleOffers.length > 1 ? 'offersAvailable_plural' : 'offersAvailable', { count: visibleOffers.length })
                    : td('waitingForOffers')}
                </Text>
                {!flow.accountCanReceiveOffers ? (
                  <Text style={styles.statusNoteText} numberOfLines={2}>
                    Votre compte n'est pas encore prêt à recevoir des courses.
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
            <View style={styles.driverHandleCopy}>
              <Text style={styles.driverModeLabel}>Mode chauffeur</Text>
              <Text style={styles.driverModeTitle}>Prêt à démarrer</Text>
            </View>
            <View style={styles.offlineHeroRow}>
              <View style={styles.offlinePulse}>
                <View style={styles.offlinePulseDot} />
              </View>
              <View style={styles.offlineHeroCopy}>
                <Text style={styles.offlineTitle}>Vous êtes hors ligne</Text>
                <Text style={styles.offlineSub} numberOfLines={2}>
                  Passez en ligne pour recevoir des courses.
                </Text>
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

        {/* Status note (operational feedback) */}
        {statusNote ? (
          <Text style={styles.statusNoteText} numberOfLines={2}>{statusNote}</Text>
        ) : presenceNote && (isOnline || activeTrip) ? (
          <Text style={styles.statusNoteText} numberOfLines={2}>{presenceNote}</Text>
        ) : null}

        {/* Refresh — accessible for tests */}
        <OrbiButton
          onPress={() => void loadDriverHome(false)}
          loading={isRefreshing}
          accessibilityLabel="Actualiser"
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
    paddingHorizontal: 14,
    paddingTop: 7,
    paddingBottom: 4,
    gap: 10,
  },
  earningsBadge: {
    backgroundColor: '#FFFFFF',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    paddingHorizontal: 14,
    paddingVertical: 9,
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
    color: '#111111',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    paddingHorizontal: 13,
    paddingVertical: 9,
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

  // Navigation button
  navBtn: {
    borderRadius: 4,
    minHeight: 46,
  },

  // Toggle
  toggleFloat: {
    position: 'absolute',
    bottom: 278,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  toggleBtn: {
    borderRadius: 4,
    minWidth: 198,
    paddingHorizontal: 24,
    minHeight: 50,
    backgroundColor: '#111111',
  },
  toggleLabel: { fontSize: 16, fontWeight: '800', fontFamily: 'Inter_700Bold' },

  // Bottom sheet
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    borderWidth: 0,
    paddingHorizontal: 16,
    paddingBottom: 22,
    paddingTop: 10,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 999,
    backgroundColor: '#D8D8D8',
    alignSelf: 'center',
    marginBottom: 12,
  },
  serviceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#E8E8E8',
    backgroundColor: '#F8F8F8',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  serviceHeaderCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  serviceEyebrow: {
    fontSize: 10,
    fontWeight: '800',
    color: '#6B6B6B',
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  serviceTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#111111',
  },
  serviceMessage: {
    fontSize: 12,
    color: theme.colors.textMuted,
    lineHeight: 17,
  },
  serviceBadge: {
    minWidth: 72,
    minHeight: 34,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    borderWidth: 1,
  },
  serviceBadgeReady: {
    backgroundColor: '#EAF7F3',
    borderColor: theme.colors.teal,
  },
  serviceBadgeAmber: {
    backgroundColor: '#FFF7E8',
    borderColor: theme.colors.amber,
  },
  serviceBadgeDanger: {
    backgroundColor: '#FFF0F0',
    borderColor: theme.colors.danger,
  },
  serviceBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#111111',
    textAlign: 'center',
  },

  // Active trip
  tripCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: 4,
    padding: 13,
    gap: 12,
    borderWidth: 1,
    borderColor: '#E8E8E8',
  },
  tripStatusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#111111',
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
    backgroundColor: '#111111',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  // Online sheet
  onlineSheet: { gap: 8 },
  driverHandleCopy: {
    gap: 2,
    marginBottom: 4,
  },
  driverModeLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#6B6B6B',
    textTransform: 'uppercase',
  },
  driverModeTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#111111',
  },
  onlineRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  onlineTitle: { fontSize: 16, fontWeight: '800', color: '#111111' },
  onlineSub: { fontSize: 13, color: theme.colors.textMuted, marginTop: 2 },
  viewOffersBtn: {
    borderRadius: 6,
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
    borderRadius: 4,
    backgroundColor: '#F3F3F3',
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  offlinePulseDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#111111',
  },
  offlineHeroCopy: {
    flex: 1,
    minWidth: 0,
  },
  offlineTitle: { fontSize: 16, fontWeight: '800', color: '#111111' },
  offlineSub: { fontSize: 13, color: theme.colors.textMuted, lineHeight: 18 },
  // Setup
  setupBtn: {
    alignSelf: 'flex-start',
    borderRadius: 4,
    minHeight: 38,
    paddingHorizontal: 12,
    marginTop: 4,
  },
  refreshDirectBtn: {
    alignSelf: 'center',
    borderRadius: 4,
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
    backgroundColor: 'rgba(0,0,0,0.42)',
    justifyContent: 'flex-end',
    paddingBottom: 18,
    paddingHorizontal: 12,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 4,
    overflow: 'hidden',
    borderWidth: 1,
  },
  progressTrack: {
    height: 3,
    backgroundColor: '#E2E2E2',
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
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#E8E8E8',
    backgroundColor: '#F5F5F5',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  categoryTagText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0,
    color: '#111111',
  },
  offerTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#111111',
    letterSpacing: 0,
  },
  offerSub: {
    fontSize: 12,
    color: theme.colors.textMuted,
    fontWeight: '600',
  },
  countdownCircle: {
    width: 62,
    height: 62,
    borderRadius: 31,
    borderWidth: 1,
    borderColor: '#E2E2E2',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 1,
  },
  countdownNum: {
    fontSize: 22,
    fontWeight: '800',
    lineHeight: 26,
    color: '#111111',
  },
  countdownUnit: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
    color: theme.colors.textMuted,
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
    backgroundColor: '#F7F7F7',
    borderRadius: 4,
    padding: 13,
    borderWidth: 1,
    borderColor: '#E8E8E8',
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
    color: theme.colors.text,
    lineHeight: 19,
  },
  routeStem: {
    width: 1,
    height: 10,
    backgroundColor: '#CFCFCF',
    marginLeft: 4.5,
    marginVertical: 3,
  },
  statsRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    backgroundColor: '#F7F7F7',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#E8E8E8',
    paddingVertical: 11,
    marginBottom: 12,
  },
  stat: { flex: 1, alignItems: 'center', gap: 4 },
  statVal: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111111',
  },
  statKey: {
    fontSize: 10.5,
    color: theme.colors.textMuted,
    textAlign: 'center',
  },
  statSep: {
    width: 1,
    backgroundColor: theme.colors.border,
    marginVertical: 4,
  },
  fareBlock: {
    marginHorizontal: 16,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: theme.colors.border,
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
    color: theme.colors.textMuted,
    fontWeight: '700',
    letterSpacing: 0,
  },
  fareSub: {
    fontSize: 10.5,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  fareAmt: {
    fontSize: 23,
    fontWeight: '800',
    flexShrink: 0,
    color: theme.colors.text,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 18,
  },
  declineBtn: {
    flex: 1,
    backgroundColor: theme.colors.backgroundAlt,
    borderRadius: 4,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  declineTxt: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0,
  },
  acceptBtn: {
    flex: 2,
    borderRadius: 4,
    paddingVertical: 16,
    alignItems: 'center',
    backgroundColor: theme.colors.text,
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
