import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  SafeAreaView,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { preventSensitiveScreenCapture, restoreSensitiveScreenCapture } from '../lib/privacy/screen-capture';
import { fetchTripDetail, reportTripIncidentWithApi, type TripDetailResponse } from '@orbi/api';
import { formatXof, orbiTheme } from '@orbi/ui';
import { OrbiButton, OrbiStatusBanner, OrbiSurface } from '@orbi/ui/native';
import { restoreRiderSession } from '../lib/auth';
import { resolveRiderAppError } from '../lib/session-feedback';

// ── Helpers ──────────────────────────────────────────────────────────────────

function ReceiptGlyph() {
  return (
    <View style={glyphStyles.badge}>
      <View style={glyphStyles.doc}>
        <View style={glyphStyles.line} />
        <View style={[glyphStyles.line, glyphStyles.lineShort]} />
        <View style={glyphStyles.line} />
      </View>
    </View>
  );
}

const glyphStyles = StyleSheet.create({
  badge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(7, 17, 31, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  doc: {
    width: 26,
    height: 32,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: orbiTheme.colors.textMuted,
    padding: 5,
    justifyContent: 'center',
    gap: 4,
  },
  line: {
    height: 2,
    borderRadius: 1,
    backgroundColor: orbiTheme.colors.textMuted,
  },
  lineShort: {
    width: '65%',
  },
});

function buildInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('') || 'OR';
}

function formatPaymentMethod(method: string | null | undefined) {
  if (!method) return 'Espèces';
  if (method === 'MOBILE_MONEY') return 'Mobile Money';
  if (method === 'WALLET') return 'Portefeuille Orbi';
  return 'Espèces';
}

function CloseGlyph() {
  return (
    <View style={receiptIcon.closeWrap}>
      <View style={[receiptIcon.closeLine, receiptIcon.closeLineA]} />
      <View style={[receiptIcon.closeLine, receiptIcon.closeLineB]} />
    </View>
  );
}

function ShareGlyph() {
  return (
    <View style={receiptIcon.shareWrap}>
      <View style={receiptIcon.shareStem} />
      <View style={[receiptIcon.shareHead, receiptIcon.shareHeadLeft]} />
      <View style={[receiptIcon.shareHead, receiptIcon.shareHeadRight]} />
      <View style={receiptIcon.shareBase} />
    </View>
  );
}

function CheckGlyph() {
  return (
    <View style={receiptIcon.checkWrap}>
      <View style={[receiptIcon.checkLine, receiptIcon.checkLineShort]} />
      <View style={[receiptIcon.checkLine, receiptIcon.checkLineLong]} />
    </View>
  );
}

// ── Row component ─────────────────────────────────────────────────────────────

function Row({
  label,
  value,
  bold,
  accent,
}: {
  label: string;
  value: string;
  bold?: boolean;
  accent?: string;
}) {
  return (
    <View style={row.wrap}>
      <Text style={row.label}>{label}</Text>
      <Text
        style={[
          row.value,
          bold && row.valueBold,
          accent ? { color: accent } : undefined,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

const row = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
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
    fontWeight: '800',
    fontSize: 15,
    color: orbiTheme.colors.text,
  },
});

// ── Main screen ───────────────────────────────────────────────────────────────

export default function ReceiptScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tripId: string }>();
  const tripId = params.tripId ?? '';

  const [detail, setDetail] = useState<TripDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    preventSensitiveScreenCapture();
    return () => { restoreSensitiveScreenCapture(); };
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
          'Recu de trajet Orbi',
          `De : ${trip.pickupAddress}`,
          `Vers : ${trip.destinationAddress}`,
          `Montant : ${formatXof(trip.actualFare)}`,
          `Chauffeur : ${trip.driverName}`,
          `Réf : ${trip.id.slice(0, 12).toUpperCase()}`,
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

  async function handleReportProblem() {
    if (!detail) return;
    Alert.alert(
      'Signaler un problème',
      'Quel type de problème souhaitez-vous signaler ?',
      [
        {
          text: 'Problème de sécurité',
          onPress: async () => {
            try {
              const { authClient } = await restoreRiderSession();
              await reportTripIncidentWithApi(authClient, detail.trip.id, {
                incidentType: 'SAFETY_ALERT',
                details: 'Problème signalé depuis le reçu de course.',
                priority: 2,
              });
              Alert.alert('Signalement envoyé', "Notre équipe va examiner votre signalement dans les plus brefs délais.");
            } catch { /* silent */ }
          },
        },
        {
          text: 'Problème de paiement',
          onPress: async () => {
            try {
              const { authClient } = await restoreRiderSession();
              await reportTripIncidentWithApi(authClient, detail.trip.id, {
                incidentType: 'PAYMENT_ISSUE',
                details: 'Problème de paiement signalé depuis le reçu.',
                priority: 2,
              });
              Alert.alert('Signalement envoyé', "Notre équipe va vérifier votre paiement.");
            } catch { /* silent */ }
          },
        },
        {
          text: 'Comportement du chauffeur',
          onPress: async () => {
            try {
              const { authClient } = await restoreRiderSession();
              await reportTripIncidentWithApi(authClient, detail.trip.id, {
                incidentType: 'DRIVER_CONDUCT',
                details: 'Comportement du chauffeur signalé depuis le reçu.',
                priority: 2,
              });
              Alert.alert('Signalement envoyé', "Merci pour votre retour. Votre sécurité est notre priorité.");
            } catch { /* silent */ }
          },
        },
        { text: 'Annuler', style: 'cancel' as const },
      ],
    );
  }

  // ── Loading state ────────────────────────────────────────────────────────────

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
        <ReceiptGlyph />
        <Text style={styles.errorTitle}>Reçu indisponible</Text>
        <Text style={styles.errorMessage}>{errorMessage ?? 'Une erreur est survenue.'}</Text>
        <OrbiButton
          label="Retour à l'accueil"
          onPress={() => router.replace('/home')}
          tone="teal"
          style={styles.errorButton}
        />
      </SafeAreaView>
    );
  }

  const trip = detail.trip;

  const completedAt = trip.completedAt
    ? new Date(trip.completedAt).toLocaleString('fr-BF', {
        weekday: 'long', day: '2-digit', month: 'long',
        hour: '2-digit', minute: '2-digit',
      })
    : null;

  const durationMin =
    trip.startedAt && trip.completedAt
      ? Math.round(
          (new Date(trip.completedAt).getTime() - new Date(trip.startedAt).getTime()) / 60000,
        )
      : null;

  const ratingLabel =
    typeof trip.driverVerification.averageRating === 'number'
      ? `★ ${trip.driverVerification.averageRating.toFixed(1)}`
      : null;

  const promoSavingsXof = trip.promoCode
    ? Math.round(trip.actualFare * (trip.promoCode.discountBps / (10000 - trip.promoCode.discountBps)))
    : null;

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe}>
      {/* Sticky header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => router.replace('/home')}
          style={({ pressed }) => [styles.headerBtn, pressed && { opacity: 0.6 }]}
        >
          <CloseGlyph />
        </Pressable>
        <Text style={styles.headerTitle}>Reçu</Text>
        <Pressable
          onPress={() => void handleShare()}
          style={({ pressed }) => [styles.headerBtn, pressed && { opacity: 0.6 }]}
        >
          <ShareGlyph />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero — fare + status */}
        <OrbiSurface tone="teal" style={styles.hero} elevated>
          <View style={styles.heroCheck}>
            <CheckGlyph />
          </View>
          <Text style={styles.heroFare}>{formatXof(trip.actualFare)}</Text>
          <Text style={styles.heroLabel}>Course terminée</Text>
          {completedAt ? <Text style={styles.heroDate}>{completedAt}</Text> : null}
        </OrbiSurface>

        <OrbiStatusBanner
          title="Recu securise"
          message="Capture protegee sur cet ecran. Reference et paiement disponibles pour support."
          tone="sky"
        />

        {/* Route card */}
        <OrbiSurface style={styles.card}>
          <Text style={styles.cardTitle}>Trajet</Text>
          <View style={styles.routeVisual}>
            {/* Left track */}
            <View style={styles.routeTrack}>
              <View style={[styles.routeDot, { backgroundColor: orbiTheme.colors.teal }]} />
              <View style={styles.routeTrackLine} />
              <View style={[styles.routeDot, { backgroundColor: orbiTheme.colors.text }]} />
            </View>
            {/* Addresses */}
            <View style={styles.routeAddresses}>
              <View style={styles.routeAddrBlock}>
                <Text style={styles.routeAddrLabel}>Départ</Text>
                <Text style={styles.routeAddrText}>{trip.pickupAddress}</Text>
              </View>
              {durationMin ? (
                <View style={styles.routeDurationRow}>
                  <Text style={styles.routeDurationText}>{durationMin} min de trajet</Text>
                </View>
              ) : null}
              <View style={styles.routeAddrBlock}>
                <Text style={styles.routeAddrLabel}>Arrivée</Text>
                <Text style={styles.routeAddrText}>{trip.destinationAddress}</Text>
              </View>
            </View>
          </View>
        </OrbiSurface>

        {/* Fare breakdown */}
        <OrbiSurface style={styles.card}>
          <Text style={styles.cardTitle}>Paiement</Text>
          <Row label="Course" value={formatXof(trip.actualFare)} />
          {trip.promoCode ? (
            <Row
              label={`Promo (${trip.promoCode.code})`}
              value={promoSavingsXof ? `− ${formatXof(promoSavingsXof)}` : `− ${trip.promoCode.discountBps / 100}%`}
              accent={orbiTheme.colors.teal}
            />
          ) : null}
          <Row label="Mode de paiement" value={formatPaymentMethod(null)} />
          <Row label="Total facturé" value={formatXof(trip.actualFare)} bold />
          <View style={[row.wrap, { borderBottomWidth: 0 }]}>
            <Text style={[row.label, { color: orbiTheme.colors.textMuted, fontSize: 12 }]}>
              Référence
            </Text>
            <Text style={[row.value, { color: orbiTheme.colors.textMuted, fontSize: 12, fontFamily: 'Inter_400Regular' }]}>
              {trip.id.slice(0, 16).toUpperCase()}
            </Text>
          </View>
        </OrbiSurface>

        {/* Driver */}
        <OrbiSurface style={styles.card}>
          <Text style={styles.cardTitle}>Votre chauffeur</Text>
          <View style={styles.driverRow}>
            <View style={styles.driverAvatar}>
              <Text style={styles.driverInitials}>{buildInitials(trip.driverName)}</Text>
            </View>
            <View style={styles.driverInfo}>
              <Text style={styles.driverName}>{trip.driverName}</Text>
              <Text style={styles.driverMeta}>
                {[
                  ratingLabel,
                  `${trip.driverVerification.completedTripsCount} courses`,
                ].filter(Boolean).join(' · ')}
              </Text>
              {trip.vehicleLabel ? (
                <Text style={styles.driverVehicle}>{trip.vehicleLabel}</Text>
              ) : null}
              {trip.driverVerification.vehicle.plateNumber ? (
                <Text style={styles.driverPlate}>
                  {trip.driverVerification.vehicle.color} · {trip.driverVerification.vehicle.plateNumber}
                </Text>
              ) : null}
            </View>
          </View>
        </OrbiSurface>

        {/* Timeline */}
        {trip.timeline.length > 0 ? (
          <OrbiSurface style={styles.card}>
            <Text style={styles.cardTitle}>Chronologie</Text>
            {trip.timeline.map((event, idx) => (
              <View key={event.id} style={[styles.timelineRow, idx === trip.timeline.length - 1 && { borderBottomWidth: 0 }]}>
                <View style={styles.timelineLeft}>
                  <View style={styles.timelineDot} />
                  {idx < trip.timeline.length - 1 ? <View style={styles.timelineLine} /> : null}
                </View>
                <View style={styles.timelineContent}>
                  <Text style={styles.timelineLabel}>{event.label}</Text>
                  <Text style={styles.timelineTime}>
                    {new Date(event.createdAt).toLocaleTimeString('fr-BF', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                </View>
              </View>
            ))}
          </OrbiSurface>
        ) : null}

        {/* Actions */}
        <View style={styles.actions}>
          <OrbiButton
            label="Evaluer ce trajet"
            helper="Aide a maintenir la qualite chauffeur"
            onPress={handleRate}
            tone="teal"
          />

          <OrbiButton
            label="Refaire ce trajet"
            variant="secondary"
            onPress={() =>
              router.replace({
                pathname: '/book',
                params: {
                  prefillPickup: trip.pickupAddress,
                  prefillDest: trip.destinationAddress,
                },
              })
            }
            tone="sky"
          />

          {trip.driverPhoneNumber ? (
            <OrbiButton
              label="Rappeler le chauffeur"
              variant="secondary"
              onPress={() => void Linking.openURL(`tel:${trip.driverPhoneNumber}`)}
              tone="teal"
            />
          ) : null}

          <OrbiButton
            label="Signaler un probleme"
            variant="danger"
            onPress={() => void handleReportProblem()}
            tone="danger"
          />

          <OrbiButton
            label="Retour à l'accueil"
            variant="ghost"
            onPress={() => router.replace('/home')}
            tone="teal"
          />
        </View>

        <View style={{ height: 16 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: orbiTheme.colors.riderBackground,
  },

  // Sticky header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: orbiTheme.colors.border,
    backgroundColor: orbiTheme.colors.riderBackground,
  },
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: orbiTheme.colors.backgroundAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
    color: orbiTheme.colors.text,
  },

  scroll: {
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 48,
    gap: 12,
  },

  // Loading / error
  centered: {
    flex: 1,
    backgroundColor: orbiTheme.colors.riderBackground,
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
    backgroundColor: orbiTheme.colors.riderBackground,
    paddingHorizontal: 32,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  errorTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: orbiTheme.colors.text,
    textAlign: 'center',
  },
  errorMessage: {
    fontSize: 14,
    color: orbiTheme.colors.textSoft,
    lineHeight: 20,
    textAlign: 'center',
  },
  errorButton: {
    marginTop: 14,
    minWidth: 200,
  },

  // Hero
  hero: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 6,
  },
  heroCheck: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: orbiTheme.colors.teal,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  heroFare: {
    fontSize: 44,
    fontWeight: '800',
    fontFamily: 'Raleway_800ExtraBold',
    color: orbiTheme.colors.text,
    letterSpacing: 0,
  },
  heroLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: orbiTheme.colors.textSoft,
  },
  heroDate: {
    fontSize: 13,
    color: orbiTheme.colors.textMuted,
    textAlign: 'center',
  },

  // Cards
  card: {
    backgroundColor: orbiTheme.colors.surface,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: orbiTheme.colors.border,
  },
  cardTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: orbiTheme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0,
    marginBottom: 8,
  },

  // Route visual
  routeVisual: {
    flexDirection: 'row',
    gap: 12,
    paddingBottom: 14,
  },
  routeTrack: {
    alignItems: 'center',
    paddingTop: 16,
    width: 12,
  },
  routeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    flexShrink: 0,
  },
  routeTrackLine: {
    flex: 1,
    width: 2,
    backgroundColor: orbiTheme.colors.border,
    marginVertical: 4,
    minHeight: 20,
  },
  routeAddresses: { flex: 1, gap: 0 },
  routeAddrBlock: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: orbiTheme.colors.border,
  },
  routeAddrLabel: {
    fontSize: 11,
    color: orbiTheme.colors.textMuted,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0,
    marginBottom: 3,
  },
  routeAddrText: {
    fontSize: 14,
    color: orbiTheme.colors.text,
    fontWeight: '500',
    lineHeight: 20,
  },
  routeDurationRow: {
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: orbiTheme.colors.border,
  },
  routeDurationText: {
    fontSize: 12,
    color: orbiTheme.colors.textMuted,
    fontWeight: '500',
  },

  // Driver section
  driverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingBottom: 14,
  },
  driverAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: orbiTheme.colors.text,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  driverInitials: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  driverInfo: { flex: 1, gap: 3 },
  driverName: {
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
    color: orbiTheme.colors.text,
  },
  driverMeta: {
    fontSize: 13,
    color: orbiTheme.colors.textSoft,
  },
  driverVehicle: {
    fontSize: 13,
    color: orbiTheme.colors.textMuted,
  },
  driverPlate: {
    fontSize: 12,
    fontWeight: '700',
    color: orbiTheme.colors.teal,
    letterSpacing: 0,
  },

  // Timeline
  timelineRow: {
    flexDirection: 'row',
    paddingBottom: 14,
    gap: 12,
  },
  timelineLeft: {
    alignItems: 'center',
    width: 10,
    paddingTop: 4,
  },
  timelineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: orbiTheme.colors.teal,
    flexShrink: 0,
  },
  timelineLine: {
    flex: 1,
    width: 1,
    backgroundColor: orbiTheme.colors.border,
    marginTop: 4,
    minHeight: 12,
  },
  timelineContent: { flex: 1, gap: 2 },
  timelineLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: orbiTheme.colors.text,
  },
  timelineTime: {
    fontSize: 12,
    color: orbiTheme.colors.textMuted,
  },

  // Actions
  actions: { gap: 10, marginTop: 4 },
  primaryBtn: {
    backgroundColor: orbiTheme.colors.text,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryBtnLabel: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
  },
  secondaryBtn: {
    backgroundColor: orbiTheme.colors.riderBackground,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: orbiTheme.colors.border,
  },
  secondaryBtnLabel: {
    color: orbiTheme.colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  ghostBtn: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  ghostBtnLabel: {
    color: orbiTheme.colors.textMuted,
    fontSize: 14,
    fontWeight: '500',
  },
  btnPressed: { opacity: 0.75 },
});

const receiptIcon = StyleSheet.create({
  closeWrap: {
    width: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeLine: {
    position: 'absolute',
    width: 16,
    height: 2,
    borderRadius: 999,
    backgroundColor: orbiTheme.colors.textSoft,
  },
  closeLineA: {
    transform: [{ rotate: '45deg' }],
  },
  closeLineB: {
    transform: [{ rotate: '-45deg' }],
  },
  shareWrap: {
    width: 18,
    height: 18,
    alignItems: 'center',
  },
  shareStem: {
    position: 'absolute',
    top: 2,
    width: 2,
    height: 13,
    borderRadius: 999,
    backgroundColor: orbiTheme.colors.textSoft,
  },
  shareHead: {
    position: 'absolute',
    top: 2,
    width: 8,
    height: 2,
    borderRadius: 999,
    backgroundColor: orbiTheme.colors.textSoft,
  },
  shareHeadLeft: {
    transform: [{ translateX: -3 }, { rotate: '-45deg' }],
  },
  shareHeadRight: {
    transform: [{ translateX: 3 }, { rotate: '45deg' }],
  },
  shareBase: {
    position: 'absolute',
    left: 3,
    right: 3,
    bottom: 1,
    height: 6,
    borderLeftWidth: 2,
    borderRightWidth: 2,
    borderBottomWidth: 2,
    borderColor: orbiTheme.colors.textSoft,
    borderBottomLeftRadius: 3,
    borderBottomRightRadius: 3,
  },
  checkWrap: {
    width: 27,
    height: 22,
  },
  checkLine: {
    position: 'absolute',
    height: 4,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
  },
  checkLineShort: {
    width: 11,
    left: 2,
    top: 12,
    transform: [{ rotate: '45deg' }],
  },
  checkLineLong: {
    width: 22,
    left: 9,
    top: 9,
    transform: [{ rotate: '-45deg' }],
  },
});
