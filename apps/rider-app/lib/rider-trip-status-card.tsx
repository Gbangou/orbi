/**
 * RiderTripStatusCard — carte de suivi de course pour l'écran d'accueil passager.
 *
 * Regroupe la frise d'étapes (TripStageTracker), les infos chauffeur (PersonBadge)
 * et les actions rapides, pour que l'état de la course soit
 * immédiatement lisible depuis la fiche du bas d'écran (façon Yango/Uber).
 */
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { MyTripsResponse } from '@orbi/api';
import { type OrbiTheme } from '@orbi/ui';
import { PersonBadge, TripStageTracker, useOrbiTheme } from '@orbi/ui/native';

type ActiveTrip = MyTripsResponse['recentTrips'][number];
type ActiveRequest = MyTripsResponse['pendingRequests'][number];

export function buildTripEtaLabel(status: string | undefined): string | null {
  switch (status) {
    case 'MATCHED':
      return 'Chauffeur confirmé · en route';
    case 'DRIVER_ARRIVING':
      return 'Votre chauffeur est arrivé';
    case 'IN_PROGRESS':
      return 'Trajet en cours';
    default:
      return null;
  }
}

function ForwardGlyph({ color }: { color: string }) {
  return (
    <View style={glyphStyles.forwardWrap}>
      <View style={[glyphStyles.forwardLine, glyphStyles.forwardLineTop, { backgroundColor: color }]} />
      <View style={[glyphStyles.forwardLine, glyphStyles.forwardLineBottom, { backgroundColor: color }]} />
    </View>
  );
}

export interface RiderTripStatusCardProps {
  activeTrip: ActiveTrip | null;
  activeRequest: ActiveRequest | null;
  flowTransitionLabel: string | null;
  isShareBusy: boolean;
  isSosBusy: boolean;
  onOpenActivity: () => void;
  onShare: () => void;
  onSos: () => void;
  onCancel: () => void;
  onStop: () => void;
}

export function RiderTripStatusCard({
  activeTrip,
  activeRequest,
  flowTransitionLabel,
  isShareBusy,
  isSosBusy,
  onOpenActivity,
  onShare,
  onSos,
  onCancel,
  onStop,
}: RiderTripStatusCardProps) {
  const theme = useOrbiTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const pickupAddress = activeTrip?.pickupAddress ?? activeRequest?.pickupAddress ?? '';
  const destinationAddress = activeTrip?.destinationAddress ?? activeRequest?.destinationAddress ?? '';
  const etaLabel = activeTrip ? buildTripEtaLabel(activeTrip.status) : null;
  const isArrived = activeTrip?.status === 'DRIVER_ARRIVING';
  const canCancel =
    Boolean(activeRequest) ||
    activeTrip?.status === 'MATCHED' ||
    activeTrip?.status === 'DRIVER_ARRIVING';
  const canStop = activeTrip?.status === 'IN_PROGRESS';

  return (
    <View style={styles.card}>
      <TripStageTracker
        status={activeTrip?.status ?? (activeRequest ? 'REQUESTED' : null)}
        audience="rider"
        style={styles.tracker}
      />

      <Pressable style={styles.routeRow} onPress={onOpenActivity} accessibilityRole="button">
        <View style={styles.routeDot} />
        <View style={styles.routeCopy}>
          <Text style={styles.routeTitle}>{activeTrip ? 'Course en cours' : 'Demande active'}</Text>
          <Text style={styles.routeSub} numberOfLines={1}>
            {pickupAddress} → {destinationAddress}
          </Text>
          {etaLabel ? (
            <Text style={[styles.etaLabel, isArrived && styles.etaLabelArrived]}>{etaLabel}</Text>
          ) : null}
          {flowTransitionLabel ? <Text style={styles.transitionLabel}>{flowTransitionLabel}</Text> : null}
        </View>
        <View style={styles.chevron}>
          <ForwardGlyph color={theme.colors.textInverse} />
        </View>
      </Pressable>

      {activeTrip?.counterpartyName ? (
        <View style={styles.driverRow}>
          <PersonBadge
            name={activeTrip.counterpartyName}
            subtitle={activeTrip.vehicleLabel}
            size={36}
            style={styles.driverBadge}
          />
          {isArrived ? (
            <Text style={styles.driverReadyHint}>Verifiez nom et plaque avant de monter.</Text>
          ) : null}
        </View>
      ) : null}

      {activeTrip || activeRequest ? (
        <View style={styles.quickActions}>
          {activeTrip ? (
            <Pressable
              accessibilityLabel="home-share-trip"
              disabled={isShareBusy}
              onPress={onShare}
              style={({ pressed }) => [
                styles.quickAction,
                pressed ? styles.quickActionPressed : null,
                isShareBusy ? styles.quickActionDisabled : null,
              ]}
            >
              <Text style={styles.quickActionLabel}>{isShareBusy ? 'Creation...' : 'Partager'}</Text>
            </Pressable>
          ) : null}
          {activeTrip ? (
            <Pressable
              accessibilityLabel="home-sos-trip"
              disabled={isSosBusy}
              onPress={onSos}
              style={({ pressed }) => [
                styles.quickAction,
                styles.quickActionDanger,
                pressed ? styles.quickActionPressed : null,
                isSosBusy ? styles.quickActionDisabled : null,
              ]}
            >
              <Text style={[styles.quickActionLabel, styles.quickActionDangerLabel]}>
                {isSosBusy ? 'SOS...' : 'SOS securite'}
              </Text>
            </Pressable>
          ) : null}
          {canCancel ? (
            <Pressable
              accessibilityLabel="home-cancel-flow"
              onPress={onCancel}
              style={({ pressed }) => [
                styles.quickAction,
                styles.quickActionDanger,
                pressed ? styles.quickActionPressed : null,
              ]}
            >
              <Text style={[styles.quickActionLabel, styles.quickActionDangerLabel]}>Annuler</Text>
            </Pressable>
          ) : null}
          {canStop ? (
            <Pressable
              accessibilityLabel="home-stop-trip"
              onPress={onStop}
              style={({ pressed }) => [
                styles.quickAction,
                styles.quickActionDanger,
                pressed ? styles.quickActionPressed : null,
              ]}
            >
              <Text style={[styles.quickActionLabel, styles.quickActionDangerLabel]}>Arreter</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const makeStyles = (theme: OrbiTheme) =>
  StyleSheet.create({
    card: {
      gap: 12,
    },
    tracker: {
      paddingHorizontal: 4,
    },
    routeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: theme.colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.colors.borderSoft,
      padding: 12,
    },
    routeDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: theme.colors.teal,
      flexShrink: 0,
    },
    routeCopy: {
      flex: 1,
      gap: 2,
    },
    routeTitle: {
      fontSize: 14,
      fontWeight: '800',
      fontFamily: 'Inter_700Bold',
      color: theme.colors.text,
    },
    routeSub: {
      fontSize: 12,
      fontFamily: 'Inter_400Regular',
      color: theme.colors.textMuted,
    },
    etaLabel: {
      fontSize: 12,
      fontWeight: '700',
      fontFamily: 'Inter_700Bold',
      color: theme.colors.teal,
      marginTop: 2,
    },
    etaLabelArrived: {
      color: theme.colors.amber,
    },
    transitionLabel: {
      fontSize: 11,
      fontFamily: 'Inter_400Regular',
      color: theme.colors.textMuted,
      marginTop: 2,
    },
    chevron: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: theme.colors.text,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    driverRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    driverBadge: {
      flex: 1,
    },
    driverReadyHint: {
      flex: 1,
      fontSize: 11,
      lineHeight: 15,
      fontFamily: 'Inter_700Bold',
      color: theme.colors.successDark,
    },
    quickActions: {
      flexDirection: 'row',
      gap: 8,
    },
    quickAction: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 10,
      borderRadius: 12,
      backgroundColor: theme.colors.backgroundAlt,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    quickActionDanger: {
      backgroundColor: 'rgba(240, 68, 94, 0.10)',
      borderColor: 'rgba(240, 68, 94, 0.28)',
    },
    quickActionPressed: {
      opacity: 0.85,
    },
    quickActionDisabled: {
      opacity: 0.5,
    },
    quickActionLabel: {
      fontSize: 12,
      fontWeight: '800',
      fontFamily: 'Inter_700Bold',
      color: theme.colors.text,
    },
    quickActionDangerLabel: {
      color: theme.colors.danger,
    },
  });

const glyphStyles = StyleSheet.create({
  forwardWrap: {
    width: 12,
    height: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  forwardLine: {
    position: 'absolute',
    width: 7,
    height: 2,
    borderRadius: 1,
  },
  forwardLineTop: {
    transform: [{ rotate: '45deg' }, { translateY: -2 }],
  },
  forwardLineBottom: {
    transform: [{ rotate: '-45deg' }, { translateY: 2 }],
  },
});
