import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
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
  fetchRiderProfile,
  type MyTripsResponse,
  type RiderProfileResponse,
} from '@orbi/api';
import { resolveOrbiApiBaseUrlForRuntime } from '@orbi/config';
import { type OrbiTheme } from '@orbi/ui';
import { OfflineBanner, safeHaptics, useOrbiTheme } from '@orbi/ui/native';
import { restoreRiderSession } from '../../lib/auth';
import {
  buildRiderFlowTransitionLabel,
  resolveRiderActiveFlow,
} from '../../lib/rider-active-flow';
import { formatRiderMoneyAmount } from '../../lib/rider-display-format';
import { normalizeRiderTripsResponse } from '../../lib/rider-trips-normalizer';
import { resolveRiderAppError } from '../../lib/session-feedback';
import { HomeMapView } from '../../lib/home-map-view';
import { useLiveRefresh } from '../../lib/use-live-refresh';
import { useRiderPosition } from '../../lib/use-rider-position';
import { useRiderRealtimeStream } from '../../lib/use-rider-realtime-stream';

type HomeAlert = {
  tone: 'info' | 'warning';
  message: string;
  actionLabel?: string;
};

type QuickPlace = {
  id: string;
  label: string;
  address: string;
  helper: string;
};

export default function RiderHomeScreen() {
  const router = useRouter();
  const theme = useOrbiTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [history, setHistory] = useState<MyTripsResponse | null>(null);
  const [profile, setProfile] = useState<RiderProfileResponse['profile'] | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(false);
  const [alert, setAlert] = useState<HomeAlert | null>(null);
  const [isShareBusy, setIsShareBusy] = useState(false);
  const previousFlowStateRef = useRef<string | null>(null);

  const flow = resolveRiderActiveFlow(history);
  const riderPosition = useRiderPosition({
    enabled: true,
    activeTripId: flow.activeTrip?.id ?? null,
  });
  const positionCopy = resolvePositionCopy(riderPosition);
  const favoritePlaces = useMemo(() => buildFavoritePlaces(profile), [profile]);
  const recentPlaces = useMemo(() => buildRecentPlaces(history), [history]);
  const hasRecentPlaces = recentPlaces.length > 0;

  const openBooking = useCallback(
    (place?: QuickPlace) => {
      safeHaptics.impact('light');

      if (place) {
        router.push({
          pathname: '/book',
          params: {
            prefillDest: place.address,
          },
        });
        return;
      }

      router.push('/book');
    },
    [router],
  );

  const openActivity = useCallback(() => {
    router.push('/activity');
  }, [router]);

  const loadHome = useCallback(async (silent = false) => {
    if (!silent) {
      setIsLoading(true);
    }

    try {
      const { authClient, session } = await restoreRiderSession();
      setSessionToken(session.sessionToken);
      const [tripsResponse, profileResponse] = await Promise.all([
        fetchMyTrips(authClient),
        fetchRiderProfile(authClient),
      ]);
      const normalizedHistory = normalizeRiderTripsResponse(tripsResponse);
      setHistory(normalizedHistory);
      setProfile(profileResponse.profile);
      setIsOffline(false);

      const nextFlow = resolveRiderActiveFlow(normalizedHistory);
      const transition = buildRiderFlowTransitionLabel(
        previousFlowStateRef.current,
        nextFlow.activeFlowState,
        'home',
      );
      previousFlowStateRef.current = nextFlow.activeFlowState;
      setAlert(transition ? { tone: 'info', message: transition } : null);
    } catch (error) {
      const feedback = await resolveRiderAppError(error, {
        surface: 'profile',
        fallback: "L'accueil n'a pas pu etre actualise.",
      });
      const networkIssue = feedback.code === 'MOB-NETWORK-OFFLINE';

      if (feedback.shouldClearSessionToken) {
        setSessionToken(null);
      }

      setIsOffline(networkIssue);
      setAlert({
        tone: 'warning',
        message: networkIssue
          ? 'Connexion absente. Vous pouvez choisir une destination, Orbi reprendra ensuite.'
          : feedback.message,
        actionLabel: feedback.actionLabel,
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHome();
  }, [loadHome]);

  useLiveRefresh(() => loadHome(true), 30_000);

  useRiderRealtimeStream(
    sessionToken,
    () => void loadHome(true),
    {
      onHeartbeat: () => undefined,
      onOpen: () => undefined,
      onError: () => undefined,
    },
  );

  async function shareActiveTrip() {
    if (!flow.activeTrip || isShareBusy) {
      return;
    }

    setIsShareBusy(true);
    try {
      const { authClient } = await restoreRiderSession();
      const response = await createTripShareLinkWithApi(authClient, flow.activeTrip.id);
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
        fallback: "Le partage du trajet n'a pas pu etre prepare.",
      });
      Alert.alert('Partage indisponible', feedback.message);
    } finally {
      setIsShareBusy(false);
    }
  }

  return (
    <View style={styles.root}>
      <HomeMapView
        riderLat={riderPosition.latestPosition?.latitude}
        riderLng={riderPosition.latestPosition?.longitude}
        style={styles.map}
        showNearbyDrivers={false}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}
      >
        <SafeAreaView style={styles.safe}>
          {isOffline ? <OfflineBanner /> : null}

          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.content}
          >
            <View style={styles.locationPanel}>
              <Text style={styles.eyebrow}>Position actuelle</Text>
              <Text style={styles.locationTitle}>{positionCopy.title}</Text>
              <Text style={styles.locationText}>{positionCopy.helper}</Text>
            </View>

            {alert ? (
              <View
                style={[
                  styles.alert,
                  alert.tone === 'warning' ? styles.alertWarning : styles.alertInfo,
                ]}
              >
                <Text style={styles.alertText}>{alert.message}</Text>
                {alert.actionLabel ? (
                  <Text style={styles.alertAction}>{alert.actionLabel}</Text>
                ) : null}
              </View>
            ) : null}

            {flow.hasOpenFlow ? (
              <ActiveFlowPanel
                flow={flow}
                isShareBusy={isShareBusy}
                onOpen={openActivity}
                onShare={() => void shareActiveTrip()}
              />
            ) : null}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Choisir une destination"
              onPress={() => openBooking()}
              style={({ pressed }) => [
                styles.destinationButton,
                pressed ? styles.pressed : null,
              ]}
            >
              <View style={styles.destinationIcon}>
                <View style={styles.destinationDot} />
              </View>
              <View style={styles.destinationCopy}>
                <Text style={styles.destinationLabel}>Où allez-vous ?</Text>
                <Text style={styles.destinationHelper}>
                  Saisissez une adresse ou choisissez un lieu.
                </Text>
              </View>
              <Text style={styles.destinationArrow}>›</Text>
            </Pressable>

            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Lieux rapides</Text>
              </View>
              <View style={styles.placeGrid}>
                {favoritePlaces.map((place) => (
                  <PlaceButton
                    key={place.id}
                    place={place}
                    onPress={() => {
                      if (place.address) {
                        openBooking(place);
                        return;
                      }

                      router.push('/account');
                    }}
                  />
                ))}
              </View>
            </View>

            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Destinations récentes</Text>
              </View>
              {hasRecentPlaces ? (
                <View style={styles.recentList}>
                  {recentPlaces.map((place) => (
                    <RecentPlaceRow
                      key={place.id}
                      place={place}
                      onPress={() => openBooking(place)}
                    />
                  ))}
                </View>
              ) : (
                <View style={styles.emptyRecent}>
                  <Text style={styles.emptyRecentTitle}>Aucune destination récente</Text>
                  <Text style={styles.emptyRecentText}>
                    Vos prochains trajets apparaitront ici.
                  </Text>
                </View>
              )}
            </View>

            {isLoading ? (
              <Text style={styles.loadingText}>Mise à jour de l’accueil...</Text>
            ) : null}
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </View>
  );
}

function ActiveFlowPanel({
  flow,
  isShareBusy,
  onOpen,
  onShare,
}: {
  flow: ReturnType<typeof resolveRiderActiveFlow>;
  isShareBusy: boolean;
  onOpen: () => void;
  onShare: () => void;
}) {
  const theme = useOrbiTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const active = flow.activeTrip ?? flow.activeRequest;
  const fare =
    flow.activeTrip
      ? formatRiderMoneyAmount(flow.activeTrip.amount)
      : flow.activeRequest
        ? formatRiderMoneyAmount(flow.activeRequest.estimatedFare)
        : null;

  if (!active) {
    return null;
  }

  return (
    <View style={styles.activePanel}>
      <View style={styles.activeHeader}>
        <View style={styles.activeDot} />
        <Text style={styles.activeTitle}>
          {flow.activeTrip ? 'Trajet actif' : 'Recherche chauffeur'}
        </Text>
      </View>
      <Text style={styles.activeRoute} numberOfLines={2}>
        {active.pickupAddress} vers {active.destinationAddress}
      </Text>
      {fare ? <Text style={styles.activeFare}>{fare}</Text> : null}
      <View style={styles.activeActions}>
        <Pressable
          accessibilityRole="button"
          onPress={onOpen}
          style={({ pressed }) => [
            styles.primaryAction,
            pressed ? styles.pressed : null,
          ]}
        >
          <Text style={styles.primaryActionText}>Reprendre</Text>
        </Pressable>
        {flow.activeTrip ? (
          <Pressable
            accessibilityRole="button"
            disabled={isShareBusy}
            onPress={onShare}
            style={({ pressed }) => [
              styles.secondaryAction,
              pressed ? styles.pressed : null,
              isShareBusy ? styles.disabled : null,
            ]}
          >
            <Text style={styles.secondaryActionText}>
              {isShareBusy ? 'Préparation...' : 'Partager'}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function PlaceButton({
  place,
  onPress,
}: {
  place: QuickPlace;
  onPress: () => void;
}) {
  const theme = useOrbiTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.placeButton, pressed ? styles.pressed : null]}
    >
      <Text style={styles.placeLabel}>{place.label}</Text>
      <Text style={styles.placeAddress} numberOfLines={1}>
        {place.helper}
      </Text>
    </Pressable>
  );
}

function RecentPlaceRow({
  place,
  onPress,
}: {
  place: QuickPlace;
  onPress: () => void;
}) {
  const theme = useOrbiTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.recentRow, pressed ? styles.pressed : null]}
    >
      <View style={styles.recentPin} />
      <View style={styles.recentCopy}>
        <Text style={styles.recentLabel} numberOfLines={1}>
          {place.label}
        </Text>
        <Text style={styles.recentAddress} numberOfLines={1}>
          {place.address}
        </Text>
      </View>
    </Pressable>
  );
}

function resolvePositionCopy(position: ReturnType<typeof useRiderPosition>) {
  if (position.positionStatus === 'requesting-permission') {
    return {
      title: 'Recherche de votre position',
      helper: 'Autorisez la localisation pour un départ plus précis.',
    };
  }

  if (position.positionStatus === 'syncing') {
    return {
      title: 'Position en cours',
      helper: 'Orbi ajuste le point de départ.',
    };
  }

  if (position.positionStatus === 'permission-denied') {
    return {
      title: 'Localisation non autorisée',
      helper: 'Vous pouvez saisir votre point de départ manuellement.',
    };
  }

  if (position.positionStatus === 'unavailable') {
    return {
      title: 'GPS indisponible',
      helper: 'Activez la localisation ou saisissez votre adresse.',
    };
  }

  if (position.positionStatus === 'error') {
    return {
      title: 'Position non confirmée',
      helper: 'Vous pouvez continuer avec une adresse saisie.',
    };
  }

  if (position.latestPosition) {
    const accuracy = position.latestPosition.accuracyMeters;
    if (typeof accuracy === 'number' && accuracy > 80) {
      return {
        title: 'Adresse approximative',
        helper: 'Vérifiez le point de départ avant de confirmer.',
      };
    }

    return {
      title: 'Autour de votre position',
      helper: 'Votre départ peut être ajusté à l’étape suivante.',
    };
  }

  return {
    title: 'Position non confirmée',
    helper: 'Choisissez une destination, puis vérifiez le départ.',
  };
}

function buildFavoritePlaces(profile: RiderProfileResponse['profile'] | null): QuickPlace[] {
  const savedPlaces = profile?.savedPlaces ?? [];
  const home = findSavedPlace(savedPlaces, ['maison', 'domicile', 'home']);
  const work = findSavedPlace(savedPlaces, ['travail', 'bureau', 'work']);

  return [
    home
      ? toQuickPlace(home, 'Domicile', 'Lieu enregistré')
      : {
          id: 'home-missing',
          label: 'Domicile',
          address: '',
          helper: 'À ajouter dans le compte',
        },
    work
      ? toQuickPlace(work, 'Travail', 'Lieu enregistré')
      : {
          id: 'work-missing',
          label: 'Travail',
          address: '',
          helper: 'À ajouter dans le compte',
        },
  ];
}

function buildRecentPlaces(history: MyTripsResponse | null): QuickPlace[] {
  const seen = new Set<string>();
  const trips = normalizeRiderTripsResponse(history).recentTrips;
  const places: QuickPlace[] = [];

  for (const trip of trips) {
    const address = typeof trip.destinationAddress === 'string'
      ? trip.destinationAddress.trim()
      : '';

    if (!address || seen.has(address.toLowerCase())) {
      continue;
    }

    seen.add(address.toLowerCase());
    places.push({
      id: `recent-${trip.id}`,
      label: compactPlaceLabel(address),
      address,
      helper: 'Destination récente',
    });

    if (places.length >= 3) {
      break;
    }
  }

  return places;
}

function findSavedPlace(
  places: RiderProfileResponse['profile']['savedPlaces'],
  labels: string[],
) {
  return places.find((place) => {
    const haystack = `${place.label} ${place.address}`.toLowerCase();
    return labels.some((label) => haystack.includes(label));
  });
}

function toQuickPlace(
  place: RiderProfileResponse['profile']['savedPlaces'][number],
  label: string,
  helper: string,
): QuickPlace {
  return {
    id: place.id,
    label,
    address: place.address,
    helper,
  };
}

function compactPlaceLabel(address: string) {
  return address.split(',')[0]?.trim() || address;
}

const makeStyles = (theme: OrbiTheme) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: theme.colors.riderBackground,
    },
    map: {
      ...StyleSheet.absoluteFillObject,
    },
    overlay: {
      flex: 1,
    },
    safe: {
      flex: 1,
    },
    content: {
      flexGrow: 1,
      justifyContent: 'flex-end',
      gap: 10,
      paddingHorizontal: 14,
      paddingTop: 12,
      paddingBottom: 18,
    },
    locationPanel: {
      alignSelf: 'flex-start',
      maxWidth: '88%',
      borderRadius: 8,
      backgroundColor: '#FFFFFF',
      borderWidth: 1,
      borderColor: theme.colors.borderSoft,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    eyebrow: {
      color: theme.colors.textMuted,
      fontSize: 11,
      fontWeight: '800',
      textTransform: 'uppercase',
    },
    locationTitle: {
      marginTop: 2,
      color: theme.colors.text,
      fontSize: 16,
      fontWeight: '800',
    },
    locationText: {
      marginTop: 2,
      color: theme.colors.textMuted,
      fontSize: 12,
      lineHeight: 17,
    },
    alert: {
      borderRadius: 8,
      borderWidth: 1,
      paddingHorizontal: 12,
      paddingVertical: 10,
      backgroundColor: '#FFFFFF',
    },
    alertInfo: {
      borderColor: theme.colors.borderSoft,
    },
    alertWarning: {
      borderColor: theme.colors.warning,
    },
    alertText: {
      color: theme.colors.text,
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '600',
    },
    alertAction: {
      marginTop: 4,
      color: theme.colors.text,
      fontSize: 12,
      fontWeight: '800',
    },
    activePanel: {
      gap: 10,
      borderRadius: 8,
      backgroundColor: '#FFFFFF',
      borderWidth: 1,
      borderColor: theme.colors.borderSoft,
      padding: 14,
    },
    activeHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    activeDot: {
      width: 9,
      height: 9,
      borderRadius: 5,
      backgroundColor: theme.colors.teal,
    },
    activeTitle: {
      color: theme.colors.text,
      fontSize: 15,
      fontWeight: '800',
    },
    activeRoute: {
      color: theme.colors.textMuted,
      fontSize: 13,
      lineHeight: 18,
    },
    activeFare: {
      color: theme.colors.text,
      fontSize: 13,
      fontWeight: '800',
    },
    activeActions: {
      flexDirection: 'row',
      gap: 8,
    },
    primaryAction: {
      flex: 1,
      minHeight: 44,
      borderRadius: 8,
      backgroundColor: '#111111',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 12,
    },
    primaryActionText: {
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: '800',
    },
    secondaryAction: {
      minHeight: 44,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: '#111111',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 14,
    },
    secondaryActionText: {
      color: '#111111',
      fontSize: 13,
      fontWeight: '800',
    },
    destinationButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      minHeight: 66,
      borderRadius: 8,
      backgroundColor: '#FFFFFF',
      borderWidth: 1,
      borderColor: theme.colors.borderSoft,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    destinationIcon: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: '#111111',
      alignItems: 'center',
      justifyContent: 'center',
    },
    destinationDot: {
      width: 9,
      height: 9,
      borderRadius: 5,
      backgroundColor: '#FFFFFF',
    },
    destinationCopy: {
      flex: 1,
      minWidth: 0,
    },
    destinationLabel: {
      color: theme.colors.text,
      fontSize: 18,
      fontWeight: '900',
    },
    destinationHelper: {
      marginTop: 2,
      color: theme.colors.textMuted,
      fontSize: 12,
    },
    destinationArrow: {
      color: theme.colors.text,
      fontSize: 28,
      fontWeight: '300',
    },
    section: {
      borderRadius: 8,
      backgroundColor: '#FFFFFF',
      borderWidth: 1,
      borderColor: theme.colors.borderSoft,
      padding: 12,
      gap: 10,
    },
    sectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    sectionTitle: {
      color: theme.colors.text,
      fontSize: 14,
      fontWeight: '900',
    },
    placeGrid: {
      flexDirection: 'row',
      gap: 8,
    },
    placeButton: {
      flex: 1,
      minHeight: 58,
      borderRadius: 8,
      backgroundColor: '#F7F7F7',
      borderWidth: 1,
      borderColor: '#ECECEC',
      paddingHorizontal: 12,
      paddingVertical: 10,
      justifyContent: 'center',
    },
    placeLabel: {
      color: theme.colors.text,
      fontSize: 14,
      fontWeight: '900',
    },
    placeAddress: {
      marginTop: 3,
      color: theme.colors.textMuted,
      fontSize: 11,
      fontWeight: '600',
    },
    recentList: {
      gap: 2,
    },
    recentRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      minHeight: 48,
      paddingVertical: 7,
      borderBottomWidth: 1,
      borderBottomColor: '#EFEFEF',
    },
    recentPin: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: '#111111',
    },
    recentCopy: {
      flex: 1,
      minWidth: 0,
    },
    recentLabel: {
      color: theme.colors.text,
      fontSize: 13,
      fontWeight: '800',
    },
    recentAddress: {
      color: theme.colors.textMuted,
      fontSize: 11,
      marginTop: 2,
    },
    emptyRecent: {
      borderRadius: 8,
      backgroundColor: '#F7F7F7',
      padding: 12,
    },
    emptyRecentTitle: {
      color: theme.colors.text,
      fontSize: 13,
      fontWeight: '800',
    },
    emptyRecentText: {
      marginTop: 3,
      color: theme.colors.textMuted,
      fontSize: 12,
    },
    loadingText: {
      alignSelf: 'center',
      color: theme.colors.textMuted,
      fontSize: 12,
      fontWeight: '600',
      paddingBottom: 2,
    },
    pressed: {
      opacity: 0.84,
      transform: [{ scale: 0.99 }],
    },
    disabled: {
      opacity: 0.5,
    },
  });
