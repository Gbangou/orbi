import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
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
import { fetchTripDetail, type TripDetailResponse } from '@orbi/api';
import { formatXof, orbiTheme } from '@orbi/ui';
import { restoreRiderSession } from '../lib/auth';
import { resolveRiderAppError } from '../lib/session-feedback';

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={row.wrap}>
      <Text style={row.label}>{label}</Text>
      <Text style={[row.value, bold && row.valueBold]}>{value}</Text>
    </View>
  );
}

const row = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 11,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: orbiTheme.colors.border,
  },
  label: {
    fontSize: 14,
    color: orbiTheme.colors.textSoft,
    flex: 1,
  },
  value: {
    fontSize: 14,
    color: orbiTheme.colors.text,
    fontWeight: '500',
    textAlign: 'right',
    flex: 1,
  },
  valueBold: {
    fontWeight: '700',
    color: orbiTheme.colors.text,
  },
});

export default function ReceiptScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tripId: string }>();
  const tripId = params.tripId ?? '';

  const [detail, setDetail] = useState<TripDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    void preventScreenCaptureAsync();
    return () => { void allowScreenCaptureAsync(); };
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
        if (isMounted) setDetail(response);
      } catch (error) {
        if (!isMounted) return;
        const feedback = await resolveRiderAppError(error, {
          fallback: 'Le reçu de course est temporairement indisponible.',
        });
        setErrorMessage(feedback.message);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    void load();
    return () => { isMounted = false; };
  }, [tripId]);

  async function handleShare() {
    if (!detail) return;
    const trip = detail.trip;
    try {
      await Share.share({
        message: [
          'Mon trajet Orbi',
          `De : ${trip.pickupAddress}`,
          `Vers : ${trip.destinationAddress}`,
          `Montant : ${formatXof(trip.actualFare)}`,
          `Chauffeur : ${trip.driverName}`,
        ].join('\n'),
      });
    } catch { /* silent */ }
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

  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color={orbiTheme.colors.teal} />
        <Text style={styles.loadingText}>Chargement du reçu…</Text>
      </SafeAreaView>
    );
  }

  if (errorMessage || !detail) {
    return (
      <SafeAreaView style={styles.errorScreen}>
        <Text style={styles.errorTitle}>Reçu indisponible</Text>
        <Text style={styles.errorMessage}>{errorMessage ?? 'Une erreur est survenue.'}</Text>
        <Pressable onPress={() => router.replace('/home')} style={styles.primaryBtn}>
          <Text style={styles.primaryBtnLabel}>Retour à l'accueil</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const trip = detail.trip;

  const completedAt = trip.completedAt
    ? new Date(trip.completedAt).toLocaleString('fr-BF', {
        day: '2-digit', month: 'long', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    : null;

  const durationMin =
    trip.startedAt && trip.completedAt
      ? Math.round(
          (new Date(trip.completedAt).getTime() - new Date(trip.startedAt).getTime()) / 60000,
        )
      : null;

  const driverRatingLabel =
    typeof trip.driverVerification.averageRating === 'number'
      ? `${trip.driverVerification.averageRating.toFixed(1)} / 5`
      : null;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Fare hero */}
        <View style={styles.hero}>
          <Text style={styles.heroLabel}>Course terminée</Text>
          <Text style={styles.heroFare}>{formatXof(trip.actualFare)}</Text>
          {completedAt ? <Text style={styles.heroDate}>{completedAt}</Text> : null}
        </View>

        {/* Route */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Trajet</Text>
          <Row label="Départ" value={trip.pickupAddress} />
          <Row label="Arrivée" value={trip.destinationAddress} />
          {durationMin ? <Row label="Durée" value={`${durationMin} min`} /> : null}
        </View>

        {/* Driver */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Chauffeur</Text>
          <Row label="Nom" value={trip.driverName} />
          {driverRatingLabel ? <Row label="Note" value={driverRatingLabel} /> : null}
          {trip.vehicleLabel ? <Row label="Véhicule" value={trip.vehicleLabel} /> : null}
          <Row
            label="Courses effectuées"
            value={String(trip.driverVerification.completedTripsCount)}
          />
        </View>

        {/* Payment */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Paiement</Text>
          <Row label="Montant" value={formatXof(trip.actualFare)} bold />
          {trip.promoCode ? (
            <Row
              label="Code promo"
              value={`${trip.promoCode.code} (−${trip.promoCode.discountBps / 100}%)`}
            />
          ) : null}
          <Row label="Référence" value={trip.id.slice(0, 12).toUpperCase()} />
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <Pressable
            onPress={handleRate}
            style={({ pressed }) => [styles.primaryBtn, pressed && styles.btnPressed]}
          >
            <Text style={styles.primaryBtnLabel}>Évaluer ce trajet</Text>
          </Pressable>
          <Pressable
            onPress={() => void handleShare()}
            style={({ pressed }) => [styles.secondaryBtn, pressed && styles.btnPressed]}
          >
            <Text style={styles.secondaryBtnLabel}>Partager le reçu</Text>
          </Pressable>
          <Pressable
            onPress={() => router.replace('/home')}
            style={({ pressed }) => [styles.ghostBtn, pressed && styles.btnPressed]}
          >
            <Text style={styles.ghostBtnLabel}>Retour à l'accueil</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: orbiTheme.colors.background,
  },
  scroll: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 48,
    gap: 14,
  },

  // Loading / error
  centered: {
    flex: 1,
    backgroundColor: orbiTheme.colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 15,
    color: orbiTheme.colors.textMuted,
  },
  errorScreen: {
    flex: 1,
    backgroundColor: orbiTheme.colors.background,
    paddingHorizontal: 24,
    justifyContent: 'center',
    gap: 12,
  },
  errorTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: orbiTheme.colors.text,
  },
  errorMessage: {
    fontSize: 14,
    color: orbiTheme.colors.textSoft,
    lineHeight: 20,
  },

  // Hero
  hero: {
    alignItems: 'center',
    paddingVertical: 28,
    gap: 6,
  },
  heroLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: orbiTheme.colors.teal,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  heroFare: {
    fontSize: 48,
    fontWeight: '800',
    color: orbiTheme.colors.text,
    letterSpacing: -1,
  },
  heroDate: {
    fontSize: 13,
    color: orbiTheme.colors.textMuted,
  },

  // Cards
  card: {
    backgroundColor: orbiTheme.colors.surface,
    borderRadius: orbiTheme.radius.card,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 2,
    borderWidth: 1,
    borderColor: orbiTheme.colors.border,
    ...orbiTheme.shadows.card,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: orbiTheme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 4,
  },

  // Buttons
  actions: {
    gap: 10,
    marginTop: 8,
  },
  primaryBtn: {
    backgroundColor: orbiTheme.colors.text,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    ...orbiTheme.shadows.button,
  },
  primaryBtnLabel: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryBtn: {
    backgroundColor: orbiTheme.colors.background,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: orbiTheme.colors.border,
  },
  secondaryBtnLabel: {
    color: orbiTheme.colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  ghostBtn: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  ghostBtnLabel: {
    color: orbiTheme.colors.textMuted,
    fontSize: 14,
    fontWeight: '500',
  },
  btnPressed: {
    opacity: 0.75,
  },
});
