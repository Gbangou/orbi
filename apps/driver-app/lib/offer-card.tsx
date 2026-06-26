import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { formatXof, orbiTheme } from "@orbi/ui";
import type { DriverOffer } from "@orbi/api";
import {
  buildDriverOfferConfidenceExplainer,
  buildDriverOfferDetailLines,
  formatDriverOfferFare,
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

function formatDistanceKm(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value)
    ? `${value.toFixed(1)} km`
    : "–";
}

// ── Vehicle icon (pure View shapes, no external dependency) ──────────────────

function VehicleIcon({ category }: { category: DriverOffer["category"] }) {
  const isMoto = category === "motorcycle";
  const color = isMoto ? orbiTheme.colors.teal : orbiTheme.colors.sky;
  return (
    <View style={[iconStyles.wrap, { borderColor: color + "66" }]}>
      {isMoto ? (
        <View style={iconStyles.motoRow}>
          <View style={[iconStyles.wheel, { borderColor: color }]} />
          <View style={[iconStyles.motoSeat, { backgroundColor: color }]} />
          <View style={[iconStyles.wheel, { borderColor: color }]} />
        </View>
      ) : (
        <View style={iconStyles.carStack}>
          <View style={[iconStyles.carCabin, { backgroundColor: color, opacity: 0.7 }]} />
          <View style={[iconStyles.carBody, { backgroundColor: color }]} />
        </View>
      )}
    </View>
  );
}

const iconStyles = StyleSheet.create({
  wrap: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  motoRow: { flexDirection: "row", alignItems: "center", gap: 3 },
  wheel: { width: 8, height: 8, borderRadius: 4, borderWidth: 1.5 },
  motoSeat: { width: 10, height: 5, borderRadius: 2, opacity: 0.85 },
  carStack: { alignItems: "center" },
  carCabin: { width: 12, height: 5, borderTopLeftRadius: 3, borderTopRightRadius: 3, marginBottom: -1 },
  carBody: { width: 20, height: 8, borderRadius: 2 },
});

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
  const color =
    tone === "teal"
      ? orbiTheme.colors.teal
      : tone === "amber"
        ? orbiTheme.colors.amber
        : tone === "sky"
          ? orbiTheme.colors.sky
          : orbiTheme.colors.muted;

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

const confStyles = StyleSheet.create({
  wrap: { borderRadius: 12, borderWidth: 1, padding: 12, gap: 6 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  badgeLabel: { fontSize: 11, fontWeight: "700", fontFamily: "Inter_700Bold" },
  score: { fontSize: 14, fontWeight: "700", fontFamily: "Inter_700Bold" },
  track: { height: 4, borderRadius: 4, backgroundColor: "rgba(0,0,0,0.07)", overflow: "hidden" },
  fill: { height: "100%", borderRadius: 4 },
  explanation: {
    fontSize: 12,
    color: orbiTheme.colors.textSoft,
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
  onAccept: (offerId: string) => void;
  onDecline: (offerId: string) => void;
}

export const OfferCard = memo(function OfferCard({
  offer,
  isFresh,
  reservationNow,
  isSubmitting,
  hasActiveTrip,
  onAccept,
  onDecline,
}: OfferCardProps) {
  const initials = buildInitials(offer.riderName);
  const confidence = buildDriverOfferConfidenceExplainer(offer);
  const detailLines = buildDriverOfferDetailLines(offer);
  const isDisabled = isSubmitting || hasActiveTrip;

  return (
    <View style={[styles.wrap, isFresh && styles.wrapFresh]}>
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
      <View style={styles.metrics}>
        <View style={styles.metric}>
          <Text style={styles.metricVal}>{formatDistanceKm(offer.pickupDistanceKm)}</Text>
          <Text style={styles.metricLbl}>Pickup</Text>
        </View>
        <View style={styles.sep} />
        <View style={styles.metric}>
          <Text style={styles.metricVal}>{Math.round(offer.etaToPickupMinutes)} min</Text>
          <Text style={styles.metricLbl}>ETA</Text>
        </View>
        <View style={styles.sep} />
        <View style={styles.metric}>
          <Text style={styles.metricVal}>{formatDistanceKm(offer.distanceKm)}</Text>
          <Text style={styles.metricLbl}>Trajet</Text>
        </View>
        {typeof offer.driverPayout === "number" ? (
          <>
            <View style={styles.sep} />
            <View style={styles.metric}>
              <Text style={[styles.metricVal, styles.metricValNet]}>
                {formatXof(offer.driverPayout)}
              </Text>
              <Text style={styles.metricLbl}>Net</Text>
            </View>
          </>
        ) : null}
      </View>

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
            <Text key={i} style={styles.detailLine}>{line}</Text>
          ))}
        </View>
      ) : null}

      {/* Accept / decline */}
      <View style={styles.actions}>
        <Pressable
          onPress={() => onAccept(offer.id)}
          disabled={isDisabled}
          style={({ pressed }) => [
            styles.acceptBtn,
            isDisabled && styles.btnDisabled,
            pressed && styles.btnPressed,
          ]}
        >
          <Text style={styles.acceptLabel}>
            {hasActiveTrip ? "Course active" : "Accepter cette offre"}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => onDecline(offer.id)}
          disabled={isDisabled}
          style={({ pressed }) => [
            styles.declineBtn,
            isDisabled && styles.btnDisabled,
            pressed && styles.btnPressed,
          ]}
        >
          <Text style={styles.declineLabel}>Refuser cette offre</Text>
        </Pressable>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: orbiTheme.colors.border,
    padding: 16,
    gap: 12,
    ...orbiTheme.shadows.card,
  },
  wrapFresh: {
    borderColor: orbiTheme.colors.teal,
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
    color: orbiTheme.colors.teal,
  },
  header: { flexDirection: "row", alignItems: "center", gap: 10 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: orbiTheme.colors.amber,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 15, fontWeight: "700", fontFamily: "Inter_700Bold", color: "#FFFFFF" },
  info: { flex: 1, gap: 2 },
  riderName: { fontSize: 15, fontWeight: "700", fontFamily: "Inter_700Bold", color: orbiTheme.colors.text },
  route: { fontSize: 12, color: orbiTheme.colors.textSoft, fontFamily: "Inter_400Regular" },
  fareCol: { alignItems: "flex-end", gap: 4 },
  fare: { fontSize: 17, fontWeight: "800", fontFamily: "Inter_700Bold", color: orbiTheme.colors.amber },
  metrics: {
    flexDirection: "row",
    backgroundColor: orbiTheme.colors.backgroundAlt,
    borderRadius: 12,
    padding: 10,
  },
  metric: { flex: 1, alignItems: "center", gap: 2 },
  metricVal: { fontSize: 14, fontWeight: "700", fontFamily: "Inter_700Bold", color: orbiTheme.colors.text },
  metricValNet: { color: orbiTheme.colors.amber },
  metricLbl: {
    fontSize: 10,
    color: orbiTheme.colors.textMuted,
    fontFamily: "Inter_400Regular",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  sep: { width: 1, backgroundColor: orbiTheme.colors.border, alignSelf: "stretch" },
  expiry: { fontSize: 12, fontWeight: "600", fontFamily: "Inter_600SemiBold", color: orbiTheme.colors.amber },
  actions: { flexDirection: "row", gap: 10 },
  acceptBtn: {
    flex: 1,
    backgroundColor: orbiTheme.colors.text,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    ...orbiTheme.shadows.button,
  },
  declineBtn: {
    width: 50,
    backgroundColor: orbiTheme.colors.backgroundAlt,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: orbiTheme.colors.border,
  },
  acceptLabel: { fontSize: 15, fontWeight: "700", fontFamily: "Inter_700Bold", color: "#FFFFFF" },
  declineLabel: { fontSize: 16, fontWeight: "700", color: orbiTheme.colors.textMuted },
  btnDisabled: { opacity: 0.38 },
  btnPressed: { opacity: 0.82 },
  detailLines: { gap: 2, paddingTop: 2 },
  detailLine: {
    fontSize: 11,
    color: orbiTheme.colors.textMuted,
    fontFamily: "Inter_400Regular",
    lineHeight: 16,
  },
});
