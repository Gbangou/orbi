/**
 * RiderTripStatusCard — carte de suivi de course pour l'écran d'accueil passager.
 *
 * Regroupe la frise d'étapes (TripStageTracker), les infos chauffeur (PersonBadge)
 * et les actions rapides, pour que l'état de la course soit
 * immédiatement lisible depuis la fiche du bas d'écran (façon Yango/Uber).
 */
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  canRiderCancelTrip,
  type MyTripsResponse,
} from '@orbi/api';
import { type OrbiTheme } from '@orbi/ui';
import { PersonBadge, TripStageTracker, useOrbiTheme } from '@orbi/ui/native';
import { formatRiderMoneyAmount } from './rider-display-format';

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
}: RiderTripStatusCardProps) {
  const theme = useOrbiTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const pickupAddress = activeTrip?.pickupAddress ?? activeRequest?.pickupAddress ?? '';
  const destinationAddress = activeTrip?.destinationAddress ?? activeRequest?.destinationAddress ?? '';
  const etaLabel = activeTrip ? buildTripEtaLabel(activeTrip.status) : null;
  const isArrived = activeTrip?.status === 'DRIVER_ARRIVING';
  const fareLabel = activeTrip
    ? formatRiderMoneyAmount(activeTrip.amount)
    : activeRequest
      ? formatRiderMoneyAmount(activeRequest.estimatedFare)
      : null;
  const canCancel =
    Boolean(activeRequest) ||
    (activeTrip ? canRiderCancelTrip(activeTrip.status) : false);

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
        {fareLabel ? (
          <View style={styles.farePill}>
            <Text style={styles.farePillLabel}>Prix</Text>
            <Text style={styles.farePillValue}>{fareLabel}</Text>
          </View>
        ) : null}
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
            <Text style={styles.driverReadyHint}>Verifiez nom, plaque et vehicule.</Text>
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
      backgroundColor: '#FFFFFF',
      borderRadius: 4,
      borderWidth: 1,
      borderColor: '#E8E8E8',
      padding: 12,
    },
    routeDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: '#111111',
      flexShrink: 0,
    },
    routeCopy: {
      flex: 1,
      gap: 2,
    },
    farePill: {
      maxWidth: 96,
      flexShrink: 0,
      borderRadius: 4,
      backgroundColor: '#F7F7F7',
      borderWidth: 1,
      borderColor: '#E8E8E8',
      paddingHorizontal: 9,
      paddingVertical: 7,
      alignItems: 'flex-end',
    },
    farePillLabel: {
      fontSize: 9,
      fontWeight: '800',
      fontFamily: 'Inter_700Bold',
      color: '#6B6B6B',
      textTransform: 'uppercase',
    },
    farePillValue: {
      marginTop: 1,
      fontSize: 12,
      fontWeight: '800',
      fontFamily: 'Inter_700Bold',
      color: '#111111',
    },
    routeTitle: {
      fontSize: 14,
      fontWeight: '800',
      fontFamily: 'Inter_700Bold',
      color: '#111111',
    },
    routeSub: {
      fontSize: 12,
      fontFamily: 'Inter_400Regular',
      color: '#6B6B6B',
    },
    etaLabel: {
      fontSize: 12,
      fontWeight: '700',
      fontFamily: 'Inter_700Bold',
      color: '#111111',
      marginTop: 2,
    },
    etaLabelArrived: {
      color: '#111111',
    },
    transitionLabel: {
      fontSize: 11,
      fontFamily: 'Inter_400Regular',
      color: '#6B6B6B',
      marginTop: 2,
    },
    chevron: {
      width: 32,
      height: 32,
      borderRadius: 4,
      backgroundColor: '#111111',
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
      color: '#111111',
    },
    quickActions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    quickAction: {
      flexGrow: 1,
      flexBasis: '47%',
      alignItems: 'center',
      paddingVertical: 10,
      borderRadius: 4,
      backgroundColor: '#F7F7F7',
      borderWidth: 1,
      borderColor: '#E8E8E8',
    },
    quickActionDanger: {
      backgroundColor: '#FFFFFF',
      borderColor: '#111111',
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
      color: '#111111',
    },
    quickActionDangerLabel: {
      color: '#111111',
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
