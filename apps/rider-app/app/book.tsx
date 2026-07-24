import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from '../lib/i18n';
import { VehicleSelector } from '../lib/booking/vehicle-selector';
import { ScheduledRidePicker, type ScheduledRideMode } from '../lib/booking/scheduled-ride-picker';
import {
  PaymentMethodsManager,
  type PaymentSelection,
} from '../lib/booking/payment-methods-manager';
import {
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  calculateDistanceKm,
  burkinaPricingCityPresets,
  createCheckoutIntentWithApi,
  createRideRequestWithApi,
  createSavedPlaceWithApi,
  estimateDurationMinutes,
  fetchNearbyDrivers,
  fetchMyTrips,
  fetchRiderProfile,
  fetchRideOptionsPreview,
  roundDistanceKm,
  resolveBurkinaPricingPresetForPlace,
  toApiPaymentMethod,
  toApiServiceTier,
  toApiVehicleType,
  validatePromoCodeWithApi,
  type MyTripsResponse,
  type PromoValidationResponse,
  type PaymentMethod,
  type Place,
  type RiderProfileResponse,
  type RideOption,
} from '@orbi/api';
import {
  describeRealtimeConnection,
  orbiCopy,
  type OrbiTheme,
} from '@orbi/ui';
import { OrbiButton, OrbiScreen, OrbiStatusBanner, OrbiSurface, safeHaptics, useOrbiTheme } from '@orbi/ui/native';
import { orbiRuntimeConfig } from '@orbi/config';
import { createRiderPublicClient, restoreRiderSession } from '../lib/auth';
import { resolveRiderAppError } from '../lib/session-feedback';
import { formatRiderMoneyAmount } from '../lib/rider-display-format';
import { buildSavedPlacePayload } from '../lib/account-safety';
import {
  areBookingPlacesEquivalent,
  buildCheckoutIdempotencyKey,
  buildRideRequestIdempotencyKey,
  resolveCheckoutChannel,
  validateBookingSelection,
} from '../lib/booking-safety';
import { useRiderRealtimeStream } from '../lib/use-rider-realtime-stream';
import {
  buildRiderFlowTransitionLabel,
  resolveRiderActiveFlow,
} from '../lib/rider-active-flow';
import { useRiderPosition } from '../lib/use-rider-position';
import { TripMapView } from '../lib/trip-map-view';
import { PlaceSearch } from '../lib/place-search';
import {
  fallbackRiderProfile,
  normalizeRiderProfileResponse,
} from '../lib/rider-profile-normalizer';
import { normalizeRiderTripsResponse } from '../lib/rider-trips-normalizer';

const cityPresets = burkinaPricingCityPresets;
const fieldDispatchRadiusKm = 8;
const emptyDestinationPlace: Place = {
  id: 'destination-manual',
  label: 'Destination a renseigner',
  address: '',
  coordinates: undefined,
};

function toPlaceFromSavedPlace(
  place: RiderProfileResponse['profile']['savedPlaces'][number],
): Place {
  const latitude = toFiniteCoordinate(place.latitude);
  const longitude = toFiniteCoordinate(place.longitude);

  return {
    id: String(place.id),
    label: sanitizePlaceText(place.label, 'Lieu enregistré'),
    address: sanitizePlaceText(place.address, 'Adresse non précisée'),
    coordinates:
      latitude !== null && longitude !== null
        ? {
            latitude,
            longitude,
          }
        : undefined,
  };
}

function toFiniteCoordinate(value: unknown) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string') {
    const parsed = Number(value.trim().replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function sanitizePlaceText(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : fallback;
}

function normalizePlaceText(value: string) {
  return value.trim().toLowerCase();
}

function isSamePlace(
  left: Place,
  right: RiderProfileResponse['profile']['savedPlaces'][number],
) {
  const rightLatitude = toFiniteCoordinate(right.latitude);
  const rightLongitude = toFiniteCoordinate(right.longitude);
  const sameAddress =
    normalizePlaceText(left.address) === normalizePlaceText(right.address);
  const sameCoordinates =
    left.coordinates &&
    rightLatitude !== null &&
    rightLongitude !== null &&
    Math.abs(left.coordinates.latitude - rightLatitude) < 0.0001 &&
    Math.abs(left.coordinates.longitude - rightLongitude) < 0.0001;

  return sameAddress || Boolean(sameCoordinates);
}

function buildSavedPlaceLabel(target: 'pickup' | 'destination', place: Place) {
  const prefix = target === 'pickup' ? 'Depart' : 'Destination';
  return `${prefix} ${place.label}`;
}

function buildCurrentPositionPlace(position: {
  latitude: number;
  longitude: number;
}): Place {
  return {
    id: 'current-position',
    label: 'Ma position',
    address: 'Position GPS actuelle',
    coordinates: {
      latitude: position.latitude,
      longitude: position.longitude,
    },
  };
}

function findCityPresetForPlace(place: Place) {
  return resolveBurkinaPricingPresetForPlace(place);
}

function PriceConfidenceCard({
  option,
  distanceKm,
  durationMinutes,
}: {
  option: RideOption | null;
  distanceKm: number;
  durationMinutes: number;
}) {
  const theme = useOrbiTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  if (!option) return null;

  const priceWindow = option.fareBreakdown?.priceWindow;
  const roundingAmount = option.fareBreakdown?.commercialRoundingAmount ?? 0;
  const roundingStep = option.fareBreakdown?.commercialRoundingStep ?? null;
  const demandLabel =
    option.surgeActive && option.surgeLabel
      ? `Demande ${option.surgeLabel}`
      : 'Demande normale';
  const pricePromise =
    option.marketplace?.pricePromise ??
    'Prix upfront affiche sans frais de pickup caches.';

  return (
    <OrbiSurface style={styles.priceConfidenceCard}>
      <View style={styles.priceConfidenceTop}>
        <View style={styles.priceConfidenceCopy}>
          <Text style={styles.priceConfidenceLabel}>Prix verrouille</Text>
          <Text style={styles.priceConfidenceFare}>
            {formatRiderMoneyAmount(option.fare)}
          </Text>
        </View>
        <View style={styles.priceConfidenceBadge}>
          <Text style={styles.priceConfidenceBadgeText}>
            {option.category === 'motorcycle' ? 'Moto' : 'Voiture'}
          </Text>
        </View>
      </View>

      <View style={styles.priceMetricGrid}>
        <View style={styles.priceMetricTile}>
          <Text style={styles.priceMetricLabel}>Trajet</Text>
          <Text style={styles.priceMetricValue}>
            {distanceKm} km · {durationMinutes} min
          </Text>
        </View>
        <View style={styles.priceMetricTile}>
          <Text style={styles.priceMetricLabel}>Fenetre</Text>
          <Text style={styles.priceMetricValue}>
            {priceWindow
              ? `${formatRiderMoneyAmount(priceWindow.min)} - ${formatRiderMoneyAmount(priceWindow.max)}`
              : 'Prix fixe'}
          </Text>
        </View>
      </View>

      <View style={styles.priceSignalRow}>
        <Text style={styles.priceSignalText} numberOfLines={2}>
          {pricePromise}
        </Text>
        <Text style={styles.priceSignalPill} numberOfLines={1}>
          {demandLabel}
        </Text>
      </View>

      {roundingAmount > 0 ? (
        <Text style={styles.priceRoundingText}>
          Arrondi CFA +{roundingAmount} XOF
          {roundingStep ? ` · palier ${roundingStep}` : ''}
        </Text>
      ) : null}
    </OrbiSurface>
  );
}

function BackGlyph() {
  const theme = useOrbiTheme();
  const bookIconStyles = useMemo(() => makeBookIconStyles(theme), [theme]);
  return (
    <View style={bookIconStyles.backWrap}>
      <View style={[bookIconStyles.backLine, bookIconStyles.backLineTop]} />
      <View style={[bookIconStyles.backLine, bookIconStyles.backLineBottom]} />
    </View>
  );
}

function TargetGlyph() {
  const theme = useOrbiTheme();
  const bookIconStyles = useMemo(() => makeBookIconStyles(theme), [theme]);
  return (
    <View style={bookIconStyles.targetOuter}>
      <View style={bookIconStyles.targetInner} />
    </View>
  );
}

function CheckGlyph() {
  const theme = useOrbiTheme();
  const bookIconStyles = useMemo(() => makeBookIconStyles(theme), [theme]);
  return (
    <View style={bookIconStyles.checkWrap}>
      <View style={[bookIconStyles.checkLine, bookIconStyles.checkLineShort]} />
      <View style={[bookIconStyles.checkLine, bookIconStyles.checkLineLong]} />
    </View>
  );
}

function ForwardGlyph({ color }: { color: string }) {
  const theme = useOrbiTheme();
  const bookIconStyles = useMemo(() => makeBookIconStyles(theme), [theme]);
  return (
    <View style={bookIconStyles.forwardWrap}>
      <View style={[bookIconStyles.forwardLine, bookIconStyles.forwardLineTop, { backgroundColor: color }]} />
      <View style={[bookIconStyles.forwardLine, bookIconStyles.forwardLineBottom, { backgroundColor: color }]} />
    </View>
  );
}

function SavedPlaceGlyph() {
  const theme = useOrbiTheme();
  const bookIconStyles = useMemo(() => makeBookIconStyles(theme), [theme]);
  return (
    <View style={bookIconStyles.savedPin}>
      <View style={bookIconStyles.savedPinDot} />
    </View>
  );
}

const makePromoStyles = (theme: OrbiTheme) => StyleSheet.create({
  container: {
    backgroundColor: theme.colors.panel,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 16,
    padding: 14,
    gap: 10,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0,
    color: theme.colors.muted,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  input: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.backgroundAlt,
    paddingHorizontal: 12,
    color: theme.colors.text,
    fontWeight: '700',
    letterSpacing: 0,
    fontSize: 14,
  },
  applyButton: {
    borderRadius: 10,
    paddingHorizontal: 14,
    minWidth: 64,
  },
  clearButton: {
    alignSelf: 'flex-start',
  },
  successBox: {
    backgroundColor: 'rgba(61,215,192,0.08)',
    borderRadius: 10,
    padding: 10,
    gap: 4,
  },
  successText: {
    color: theme.colors.teal,
    fontWeight: '800',
    fontSize: 14,
  },
  successMeta: {
    color: theme.colors.muted,
    fontSize: 12,
  },
  errorText: {
    color: theme.colors.danger ?? '#ff7f66',
    fontSize: 12,
    fontWeight: '600',
  },
  strikePrice: {
    fontSize: 13,
    color: theme.colors.muted,
    textDecorationLine: 'line-through',
    fontWeight: '600',
  },
  discountedPrice: {
    color: theme.colors.teal,
  },
});

export default function BookingScreen() {
  const router = useRouter();
  const theme = useOrbiTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const promoStyles = useMemo(() => makePromoStyles(theme), [theme]);
  const { t } = useTranslation();
  const tb = (key: string) => t(`booking.${key}`);
  const [options, setOptions] = useState<RideOption[]>([]);
  const [history, setHistory] = useState<MyTripsResponse | null>(null);
  const [profile, setProfile] =
    useState<RiderProfileResponse>(fallbackRiderProfile);
  const [selectedOptionId, setSelectedOptionId] = useState<string>('');
  const [selectedPaymentMethod, setSelectedPaymentMethod] =
    useState<PaymentMethod>('cash');
  const [paymentSelection, setPaymentSelection] =
    useState<PaymentSelection>({ method: 'cash' });
  const [selectedCityId, setSelectedCityId] = useState<
    (typeof cityPresets)[number]['id']
  >(cityPresets[0].id);
  const [status, setStatus] = useState(
    'Connexion au compte passager en cours...',
  );
  const [pickupPlace, setPickupPlace] = useState<Place>(cityPresets[0].pickup);
  const [destinationPlace, setDestinationPlace] = useState<Place>(
    emptyDestinationPlace,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  // Courses programmées
  const [scheduleMode, setScheduleMode] = useState<ScheduledRideMode>('now');
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [promoCodeInput, setPromoCodeInput] = useState('');
  const [promoValidation, setPromoValidation] =
    useState<PromoValidationResponse | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [isValidatingPromo, setIsValidatingPromo] = useState(false);
  const [isRealtimeSyncing, setIsRealtimeSyncing] = useState(false);
  const [bookingConfirmed, setBookingConfirmed] = useState(false);
  const [bookingTransitionLabel, setBookingTransitionLabel] = useState<
    string | null
  >(null);
  const checkScale = useRef(new Animated.Value(0)).current;
  const checkOpacity = useRef(new Animated.Value(0)).current;
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [paymentPreview, setPaymentPreview] = useState<{
    provider: string;
    transactionRef: string;
    supportedNetworks: string[];
    channel: string;
  } | null>(null);
  const [nearbyCompatibleDriverCount, setNearbyCompatibleDriverCount] =
    useState<number | null>(null);
  const [autoAppliedRiderPosition, setAutoAppliedRiderPosition] =
    useState(false);
  const [showPromo, setShowPromo] = useState(false);
  const previousFlowStateRef = useRef<string | null>(null);
  const bookingMutationInFlightRef = useRef(false);
  const riderPosition = useRiderPosition({
    enabled: true,
  });

  const selectedOption = useMemo(
    () =>
      options.find((option) => option.id === selectedOptionId) ??
      options[0] ??
      null,
    [options, selectedOptionId],
  );
  const selectedCity =
    cityPresets.find((city) => city.id === selectedCityId) ?? cityPresets[0];
  const tripEstimate = useMemo(() => {
    if (!pickupPlace.coordinates || !destinationPlace.coordinates) {
      return {
        distanceKm: selectedCity.estimatedDistanceKm,
        durationMinutes: selectedCity.estimatedDurationMinutes,
        source: 'preset' as const,
      };
    }

    const computedDistanceKm = calculateDistanceKm(
      pickupPlace.coordinates,
      destinationPlace.coordinates,
    );

    const distanceKm = roundDistanceKm(computedDistanceKm);

    return {
      distanceKm,
      durationMinutes: estimateDurationMinutes(distanceKm, selectedCity.zone),
      source: 'coordinates' as const,
    };
  }, [
    destinationPlace.coordinates,
    pickupPlace.coordinates,
    selectedCity.estimatedDistanceKm,
    selectedCity.estimatedDurationMinutes,
    selectedCity.zone,
  ]);
  const savedPlaces = useMemo(
    () => profile.profile.savedPlaces.map(toPlaceFromSavedPlace),
    [profile],
  );

  useEffect(() => {
    void loadBookingContext();
  }, [pickupPlace, destinationPlace, selectedCityId, selectedPaymentMethod]);

  useEffect(() => {
    if (autoAppliedRiderPosition || !riderPosition.latestPosition) {
      return;
    }

    if (!areBookingPlacesEquivalent(pickupPlace, selectedCity.pickup)) {
      return;
    }

    setPickupPlace(buildCurrentPositionPlace(riderPosition.latestPosition));
    setAutoAppliedRiderPosition(true);
  }, [
    autoAppliedRiderPosition,
    pickupPlace,
    riderPosition.latestPosition,
    selectedCity.pickup,
  ]);

  async function loadBookingContext(
    options: { resetPaymentPreview?: boolean } = {},
  ) {
    const client = createRiderPublicClient();

    setIsRefreshing(true);

    try {
      const { authClient, me, session } = await restoreRiderSession();
      setSessionToken(session.sessionToken);

      const pickupCoordinates =
        pickupPlace.coordinates ?? riderPosition.latestPosition ?? null;
      const nearbyDriversPromise = pickupCoordinates
        ? fetchNearbyDrivers(client, {
            lat: pickupCoordinates.latitude,
            lng: pickupCoordinates.longitude,
            radiusKm: fieldDispatchRadiusKm,
          }).catch(() => null)
        : Promise.resolve(null);

      const [nearbyDriversResponse, historyResponse, profileResponse] =
        await Promise.all([
          nearbyDriversPromise,
          fetchMyTrips(authClient),
          fetchRiderProfile(authClient),
        ]);

      const compatibleDriverCount = nearbyDriversResponse
        ? nearbyDriversResponse.drivers.filter(
            (driver) => driver.status === 'ONLINE',
          ).length
        : null;
      const normalizedHistory = normalizeRiderTripsResponse(historyResponse);
      setNearbyCompatibleDriverCount(compatibleDriverCount);

      const response = await fetchRideOptionsPreview(client, {
        distanceKm: tripEstimate.distanceKm,
        durationMinutes: tripEstimate.durationMinutes,
        vehicleType: 'MOTORCYCLE',
        paymentMethod: toApiPaymentMethod(selectedPaymentMethod),
        zone: selectedCity.zone,
        city: selectedCity.id,
        districtProfile: selectedCity.districtProfile,
        pickupLatitude: pickupPlace.coordinates?.latitude,
        pickupLongitude: pickupPlace.coordinates?.longitude,
        destinationLatitude: destinationPlace.coordinates?.latitude,
        destinationLongitude: destinationPlace.coordinates?.longitude,
      });
      const safeOptions =
        response && typeof response === 'object' && Array.isArray(response.options)
          ? response.options
          : [];

      setOptions(safeOptions);
      setHistory(normalizedHistory);
      setProfile(normalizeRiderProfileResponse(profileResponse));
      if (options.resetPaymentPreview ?? true) {
        setPaymentPreview(null);
      }
      const flow = resolveRiderActiveFlow(normalizedHistory);

      const firstOption = safeOptions[0];
      const nextSelectedOption =
        safeOptions.find((option) => option.id === selectedOptionId) ??
        firstOption ??
        null;

      if (nextSelectedOption) {
        setSelectedOptionId(nextSelectedOption.id);
        const supportedPayments =
          nextSelectedOption.paymentMethods ?? ['mobile-money'];
        if (!supportedPayments.includes(selectedPaymentMethod)) {
          setSelectedPaymentMethod(supportedPayments[0]);
        }
      }

      setStatus(
        flow.hasOpenFlow
          ? `${me.user.fullName} a deja une demande ou une course active.`
          : compatibleDriverCount === null
            ? `Disponibilite chauffeur non verifiee autour du depart. Reessayez avant de lancer une demande immediate.`
            : compatibleDriverCount > 0
              ? `Pret a reserver pour ${me.user.fullName} a ${selectedCity.label}. ${compatibleDriverCount} chauffeur${compatibleDriverCount > 1 ? 's' : ''} compatible${compatibleDriverCount > 1 ? 's' : ''} en ligne dans ${fieldDispatchRadiusKm} km.`
              : `Aucun chauffeur compatible en ligne dans ${fieldDispatchRadiusKm} km autour du depart. Passez un chauffeur en ligne avant de tester une demande immediate.`,
      );
    } catch (error) {
      const feedback = await resolveRiderAppError(error, {
        surface: 'profile',
        network: orbiCopy.riderNetworkUnavailable,
        fallback: orbiCopy.serviceUnavailable,
      });

      if (feedback.shouldClearSessionToken) {
        setSessionToken(null);
      }

      setStatus(feedback.message);
      setOptions([]);
      setHistory(null);
      setPaymentPreview(null);
      setProfile(fallbackRiderProfile);
      setNearbyCompatibleDriverCount(null);
    } finally {
      setIsRealtimeSyncing(false);
      setIsRefreshing(false);
    }
  }

  useRiderRealtimeStream(
    sessionToken,
    () => {
      setIsRealtimeSyncing(true);
      setStatus('Reservation mise a jour en direct.');
      void loadBookingContext();
    },
    {
      onHeartbeat: () => {
        setStatus(describeRealtimeConnection('rider', 'active'));
      },
      onOpen: () => {
        setIsRealtimeSyncing(false);
        setStatus(describeRealtimeConnection('rider', 'connected'));
      },
      onError: () => {
        setIsRealtimeSyncing(false);
        setStatus(describeRealtimeConnection('rider', 'reconnecting'));
      },
    },
  );

  function applyPlace(target: 'pickup' | 'destination', place: Place) {
    const inferredCity = findCityPresetForPlace(place);

    if (inferredCity) {
      setSelectedCityId(inferredCity.id);
    }

    if (target === 'pickup') {
      setPickupPlace(place);
      return;
    }

    setDestinationPlace(place);
  }

  function handleUseCurrentPositionAsPickup() {
    if (!riderPosition.latestPosition) {
      setStatus('Position GPS passager pas encore disponible.');
      return;
    }

    setPickupPlace(buildCurrentPositionPlace(riderPosition.latestPosition));
    setAutoAppliedRiderPosition(true);
    setStatus('Depart mis a jour avec votre position GPS actuelle.');
  }

  function handleSelectDestinationOnMap(coordinates: {
    latitude: number;
    longitude: number;
  }) {
    setDestinationPlace({
      id: `map-${coordinates.latitude.toFixed(5)}-${coordinates.longitude.toFixed(5)}`,
      label: 'Point choisi sur la carte',
      address: `${coordinates.latitude.toFixed(5)}, ${coordinates.longitude.toFixed(5)}`,
      coordinates,
    });
    setStatus('Destination mise a jour depuis la carte.');
  }

  async function handleSaveCurrentPlace(target: 'pickup' | 'destination') {
    if (bookingMutationInFlightRef.current) {
      return;
    }

    const place = target === 'pickup' ? pickupPlace : destinationPlace;

    if (!place.coordinates) {
      setStatus(
        "Ce lieu n'a pas encore de coordonnees et ne peut pas etre enregistre.",
      );
      return;
    }

    const alreadySaved = profile.profile.savedPlaces.some((savedPlace) =>
      isSamePlace(place, savedPlace),
    );

    if (alreadySaved) {
      setStatus('Ce lieu est deja present dans vos favoris.');
      return;
    }

    bookingMutationInFlightRef.current = true;
    setIsSubmitting(true);
    setStatus(
      target === 'pickup'
        ? 'Enregistrement du point de depart...'
        : 'Enregistrement de la destination...',
    );

    try {
      const { authClient } = await restoreRiderSession();
      const validation = buildSavedPlacePayload({
        label: buildSavedPlaceLabel(target, place),
        address: place.address,
        latitude: String(place.coordinates.latitude),
        longitude: String(place.coordinates.longitude),
      });

      if (!validation.ok) {
        setStatus(validation.message);
        return;
      }

      await createSavedPlaceWithApi(authClient, validation.payload);
      await loadBookingContext();
      setStatus('Lieu ajoute a vos favoris pour les prochaines reservations.');
    } catch (error) {
      const feedback = await resolveRiderAppError(error, {
        surface: 'profile',
        fallback: "Le lieu n'a pas pu etre ajoute aux favoris.",
      });

      if (feedback.shouldClearSessionToken) {
        setSessionToken(null);
      }

      setStatus(feedback.message);
    } finally {
      bookingMutationInFlightRef.current = false;
      setIsSubmitting(false);
    }
  }

  const flow = resolveRiderActiveFlow(history);
  const {
    activeTrip,
    activeRequest,
    activeFlowState,
    hasOpenFlow,
    primaryStatusLabel,
  } = flow;
  const immediateBookingSupplyUnknown =
    !hasOpenFlow &&
    scheduleMode === 'now' &&
    nearbyCompatibleDriverCount === null;
  const immediateBookingUnavailable =
    !hasOpenFlow &&
    scheduleMode === 'now' &&
    nearbyCompatibleDriverCount !== null &&
    nearbyCompatibleDriverCount <= 0;
  const isBookingCtaDisabled =
    isSubmitting ||
    (!hasOpenFlow &&
      (!selectedOption ||
        !destinationPlace.coordinates ||
        immediateBookingSupplyUnknown ||
        immediateBookingUnavailable));
  const bookingCtaLabel = isSubmitting
    ? tb('confirmLoading')
      : hasOpenFlow
        ? tb('activeFlow')
      : immediateBookingUnavailable
        ? 'Aucun chauffeur proche'
      : immediateBookingSupplyUnknown
        ? 'Vérification chauffeur...'
      : selectedOption && destinationPlace.coordinates
        ? tb('confirm').replace('{{fare}}', formatRiderMoneyAmount(selectedOption.fare))
        : tb('noServiceSelected');

  useEffect(() => {
    const previousFlowState = previousFlowStateRef.current;
    setBookingTransitionLabel(
      buildRiderFlowTransitionLabel(
        previousFlowState,
        activeFlowState,
        'booking',
      ),
    );

    previousFlowStateRef.current = activeFlowState;
  }, [activeFlowState]);

  useEffect(() => {
    if (!bookingTransitionLabel) {
      return;
    }

    const timeout = setTimeout(() => {
      setBookingTransitionLabel(null);
    }, 5000);

    return () => clearTimeout(timeout);
  }, [bookingTransitionLabel]);

  function handlePaymentMethodSelect(method: PaymentMethod) {
    setSelectedPaymentMethod(method);

    if (method === 'cash') {
      setPaymentSelection({ method: 'cash' });
      return;
    }

    if (method === 'wallet') {
      setPaymentSelection({ method: 'wallet' });
      return;
    }

    setPaymentSelection((current) =>
      current.method === 'mobile-money'
        ? current
        : {
            method: 'mobile-money',
            network: 'ORANGE_BFA',
            phoneNumber: '',
          },
    );
  }

  function resolveMobileMoneyNetwork(selection: PaymentSelection) {
    if (selection.method !== 'mobile-money') {
      return undefined;
    }

    return selection.network === 'MOOV_BFA' ? 'MOOV' : 'ORANGE_MONEY';
  }

  function resolveMobileMoneyPhoneNumber(
    selection: PaymentSelection,
    fallbackPhoneNumber: string | null,
  ) {
    const selectedDigits =
      selection.method === 'mobile-money'
        ? selection.phoneNumber.replace(/\D/g, '')
        : '';
    const fallbackDigits = fallbackPhoneNumber?.replace(/\D/g, '') ?? '';

    return selectedDigits || fallbackDigits || undefined;
  }

  async function handleValidatePromo() {
    const code = promoCodeInput.trim().toUpperCase();
    if (!code) return;
    setIsValidatingPromo(true);
    setPromoError(null);
    setPromoValidation(null);
    try {
      const { authClient } = await restoreRiderSession();
      const result = await validatePromoCodeWithApi(authClient, code);
      setPromoValidation(result);
    } catch {
      setPromoError('Code invalide, expire ou non applicable a votre compte.');
    } finally {
      setIsValidatingPromo(false);
    }
  }

  async function handleCreateRideRequest() {
    if (bookingMutationInFlightRef.current) {
      return;
    }
    safeHaptics.impact('heavy');

    const bookingValidation = validateBookingSelection({
      destinationPlace,
      hasOpenFlow,
      pickupPlace,
      selectedOption,
      selectedPaymentMethod,
    });
    if (!bookingValidation.ok) {
      setStatus(bookingValidation.message);
      return;
    }
    const selectedValidatedOption = bookingValidation.option;

    if (scheduleMode === 'now' && nearbyCompatibleDriverCount === null) {
      setStatus(
        'Disponibilite chauffeur pas encore verifiee. Attendez la synchronisation ou reessayez.',
      );
      return;
    }

    if (
      scheduleMode === 'now' &&
      nearbyCompatibleDriverCount !== null &&
      nearbyCompatibleDriverCount <= 0
    ) {
      setStatus(
        `Aucun chauffeur compatible en ligne dans ${fieldDispatchRadiusKm} km. Ouvrez l'app chauffeur, connectez le compte driver, passez en ligne, puis relancez la demande.`,
      );
      return;
    }

    if (selectedPaymentMethod === 'mobile-money') {
      const mobileMoneyPhone = resolveMobileMoneyPhoneNumber(
        paymentSelection,
        profile.profile.phoneNumber,
      );

      if (!mobileMoneyPhone || mobileMoneyPhone.length < 8) {
        setStatus(
          'Ajoutez un numéro Mobile Money valide avant de confirmer la course.',
        );
        return;
      }
    }

    bookingMutationInFlightRef.current = true;
    setIsSubmitting(true);
    setStatus(
      `Creation authentifiee de la demande ${selectedValidatedOption.title}...`,
    );

    try {
      const { authClient, me } = await restoreRiderSession();
      const bookingIdempotencyKey = buildRideRequestIdempotencyKey({
        destinationAddress: destinationPlace.address,
        paymentMethod: selectedPaymentMethod,
        pickupAddress: pickupPlace.address,
        riderId: me.user.id,
        selectedCityId: selectedCity.id,
        selectedOptionId: selectedValidatedOption.id,
      });
      const createdRequest = await createRideRequestWithApi(
        authClient,
        {
          pickupAddress: pickupPlace.address,
          pickupLatitude:
            pickupPlace.coordinates?.latitude ??
            riderPosition.latestPosition?.latitude,
          pickupLongitude:
            pickupPlace.coordinates?.longitude ??
            riderPosition.latestPosition?.longitude,
          destinationAddress: destinationPlace.address,
          destinationLatitude: destinationPlace.coordinates?.latitude,
          destinationLongitude: destinationPlace.coordinates?.longitude,
          requestedVehicleType: toApiVehicleType(selectedValidatedOption.category),
          requestedServiceTier: toApiServiceTier(selectedValidatedOption.tier),
          estimatedDistanceKm: tripEstimate.distanceKm,
          estimatedDurationMinutes: tripEstimate.durationMinutes,
          paymentMethod: toApiPaymentMethod(selectedPaymentMethod),
          pickupAreaType: selectedCity.zone,
          city: selectedCity.id,
          districtProfile: selectedCity.districtProfile,
          notes: `Flow authentifie depuis l'app rider pour ${me.user.fullName}, ville ${selectedCity.label}, profil ${selectedCity.districtProfile}, option ${selectedValidatedOption.title}, paiement ${selectedPaymentMethod}`,
          promoCode: promoValidation?.code,
        },
        {
          idempotencyKey: bookingIdempotencyKey,
        },
      );

      if (selectedPaymentMethod !== 'cash') {
        const mobileMoneyPhone = resolveMobileMoneyPhoneNumber(
          paymentSelection,
          me.user.phoneNumber ?? profile.profile.phoneNumber,
        );
        const paymentIntent = await createCheckoutIntentWithApi(
          authClient,
          {
            rideRequestId: createdRequest.id,
            channel: resolveCheckoutChannel(selectedPaymentMethod),
            mobileMoneyNetwork:
              selectedPaymentMethod === 'mobile-money'
                ? resolveMobileMoneyNetwork(paymentSelection)
                : undefined,
            customerPhoneNumber:
              selectedPaymentMethod === 'mobile-money'
                ? mobileMoneyPhone
                : undefined,
            redirectUrl: orbiRuntimeConfig.paymentRedirectUrl,
          },
          {
            idempotencyKey: buildCheckoutIdempotencyKey({
              paymentMethod: selectedPaymentMethod,
              rideRequestId: createdRequest.id,
            }),
          },
        );

        setPaymentPreview({
          provider: paymentIntent.provider,
          transactionRef: paymentIntent.transactionRef,
          supportedNetworks: paymentIntent.supportedMobileMoneyNetworks,
          channel: paymentIntent.channel,
        });
        setStatus(
          `Demande ${createdRequest.id.slice(0, 8)} creee. ${createdRequest.bookingReadinessSummary ?? `Metriques ${createdRequest.routeMetricsSource === 'SERVER_COORDINATES' ? 'serveur GPS' : 'client fallback'}.`} Paiement ${paymentIntent.provider} initialise via ${paymentIntent.channel}.${createdRequest.pricingReason ? ` ${createdRequest.pricingReason}` : ''}`,
        );
      } else {
        setPaymentPreview(null);
        setStatus(
          `Demande ${createdRequest.id.slice(0, 8)} creee avec succes. ${createdRequest.bookingReadinessSummary ?? `Metriques ${createdRequest.routeMetricsSource === 'SERVER_COORDINATES' ? 'serveur GPS' : 'client fallback'}.`} Paiement en espece a regler a la fin du trajet.${createdRequest.pricingReason ? ` ${createdRequest.pricingReason}` : ''}`,
        );
      }

      // Feedback de creation de demande, avant acceptation chauffeur.
      setBookingConfirmed(true);
      safeHaptics.notify('success');
      Animated.sequence([
        Animated.spring(checkScale, { toValue: 1, tension: 50, friction: 5, useNativeDriver: false }),
        Animated.timing(checkOpacity, { toValue: 1, duration: 150, useNativeDriver: false }),
      ]).start();
      setTimeout(() => {
        Animated.timing(checkOpacity, { toValue: 0, duration: 400, useNativeDriver: false }).start();
        setTimeout(() => {
          setBookingConfirmed(false);
          checkScale.setValue(0);
          router.push('/activity');
        }, 450);
      }, 1800);

      await loadBookingContext({ resetPaymentPreview: false });
    } catch (error) {
      const feedback = await resolveRiderAppError(error, {
        surface: selectedPaymentMethod === 'cash' ? 'booking' : 'payments',
        fallback:
          'La creation de demande a echoue. Verifiez le backend ou la base locale.',
      });

      if (feedback.shouldClearSessionToken) {
        setSessionToken(null);
      }

      setStatus(feedback.message);
    } finally {
      bookingMutationInFlightRef.current = false;
      setIsSubmitting(false);
    }
  }

  return (
    <OrbiScreen audience="rider" style={styles.safe}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={styles.backBtn}
          hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
        >
          <BackGlyph />
        </Pressable>
        <Text style={styles.headerTitle}>Réserver</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* ── Booking confirmation overlay ── */}
      {bookingConfirmed ? (
        <Animated.View style={[styles.confirmOverlay, { opacity: checkOpacity }]}>
          <Animated.View style={[styles.confirmCircle, { transform: [{ scale: checkScale }] }]}>
            <CheckGlyph />
          </Animated.View>
          <Text style={styles.confirmLabel}>Demande envoyée</Text>
        </Animated.View>
      ) : null}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Route summary card ── */}
        <OrbiSurface style={styles.routeSummaryCard} elevated>
          <View style={styles.routeSummaryRow}>
            <View style={styles.routeDotGreen} />
            <View style={styles.routeSummaryField}>
              <Text style={styles.routeSummaryLabel}>Départ</Text>
              <Text style={styles.routeSummaryValue} numberOfLines={1}>
                {pickupPlace.label}
              </Text>
            </View>
            <Pressable
              onPress={handleUseCurrentPositionAsPickup}
              style={styles.gpsBtn}
              hitSlop={8}
            >
              <TargetGlyph />
            </Pressable>
          </View>
          <View style={styles.routeSummarySep} />
          <View style={styles.routeSummaryRow}>
            <View style={styles.routeDotDark} />
            <View style={styles.routeSummaryField}>
              <Text style={styles.routeSummaryLabel}>Destination</Text>
              <Text
                style={[
                  styles.routeSummaryValue,
                  !destinationPlace.coordinates && styles.routeSummaryPlaceholder,
                ]}
                numberOfLines={1}
              >
                {destinationPlace.label}
              </Text>
            </View>
          </View>
          <View style={styles.tripDecisionRow}>
            <Text style={styles.tripDecisionValue} numberOfLines={1}>
              {selectedOption ? formatRiderMoneyAmount(selectedOption.fare) : '--'} · {tripEstimate.distanceKm} km · {tripEstimate.durationMinutes} min
            </Text>
            <View style={styles.tripDecisionSignal}>
              <View
                style={[
                  styles.tripDecisionDot,
                  {
                    backgroundColor:
                      nearbyCompatibleDriverCount === null
                        ? theme.colors.sky
                        : nearbyCompatibleDriverCount > 0
                          ? theme.colors.teal
                          : theme.colors.amber,
                  },
                ]}
              />
              <Text style={styles.tripDecisionSignalText} numberOfLines={1}>
                {nearbyCompatibleDriverCount === null
                  ? 'Scan'
                  : nearbyCompatibleDriverCount > 0
                    ? `${nearbyCompatibleDriverCount} proche${nearbyCompatibleDriverCount > 1 ? 's' : ''}`
                    : 'Aucun proche'}
              </Text>
            </View>
          </View>
        </OrbiSurface>

        {/* ── Search fields ── */}
        <View style={styles.searchSection}>
          <View style={styles.searchField}>
            <Text style={styles.searchFieldLabel}>Départ</Text>
            <PlaceSearch
              placeholder="Quartier, monument, adresse…"
              tone="teal"
              cityHint={selectedCity.label}
              onSelectPlace={(place) => applyPlace('pickup', place)}
            />
          </View>
          <View style={styles.searchField}>
            <Text style={styles.searchFieldLabel}>Destination</Text>
            <PlaceSearch
              placeholder="Où allez-vous ?"
              tone="amber"
              cityHint={selectedCity.label}
              onSelectPlace={(place) => applyPlace('destination', place)}
            />
          </View>
        </View>

        {/* ── Map preview ── */}
        <View style={styles.mapPreviewWrap}>
          <TripMapView
            pickupLat={
              pickupPlace.coordinates?.latitude ??
              riderPosition.latestPosition?.latitude ??
              selectedCity.pickup.coordinates.latitude
            }
            pickupLng={
              pickupPlace.coordinates?.longitude ??
              riderPosition.latestPosition?.longitude ??
              selectedCity.pickup.coordinates.longitude
            }
            destLat={
              destinationPlace.coordinates?.latitude ??
              selectedCity.destination.coordinates.latitude
            }
            destLng={
              destinationPlace.coordinates?.longitude ??
              selectedCity.destination.coordinates.longitude
            }
            driverLat={null}
            driverLng={null}
            selectable
            onSelectCoordinate={handleSelectDestinationOnMap}
            style={styles.mapPreview}
          />
          <View style={styles.mapBadge}>
            <Text style={styles.mapBadgeText}>
              {tripEstimate.distanceKm} km · {tripEstimate.durationMinutes} min
            </Text>
          </View>
        </View>

        {/* ── Active flow notice ── */}
        {hasOpenFlow ? (
          <Pressable onPress={() => router.push('/activity')}>
            <OrbiSurface tone="amber" style={styles.activeFlowBanner}>
              <View style={{ flex: 1 }}>
              <Text style={styles.activeFlowTitle}>
                Course ou demande en cours
              </Text>
              <Text style={styles.activeFlowSub} numberOfLines={1}>
                {activeTrip
                  ? `${activeTrip.pickupAddress} → ${activeTrip.destinationAddress}`
                  : activeRequest
                    ? `${activeRequest.pickupAddress} → ${activeRequest.destinationAddress}`
                    : "Voir l'activité"}
              </Text>
              </View>
              <ForwardGlyph color={theme.colors.amber} />
            </OrbiSurface>
          </Pressable>
        ) : immediateBookingUnavailable || immediateBookingSupplyUnknown ? (
          <OrbiStatusBanner
            tone={immediateBookingUnavailable ? 'amber' : 'sky'}
            title={immediateBookingUnavailable ? 'Aucun chauffeur proche' : 'Vérification chauffeur en cours'}
            message={
              immediateBookingUnavailable
                ? `Demande immédiate bloquée tant qu'aucun chauffeur n'est en ligne dans ${fieldDispatchRadiusKm} km.`
                : 'Le backend doit confirmer la présence chauffeur avant de lancer la recherche.'
            }
          />
        ) : nearbyCompatibleDriverCount !== null ? (
          <OrbiStatusBanner
            tone="teal"
            title={`${nearbyCompatibleDriverCount} chauffeur${nearbyCompatibleDriverCount > 1 ? 's' : ''} en ligne`}
            message={`Disponibilité réelle vérifiée dans ${fieldDispatchRadiusKm} km autour du départ.`}
          />
        ) : null}

        {/* ── Scheduled ride picker ── */}
        <ScheduledRidePicker
          mode={scheduleMode}
          scheduledDate={scheduledDate}
          scheduledTime={scheduledTime}
          onModeChange={setScheduleMode}
          onDateChange={setScheduledDate}
          onTimeChange={setScheduledTime}
        />

        {/* ── Vehicle selector (extracted component) ── */}
        <VehicleSelector
          options={options}
          selectedOptionId={selectedOptionId}
          promoValidation={promoValidation}
          isRefreshing={isRefreshing}
          onSelect={setSelectedOptionId}
        />

        <PriceConfidenceCard
          option={selectedOption}
          distanceKm={tripEstimate.distanceKm}
          durationMinutes={tripEstimate.durationMinutes}
        />

        {/* ── Payment method ── */}
        <PaymentMethodsManager
          selectedMethod={selectedPaymentMethod}
          availableMethods={selectedOption?.paymentMethods}
          onSelect={handlePaymentMethodSelect}
          onSelectionChange={setPaymentSelection}
        />

        {/* ── Promo code ── */}
        <View style={promoStyles.container}>
          {promoValidation ? (
            <>
              <Text style={promoStyles.label}>Code promo appliqué</Text>
              <View style={promoStyles.successBox}>
                <Text style={promoStyles.successText}>
                  {promoValidation.code}
                </Text>
                <Text style={promoStyles.successMeta}>
                  Réduction de {promoValidation.discountBps / 100}%
                </Text>
              </View>
              <OrbiButton
                onPress={() => {
                  setPromoValidation(null);
                  setPromoCodeInput('');
                }}
                label="Retirer le code"
                variant="secondary"
                tone="danger"
                style={promoStyles.clearButton}
              />
            </>
          ) : (
            <>
              <Pressable
                onPress={() => setShowPromo(!showPromo)}
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <Text style={promoStyles.label}>Code promo</Text>
                <Text style={styles.promoToggleLink}>
                  {showPromo ? t('common.cancel') : tb('addPromo')}
                </Text>
              </Pressable>
              {showPromo ? (
                <View style={promoStyles.row}>
                  <TextInput
                    value={promoCodeInput}
                    onChangeText={setPromoCodeInput}
                    placeholder="CODE PROMO"
                    autoCapitalize="characters"
                    placeholderTextColor={theme.colors.textMuted}
                    style={promoStyles.input}
                  />
                  <OrbiButton
                    onPress={() => void handleValidatePromo()}
                    disabled={isValidatingPromo || !promoCodeInput.trim()}
                    loading={isValidatingPromo}
                    label="OK"
                    tone="teal"
                    style={promoStyles.applyButton}
                  />
                </View>
              ) : null}
              {promoError ? (
                <Text style={promoStyles.errorText}>{promoError}</Text>
              ) : null}
            </>
          )}
        </View>

        {/* ── Saved places ── */}
        {savedPlaces.length > 0 ? (
          <View style={styles.savedSection}>
            <Text style={styles.sectionTitle}>{tb('savedPlaces')}</Text>
            {savedPlaces.slice(0, 2).map((place) => (
              <Pressable
                key={place.id}
                style={styles.savedRow}
                onPress={() => applyPlace('destination', place)}
              >
                <View style={styles.savedIconWrap}>
                  <SavedPlaceGlyph />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.savedLabel}>{place.label}</Text>
                  <Text style={styles.savedAddress} numberOfLines={1}>
                    {place.address}
                  </Text>
                </View>
                <ForwardGlyph color={theme.colors.textMuted} />
              </Pressable>
            ))}
          </View>
        ) : null}

        {/* ── Payment preview (after booking) ── */}
        {paymentPreview ? (
          <OrbiStatusBanner
            tone="teal"
            title="Paiement initié"
            message={`${paymentPreview.provider} · ${paymentPreview.channel} · Réf: ${paymentPreview.transactionRef}`}
          />
        ) : null}

        {/* ── Realtime sync indicator ── */}
        {isRealtimeSyncing ? (
          <OrbiStatusBanner
            tone="sky"
            title="Mise à jour en cours"
            message="Synchronisation du booking et du direct."
          />
        ) : null}

        <View style={{ height: 110 }} />
      </ScrollView>

      {/* ── CTA fixe en bas ── */}
      <View style={styles.ctaWrap}>
        <View style={styles.ctaSignalRow}>
          <View style={styles.ctaSignalCopy}>
            <Text style={styles.ctaSignalTitle} numberOfLines={1}>
              {hasOpenFlow
                ? 'Course en cours'
                : immediateBookingUnavailable
                  ? 'Aucun chauffeur autour du départ'
                : immediateBookingSupplyUnknown
                  ? 'Scan disponibilité'
                  : selectedOption && destinationPlace.coordinates
                    ? `${formatRiderMoneyAmount(selectedOption.fare)} · ${selectedOption.title}`
                    : 'Choisissez votre course'}
            </Text>
            <Text style={styles.ctaSignalMeta} numberOfLines={1}>
              {hasOpenFlow
                ? 'Suivez le statut dans Activité'
                : immediateBookingUnavailable
                  ? `Essayez plus tard ou programmez la course`
                  : immediateBookingSupplyUnknown
                    ? `Vérification dans ${fieldDispatchRadiusKm} km`
                    : selectedOption && destinationPlace.coordinates
                      ? `${tripEstimate.distanceKm} km · ${tripEstimate.durationMinutes} min · ${selectedPaymentMethod === 'cash' ? 'Espèces' : selectedPaymentMethod}`
                      : 'Départ, destination et disponibilité requis'}
            </Text>
          </View>
          <View
            style={[
              styles.ctaAvailabilityDot,
              {
                backgroundColor:
                  immediateBookingUnavailable
                    ? theme.colors.amber
                    : immediateBookingSupplyUnknown
                      ? theme.colors.sky
                      : theme.colors.teal,
              },
            ]}
          />
        </View>
        <OrbiButton
          accessibilityLabel="booking-cta"
          onPress={
            hasOpenFlow
              ? () => router.push('/activity')
              : () => void handleCreateRideRequest()
          }
          disabled={isBookingCtaDisabled}
          loading={isSubmitting}
          label={bookingCtaLabel}
          tone="teal"
          style={styles.ctaBtn}
          labelStyle={styles.ctaBtnLabel}
        />
      </View>
    </OrbiScreen>
  );
}

const makeStyles = (theme: OrbiTheme) => StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 40,
    gap: 10,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.riderBackground,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.backgroundAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
    color: theme.colors.text,
  },

  // Route summary card
  routeSummaryCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(0,194,168,0.24)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    ...theme.shadows.card,
  },
  routeSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 10,
  },
  routeDotGreen: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.colors.teal,
    flexShrink: 0,
  },
  routeDotDark: {
    width: 10,
    height: 10,
    borderRadius: 3,
    backgroundColor: theme.colors.text,
    flexShrink: 0,
  },
  routeSummaryField: { flex: 1 },
  routeSummaryLabel: {
    fontSize: 10,
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0,
    marginBottom: 2,
  },
  routeSummaryValue: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
    color: theme.colors.text,
  },
  routeSummaryPlaceholder: {
    color: theme.colors.textMuted,
    fontWeight: '400',
    fontFamily: 'Inter_400Regular',
  },
  routeSummarySep: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginLeft: 22,
  },
  tripDecisionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(0,194,168,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(0,194,168,0.18)',
    paddingHorizontal: 11,
    paddingVertical: 7,
    marginTop: 6,
  },
  tripDecisionValue: {
    fontSize: 12,
    fontWeight: '800',
    fontFamily: 'Inter_700Bold',
    color: theme.colors.text,
    flex: 1,
  },
  tripDecisionSignal: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flexShrink: 0,
  },
  tripDecisionDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  tripDecisionSignalText: {
    fontSize: 11,
    fontWeight: '800',
    fontFamily: 'Inter_700Bold',
    color: theme.colors.textSoft,
  },
  gpsBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.colors.accentLight,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  // Search section
  searchSection: { gap: 7 },
  searchField: { gap: 4 },
  searchFieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0,
  },

  // City chips
  cityScrollContent: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    paddingHorizontal: 2,
  },
  cityChip: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: theme.colors.backgroundAlt,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  cityChipActive: {
    backgroundColor: theme.colors.text,
    borderColor: theme.colors.text,
  },
  cityChipLabel: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
    color: theme.colors.textSoft,
  },
  cityChipLabelActive: { color: theme.colors.textInverse },

  // Map preview
  mapPreviewWrap: {
    height: 150,
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: 'rgba(0, 201, 167, 0.12)',
    ...theme.shadows.card,
  },
  mapPreview: { width: '100%', height: '100%' },
  mapBadge: {
    position: 'absolute',
    bottom: 10,
    left: 10,
    backgroundColor: 'rgba(0,0,0,0.72)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  mapBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
    color: '#FFFFFF',
  },
  // Active flow banner
  activeFlowBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
  },
  activeFlowTitle: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
    color: theme.colors.text,
  },
  activeFlowSub: {
    fontSize: 12,
    color: theme.colors.textSoft,
    fontFamily: 'Inter_400Regular',
    marginTop: 2,
  },
  // Vehicle section
  vehicleSection: { gap: 10 },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
    color: theme.colors.text,
    paddingHorizontal: 2,
  },
  vehicleScroll: { gap: 10, paddingHorizontal: 2 },
  vehicleCard: {
    width: 112,
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    padding: 12,
    alignItems: 'center',
    gap: 6,
    ...theme.shadows.card,
  },
  vehicleAvatar: {
    width: 64,
    height: 64,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.backgroundAlt,
  },
  vehicleName: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
    color: theme.colors.textSoft,
    textAlign: 'center',
  },
  vehicleEta: {
    fontSize: 11,
    color: theme.colors.textMuted,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
  },
  vehicleFare: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
    color: theme.colors.textSoft,
    textAlign: 'center',
  },
  vehicleLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    justifyContent: 'center',
    paddingVertical: 20,
  },
  vehicleLoadingText: {
    fontSize: 14,
    color: theme.colors.textMuted,
    fontFamily: 'Inter_400Regular',
  },
  priceConfidenceCard: {
    padding: 12,
    gap: 10,
    borderColor: 'rgba(0,194,168,0.22)',
  },
  priceConfidenceTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  priceConfidenceCopy: {
    flex: 1,
    minWidth: 0,
  },
  priceConfidenceLabel: {
    fontSize: 11,
    fontWeight: '800',
    fontFamily: 'Inter_700Bold',
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  priceConfidenceFare: {
    fontSize: 24,
    fontWeight: '800',
    fontFamily: 'Inter_700Bold',
    color: theme.colors.text,
    marginTop: 1,
  },
  priceConfidenceBadge: {
    borderRadius: 999,
    backgroundColor: 'rgba(0,194,168,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(0,194,168,0.22)',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  priceConfidenceBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    fontFamily: 'Inter_700Bold',
    color: theme.colors.teal,
  },
  priceMetricGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  priceMetricTile: {
    flex: 1,
    minWidth: 0,
    borderRadius: 12,
    backgroundColor: theme.colors.backgroundAlt,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 2,
  },
  priceMetricLabel: {
    fontSize: 10,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  priceMetricValue: {
    fontSize: 12,
    fontWeight: '800',
    fontFamily: 'Inter_700Bold',
    color: theme.colors.text,
  },
  priceSignalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  priceSignalText: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Inter_400Regular',
    color: theme.colors.textSoft,
  },
  priceSignalPill: {
    maxWidth: 112,
    borderRadius: 999,
    backgroundColor: theme.colors.text,
    color: theme.colors.textInverse,
    overflow: 'hidden',
    paddingHorizontal: 9,
    paddingVertical: 5,
    fontSize: 10,
    fontWeight: '800',
    fontFamily: 'Inter_700Bold',
  },
  priceRoundingText: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
    color: theme.colors.textMuted,
  },


  // Promo
  promoToggleLink: {
    color: theme.colors.teal,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
  },

  // Saved places
  savedSection: { gap: 8 },
  savedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: theme.colors.backgroundAlt,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  savedIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,201,167,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  savedLabel: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
    color: theme.colors.text,
  },
  savedAddress: {
    fontSize: 12,
    color: theme.colors.textMuted,
    fontFamily: 'Inter_400Regular',
  },
  // ── Booking confirmation overlay ────────────────────────────────────────────
  confirmOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
    gap: 16,
  },
  confirmCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#00C9A7',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#00C9A7',
    shadowOpacity: 0.55,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 6 },
    elevation: 14,
  },
  confirmLabel: {
    fontSize: 18,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
    color: '#FFFFFF',
  },

  // CTA
  ctaWrap: {
    paddingHorizontal: 16,
    paddingBottom: 22,
    paddingTop: 10,
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 },
    elevation: 12,
  },
  ctaBtn: {
    minHeight: 50,
  },
  ctaBtnLabel: {
    fontSize: 15,
  },
  ctaSignalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 8,
  },
  ctaSignalCopy: {
    flex: 1,
    minWidth: 0,
  },
  ctaSignalTitle: {
    fontSize: 13,
    fontWeight: '800',
    fontFamily: 'Inter_700Bold',
    color: theme.colors.text,
  },
  ctaSignalMeta: {
    fontSize: 11,
    fontWeight: '500',
    color: theme.colors.textMuted,
    marginTop: 1,
  },
  ctaAvailabilityDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },

  // Compat stubs (used in internal handlers only)
  confirmButtonDisabled: { opacity: 0.38 },
  bookingMap: { height: 180, borderRadius: 16, overflow: 'hidden' },
  paymentRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  paymentChip: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: theme.colors.backgroundAlt,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  paymentChipActive: {
    backgroundColor: theme.colors.text,
    borderColor: theme.colors.text,
  },
  paymentChipLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.textSoft,
  },
  paymentChipLabelActive: { color: theme.colors.textInverse },
  routeActionStack: { gap: 10 },
  inlineActions: { gap: 8 },
  inlineActionCard: { width: '100%' },

});

const makeBookIconStyles = (theme: OrbiTheme) => StyleSheet.create({
  backWrap: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backLine: {
    position: 'absolute',
    width: 12,
    height: 2.5,
    borderRadius: 999,
    backgroundColor: theme.colors.text,
    left: 3,
  },
  backLineTop: {
    transform: [{ rotate: '-45deg' }, { translateY: -4 }],
  },
  backLineBottom: {
    transform: [{ rotate: '45deg' }, { translateY: 4 }],
  },
  targetOuter: {
    width: 17,
    height: 17,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: theme.colors.teal,
    alignItems: 'center',
    justifyContent: 'center',
  },
  targetInner: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: theme.colors.teal,
  },
  checkWrap: {
    width: 42,
    height: 34,
  },
  checkLine: {
    position: 'absolute',
    height: 6,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
  },
  checkLineShort: {
    width: 16,
    left: 5,
    top: 18,
    transform: [{ rotate: '45deg' }],
  },
  checkLineLong: {
    width: 32,
    left: 14,
    top: 14,
    transform: [{ rotate: '-45deg' }],
  },
  forwardWrap: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
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
  savedPin: {
    width: 15,
    height: 15,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: theme.colors.teal,
    alignItems: 'center',
    justifyContent: 'center',
  },
  savedPinDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: theme.colors.teal,
  },
});
