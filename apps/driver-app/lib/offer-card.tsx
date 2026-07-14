import { memo, useEffect, useMemo, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { type OrbiTheme } from "@orbi/ui";
import { OrbiButton, OrbiSurface, useOrbiTheme, VehicleIllustration } from "@orbi/ui/native";
import type { DriverOffer } from "@orbi/api";
import {
  buildDriverOfferConfidenceExplainer,
  buildDriverOfferDetailLines,
  formatDriverOfferDistance,
  formatDriverOfferFare,
  formatDriverOfferMoney,
  formatDriverOfferMinutes,
  toFiniteOfferNumber,
} from "./offer-signal";
import { formatReservationCountdown } from "./offer-reservation";

function buildInitials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w.charAt(0).toUpperCase())
      .join("") || "OR"
  );
}

// ── Vehicle icon — premium isometric SVG illustration ────────────────────────

function VehicleIcon({ category }: { category: DriverOffer["category"] }) {
  const tier = category === "motorcycle" ? "moto-standard" : "car-standard";
  return <VehicleIllustration tier={tier} width={56} height={40} />;
}

// ── Confidence bar ────────────────────────────────────────────────────────────

function ConfidenceBar({
  badge,
  score,
  barPercent,
  explanation,
  windowLabel,
  tone,
}: {
  badge: string;
  score: number;
  barPercent: number;
  explanation: string;
  windowLabel: string;
  tone: string;
}) {
  const theme = useOrbiTheme();
  const confStyles = useMemo(() => makeConfStyles(theme), [theme]);
  const color =
    tone === "teal"
      ? theme.colors.teal
      : tone === "amber"
        ? theme.colors.amber
        : tone === "sky"
          ? theme.colors.sky
          : theme.colors.muted;

  return (
    <View style={[confStyles.wrap, { borderColor: color + "44" }]}>
      <View style={confStyles.header}>
        <View style={[confStyles.badge, { backgroundColor: color + "22", borderColor: color }]}>
          <Text style={[confStyles.badgeLabel, { color }]}>{badge}</Text>
        </View>
        <Text style={[confStyles.score, { color }]}>{score}/100</Text>
      </View>
      <View style={confStyles.track}>
        <View
          style={[
            confStyles.fill,
            { width: `${barPercent}%` as `${number}%`, backgroundColor: color },
          ]}
        />
      </View>
      <Text style={confStyles.explanation}>{explanation}</Text>
      <Text style={[confStyles.window, { color }]}>{windowLabel}</Text>
    </View>
  );
}

const makeConfStyles = (theme: OrbiTheme) => StyleSheet.create({
  wrap: { borderRadius: 12, borderWidth: 1, padding: 12, gap: 6 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  badgeLabel: { fontSize: 11, fontWeight: "700", fontFamily: "Inter_700Bold" },
  score: { fontSize: 14, fontWeight: "700", fontFamily: "Inter_700Bold" },
  track: { height: 4, borderRadius: 4, backgroundColor: "rgba(0,0,0,0.07)", overflow: "hidden" },
  fill: { height: "100%", borderRadius: 4 },
  explanation: {
    fontSize: 12,
    color: theme.colors.textSoft,
    fontFamily: "Inter_400Regular",
    lineHeight: 17,
  },
  window: { fontSize: 11, fontFamily: "Inter_400Regular" },
});

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
  const initials = buildInitials(offer.riderName);
  const confidence = buildDriverOfferConfidenceExplainer(offer);
  const detailLines = buildDriverOfferDetailLines(offer);
  const isDisabled = isSubmitting || hasActiveTrip;
  const driverPayout = toFiniteOfferNumber(offer.driverPayout);

  // Spring slide-in animation — staggered by index
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
          useNativeDriver: false,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 220,
          useNativeDriver: false,
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

      {/* Header: rider avatar · info · fare + vehicle */}
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <View style={styles.info}>
          <Text style={styles.riderName}>{offer.riderName}</Text>
          <Text style={styles.route} numberOfLines={1}>
            {offer.pickup} → {offer.destination}
          </Text>
        </View>
        <View style={styles.fareCol}>
          <Text style={styles.fare}>{formatDriverOfferFare(offer)}</Text>
          <VehicleIcon category={offer.category} />
        </View>
      </View>

      {/* Metrics: pickup distance · ETA · trip distance · net (if available) */}
      <OrbiSurface style={styles.metrics}>
        <View style={styles.metric}>
          <Text style={styles.metricVal}>
            {formatDriverOfferDistance(offer.pickupDistanceKm, "–")}
          </Text>
          <Text style={styles.metricLbl}>Pickup</Text>
        </View>
        <View style={styles.sep} />
        <View style={styles.metric}>
          <Text style={styles.metricVal}>
            {formatDriverOfferMinutes(offer.etaToPickupMinutes, "–")}
          </Text>
          <Text style={styles.metricLbl}>ETA</Text>
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
              <Text style={styles.metricLbl}>Net</Text>
            </View>
          </>
        ) : null}
      </OrbiSurface>

      {/* Reservation expiry */}
      {offer.reservationExpiresAt ? (
        <Text style={styles.expiry}>
          Expire {formatReservationCountdown(offer.reservationExpiresAt, reservationNow)}
        </Text>
      ) : null}

      {/* Confidence signal */}
      {confidence ? (
        <ConfidenceBar
          badge={confidence.badge}
          score={confidence.score}
          barPercent={confidence.barPercent}
          explanation={confidence.explanation}
          windowLabel={confidence.windowLabel}
          tone={confidence.tone}
        />
      ) : null}

      {/* Detail lines — dispatch context, confidence, window, learning */}
      {detailLines.length > 0 ? (
        <View style={styles.detailLines}>
          {detailLines.map((line, i) => (
            <Text key={i} style={styles.detailLine} numberOfLines={2} ellipsizeMode="tail">
              {line}
            </Text>
          ))}
        </View>
      ) : null}

      {/* Accept / decline */}
      <View style={styles.actions}>
        <OrbiButton
          label={hasActiveTrip ? "Course active" : "Accepter cette offre"}
          onPress={() => onAccept(offer.id)}
          disabled={isDisabled}
          tone="teal"
          style={styles.acceptBtn}
        />
        <OrbiButton
          label="Refuser cette offre"
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
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 14,
    gap: 10,
    ...theme.shadows.card,
  },
  wrapFresh: {
    borderColor: theme.colors.teal,
    backgroundColor: "rgba(0,201,167,0.03)",
  },
  freshBadge: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(0,201,167,0.12)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  freshBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
    color: theme.colors.teal,
  },
  header: { flexDirection: "row", alignItems: "center", gap: 10 },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: theme.colors.accentDark,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 15, fontWeight: "700", fontFamily: "Inter_700Bold", color: "#FFFFFF" },
  info: { flex: 1, gap: 2 },
  riderName: { fontSize: 15, fontWeight: "700", fontFamily: "Inter_700Bold", color: theme.colors.text },
  route: { fontSize: 12, color: theme.colors.textSoft, fontFamily: "Inter_400Regular" },
  fareCol: { alignItems: "flex-end", gap: 4 },
  fare: { fontSize: 17, fontWeight: "800", fontFamily: "Inter_700Bold", color: theme.colors.text },
  metrics: {
    flexDirection: "row",
    padding: 8,
  },
  metric: { flex: 1, alignItems: "center", gap: 2 },
  metricVal: { fontSize: 14, fontWeight: "700", fontFamily: "Inter_700Bold", color: theme.colors.text },
  metricValNet: { color: theme.colors.amber },
  metricLbl: {
    fontSize: 10,
    color: theme.colors.textMuted,
    fontFamily: "Inter_400Regular",
    textTransform: "uppercase",
    letterSpacing: 0,
  },
  sep: { width: 1, backgroundColor: theme.colors.border, alignSelf: "stretch" },
  expiry: { fontSize: 12, fontWeight: "600", fontFamily: "Inter_600SemiBold", color: theme.colors.amber },
  actions: { flexDirection: "row", gap: 10 },
  acceptBtn: {
    flex: 1,
  },
  declineBtn: {
    width: 136,
  },
  declineLabel: {
    fontSize: 12,
  },
  detailLines: { gap: 3, paddingTop: 2 },
  detailLine: {
    fontSize: 11,
    color: theme.colors.textMuted,
    fontFamily: "Inter_400Regular",
    lineHeight: 16,
  },
});
