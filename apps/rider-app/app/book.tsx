import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from '../lib/i18n';
import { VehicleSelector } from '../lib/booking/vehicle-selector';
import { ScheduledRidePicker, type ScheduledRideMode } from '../lib/booking/scheduled-ride-picker';
import { PaymentMethodsManager } from '../lib/booking/payment-methods-manager';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  SafeAreaView,
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
  createOrbiApiClient,
  createSavedPlaceWithApi,
  estimateDurationMinutes,
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
  formatXof,
  orbiCopy,
  orbiTheme,
} from '@orbi/ui';
import {
  orbiRuntimeConfig,
  resolveOrbiApiBaseUrlForRuntime,
} from '@orbi/config';
import { restoreRiderSession } from '../lib/auth';
import { resolveRiderAppError } from '../lib/session-feedback';
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

const cityPresets = burkinaPricingCityPresets;

const fallbackRiderProfile: RiderProfileResponse = {
  profile: {
    id: 'loading',
    fullName: '',
    email: '',
    phoneNumber: null,
    preferredTier: 'MOTO_STANDARD',
    emergencyPhone: null,
    trustedContact: {
      phoneNumber: null,
      shareMode: 'DISABLED',
      status: 'MISSING',
      safetyNote: '',
    },
    savedPlaces: [],
    stats: {
      totalRideRequests: 0,
      totalTrips: 0,
      completedTrips: 0,
      savedPlaces: 0,
    },
  },
};

function toPlaceFromSavedPlace(
  place: RiderProfileResponse['profile']['savedPlaces'][number],
): Place {
  return {
    id: place.id,
    label: place.label,
    address: place.address,
    coordinates:
      place.latitude !== null &&
      place.latitude !== undefined &&
      place.longitude !== null &&
      place.longitude !== undefined
        ? {
            latitude: place.latitude,
            longitude: place.longitude,
          }
        : undefined,
  };
}

function normalizePlaceText(value: string) {
  return value.trim().toLowerCase();
}

function isSamePlace(
  left: Place,
  right: RiderProfileResponse['profile']['savedPlaces'][number],
) {
  const sameAddress =
    normalizePlaceText(left.address) === normalizePlaceText(right.address);
  const sameCoordinates =
    left.coordinates &&
    right.latitude !== null &&
    right.latitude !== undefined &&
    right.longitude !== null &&
    right.longitude !== undefined &&
    Math.abs(left.coordinates.latitude - right.latitude) < 0.0001 &&
    Math.abs(left.coordinates.longitude - right.longitude) < 0.0001;

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


const promoStyles = StyleSheet.create({
  container: {
    backgroundColor: orbiTheme.colors.panel,
    borderWidth: 1,
    borderColor: orbiTheme.colors.border,
    borderRadius: 16,
    padding: 14,
    gap: 10,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: orbiTheme.colors.muted,
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
    borderColor: orbiTheme.colors.border,
    backgroundColor: orbiTheme.colors.backgroundAlt,
    paddingHorizontal: 12,
    color: orbiTheme.colors.text,
    fontWeight: '700',
    letterSpacing: 1.5,
    fontSize: 14,
  },
  applyButton: {
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: orbiTheme.colors.teal,
  },
  applyButtonDisabled: {
    opacity: 0.4,
  },
  applyButtonLabel: {
    color: orbiTheme.colors.background,
    fontWeight: '800',
    fontSize: 13,
  },
  clearButton: {
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: orbiTheme.colors.border,
  },
  clearButtonLabel: {
    color: orbiTheme.colors.muted,
    fontWeight: '700',
    fontSize: 13,
  },
  successBox: {
    backgroundColor: 'rgba(61,215,192,0.08)',
    borderRadius: 10,
    padding: 10,
    gap: 4,
  },
  successText: {
    color: orbiTheme.colors.teal,
    fontWeight: '800',
    fontSize: 14,
  },
  successMeta: {
    color: orbiTheme.colors.muted,
    fontSize: 12,
  },
  errorText: {
    color: orbiTheme.colors.danger ?? '#ff7f66',
    fontSize: 12,
    fontWeight: '600',
  },
  strikePrice: {
    fontSize: 13,
    color: orbiTheme.colors.muted,
    textDecorationLine: 'line-through',
    fontWeight: '600',
  },
  discountedPrice: {
    color: orbiTheme.colors.teal,
  },
});

export default function BookingScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const tb = (key: string) => t(`booking.${key}`);
  // Accept voice suggestion params from /voice screen
  const {
    suggestionName,
    suggestionAddress,
    suggestionLat,
    suggestionLng,
  } = useLocalSearchParams<{
    suggestionName?: string;
    suggestionAddress?: string;
    suggestionLat?: string;
    suggestionLng?: string;
  }>();
  const [options, setOptions] = useState<RideOption[]>([]);
  const [history, setHistory] = useState<MyTripsResponse | null>(null);
  const [profile, setProfile] =
    useState<RiderProfileResponse>(fallbackRiderProfile);
  const [selectedOptionId, setSelectedOptionId] = useState<string>('');
  const [selectedPaymentMethod, setSelectedPaymentMethod] =
    useState<PaymentMethod>('cash');
  const [selectedCityId, setSelectedCityId] = useState<
    (typeof cityPresets)[number]['id']
  >(cityPresets[0].id);
  const [status, setStatus] = useState(
    'Connexion au compte passager en cours...',
  );
  const [pickupPlace, setPickupPlace] = useState<Place>(cityPresets[0].pickup);
  const [destinationPlace, setDestinationPlace] = useState<Place>(
    cityPresets[0].destination,
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
  // Pre-fill destination from voice suggestion params
  useEffect(() => {
    if (
      suggestionName &&
      suggestionAddress &&
      suggestionLat &&
      suggestionLng
    ) {
      const lat = parseFloat(suggestionLat);
      const lng = parseFloat(suggestionLng);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        setDestinationPlace({
          id: `voice-${Date.now()}`,
          label: suggestionName,
          address: suggestionAddress,
          coordinates: { latitude: lat, longitude: lng },
        });
      }
    }
  // Only run once on mount (params don't change after navigation)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    const client = createOrbiApiClient(resolveOrbiApiBaseUrlForRuntime(), {
      version: orbiRuntimeConfig.apiVersion,
    });

    setIsRefreshing(true);

    try {
      const { authClient, me, session } = await restoreRiderSession();
      setSessionToken(session.sessionToken);
      const [response, historyResponse, profileResponse] = await Promise.all([
        fetchRideOptionsPreview(client, {
          distanceKm: tripEstimate.distanceKm,
          durationMinutes: tripEstimate.durationMinutes,
          vehicleType: 'MOTORCYCLE',
          paymentMethod: toApiPaymentMethod(selectedPaymentMethod),
          zone: selectedCity.zone,
          city: selectedCity.id,
          districtProfile: selectedCity.districtProfile,
          isPeakHour: true,
          activeDriverCount: 8,
          openRequestCount: 11,
        }),
        fetchMyTrips(authClient),
        fetchRiderProfile(authClient),
      ]);

      setOptions(response.options);
      setHistory(historyResponse);
      setProfile(profileResponse);
      if (options.resetPaymentPreview ?? true) {
        setPaymentPreview(null);
      }
      const flow = resolveRiderActiveFlow(historyResponse);

      const firstOption = response.options[0];
      const nextSelectedOption =
        response.options.find((option) => option.id === selectedOptionId) ??
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
          : `Pret a reserver pour ${me.user.fullName} a ${selectedCity.label}.`,
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

  function handleSelectCity(city: (typeof cityPresets)[number]) {
    setSelectedCityId(city.id);
    setPickupPlace(city.pickup);
    setDestinationPlace(city.destination);
    setAutoAppliedRiderPosition(false);
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
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

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
        const paymentIntent = await createCheckoutIntentWithApi(
          authClient,
          {
            rideRequestId: createdRequest.id,
            channel: resolveCheckoutChannel(selectedPaymentMethod),
            mobileMoneyNetwork:
              selectedPaymentMethod === 'mobile-money'
                ? 'ORANGE_MONEY'
                : undefined,
            customerPhoneNumber: me.user.phoneNumber ?? undefined,
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

      // Confirmation animation — green checkmark Uber-style
      setBookingConfirmed(true);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Animated.sequence([
        Animated.spring(checkScale, { toValue: 1, tension: 50, friction: 5, useNativeDriver: true }),
        Animated.timing(checkOpacity, { toValue: 1, duration: 150, useNativeDriver: true }),
      ]).start();
      setTimeout(() => {
        Animated.timing(checkOpacity, { toValue: 0, duration: 400, useNativeDriver: true }).start();
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
    <SafeAreaView style={styles.safe}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={styles.backBtn}
          hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
        >
          <Text style={styles.backArrow}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Réserver</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* ── Booking confirmation overlay ── */}
      {bookingConfirmed ? (
        <Animated.View style={[styles.confirmOverlay, { opacity: checkOpacity }]}>
          <Animated.View style={[styles.confirmCircle, { transform: [{ scale: checkScale }] }]}>
            <Text style={styles.confirmCheck}>✓</Text>
          </Animated.View>
          <Text style={styles.confirmLabel}>Course confirmée !</Text>
        </Animated.View>
      ) : null}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Route summary card ── */}
        <View style={styles.routeSummaryCard}>
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
              <Text style={styles.gpsBtnText}>◎</Text>
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
        </View>

        {/* ── Search fields ── */}
        <View style={styles.searchSection}>
          <View style={styles.searchField}>
            <Text style={styles.searchFieldLabel}>Départ</Text>
            <PlaceSearch
              placeholder="Quartier, monument, adresse…"
              tone="teal"
              onSelectPlace={(place) => applyPlace('pickup', place)}
            />
          </View>
          <View style={styles.searchField}>
            <View style={styles.searchFieldHeaderRow}>
              <Text style={styles.searchFieldLabel}>Destination</Text>
              <Pressable
                onPress={() => router.push('/voice')}
                style={styles.voiceBtn}
                hitSlop={8}
              >
                <Text style={styles.voiceBtnText}>🎤 Voix</Text>
              </Pressable>
            </View>
            <PlaceSearch
              placeholder="Où allez-vous ?"
              tone="amber"
              onSelectPlace={(place) => applyPlace('destination', place)}
            />
          </View>
        </View>

        {/* ── City chips ── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.cityScrollContent}
        >
          {cityPresets.map((city) => (
            <Pressable
              key={city.id}
              onPress={() => handleSelectCity(city)}
              style={[
                styles.cityChip,
                selectedCityId === city.id && styles.cityChipActive,
              ]}
            >
              <Text
                style={[
                  styles.cityChipLabel,
                  selectedCityId === city.id && styles.cityChipLabelActive,
                ]}
              >
                {city.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* ── Map preview ── */}
        {(pickupPlace.coordinates || riderPosition.latestPosition) &&
        destinationPlace.coordinates ? (
          <View style={styles.mapPreviewWrap}>
            <TripMapView
              pickupLat={
                pickupPlace.coordinates?.latitude ??
                riderPosition.latestPosition?.latitude
              }
              pickupLng={
                pickupPlace.coordinates?.longitude ??
                riderPosition.latestPosition?.longitude
              }
              destLat={destinationPlace.coordinates.latitude}
              destLng={destinationPlace.coordinates.longitude}
              driverLat={null}
              driverLng={null}
              style={styles.mapPreview}
            />
            <View style={styles.mapBadge}>
              <Text style={styles.mapBadgeText}>
                {tripEstimate.distanceKm} km · {tripEstimate.durationMinutes} min
              </Text>
            </View>
          </View>
        ) : null}

        {/* ── Active flow notice ── */}
        {hasOpenFlow ? (
          <Pressable
            style={styles.activeFlowBanner}
            onPress={() => router.push('/activity')}
          >
            <View style={styles.activeFlowDot} />
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
            <Text style={styles.activeFlowArrow}>›</Text>
          </Pressable>
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

        {/* ── Payment method ── */}
        <PaymentMethodsManager
          selectedMethod={selectedPaymentMethod}
          availableMethods={selectedOption?.paymentMethods}
          onSelect={setSelectedPaymentMethod}
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
              <Pressable
                onPress={() => {
                  setPromoValidation(null);
                  setPromoCodeInput('');
                }}
                style={promoStyles.clearButton}
              >
                <Text style={promoStyles.clearButtonLabel}>
                  Retirer le code
                </Text>
              </Pressable>
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
                    placeholderTextColor={orbiTheme.colors.textMuted}
                    style={promoStyles.input}
                  />
                  <Pressable
                    onPress={() => void handleValidatePromo()}
                    disabled={isValidatingPromo || !promoCodeInput.trim()}
                    style={[
                      promoStyles.applyButton,
                      (isValidatingPromo || !promoCodeInput.trim()) &&
                        promoStyles.applyButtonDisabled,
                    ]}
                  >
                    <Text style={promoStyles.applyButtonLabel}>
                      {isValidatingPromo ? '…' : 'OK'}
                    </Text>
                  </Pressable>
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
            {savedPlaces.slice(0, 4).map((place) => (
              <Pressable
                key={place.id}
                style={styles.savedRow}
                onPress={() => applyPlace('destination', place)}
              >
                <View style={styles.savedIconWrap}>
                  <Text style={styles.savedStar}>★</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.savedLabel}>{place.label}</Text>
                  <Text style={styles.savedAddress} numberOfLines={1}>
                    {place.address}
                  </Text>
                </View>
                <Text style={styles.savedArrow}>›</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {/* ── Payment preview (after booking) ── */}
        {paymentPreview ? (
          <View style={styles.paymentPreviewCard}>
            <Text style={styles.paymentPreviewTitle}>Paiement initié</Text>
            <Text style={styles.paymentPreviewProvider}>
              {paymentPreview.provider} · {paymentPreview.channel}
            </Text>
            <Text style={styles.paymentPreviewRef}>
              Réf : {paymentPreview.transactionRef}
            </Text>
          </View>
        ) : null}

        {/* ── Realtime sync indicator ── */}
        {isRealtimeSyncing ? (
          <View style={styles.syncNotice}>
            <ActivityIndicator
              size="small"
              color={orbiTheme.colors.teal}
              style={{ transform: [{ scale: 0.75 }] }}
            />
            <Text style={styles.syncNoticeText}>Mise à jour en cours…</Text>
          </View>
        ) : null}

        <View style={{ height: 110 }} />
      </ScrollView>

      {/* ── CTA fixe en bas ── */}
      <View style={styles.ctaWrap}>
        <Pressable
          onPress={
            hasOpenFlow
              ? () => router.push('/activity')
              : () => void handleCreateRideRequest()
          }
          disabled={
            isSubmitting ||
            (!hasOpenFlow && (!selectedOption || !destinationPlace.coordinates))
          }
          style={({ pressed }) => [
            styles.ctaBtn,
            (isSubmitting ||
              (!hasOpenFlow &&
                (!selectedOption || !destinationPlace.coordinates))) &&
              styles.ctaBtnDisabled,
            pressed && styles.ctaBtnPressed,
          ]}
        >
          <Text style={styles.ctaBtnLabel}>
            {isSubmitting
              ? tb('confirmLoading')
              : hasOpenFlow
                ? tb('activeFlow')
                : selectedOption && destinationPlace.coordinates
                  ? tb('confirm').replace('{{fare}}', formatXof(selectedOption.fare))
                  : tb('noServiceSelected')}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: orbiTheme.colors.background },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 40,
    gap: 16,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: orbiTheme.colors.border,
    backgroundColor: orbiTheme.colors.background,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: orbiTheme.colors.backgroundAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backArrow: { fontSize: 28, color: orbiTheme.colors.text, marginTop: -2 },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
    color: orbiTheme.colors.text,
  },

  // Route summary card
  routeSummaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: orbiTheme.colors.border,
    paddingHorizontal: 16,
    paddingVertical: 4,
    ...orbiTheme.shadows.card,
  },
  routeSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    gap: 12,
  },
  routeDotGreen: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: orbiTheme.colors.teal,
    flexShrink: 0,
  },
  routeDotDark: {
    width: 10,
    height: 10,
    borderRadius: 3,
    backgroundColor: orbiTheme.colors.text,
    flexShrink: 0,
  },
  routeSummaryField: { flex: 1 },
  routeSummaryLabel: {
    fontSize: 10,
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
    color: orbiTheme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  routeSummaryValue: {
    fontSize: 15,
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
    color: orbiTheme.colors.text,
  },
  routeSummaryPlaceholder: {
    color: orbiTheme.colors.textMuted,
    fontWeight: '400',
    fontFamily: 'Inter_400Regular',
  },
  routeSummarySep: {
    height: 1,
    backgroundColor: orbiTheme.colors.border,
    marginLeft: 22,
  },
  gpsBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: orbiTheme.colors.accentLight,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  gpsBtnText: { fontSize: 16, color: orbiTheme.colors.teal },

  // Search section
  searchSection: { gap: 10 },
  searchField: { gap: 4 },
  searchFieldHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 2,
  },
  searchFieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
    color: orbiTheme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  voiceBtn: {
    backgroundColor: 'rgba(0,201,167,0.10)',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  voiceBtnText: {
    fontSize: 11,
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
    color: orbiTheme.colors.teal,
  },

  // City chips
  cityScrollContent: { gap: 8, paddingHorizontal: 2 },
  cityChip: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: orbiTheme.colors.backgroundAlt,
    borderWidth: 1,
    borderColor: orbiTheme.colors.border,
  },
  cityChipActive: {
    backgroundColor: orbiTheme.colors.text,
    borderColor: orbiTheme.colors.text,
  },
  cityChipLabel: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
    color: orbiTheme.colors.textSoft,
  },
  cityChipLabelActive: { color: '#FFFFFF' },

  // Map preview
  mapPreviewWrap: {
    height: 180,
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
    ...orbiTheme.shadows.card,
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
    backgroundColor: 'rgba(255,149,0,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,149,0,0.28)',
    borderRadius: 14,
    padding: 14,
  },
  activeFlowDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: orbiTheme.colors.amber,
    flexShrink: 0,
  },
  activeFlowTitle: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
    color: orbiTheme.colors.text,
  },
  activeFlowSub: {
    fontSize: 12,
    color: orbiTheme.colors.textSoft,
    fontFamily: 'Inter_400Regular',
    marginTop: 2,
  },
  activeFlowArrow: { fontSize: 22, color: orbiTheme.colors.amber },

  // Vehicle section
  vehicleSection: { gap: 10 },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
    color: orbiTheme.colors.text,
    paddingHorizontal: 2,
  },
  vehicleScroll: { gap: 10, paddingHorizontal: 2 },
  vehicleCard: {
    width: 112,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: orbiTheme.colors.border,
    padding: 12,
    alignItems: 'center',
    gap: 6,
    ...orbiTheme.shadows.card,
  },
  vehicleAvatar: {
    width: 64,
    height: 64,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: orbiTheme.colors.border,
    backgroundColor: orbiTheme.colors.backgroundAlt,
  },
  vehicleName: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
    color: orbiTheme.colors.textSoft,
    textAlign: 'center',
  },
  vehicleEta: {
    fontSize: 11,
    color: orbiTheme.colors.textMuted,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
  },
  vehicleFare: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
    color: orbiTheme.colors.textSoft,
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
    color: orbiTheme.colors.textMuted,
    fontFamily: 'Inter_400Regular',
  },


  // Promo
  promoToggleLink: {
    color: orbiTheme.colors.teal,
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
    backgroundColor: orbiTheme.colors.backgroundAlt,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: orbiTheme.colors.border,
  },
  savedIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,201,167,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  savedStar: { fontSize: 16, color: orbiTheme.colors.teal },
  savedLabel: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
    color: orbiTheme.colors.text,
  },
  savedAddress: {
    fontSize: 12,
    color: orbiTheme.colors.textMuted,
    fontFamily: 'Inter_400Regular',
  },
  savedArrow: { fontSize: 20, color: orbiTheme.colors.textMuted },

  // Payment preview
  paymentPreviewCard: {
    backgroundColor: 'rgba(0,201,167,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(0,201,167,0.22)',
    borderRadius: 14,
    padding: 14,
    gap: 4,
  },
  paymentPreviewTitle: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
    color: orbiTheme.colors.teal,
  },
  paymentPreviewProvider: {
    fontSize: 13,
    color: orbiTheme.colors.textSoft,
    fontFamily: 'Inter_500Medium',
  },
  paymentPreviewRef: {
    fontSize: 12,
    color: orbiTheme.colors.textMuted,
    fontFamily: 'Inter_400Regular',
  },

  // Sync notice
  syncNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    justifyContent: 'center',
    paddingVertical: 8,
  },
  syncNoticeText: {
    fontSize: 12,
    color: orbiTheme.colors.textMuted,
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
  confirmCheck: {
    fontSize: 44,
    color: '#FFFFFF',
    fontWeight: '800',
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
    paddingBottom: 28,
    paddingTop: 12,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: orbiTheme.colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 },
    elevation: 12,
  },
  ctaBtn: {
    backgroundColor: orbiTheme.colors.text,
    borderRadius: 14,
    paddingVertical: 17,
    alignItems: 'center',
    ...orbiTheme.shadows.button,
  },
  ctaBtnDisabled: { opacity: 0.38 },
  ctaBtnPressed: { opacity: 0.85 },
  ctaBtnLabel: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
  },

  // Compat stubs (used in internal handlers only)
  confirmButtonDisabled: { opacity: 0.38 },
  bookingMap: { height: 180, borderRadius: 16, overflow: 'hidden' },
  paymentRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  paymentChip: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: orbiTheme.colors.backgroundAlt,
    borderWidth: 1,
    borderColor: orbiTheme.colors.border,
  },
  paymentChipActive: {
    backgroundColor: orbiTheme.colors.text,
    borderColor: orbiTheme.colors.text,
  },
  paymentChipLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: orbiTheme.colors.textSoft,
  },
  paymentChipLabelActive: { color: '#FFFFFF' },
  routeActionStack: { gap: 10 },
  inlineActions: { gap: 8 },
  inlineActionCard: { width: '100%' },

});
