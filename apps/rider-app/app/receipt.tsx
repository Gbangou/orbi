import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  preventScreenCaptureAsync,
  allowScreenCaptureAsync,
} from 'expo-screen-capture';
import {
  fetchTripDetail,
  type TripDetailResponse,
} from '@orbi/api';
import { formatXof, orbiTheme } from '@orbi/ui';
import { restoreRiderSession } from '../lib/auth';
import { resolveRiderAppError } from '../lib/session-feedback';

function ReceiptRow({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <View style={styles.receiptRow}>
      <Text style={styles.receiptRowLabel}>{label}</Text>
      <Text style={[styles.receiptRowValue, accent ? styles.receiptRowValueAccent : null]}>
        {value}
      </Text>
    </View>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

export default function ReceiptScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tripId: string }>();
  const tripId = params.tripId ?? '';

  const [detail, setDetail] = useState<TripDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    void preventScreenCaptureAsync();
    return () => {
      void allowScreenCaptureAsync();
    };
  }, []);

  useEffect(() => {
    if (!tripId) {
      setErrorMessage('Identifiant de course manquant.');
      setLoading(false);
      return;
    }

    let isMounted = true;

    async function load() {
      try {
        const { authClient } = await restoreRiderSession();
        const response = await fetchTripDetail(authClient, tripId);
        if (isMounted) {
          setDetail(response);
        }
      } catch (error) {
        if (!isMounted) return;
        const feedback = await resolveRiderAppError(error, {
          fallback: 'Le recu de course est temporairement indisponible.',
        });
        setErrorMessage(feedback.message);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      isMounted = false;
    };
  }, [tripId]);

  async function handleShare() {
    if (!detail) return;

    try {
      const trip = detail.trip;
      const shareText = [
        'Mon trajet Orbi',
        `De: ${trip.pickupAddress}`,
        `Vers: ${trip.destinationAddress}`,
        `Montant: ${formatXof(trip.actualFare)}`,
        `Chauffeur: ${trip.driverName}`,
        `Vehicule: ${trip.vehicleLabel}`,
      ].join('\n');

      await Share.share({ message: shareText });
    } catch {
      // Share cancelled or failed silently
    }
  }

  function handleRate() {
    if (!detail) return;
    const trip = detail.trip;
    router.replace({
      pathname: '/rating',
      params: {
        tripId: trip.id,
        driverName: trip.driverName,
        fare: String(trip.actualFare),
        destination: trip.destinationAddress,
      },
    });
  }

  function handleHome() {
    router.replace('/home');
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <View style={styles.loadingCard}>
          <Text style={styles.loadingEyebrow}>Orbi Passager</Text>
          <Text style={styles.loadingTitle}>Chargement du recu...</Text>
          <Text style={styles.loadingBody}>Recuperation des details de votre trajet.</Text>
        </View>
      </View>
    );
  }

  if (errorMessage || !detail) {
    return (
      <ScrollView contentContainerStyle={styles.screen}>
        <Text style={styles.eyebrow}>Orbi Passager</Text>
        <Text style={styles.title}>Recu de course</Text>
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{errorMessage ?? 'Recu indisponible.'}</Text>
        </View>
        <Pressable onPress={handleHome} style={styles.primaryButton}>
          <Text style={styles.primaryButtonLabel}>Retour a l accueil</Text>
        </Pressable>
      </ScrollView>
    );
  }

  const trip = detail.trip;
  const completedAt = trip.completedAt
    ? new Date(trip.completedAt).toLocaleString('fr-BF', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  const distanceToDestinationKm =
    trip.routeMonitoring.latestPosition?.distanceToDestinationKm;
  const distanceLabel =
    typeof distanceToDestinationKm === 'number' && distanceToDestinationKm > 0
      ? `${distanceToDestinationKm.toFixed(1)} km (signal GPS)`
      : null;

  const driverRatingLabel =
    typeof trip.driverVerification.averageRating === 'number'
      ? `${trip.driverVerification.averageRating.toFixed(1)} / 5`
      : null;

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Orbi Passager</Text>
        <Text style={styles.title}>Recu de course</Text>
        {completedAt ? (
          <Text style={styles.subtitle}>{completedAt}</Text>
        ) : null}
      </View>

      <View style={styles.fareHero}>
        <Text style={styles.fareHeroLabel}>Montant total</Text>
        <Text style={styles.fareHeroAmount}>{formatXof(trip.actualFare)}</Text>
        <View
          style={[
            styles.fareStatusBadge,
            trip.status === 'COMPLETED'
              ? styles.fareStatusCompleted
              : styles.fareStatusOther,
          ]}
        >
          <Text style={styles.fareStatusLabel}>
            {trip.status === 'COMPLETED' ? 'Course terminee' : trip.status}
          </Text>
        </View>
      </View>

      <View style={styles.receiptCard}>
        <Text style={styles.receiptSection}>Trajet</Text>
        <ReceiptRow label="Depart" value={trip.pickupAddress} />
        <Divider />
        <ReceiptRow label="Arrivee" value={trip.destinationAddress} />
        {distanceLabel ? (
          <>
            <Divider />
            <ReceiptRow label="Distance" value={distanceLabel} />
          </>
        ) : null}
        {trip.startedAt && trip.completedAt ? (
          <>
            <Divider />
            <ReceiptRow
              label="Duree"
              value={`${Math.round(
                (new Date(trip.completedAt).getTime() -
                  new Date(trip.startedAt).getTime()) /
                  60000,
              )} min`}
            />
          </>
        ) : null}
      </View>

      <View style={styles.receiptCard}>
        <Text style={styles.receiptSection}>Chauffeur</Text>
        <ReceiptRow
          label="Nom"
          value={trip.driverName}
        />
        {driverRatingLabel ? (
          <>
            <Divider />
            <ReceiptRow label="Note chauffeur" value={driverRatingLabel} />
          </>
        ) : null}
        {trip.vehicleLabel ? (
          <>
            <Divider />
            <ReceiptRow label="Vehicule" value={trip.vehicleLabel} />
          </>
        ) : null}
        <Divider />
        <ReceiptRow
          label="Courses effectuees"
          value={String(trip.driverVerification.completedTripsCount)}
        />
      </View>

      <View style={styles.receiptCard}>
        <Text style={styles.receiptSection}>Paiement</Text>
        <ReceiptRow label="Montant course" value={formatXof(trip.actualFare)} accent />
        <Divider />
        <ReceiptRow
          label="Reference"
          value={trip.id.slice(0, 12).toUpperCase()}
        />
      </View>

      <View style={styles.actions}>
        <Pressable onPress={handleRate} style={styles.primaryButton}>
          <Text style={styles.primaryButtonLabel}>Evaluer ce trajet</Text>
        </Pressable>
        <Pressable onPress={handleShare} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonLabel}>Partager le recu</Text>
        </Pressable>
        <Pressable onPress={handleHome} style={styles.ghostButton}>
          <Text style={styles.ghostButtonLabel}>Retour a l accueil</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingTop: 72,
    paddingHorizontal: 24,
    paddingBottom: 48,
    backgroundColor: orbiTheme.colors.background,
    gap: 18,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: orbiTheme.colors.background,
  },
  loadingCard: {
    backgroundColor: orbiTheme.colors.panel,
    borderRadius: orbiTheme.radius.card,
    borderWidth: 1,
    borderColor: orbiTheme.colors.border,
    padding: 24,
    gap: 10,
  },
  loadingEyebrow: {
    color: orbiTheme.colors.teal,
    textTransform: 'uppercase',
    letterSpacing: 2,
    fontSize: 11,
  },
  loadingTitle: {
    color: orbiTheme.colors.text,
    fontSize: 24,
    fontWeight: '800',
  },
  loadingBody: {
    color: orbiTheme.colors.muted,
    lineHeight: 20,
  },
  header: {
    gap: 5,
  },
  eyebrow: {
    color: orbiTheme.colors.teal,
    textTransform: 'uppercase',
    letterSpacing: 2,
    fontSize: 11,
    fontWeight: '700',
  },
  title: {
    color: orbiTheme.colors.text,
    fontSize: 32,
    fontWeight: '800',
  },
  subtitle: {
    color: orbiTheme.colors.muted,
    lineHeight: 20,
  },
  fareHero: {
    backgroundColor: orbiTheme.colors.panel,
    borderRadius: orbiTheme.radius.card,
    borderWidth: 1,
    borderColor: orbiTheme.colors.border,
    padding: 24,
    alignItems: 'center',
    gap: 8,
  },
  fareHeroLabel: {
    color: orbiTheme.colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    fontSize: 11,
    fontWeight: '700',
  },
  fareHeroAmount: {
    color: orbiTheme.colors.text,
    fontSize: 42,
    fontWeight: '900',
    letterSpacing: -1,
  },
  fareStatusBadge: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 5,
  },
  fareStatusCompleted: {
    backgroundColor: 'rgba(45, 212, 191, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(45, 212, 191, 0.35)',
  },
  fareStatusOther: {
    backgroundColor: 'rgba(245, 158, 11, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.35)',
  },
  fareStatusLabel: {
    color: orbiTheme.colors.teal,
    fontWeight: '700',
    fontSize: 12,
  },
  receiptCard: {
    backgroundColor: orbiTheme.colors.panel,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: orbiTheme.colors.border,
    padding: 18,
    gap: 4,
  },
  receiptSection: {
    color: orbiTheme.colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 8,
  },
  receiptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 6,
  },
  receiptRowLabel: {
    color: orbiTheme.colors.muted,
    flex: 1,
    fontSize: 14,
  },
  receiptRowValue: {
    color: orbiTheme.colors.text,
    fontWeight: '700',
    flex: 2,
    textAlign: 'right',
    fontSize: 14,
    lineHeight: 20,
  },
  receiptRowValueAccent: {
    color: orbiTheme.colors.teal,
    fontSize: 16,
  },
  divider: {
    height: 1,
    backgroundColor: orbiTheme.colors.border,
    opacity: 0.5,
  },
  actions: {
    gap: 10,
    marginTop: 4,
  },
  primaryButton: {
    backgroundColor: orbiTheme.colors.teal,
    borderRadius: orbiTheme.radius.button,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryButtonLabel: {
    color: '#04282a',
    fontWeight: '900',
    fontSize: 16,
  },
  secondaryButton: {
    borderRadius: orbiTheme.radius.button,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: orbiTheme.colors.teal,
    backgroundColor: 'rgba(45, 212, 191, 0.08)',
  },
  secondaryButtonLabel: {
    color: orbiTheme.colors.teal,
    fontWeight: '700',
    fontSize: 15,
  },
  ghostButton: {
    borderRadius: orbiTheme.radius.button,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: orbiTheme.colors.border,
  },
  ghostButtonLabel: {
    color: orbiTheme.colors.muted,
    fontWeight: '700',
    fontSize: 14,
  },
  errorCard: {
    backgroundColor: 'rgba(251, 113, 133, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(251, 113, 133, 0.3)',
    borderRadius: 16,
    padding: 16,
  },
  errorText: {
    color: orbiTheme.colors.rose,
    lineHeight: 20,
  },
});
