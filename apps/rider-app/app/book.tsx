import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  calculateDistanceKm,
  burkinaPricingCityPresets,
  createCheckoutIntentWithApi,
  createRideRequestWithApi,
  createSavedPlaceWithApi,
  estimateDurationMinutes,
  fetchMyTrips,
  fetchRiderProfile,
  fetchRideOptionsPreview,
  roundDistanceKm,
  riderRideOptions,
  resolveBurkinaPricingPresetForPlace,
  resolveVoiceLocationIntentWithApi,
  toApiPaymentMethod,
  toApiServiceTier,
  toApiVehicleType,
  type MyTripsResponse,
  type PaymentMethod,
  type Place,
  type RiderProfileResponse,
  type RideOption,
  type VoiceLocationIntentResponse,
} from '@orbi/api';
import {
  describeRealtimeConnection,
  formatRealtimeBadgeLabel,
  formatXof,
  orbiTheme,
} from '@orbi/ui';
import { createOrbiApiClient } from '@orbi/api';
import {
  orbiRuntimeConfig,
  resolveOrbiApiBaseUrlForRuntime,
} from '@orbi/config';
import { restoreRiderSession } from '../lib/auth';
import { resolveRiderAppError } from '../lib/session-feedback';
import {
  FlowActionButton,
  InsightBadge,
  LiveStatusBanner,
  MetricTile,
  QuickActionCard,
  RouteSignalCard,
  SectionCard,
  SectionHeading,
  TransitionNoticeCard,
} from '../lib/realtime-widgets';
import { useRiderRealtimeStream } from '../lib/use-rider-realtime-stream';
import { RiderJourneySection } from '../lib/rider-journey';
import {
  buildRiderFlowTransitionLabel,
  resolveRiderActiveFlow,
} from '../lib/rider-active-flow';
import { useRiderPosition } from '../lib/use-rider-position';

const cityPresets = burkinaPricingCityPresets;

const fallbackRiderProfile: RiderProfileResponse = {
  profile: {
    id: 'fallback-rider',
    fullName: 'Awa Ouedraogo',
    email: 'rider@orbi.app',
    phoneNumber: null,
    preferredTier: 'MOTO_STANDARD',
    emergencyPhone: null,
    trustedContact: {
      phoneNumber: null,
      shareMode: 'DISABLED',
      status: 'MISSING',
      safetyNote: 'Ajoutez un numero Burkina pour accelerer le partage en cas de trajet sensible.',
    },
    savedPlaces: [
      {
        id: 'saved-home',
        label: 'Maison',
        address: 'Patte d Oie, Ouagadougou',
        latitude: 12.3412,
        longitude: -1.5601,
      },
      {
        id: 'saved-work',
        label: 'Bureau',
        address: 'Ouaga 2000, Ouagadougou',
        latitude: 12.3274,
        longitude: -1.5339,
      },
    ],
    stats: {
      totalRideRequests: 0,
      totalTrips: 0,
      completedTrips: 0,
      savedPlaces: 2,
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

function toIdempotencySegment(value: string | null | undefined) {
  return normalizePlaceText(value ?? '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'unknown';
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

function arePlacesEquivalent(left: Place, right: Place) {
  if (
    left.coordinates &&
    right.coordinates &&
    Math.abs(left.coordinates.latitude - right.coordinates.latitude) < 0.0001 &&
    Math.abs(left.coordinates.longitude - right.coordinates.longitude) < 0.0001
  ) {
    return true;
  }

  return normalizePlaceText(left.address) === normalizePlaceText(right.address);
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

function buildRideOptionVisual(option: RideOption) {
  const isMoto = option.category === 'motorcycle';

  return {
    categoryLabel: isMoto ? 'Moto' : 'Voiture',
    promiseLabel: isMoto ? 'Rapide en ville' : 'Confort protege',
    capacityLabel: isMoto
      ? option.tier === 'moto-plus'
        ? 'Casque premium'
        : 'Solo agile'
      : option.tier === 'car-xl'
        ? 'Groupe'
        : option.tier === 'car-comfort'
          ? 'Clim + confort'
          : '4 places',
    tone: isMoto ? 'teal' : option.tier === 'car-comfort' ? 'sky' : 'amber',
  } as const;
}

function VehicleOptionAvatar({
  category,
  isSelected,
  tone,
}: {
  category: RideOption['category'];
  isSelected: boolean;
  tone: 'teal' | 'sky' | 'amber';
}) {
  const isMoto = category === 'motorcycle';
  const accent =
    tone === 'teal'
      ? orbiTheme.colors.teal
      : tone === 'sky'
        ? orbiTheme.colors.sky
        : orbiTheme.colors.amber;

  return (
    <View
      style={[
        styles.vehicleAvatar,
        isSelected ? styles.vehicleAvatarSelected : null,
        { borderColor: isSelected ? accent : orbiTheme.colors.border },
      ]}
    >
      {isMoto ? (
        <View style={styles.motoDrawing}>
          <View style={[styles.motoHandle, { backgroundColor: accent }]} />
          <View style={[styles.motoSeat, { backgroundColor: accent }]} />
          <View style={styles.motoWheelRow}>
            <View style={[styles.vehicleWheel, { borderColor: accent }]} />
            <View style={[styles.vehicleWheel, { borderColor: accent }]} />
          </View>
        </View>
      ) : (
        <View style={styles.carDrawing}>
          <View style={[styles.carCabin, { borderBottomColor: accent }]} />
          <View style={[styles.carBody, { backgroundColor: accent }]} />
          <View style={styles.carWheelRow}>
            <View style={[styles.vehicleWheel, { borderColor: accent }]} />
            <View style={[styles.vehicleWheel, { borderColor: accent }]} />
          </View>
        </View>
      )}
    </View>
  );
}

export default function BookingScreen() {
  const router = useRouter();
  const [options, setOptions] = useState<RideOption[]>(riderRideOptions);
  const [history, setHistory] = useState<MyTripsResponse | null>(null);
  const [profile, setProfile] =
    useState<RiderProfileResponse>(fallbackRiderProfile);
  const [selectedOptionId, setSelectedOptionId] = useState<string>(
    riderRideOptions[0]?.id ?? '',
  );
  const [selectedPaymentMethod, setSelectedPaymentMethod] =
    useState<PaymentMethod>('mobile-money');
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
  const [voiceTranscript, setVoiceTranscript] = useState('Je vais a Ouaga 2000');
  const [voiceResult, setVoiceResult] = useState<VoiceLocationIntentResponse | null>(null);
  const [isResolvingVoice, setIsResolvingVoice] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isRealtimeSyncing, setIsRealtimeSyncing] = useState(false);
  const [bookingTransitionLabel, setBookingTransitionLabel] = useState<string | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [paymentPreview, setPaymentPreview] = useState<{
    provider: string;
    transactionRef: string;
    supportedNetworks: string[];
    channel: string;
  } | null>(null);
  const [autoAppliedRiderPosition, setAutoAppliedRiderPosition] = useState(false);
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
  const voiceResolvedPlaces = useMemo(
    () =>
      (voiceResult?.suggestions ?? []).map((item) => ({
        id: item.id,
        label: item.name,
        address: item.address,
        district: item.district,
        coordinates: {
          latitude: item.latitude,
          longitude: item.longitude,
        },
      })),
    [voiceResult],
  );

  useEffect(() => {
    void loadBookingContext();
  }, [pickupPlace, destinationPlace, selectedCityId]);

  useEffect(() => {
    if (autoAppliedRiderPosition || !riderPosition.latestPosition) {
      return;
    }

    if (!arePlacesEquivalent(pickupPlace, selectedCity.pickup)) {
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

  async function loadBookingContext() {
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
          paymentMethod: 'MOBILE_MONEY',
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
      setPaymentPreview(null);
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
        network: 'Mode local actif, impossible de joindre la session reelle.',
        fallback: 'Mode local actif, impossible de joindre la session reelle.',
      });

      if (feedback.shouldClearSessionToken) {
        setSessionToken(null);
      }

      setStatus(feedback.message);
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

  async function handleResolveVoiceIntent() {
    const client = createOrbiApiClient(resolveOrbiApiBaseUrlForRuntime(), {
      version: orbiRuntimeConfig.apiVersion,
    });

    setIsResolvingVoice(true);
    setStatus('Interpretation du lieu dicte...');

    if (!voiceTranscript.trim()) {
      setStatus('Dictez ou saisissez un lieu avant de lancer l analyse vocale.');
      setIsResolvingVoice(false);
      return;
    }

    try {
      const response = await resolveVoiceLocationIntentWithApi(client, {
        transcript: voiceTranscript.trim(),
      });
      setVoiceResult(response);
      setStatus(
        response.needsClarification
          ? 'Commande vocale comprise partiellement. Choisissez une suggestion.'
          : `Commande vocale interpretee pour ${response.intentType}.`,
      );
    } catch (error) {
      const feedback = await resolveRiderAppError(error, {
        surface: 'booking',
        fallback: 'La suggestion vocale du lieu est indisponible.',
      });

      if (feedback.shouldClearSessionToken) {
        setSessionToken(null);
      }

      setStatus(feedback.message);
    } finally {
      setIsResolvingVoice(false);
    }
  }

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
      await createSavedPlaceWithApi(authClient, {
        label: buildSavedPlaceLabel(target, place),
        address: place.address,
        latitude: place.coordinates.latitude,
        longitude: place.coordinates.longitude,
      });
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
  const { activeTrip, activeRequest, activeFlowState, hasOpenFlow, primaryStatusLabel } =
    flow;

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

  async function handleCreateRideRequest() {
    if (bookingMutationInFlightRef.current) {
      return;
    }

    if (!selectedOption) {
      return;
    }

    if (hasOpenFlow) {
      setStatus('Une demande ou une course est deja active. Finalisez-la d abord.');
      return;
    }

    if (arePlacesEquivalent(pickupPlace, destinationPlace)) {
      setStatus('Le depart et la destination doivent etre differents.');
      return;
    }

    bookingMutationInFlightRef.current = true;
    setIsSubmitting(true);
    setStatus(
      `Creation authentifiee de la demande ${selectedOption.title}...`,
    );

    try {
      const { authClient, me } = await restoreRiderSession();
      const bookingIdempotencyKey = [
        'ride-request',
        toIdempotencySegment(me.user.id ?? 'rider'),
        toIdempotencySegment(selectedCity.id),
        toIdempotencySegment(selectedOption.id),
        toIdempotencySegment(selectedPaymentMethod),
        toIdempotencySegment(pickupPlace.address),
        toIdempotencySegment(destinationPlace.address),
      ]
        .join('-')
        .slice(0, 128);
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
          requestedVehicleType: toApiVehicleType(selectedOption.category),
          requestedServiceTier: toApiServiceTier(selectedOption.tier),
          estimatedDistanceKm: tripEstimate.distanceKm,
          estimatedDurationMinutes: tripEstimate.durationMinutes,
          paymentMethod: toApiPaymentMethod(selectedPaymentMethod),
          pickupAreaType: selectedCity.zone,
          city: selectedCity.id,
          districtProfile: selectedCity.districtProfile,
          notes: `Flow authentifie depuis l'app rider pour ${me.user.fullName}, ville ${selectedCity.label}, profil ${selectedCity.districtProfile}, option ${selectedOption.title}, paiement ${selectedPaymentMethod}`,
        },
        {
          idempotencyKey: bookingIdempotencyKey,
        },
      );

      if (selectedPaymentMethod !== 'cash') {
        const paymentIntent = await createCheckoutIntentWithApi(authClient, {
          rideRequestId: createdRequest.id,
          channel:
            selectedPaymentMethod === 'wallet' ? 'WALLET' : 'MOBILE_MONEY',
          mobileMoneyNetwork:
            selectedPaymentMethod === 'mobile-money'
              ? 'ORANGE_MONEY'
              : undefined,
          customerPhoneNumber: me.user.phoneNumber ?? undefined,
          redirectUrl: orbiRuntimeConfig.paymentRedirectUrl,
        }, {
          idempotencyKey: `checkout-${createdRequest.id}-${selectedPaymentMethod}`,
        });

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

      await loadBookingContext();
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
    <ScrollView contentContainerStyle={styles.screen}>
      <Text style={styles.title}>Reserver un trajet</Text>
      <LiveStatusBanner
        label={formatRealtimeBadgeLabel('Booking live', isRealtimeSyncing)}
        message={status}
        secondaryMessage={
          isRealtimeSyncing
            ? 'Resynchronisation silencieuse en cours pour consolider reservation, paiement et historique.'
            : bookingTransitionLabel
              ? bookingTransitionLabel
              : 'Le flux croise tarification, historique, paiement et temps reel pour garder une reservation plus explicite.'
        }
        tone={isRealtimeSyncing || bookingTransitionLabel ? 'sky' : 'teal'}
      />
      <Pressable
        onPress={() => void loadBookingContext()}
        disabled={isRefreshing || isSubmitting}
        style={[
          styles.refreshButton,
          isRefreshing || isSubmitting ? styles.confirmButtonDisabled : null,
        ]}
      >
        <Text style={styles.refreshButtonLabel}>
          {isRefreshing ? 'Actualisation...' : 'Actualiser les options'}
        </Text>
      </Pressable>

      {bookingTransitionLabel ? (
        <TransitionNoticeCard
          label="Transition live"
          message={bookingTransitionLabel}
          tone="sky"
        />
      ) : null}

      <SectionCard tone="sky">
        <SectionHeading
          eyebrow="Vue rapide"
          title={`${pickupPlace.label} vers ${destinationPlace.label}`}
          description={`Trajet estime ${tripEstimate.distanceKm} km, ${tripEstimate.durationMinutes} min avec source ${
            tripEstimate.source === 'coordinates' ? 'coordonnees reelles' : 'preset local'
          }.`}
        />
        <View style={styles.insightRow}>
          <InsightBadge label="Ville" value={selectedCity.label} tone="sky" />
          <InsightBadge
            label="Paiement"
            value={selectedPaymentMethod}
            tone="teal"
          />
          <InsightBadge
            label="Etat"
            value={hasOpenFlow ? primaryStatusLabel : 'Pret'}
            tone={hasOpenFlow ? 'amber' : 'teal'}
          />
        </View>
        <View style={styles.heroMetrics}>
          <MetricTile
            label="Distance"
            value={`${tripEstimate.distanceKm} km`}
            helper={selectedCity.districtProfile.toLowerCase().replace(/_/g, ' ')}
          />
          <MetricTile
            label="Duree"
            value={`${tripEstimate.durationMinutes} min`}
            helper={`zone ${selectedCity.zone.toLowerCase().replace(/_/g, ' ')}`}
          />
          <MetricTile
            label="Services"
            value={String(options.length)}
            helper="options pricees disponibles"
          />
        </View>
      </SectionCard>

      <RiderJourneySection
        currentStep="book"
        description="La reservation reste connectee au meme tunnel passager que la connexion, la voix et le suivi live."
      />

      <View style={styles.paymentSection}>
        <Text style={styles.section}>Ville et contexte local</Text>
        <View style={styles.paymentRow}>
          {cityPresets.map((city) => {
            const isActive = city.id === selectedCityId;

            return (
              <Pressable
                key={city.id}
                onPress={() => handleSelectCity(city)}
                style={[
                  styles.paymentChip,
                  isActive ? styles.paymentChipActive : null,
                ]}
              >
                <Text
                  style={[
                    styles.paymentChipLabel,
                    isActive ? styles.paymentChipLabelActive : null,
                  ]}
                >
                  {city.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <RouteSignalCard
        eyebrow="Trajet en preparation"
        badgeLabel={hasOpenFlow ? 'Flux actif' : 'Pret a reserver'}
        badgeTone={hasOpenFlow ? 'amber' : 'teal'}
        title={`${pickupPlace.label} vers ${destinationPlace.label}`}
        description={`${pickupPlace.address} vers ${destinationPlace.address}`}
        insights={[
          {
            label: 'Distance',
            value: `${tripEstimate.distanceKm} km`,
            tone: 'sky',
          },
          {
            label: 'Duree',
            value: `${tripEstimate.durationMinutes} min`,
            tone: 'teal',
          },
          {
            label: 'Paiement',
            value: selectedPaymentMethod,
            tone: 'amber',
          },
        ]}
        detailLines={[
          `Depart: ${pickupPlace.address}`,
          `Destination: ${destinationPlace.address}`,
          riderPosition.latestPosition
            ? `Position passager: precision ${Math.round(riderPosition.latestPosition.accuracyMeters ?? 0)} m.`
            : riderPosition.positionNote,
          `Source du calcul: ${tripEstimate.source === 'coordinates' ? 'coordonnees reelles' : 'preset local'}.`,
          selectedOption
            ? `Selection: ${selectedOption.title}, ${formatXof(selectedOption.fare)}, paiement ${selectedPaymentMethod}, ville ${selectedCity.label}`
            : `Ville ${selectedCity.label}`,
        ]}
        note={
          hasOpenFlow
            ? 'Une demande ou une course est deja en cours. Finalisez-la depuis l historique avant de reserver a nouveau.'
            : null
        }
        noteTone="amber"
        isHighlighted={Boolean(bookingTransitionLabel)}
      >
        {hasOpenFlow ? (
          <QuickActionCard
            title="Suivre le flux actif"
            description={
              activeTrip
                ? `${activeTrip.pickupAddress} vers ${activeTrip.destinationAddress}`
                : activeRequest
                  ? `${activeRequest.pickupAddress} vers ${activeRequest.destinationAddress}`
                  : 'Ouvrir le suivi pour finaliser la demande en cours.'
            }
            tone="amber"
            emphasis="primary"
            onPress={() => router.push('/activity')}
            style={styles.inlineActionCard}
          />
        ) : (
          <View style={styles.routeActionStack}>
            <FlowActionButton
              onPress={() => handleUseCurrentPositionAsPickup()}
              disabled={isSubmitting || !riderPosition.latestPosition}
              label="Utiliser ma position"
              emphasis="secondary"
              style={isSubmitting || !riderPosition.latestPosition ? styles.confirmButtonDisabled : null}
            />
            <FlowActionButton
              onPress={() => void handleSaveCurrentPlace('pickup')}
              disabled={isSubmitting || !pickupPlace.coordinates}
              label="Enregistrer ce depart"
              emphasis="secondary"
              style={isSubmitting ? styles.confirmButtonDisabled : null}
            />
            <FlowActionButton
              onPress={() => void handleSaveCurrentPlace('destination')}
              disabled={isSubmitting || !destinationPlace.coordinates}
              label="Enregistrer cette destination"
              emphasis="secondary"
              style={isSubmitting ? styles.confirmButtonDisabled : null}
            />
          </View>
        )}
      </RouteSignalCard>

      <View style={styles.assuranceRow}>
        <View style={styles.assuranceCard}>
          <Text style={styles.assuranceTitle}>Contexte marche</Text>
          <Text style={styles.assuranceText}>
            Tarification locale pour {selectedCity.label}, profil{' '}
            {selectedCity.districtProfile.toLowerCase().replace(/_/g, ' ')}.
          </Text>
        </View>
        <View style={styles.assuranceCard}>
          <Text style={styles.assuranceTitle}>Paiement</Text>
          <Text style={styles.assuranceText}>
            Mobile Money agrege prioritaire, cash disponible en secours.
          </Text>
        </View>
        <View style={styles.assuranceCard}>
          <Text style={styles.assuranceTitle}>Securite</Text>
          <Text style={styles.assuranceText}>
            Code pickup, timeline et signalement incident actifs.
          </Text>
        </View>
      </View>

      <View style={styles.selectorCard}>
        <Text style={styles.section}>Lieux enregistres</Text>
        <Text style={styles.helperText}>
          Utilisez vos lieux favoris comme point de depart ou destination.
        </Text>
        <View style={styles.placeChipRow}>
          {savedPlaces.map((place) => (
            <RouteSignalCard
              key={place.id}
              eyebrow="Favori"
              title={place.label}
              description={place.address}
              detailLines={['Choisissez si ce lieu devient le depart ou la destination.']}
            >
              <View style={styles.inlineActions}>
                <QuickActionCard
                  title="Comme depart"
                  onPress={() => applyPlace('pickup', place)}
                  tone="sky"
                  style={styles.inlineActionCard}
                />
                <QuickActionCard
                  title="Comme destination"
                  onPress={() => applyPlace('destination', place)}
                  tone="teal"
                  style={styles.inlineActionCard}
                />
              </View>
            </RouteSignalCard>
          ))}
        </View>
      </View>

      <View style={styles.selectorCard}>
        <Text style={styles.section}>Suggestion vocale de lieu</Text>
        <TextInput
          value={voiceTranscript}
          onChangeText={setVoiceTranscript}
          placeholder="Ex: viens me chercher a l universite de Ouaga"
          placeholderTextColor={orbiTheme.colors.muted}
          style={styles.voiceInput}
        />
        <FlowActionButton
          onPress={() => void handleResolveVoiceIntent()}
          disabled={isResolvingVoice}
          label={isResolvingVoice ? 'Analyse...' : 'Analyser le lieu'}
          tone="teal"
          emphasis="primary"
          style={isResolvingVoice ? styles.confirmButtonDisabled : null}
        />
        {voiceResolvedPlaces.length ? (
          <View style={styles.placeChipRow}>
            {voiceResolvedPlaces.map((place) => (
              <RouteSignalCard
                key={`voice-${place.id}`}
                eyebrow="Suggestion vocale"
                title={place.label}
                description={place.address}
                detailLines={['Appliquez cette suggestion au depart ou a l arrivee.']}
              >
                <View style={styles.inlineActions}>
                  <QuickActionCard
                    title="Appliquer au depart"
                    onPress={() => applyPlace('pickup', place)}
                    tone="sky"
                    style={styles.inlineActionCard}
                  />
                  <QuickActionCard
                    title="Appliquer a l arrivee"
                    onPress={() => applyPlace('destination', place)}
                    tone="teal"
                    style={styles.inlineActionCard}
                  />
                </View>
              </RouteSignalCard>
            ))}
          </View>
        ) : null}
      </View>

      {paymentPreview ? (
        <RouteSignalCard
          eyebrow="Paiement initialise"
          badgeLabel={paymentPreview.channel}
          badgeTone="teal"
          title={paymentPreview.provider}
          description={`Reference ${paymentPreview.transactionRef}`}
          detailLines={
            paymentPreview.supportedNetworks.length
              ? [
                  `Reseaux supportes: ${paymentPreview.supportedNetworks.join(', ')}`,
                ]
              : undefined
          }
          note="Le paiement est prepare avant la progression du flux ride."
          noteTone="teal"
        />
      ) : null}

      <Text style={styles.section}>Choisissez votre service</Text>
      {options.map((option) => {
        const isSelected = option.id === selectedOption?.id;
        const visual = buildRideOptionVisual(option);

        return (
          <Pressable
            key={option.id}
            onPress={() => {
              setSelectedOptionId(option.id);
              setSelectedPaymentMethod(
                option.paymentMethods?.[0] ?? 'mobile-money',
              );
            }}
            style={[styles.option, isSelected ? styles.optionSelected : null]}
          >
            <View style={styles.optionHeader}>
              <VehicleOptionAvatar
                category={option.category}
                isSelected={isSelected}
                tone={visual.tone}
              />
              <View style={styles.optionCopy}>
                <View style={styles.optionTop}>
                  <View style={styles.optionTitleBlock}>
                    <Text style={styles.optionTitle}>{option.title}</Text>
                    <Text style={styles.optionCategory}>
                      {visual.categoryLabel} - {visual.promiseLabel}
                    </Text>
                  </View>
                  <View style={styles.optionPriceBlock}>
                    <Text style={styles.optionPrice}>
                      {formatXof(option.fare)}
                    </Text>
                    <Text style={styles.optionEta}>{option.etaMinutes} min</Text>
                  </View>
                </View>
                <View style={styles.optionChipRow}>
                  <Text style={styles.optionChip}>{visual.capacityLabel}</Text>
                  <Text style={styles.optionChip}>{option.badge}</Text>
                  <Text style={styles.optionChip}>{selectedPaymentMethod}</Text>
                </View>
              </View>
            </View>
            <Text style={styles.optionMeta}>
              Tarif upfront estime, service {visual.categoryLabel.toLowerCase()} compatible avec ce trajet.
            </Text>
            {option.fareBreakdown ? (
              <View style={styles.breakdownBlock}>
                <Text style={styles.breakdown}>
                  Base {formatXof(option.fareBreakdown.baseFare)} - Frais{' '}
                  {formatXof(option.fareBreakdown.bookingFee)} - Demande x
                  {option.fareBreakdown.demandMultiplier.toFixed(2)}
                </Text>
                {option.fareBreakdown.priceWindow ? (
                  <Text style={styles.breakdownHint}>
                    Fenetre estimee{' '}
                    {formatXof(option.fareBreakdown.priceWindow.min)} a{' '}
                    {formatXof(option.fareBreakdown.priceWindow.max)}
                  </Text>
                ) : null}
                {option.fareBreakdown.reasons?.[0] ? (
                  <Text style={styles.breakdownHint}>
                    {option.fareBreakdown.reasons[0]}
                  </Text>
                ) : null}
                {option.fareBreakdown.driverPickupDistancePolicy ? (
                  <Text style={styles.breakdownHint}>
                    {option.fareBreakdown.driverPickupDistancePolicy}
                  </Text>
                ) : option.fareBreakdown.reasons?.[1] ? (
                  <Text style={styles.breakdownHint}>
                    {option.fareBreakdown.reasons[1]}
                  </Text>
                ) : null}
              </View>
            ) : null}
            {option.safetyNote ? (
              <Text style={styles.safety}>{option.safetyNote}</Text>
            ) : null}
          </Pressable>
        );
      })}

      {selectedOption?.paymentMethods?.length ? (
        <View style={styles.paymentSection}>
          <Text style={styles.section}>Choisissez votre paiement</Text>
          <View style={styles.paymentRow}>
            {selectedOption.paymentMethods.map((method) => {
              const isActive = method === selectedPaymentMethod;

              return (
                <Pressable
                  key={method}
                  onPress={() => setSelectedPaymentMethod(method)}
                  style={[
                    styles.paymentChip,
                    isActive ? styles.paymentChipActive : null,
                  ]}
                >
                  <Text
                    style={[
                      styles.paymentChipLabel,
                      isActive ? styles.paymentChipLabelActive : null,
                    ]}
                  >
                    {method}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      <FlowActionButton
        disabled={isSubmitting || hasOpenFlow || !selectedOption}
        onPress={handleCreateRideRequest}
        label={
          isSubmitting
            ? 'Creation de la demande...'
            : hasOpenFlow
              ? 'Demande deja en cours'
              : selectedOption
                ? `Confirmer ${selectedOption.title}`
                : 'Choisir un service'
        }
        tone="teal"
        emphasis="primary"
        style={
          isSubmitting || hasOpenFlow || !selectedOption
            ? styles.confirmButtonDisabled
            : null
        }
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingTop: 88,
    paddingHorizontal: 24,
    paddingBottom: 40,
    backgroundColor: orbiTheme.colors.background,
    gap: 16,
  },
  title: {
    color: orbiTheme.colors.text,
    fontSize: 32,
    fontWeight: '800',
  },
  subtitle: {
    color: orbiTheme.colors.muted,
  },
  refreshButton: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: orbiTheme.colors.backgroundAlt,
    borderWidth: 1,
    borderColor: orbiTheme.colors.border,
  },
  refreshButtonLabel: {
    color: orbiTheme.colors.text,
    fontWeight: '700',
    fontSize: 13,
  },
  routeActionStack: {
    gap: 10,
  },
  routeCard: {
    backgroundColor: orbiTheme.colors.panel,
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: orbiTheme.colors.border,
    gap: 6,
  },
  routeCardHighlight: {
    borderColor: 'rgba(56, 189, 248, 0.42)',
    backgroundColor: 'rgba(56, 189, 248, 0.08)',
  },
  label: {
    color: orbiTheme.colors.teal,
    textTransform: 'uppercase',
    fontSize: 12,
  },
  value: {
    color: orbiTheme.colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  routeMeta: {
    color: orbiTheme.colors.muted,
    lineHeight: 18,
  },
  savePlaceButton: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: orbiTheme.colors.backgroundAlt,
    borderWidth: 1,
    borderColor: orbiTheme.colors.border,
    marginTop: 2,
  },
  savePlaceButtonLabel: {
    color: orbiTheme.colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  selectionSummary: {
    color: orbiTheme.colors.text,
    marginTop: 8,
    fontWeight: '600',
  },
  warning: {
    color: orbiTheme.colors.amber,
    marginTop: 8,
    lineHeight: 18,
  },
  transitionMeta: {
    color: orbiTheme.colors.sky,
    marginTop: 6,
    lineHeight: 18,
    fontWeight: '700',
  },
  section: {
    color: orbiTheme.colors.text,
    fontSize: 20,
    fontWeight: '700',
  },
  assuranceRow: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
  },
  assuranceCard: {
    flexGrow: 1,
    minWidth: 150,
    backgroundColor: orbiTheme.colors.backgroundAlt,
    borderWidth: 1,
    borderColor: orbiTheme.colors.border,
    borderRadius: 20,
    padding: 16,
    gap: 6,
  },
  selectorCard: {
    backgroundColor: orbiTheme.colors.panel,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: orbiTheme.colors.border,
    padding: 18,
    gap: 12,
  },
  insightRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  heroMetrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  helperText: {
    color: orbiTheme.colors.muted,
    lineHeight: 18,
  },
  placeChipRow: {
    gap: 10,
  },
  placeChoiceCard: {
    backgroundColor: orbiTheme.colors.backgroundAlt,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: orbiTheme.colors.border,
    padding: 14,
    gap: 6,
  },
  placeChoiceLabel: {
    color: orbiTheme.colors.text,
    fontWeight: '700',
    fontSize: 15,
  },
  placeChoiceMeta: {
    color: orbiTheme.colors.muted,
    lineHeight: 18,
  },
  inlineActions: {
    gap: 8,
    marginTop: 4,
  },
  inlineActionCard: {
    width: '100%',
  },
  inlineChip: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: orbiTheme.colors.border,
    backgroundColor: orbiTheme.colors.panel,
  },
  inlineChipLabel: {
    color: orbiTheme.colors.text,
    fontWeight: '700',
    fontSize: 12,
  },
  voiceInput: {
    backgroundColor: orbiTheme.colors.backgroundAlt,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: orbiTheme.colors.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: orbiTheme.colors.text,
    fontSize: 15,
  },
  voiceAction: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: orbiTheme.colors.teal,
  },
  voiceActionLabel: {
    color: '#052a28',
    fontWeight: '800',
  },
  assuranceTitle: {
    color: orbiTheme.colors.text,
    fontWeight: '800',
    fontSize: 15,
  },
  assuranceText: {
    color: orbiTheme.colors.muted,
    lineHeight: 18,
    fontSize: 13,
  },
  paymentPreviewCard: {
    backgroundColor: orbiTheme.colors.panel,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: orbiTheme.colors.border,
    gap: 6,
  },
  paymentPreviewTitle: {
    color: orbiTheme.colors.text,
    fontWeight: '800',
    fontSize: 16,
  },
  paymentPreviewText: {
    color: orbiTheme.colors.text,
    fontSize: 13,
  },
  paymentPreviewHint: {
    color: orbiTheme.colors.teal,
    fontSize: 12,
    lineHeight: 18,
  },
  option: {
    backgroundColor: orbiTheme.colors.backgroundAlt,
    borderWidth: 1,
    borderColor: orbiTheme.colors.border,
    borderRadius: 20,
    padding: 16,
    gap: 10,
  },
  optionSelected: {
    borderColor: orbiTheme.colors.teal,
    backgroundColor: orbiTheme.colors.panel,
  },
  optionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  optionCopy: {
    flex: 1,
    gap: 10,
  },
  optionTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  optionTitleBlock: {
    flex: 1,
    gap: 3,
  },
  optionTitle: {
    color: orbiTheme.colors.text,
    fontWeight: '800',
    fontSize: 18,
  },
  optionCategory: {
    color: orbiTheme.colors.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  optionPriceBlock: {
    alignItems: 'flex-end',
    gap: 2,
  },
  optionPrice: {
    color: orbiTheme.colors.text,
    fontWeight: '900',
    fontSize: 17,
  },
  optionEta: {
    color: orbiTheme.colors.sky,
    fontWeight: '800',
    fontSize: 12,
  },
  optionChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionChip: {
    overflow: 'hidden',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: orbiTheme.colors.border,
    backgroundColor: orbiTheme.colors.panel,
    color: orbiTheme.colors.text,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  vehicleAvatar: {
    width: 72,
    height: 72,
    borderRadius: 20,
    borderWidth: 1,
    backgroundColor: orbiTheme.colors.panel,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vehicleAvatarSelected: {
    backgroundColor: 'rgba(45, 212, 191, 0.1)',
  },
  motoDrawing: {
    width: 54,
    height: 38,
    justifyContent: 'flex-end',
  },
  motoHandle: {
    width: 18,
    height: 4,
    borderRadius: 999,
    alignSelf: 'flex-end',
    transform: [{ rotate: '-18deg' }],
  },
  motoSeat: {
    width: 31,
    height: 8,
    borderRadius: 999,
    marginLeft: 10,
    marginBottom: 5,
  },
  motoWheelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  carDrawing: {
    width: 56,
    height: 38,
    justifyContent: 'flex-end',
  },
  carCabin: {
    width: 30,
    alignSelf: 'center',
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderBottomWidth: 12,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  carBody: {
    width: 52,
    height: 15,
    borderRadius: 8,
    alignSelf: 'center',
    marginTop: -1,
  },
  carWheelRow: {
    width: 46,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignSelf: 'center',
    marginTop: -5,
  },
  vehicleWheel: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 3,
    backgroundColor: orbiTheme.colors.background,
  },
  badge: {
    fontWeight: '800',
    fontSize: 12,
    textTransform: 'uppercase',
  },
  optionMeta: {
    color: orbiTheme.colors.muted,
  },
  breakdownBlock: {
    gap: 4,
  },
  breakdown: {
    color: orbiTheme.colors.text,
    fontSize: 13,
  },
  breakdownHint: {
    color: orbiTheme.colors.muted,
    fontSize: 12,
    lineHeight: 17,
  },
  safety: {
    color: orbiTheme.colors.teal,
    fontSize: 13,
    lineHeight: 18,
  },
  paymentSection: {
    gap: 12,
  },
  paymentRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  paymentChip: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: orbiTheme.colors.backgroundAlt,
    borderWidth: 1,
    borderColor: orbiTheme.colors.border,
  },
  paymentChipActive: {
    backgroundColor: orbiTheme.colors.teal,
    borderColor: orbiTheme.colors.teal,
  },
  paymentChipLabel: {
    color: orbiTheme.colors.text,
    fontWeight: '700',
    fontSize: 13,
  },
  paymentChipLabelActive: {
    color: '#052a28',
  },
  confirmButton: {
    backgroundColor: orbiTheme.colors.teal,
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  confirmButtonDisabled: {
    opacity: 0.7,
  },
  confirmLabel: {
    color: '#052a28',
    fontWeight: '800',
    fontSize: 16,
    textAlign: 'center',
  },
});
