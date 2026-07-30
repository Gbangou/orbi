import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
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
import {
  createCheckoutIntentWithApi,
  fetchRiderProfile,
  fetchTripDetail,
  reportTripIncidentWithApi,
  type TripDetailResponse,
} from '@orbi/api';
import { orbiRuntimeConfig } from '@orbi/config';
import { type OrbiTheme } from '@orbi/ui';
import {
  OrbiButton,
  OrbiStatusBanner,
  OrbiSurface,
  PersonBadge,
  TripStageTracker,
  useOrbiTheme,
} from '@orbi/ui/native';
import { restoreRiderSession } from '../lib/auth';
import { resolveRiderAppError } from '../lib/session-feedback';
import {
  calculateRiderPromoSavings,
  calculateRiderTripDurationMinutes,
  formatRiderDateTime,
  formatRiderMoneyAmount,
} from '../lib/rider-display-format';

// ── Helpers ──────────────────────────────────────────────────────────────────

function ReceiptGlyph() {
  const theme = useOrbiTheme();
  const glyphStyles = useMemo(() => makeGlyphStyles(theme), [theme]);
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

const makeGlyphStyles = (theme: OrbiTheme) => StyleSheet.create({
  badge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: theme.colors.backgroundAlt,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  doc: {
    width: 26,
    height: 32,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: theme.colors.textMuted,
    padding: 5,
    justifyContent: 'center',
    gap: 4,
  },
  line: {
    height: 2,
    borderRadius: 1,
    backgroundColor: theme.colors.textMuted,
  },
  lineShort: {
    width: '65%',
  },
});

function formatPaymentMethod(method: string | null | undefined) {
  if (!method) return 'Espèces';
  if (method === 'MOBILE_MONEY') return 'Mobile Money';
  if (method === 'WALLET') return 'Portefeuille Orbi';
  return 'Espèces';
}

function CloseGlyph() {
  const theme = useOrbiTheme();
  const receiptIcon = useMemo(() => makeReceiptIconStyles(theme), [theme]);
  return (
    <View style={receiptIcon.closeWrap}>
      <View style={[receiptIcon.closeLine, receiptIcon.closeLineA]} />
      <View style={[receiptIcon.closeLine, receiptIcon.closeLineB]} />
    </View>
  );
}

function ShareGlyph() {
  const theme = useOrbiTheme();
  const receiptIcon = useMemo(() => makeReceiptIconStyles(theme), [theme]);
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
  const theme = useOrbiTheme();
  const receiptIcon = useMemo(() => makeReceiptIconStyles(theme), [theme]);
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
  const theme = useOrbiTheme();
  const row = useMemo(() => makeRowStyles(theme), [theme]);
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

const makeRowStyles = (theme: OrbiTheme) => StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  label: {
    fontSize: 14,
    color: theme.colors.textSoft,
    flex: 1,
  },
  value: {
    fontSize: 14,
    color: theme.colors.text,
    fontWeight: '500',
    textAlign: 'right',
    flex: 1,
  },
  valueBold: {
    fontWeight: '800',
    fontSize: 15,
    color: theme.colors.text,
  },
});

// ── Main screen ───────────────────────────────────────────────────────────────

export default function ReceiptScreen() {
  const router = useRouter();
  const theme = useOrbiTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const row = useMemo(() => makeRowStyles(theme), [theme]);
  const params = useLocalSearchParams<{ tripId: string }>();
  const tripId = params.tripId ?? '';

  const [detail, setDetail] = useState<TripDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);
  const [paymentMessage, setPaymentMessage] = useState<string | null>(null);
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
          `Montant : ${formatRiderMoneyAmount(trip.actualFare)}`,
          `Chauffeur : ${trip.driverName}`,
          `Réf : ${trip.id.slice(0, 12).toUpperCase()}`,
        ].join('\n'),
      });
    } catch { /* silent */ }
  }

  async function handleFinalizePayment() {
    if (!detail || paymentSubmitting) return;

    const trip = detail.trip;
    setPaymentSubmitting(true);
    setPaymentMessage('Initialisation du paiement Mobile Money...');

    try {
      const { authClient } = await restoreRiderSession();
      const profile = await fetchRiderProfile(authClient);
      const customerPhoneNumber = profile.profile.phoneNumber;

      if (!customerPhoneNumber) {
        setPaymentMessage(
          'Ajoutez un numero Mobile Money dans votre profil avant de finaliser le paiement.',
        );
        return;
      }

      const paymentIntent = await createCheckoutIntentWithApi(
        authClient,
        {
          rideRequestId: trip.rideRequestId,
          channel: 'MOBILE_MONEY',
          amount: trip.actualFare,
          customerPhoneNumber,
          redirectUrl: orbiRuntimeConfig.paymentRedirectUrl,
        },
        {
          idempotencyKey: `receipt-${trip.rideRequestId}-mobile-money`,
        },
      );

      setPaymentMessage(
        `Paiement ${paymentIntent.provider} initialise. Confirmez la demande sur votre telephone. Ref ${paymentIntent.transactionRef.slice(0, 12)}.`,
      );
      const refreshed = await fetchTripDetail(authClient, trip.id);
      setDetail(refreshed);
    } catch (error) {
      const feedback = await resolveRiderAppError(error, {
        surface: 'payments',
        fallback: "Le paiement n'a pas pu etre initialise.",
      });
      setPaymentMessage(feedback.message);
      Alert.alert('Paiement non initialise', feedback.message);
    } finally {
      setPaymentSubmitting(false);
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
        <ActivityIndicator size="large" color={theme.colors.teal} />
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
    ? formatRiderDateTime(trip.completedAt, '')
    : null;

  const durationMin = calculateRiderTripDurationMinutes({
    startedAt: trip.startedAt,
    completedAt: trip.completedAt,
  });

  const promoSavingsXof = trip.promoCode
    ? calculateRiderPromoSavings({
        amount: trip.actualFare,
        discountBps: trip.promoCode.discountBps,
      })
    : null;
  const receiptStatus = trip.receipt?.status?.toUpperCase() ?? null;
  const paymentMethod = (trip.paymentMethod ?? 'MOBILE_MONEY').toUpperCase();
  const paymentSettled =
    paymentMethod === 'CASH' ||
    receiptStatus === 'SUCCEEDED' ||
    receiptStatus === 'COMPLETED';
  const canFinalizePayment =
    !paymentSettled && paymentMethod !== 'CASH' && paymentMethod !== 'WALLET';

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
        <TripStageTracker status="COMPLETED" audience="rider" style={styles.stageTracker} />

        {/* Hero — fare + status */}
        <OrbiSurface tone="teal" style={styles.hero} elevated>
          <View style={styles.heroCheck}>
            <CheckGlyph />
          </View>
          <Text style={styles.heroFare}>{formatRiderMoneyAmount(trip.actualFare)}</Text>
          <Text style={styles.heroLabel}>Course terminée</Text>
          {completedAt ? <Text style={styles.heroDate}>{completedAt}</Text> : null}
        </OrbiSurface>

        <OrbiStatusBanner
          title={paymentSettled ? "Recu professionnel" : "Paiement a finaliser"}
          message={
            paymentSettled
              ? "Reference, paiement et details chauffeur disponibles. Vous pouvez l envoyer par SMS, WhatsApp ou email."
              : `Montant a payer: ${formatRiderMoneyAmount(trip.actualFare)}. Finalisez le paiement avant de quitter le flux.`
          }
          tone={paymentSettled ? "sky" : "amber"}
        />
        {paymentMessage ? (
          <OrbiStatusBanner
            title="Paiement"
            message={paymentMessage}
            tone={paymentMessage.includes('initialise') ? 'teal' : 'amber'}
          />
        ) : null}

        {/* Route card */}
        <OrbiSurface style={styles.card}>
          <Text style={styles.cardTitle}>Trajet</Text>
          <View style={styles.routeVisual}>
            {/* Left track */}
            <View style={styles.routeTrack}>
              <View style={[styles.routeDot, { backgroundColor: theme.colors.teal }]} />
              <View style={styles.routeTrackLine} />
              <View style={[styles.routeDot, { backgroundColor: theme.colors.text }]} />
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
          <Row label="Course" value={formatRiderMoneyAmount(trip.actualFare)} />
          {trip.promoCode ? (
            <Row
              label={`Promo (${trip.promoCode.code})`}
              value={promoSavingsXof ? `− ${formatRiderMoneyAmount(promoSavingsXof)}` : `− ${trip.promoCode.discountBps / 100}%`}
              accent={theme.colors.teal}
            />
          ) : null}
          <Row label="Mode de paiement" value={formatPaymentMethod(trip.paymentMethod)} />
          <Row
            label="Statut"
            value={paymentSettled ? 'Regle' : receiptStatus ?? 'A finaliser'}
          />
          <Row label="Total facturé" value={formatRiderMoneyAmount(trip.actualFare)} bold />
          <View style={[row.wrap, { borderBottomWidth: 0 }]}>
            <Text style={[row.label, { color: theme.colors.textMuted, fontSize: 12 }]}>
              Référence
            </Text>
            <Text style={[row.value, { color: theme.colors.textMuted, fontSize: 12, fontFamily: 'Inter_400Regular' }]}>
              {trip.id.slice(0, 16).toUpperCase()}
            </Text>
          </View>
        </OrbiSurface>

        {/* Driver */}
        <OrbiSurface style={styles.card}>
          <Text style={styles.cardTitle}>Votre chauffeur</Text>
          <PersonBadge
            name={trip.driverName}
            subtitle={[`${trip.driverVerification.completedTripsCount} courses`, trip.vehicleLabel]
              .filter(Boolean)
              .join(' · ')}
            rating={trip.driverVerification.averageRating ?? undefined}
            plate={
              trip.driverVerification.vehicle.plateNumber
                ? `${trip.driverVerification.vehicle.color} · ${trip.driverVerification.vehicle.plateNumber}`
                : null
            }
            size={56}
          />
        </OrbiSurface>

        {/* Actions */}
        <View style={styles.actions}>
          <OrbiButton
            label="Envoyer le recu"
            helper="SMS, WhatsApp ou email"
            onPress={() => void handleShare()}
            tone="teal"
          />

          {canFinalizePayment ? (
            <OrbiButton
              label={paymentSubmitting ? "Paiement..." : "Finaliser le paiement"}
              helper={`${formatRiderMoneyAmount(trip.actualFare)} via Mobile Money`}
              onPress={() => void handleFinalizePayment()}
              tone="amber"
              disabled={paymentSubmitting}
            />
          ) : null}

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

const makeStyles = (theme: OrbiTheme) => StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: theme.colors.riderBackground,
  },

  // Sticky header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.riderBackground,
  },
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.backgroundAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
    color: theme.colors.text,
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
    backgroundColor: theme.colors.riderBackground,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 15,
    color: theme.colors.textMuted,
  },
  errorScreen: {
    flex: 1,
    backgroundColor: theme.colors.riderBackground,
    paddingHorizontal: 32,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  errorTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: theme.colors.text,
    textAlign: 'center',
  },
  errorMessage: {
    fontSize: 14,
    color: theme.colors.textSoft,
    lineHeight: 20,
    textAlign: 'center',
  },
  errorButton: {
    marginTop: 14,
    minWidth: 200,
  },

  stageTracker: {
    marginTop: -4,
    marginBottom: 4,
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
    backgroundColor: theme.colors.teal,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  heroFare: {
    fontSize: 44,
    fontWeight: '800',
    fontFamily: 'Raleway_800ExtraBold',
    color: theme.colors.text,
    letterSpacing: 0,
  },
  heroLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.textSoft,
  },
  heroDate: {
    fontSize: 13,
    color: theme.colors.textMuted,
    textAlign: 'center',
  },

  // Cards
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  cardTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.colors.textMuted,
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
    backgroundColor: theme.colors.border,
    marginVertical: 4,
    minHeight: 20,
  },
  routeAddresses: { flex: 1, gap: 0 },
  routeAddrBlock: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  routeAddrLabel: {
    fontSize: 11,
    color: theme.colors.textMuted,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0,
    marginBottom: 3,
  },
  routeAddrText: {
    fontSize: 14,
    color: theme.colors.text,
    fontWeight: '500',
    lineHeight: 20,
  },
  routeDurationRow: {
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  routeDurationText: {
    fontSize: 12,
    color: theme.colors.textMuted,
    fontWeight: '500',
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
    backgroundColor: theme.colors.teal,
    flexShrink: 0,
  },
  timelineLine: {
    flex: 1,
    width: 1,
    backgroundColor: theme.colors.border,
    marginTop: 4,
    minHeight: 12,
  },
  timelineContent: { flex: 1, gap: 2 },
  timelineLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.text,
  },
  timelineTime: {
    fontSize: 12,
    color: theme.colors.textMuted,
  },

  // Actions
  actions: { gap: 10, marginTop: 4 },
  primaryBtn: {
    backgroundColor: theme.colors.text,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryBtnLabel: {
    color: theme.colors.textInverse,
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
  },
  secondaryBtn: {
    backgroundColor: theme.colors.riderBackground,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: theme.colors.border,
  },
  secondaryBtnLabel: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  ghostBtn: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  ghostBtnLabel: {
    color: theme.colors.textMuted,
    fontSize: 14,
    fontWeight: '500',
  },
  btnPressed: { opacity: 0.75 },
});

const makeReceiptIconStyles = (theme: OrbiTheme) => StyleSheet.create({
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
    backgroundColor: theme.colors.textSoft,
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
    backgroundColor: theme.colors.textSoft,
  },
  shareHead: {
    position: 'absolute',
    top: 2,
    width: 8,
    height: 2,
    borderRadius: 999,
    backgroundColor: theme.colors.textSoft,
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
    borderColor: theme.colors.textSoft,
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
