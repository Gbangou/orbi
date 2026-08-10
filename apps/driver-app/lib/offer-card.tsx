import { memo, useEffect, useMemo, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { type OrbiTheme } from "@orbi/ui";
import {
  OrbiButton,
  OrbiSurface,
  PersonBadge,
  useOrbiTheme,
  VehicleIllustration,
} from "@orbi/ui/native";
import type { DriverOffer } from "@orbi/api";
import {
  buildDriverOfferDecisionSummary,
  formatDriverOfferDistance,
  formatDriverOfferMoney,
  formatDriverOfferMinutes,
  resolveDriverOfferMoneyDisplay,
  toFiniteOfferNumber,
} from "./offer-signal";
import { formatReservationCountdown } from "./offer-reservation";

// ── Vehicle icon — premium isometric SVG illustration ────────────────────────

function VehicleIcon({ category }: { category: DriverOffer["category"] }) {
  const tier = category === "motorcycle" ? "moto-standard" : "car-standard";
  return <VehicleIllustration tier={tier} width={64} height={46} />;
}

function formatOfferVehicleType(category: DriverOffer["category"]) {
  return category === "motorcycle" ? "Moto" : "Voiture";
}

function formatOfferPaymentMethod(paymentMethod: DriverOffer["paymentMethod"]) {
  const normalized = String(paymentMethod ?? "mobile-money").toUpperCase().replace(/-/g, "_");

  switch (normalized) {
    case "CASH":
      return "Espèces";
    case "WALLET":
      return "Wallet Orbi";
    case "MOBILE_MONEY":
      return "Mobile Money";
    default:
      return "Paiement confirmé";
  }
}

// ── Public interface ──────────────────────────────────────────────────────────

export interface OfferCardProps {
  offer: DriverOffer;
  isFresh: boolean;
  reservationNow: number;
  isSubmitting: boolean;
  hasActiveTrip: boolean;
  index?: number;
  onAccept: (offerId: string) => void;
  onDecline: (offerId: string) => void;
}

export const OfferCard = memo(function OfferCard({
  offer,
  isFresh,
  reservationNow,
  isSubmitting,
  hasActiveTrip,
  index = 0,
  onAccept,
  onDecline,
}: OfferCardProps) {
  const theme = useOrbiTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const decision = buildDriverOfferDecisionSummary(offer);
  const isDisabled = isSubmitting || hasActiveTrip;
  const driverPayout = toFiniteOfferNumber(offer.driverPayout);
  const moneyDisplay = resolveDriverOfferMoneyDisplay(offer);
  const vehicleTypeLabel = formatOfferVehicleType(offer.category);
  const paymentMethodLabel = formatOfferPaymentMethod(offer.paymentMethod);
  const remainingTimeLabel = offer.reservationExpiresAt
    ? formatReservationCountdown(offer.reservationExpiresAt, reservationNow)
    : "À confirmer";

  // Professional staggered entry for new offers.
  const slideY = useRef(new Animated.Value(32)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const delay = index * 60; // 60ms stagger between cards
    let animation: Animated.CompositeAnimation | null = null;
    const timer = setTimeout(() => {
      slideY.stopAnimation();
      opacity.stopAnimation();
      slideY.setValue(32);
      opacity.setValue(0);

      animation = Animated.parallel([
        Animated.spring(slideY, {
          toValue: 0,
          tension: 60,
          friction: 8,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
      ]);
      animation.start();
    }, delay);
    return () => {
      clearTimeout(timer);
      animation?.stop();
      slideY.stopAnimation();
      opacity.stopAnimation();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Animated.View
      style={[
        styles.wrap,
        isFresh && styles.wrapFresh,
        { opacity, transform: [{ translateY: slideY }] },
      ]}
    >
      {/* Fresh badge */}
      {isFresh ? (
        <View style={styles.freshBadge}>
          <Text style={styles.freshBadgeText}>Nouvelle</Text>
        </View>
      ) : null}

      {/* Header: rider info · fare + vehicle */}
      <View style={styles.header}>
        <PersonBadge
          name={offer.riderName}
          subtitle={`${offer.pickup} → ${offer.destination}`}
          size={42}
          style={styles.personBadge}
        />
        <View style={styles.fareCol}>
          <Text style={styles.fareLabel}>{moneyDisplay.label}</Text>
          <Text style={styles.fare}>{moneyDisplay.amountLabel}</Text>
          <Text style={styles.vehicleLabel}>{vehicleTypeLabel}</Text>
          <VehicleIcon category={offer.category} />
        </View>
      </View>

      <View style={styles.routePanel}>
        <View style={styles.routePoint}>
          <Text style={styles.routeLabel}>Départ</Text>
          <Text style={styles.routeText} numberOfLines={2}>
            {offer.pickup}
          </Text>
        </View>
        <View style={styles.routePoint}>
          <Text style={styles.routeLabel}>Destination</Text>
          <Text style={styles.routeText} numberOfLines={2}>
            {offer.destination}
          </Text>
        </View>
      </View>

      {/* Metrics: pickup distance · arrival estimate · trip distance · net (if available) */}
      <OrbiSurface style={styles.metrics}>
        <View style={styles.metric}>
          <Text style={styles.metricVal}>
            {formatDriverOfferDistance(offer.pickupDistanceKm, "–")}
          </Text>
          <Text style={styles.metricLbl}>Prise en charge</Text>
        </View>
        <View style={styles.sep} />
        <View style={styles.metric}>
          <Text style={styles.metricVal}>
            {formatDriverOfferMinutes(offer.etaToPickupMinutes, "–")}
          </Text>
          <Text style={styles.metricLbl}>Arrivée</Text>
        </View>
        <View style={styles.sep} />
        <View style={styles.metric}>
          <Text style={styles.metricVal}>
            {formatDriverOfferDistance(offer.distanceKm, "–")}
          </Text>
          <Text style={styles.metricLbl}>Trajet</Text>
        </View>
        {driverPayout !== null ? (
          <>
            <View style={styles.sep} />
            <View style={styles.metric}>
              <Text style={[styles.metricVal, styles.metricValNet]}>
                {formatDriverOfferMoney(driverPayout)}
              </Text>
              <Text style={styles.metricLbl}>Gain net</Text>
            </View>
          </>
        ) : null}
      </OrbiSurface>

      <View style={styles.infoGrid}>
        <View style={styles.infoItem}>
          <Text style={styles.infoLabel}>Véhicule</Text>
          <Text style={styles.infoValue}>{vehicleTypeLabel}</Text>
        </View>
        <View style={styles.infoItem}>
          <Text style={styles.infoLabel}>Paiement</Text>
          <Text style={styles.infoValue}>{paymentMethodLabel}</Text>
        </View>
        <View style={styles.infoItem}>
          <Text style={styles.infoLabel}>Temps restant</Text>
          <Text style={styles.infoValue}>{remainingTimeLabel}</Text>
        </View>
      </View>

      <View
        style={[
          styles.decisionPanel,
          decision.tone === "amber"
            ? styles.decisionPanelAmber
            : decision.tone === "rose"
              ? styles.decisionPanelRose
              : styles.decisionPanelTeal,
        ]}
      >
        <Text style={styles.decisionTitle} numberOfLines={2}>
          {decision.title}
        </Text>
        <Text style={styles.decisionSubtitle} numberOfLines={2}>
          {decision.subtitle}
        </Text>
      </View>

      {/* Reservation expiry */}
      {offer.reservationExpiresAt ? (
        <Text style={styles.expiry}>
          Temps restant : {remainingTimeLabel}
        </Text>
      ) : null}

      {/* Accept / decline */}
      <View style={styles.actions}>
        <OrbiButton
          label={hasActiveTrip ? "Course active" : "Accepter"}
          onPress={() => onAccept(offer.id)}
          disabled={isDisabled}
          tone="teal"
          style={styles.acceptBtn}
        />
        <OrbiButton
          label="Refuser"
          onPress={() => onDecline(offer.id)}
          disabled={isDisabled}
          variant="secondary"
          tone="danger"
          style={styles.declineBtn}
          labelStyle={styles.declineLabel}
        />
      </View>
    </Animated.View>
  );
});

const makeStyles = (theme: OrbiTheme) => StyleSheet.create({
  wrap: {
    backgroundColor: "#FFFFFF",
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#E8E8E8",
    padding: 13,
    gap: 10,
  },
  wrapFresh: {
    borderColor: "#111111",
    backgroundColor: "#FFFFFF",
  },
  freshBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#111111",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  freshBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
  },
  header: { flexDirection: "row", alignItems: "center", gap: 10 },
  personBadge: { flex: 1 },
  fareCol: { alignItems: "flex-end", gap: 4 },
  fareLabel: {
    fontSize: 10,
    fontWeight: "800",
    fontFamily: "Inter_700Bold",
    color: "#6B6B6B",
    textTransform: "uppercase",
  },
  fare: { fontSize: 17, fontWeight: "800", fontFamily: "Inter_700Bold", color: "#111111" },
  vehicleLabel: {
    fontSize: 11,
    fontWeight: "800",
    fontFamily: "Inter_700Bold",
    color: "#111111",
  },
  routePanel: {
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#E8E8E8",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 7,
  },
  routePoint: { gap: 2 },
  routeLabel: {
    fontSize: 10,
    fontWeight: "800",
    fontFamily: "Inter_700Bold",
    color: "#6B6B6B",
    textTransform: "uppercase",
  },
  routeText: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
    color: "#111111",
  },
  metrics: {
    flexDirection: "row",
    padding: 8,
    backgroundColor: "#F7F7F7",
    borderColor: "#E8E8E8",
    borderRadius: 4,
  },
  metric: { flex: 1, alignItems: "center", gap: 2 },
  metricVal: { fontSize: 14, fontWeight: "700", fontFamily: "Inter_700Bold", color: "#111111" },
  metricValNet: { color: "#111111" },
  metricLbl: {
    fontSize: 10,
    color: "#6B6B6B",
    fontFamily: "Inter_400Regular",
    textTransform: "uppercase",
    letterSpacing: 0,
  },
  sep: { width: 1, backgroundColor: "#E8E8E8", alignSelf: "stretch" },
  infoGrid: { flexDirection: "row", gap: 7 },
  infoItem: {
    flex: 1,
    minHeight: 48,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#E8E8E8",
    backgroundColor: "#F7F7F7",
    paddingHorizontal: 8,
    paddingVertical: 7,
    gap: 2,
    justifyContent: "center",
  },
  infoLabel: {
    fontSize: 9,
    fontWeight: "800",
    fontFamily: "Inter_700Bold",
    color: "#6B6B6B",
    textTransform: "uppercase",
  },
  infoValue: {
    fontSize: 12,
    fontWeight: "800",
    fontFamily: "Inter_700Bold",
    color: "#111111",
  },
  expiry: { fontSize: 12, fontWeight: "600", fontFamily: "Inter_600SemiBold", color: "#6B6B6B" },
  decisionPanel: {
    borderRadius: 4,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 3,
  },
  decisionPanelTeal: {
    backgroundColor: "#F7F7F7",
    borderColor: "#E8E8E8",
  },
  decisionPanelAmber: {
    backgroundColor: "#F7F7F7",
    borderColor: "#E8E8E8",
  },
  decisionPanelRose: {
    backgroundColor: "#F7F7F7",
    borderColor: "#E8E8E8",
  },
  decisionTitle: {
    fontSize: 13,
    fontWeight: "800",
    fontFamily: "Inter_700Bold",
    color: "#111111",
  },
  decisionSubtitle: {
    fontSize: 11,
    lineHeight: 15,
    fontFamily: "Inter_400Regular",
    color: "#5F5F5F",
  },
  actions: { flexDirection: "row", gap: 10 },
  acceptBtn: {
    flex: 1,
    backgroundColor: "#111111",
    borderRadius: 6,
  },
  declineBtn: {
    width: 126,
    backgroundColor: "#FFFFFF",
    borderColor: "#E8E8E8",
    borderRadius: 6,
  },
  declineLabel: {
    fontSize: 12,
  },
});
