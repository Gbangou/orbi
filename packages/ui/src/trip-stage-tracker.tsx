/**
 * TripStageTracker — indicateur d'étapes du cycle de course.
 *
 * Traduit le statut brut de course/demande (REQUESTED, MATCHED,
 * DRIVER_ARRIVING, IN_PROGRESS, COMPLETED — voir @orbi/domain) en une frise
 * d'étapes lisible, partagée entre rider-app et driver-app, pour que
 * l'utilisateur voie toujours où il en est dans la course.
 */
import { useMemo } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { orbiTheme, type OrbiTheme } from './index';
import { useOrbiTheme } from './theme-context';

export type TripStageKey = 'search' | 'matched' | 'arriving' | 'in_progress' | 'completed';

const RIDER_STAGE_KEYS: TripStageKey[] = ['search', 'matched', 'arriving', 'in_progress', 'completed'];
const DRIVER_STAGE_KEYS: TripStageKey[] = ['matched', 'arriving', 'in_progress', 'completed'];

const RIDER_LABELS: Record<TripStageKey, string> = {
  search: 'Recherche',
  matched: 'En route',
  arriving: 'Arrivée',
  in_progress: 'En course',
  completed: 'Terminé',
};

const DRIVER_LABELS: Record<TripStageKey, string> = {
  search: 'Recherche',
  matched: 'Rejoindre',
  arriving: 'Arrivé',
  in_progress: 'En course',
  completed: 'Terminée',
};

/** Convertit un statut brut de demande/course en clé d'étape du tracker. */
export function resolveTripStageKey(status: string | null | undefined): TripStageKey {
  switch ((status ?? '').toUpperCase()) {
    case 'MATCHED':
      return 'matched';
    case 'DRIVER_ARRIVING':
      return 'arriving';
    case 'IN_PROGRESS':
      return 'in_progress';
    case 'COMPLETED':
      return 'completed';
    default:
      return 'search';
  }
}

export interface TripStageTrackerProps {
  /** Statut brut de la demande/course (ex. 'MATCHED', 'IN_PROGRESS'...). */
  status: string | null | undefined;
  /** Adapte les libellés et masque l'étape "Recherche", absente côté chauffeur. */
  audience?: 'rider' | 'driver';
  style?: StyleProp<ViewStyle>;
}

export function TripStageTracker({ status, audience = 'rider', style }: TripStageTrackerProps) {
  const theme = useOrbiTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const stageKeys = audience === 'driver' ? DRIVER_STAGE_KEYS : RIDER_STAGE_KEYS;
  const labels = audience === 'driver' ? DRIVER_LABELS : RIDER_LABELS;
  const resolvedKey = resolveTripStageKey(status);
  const rawIndex = stageKeys.indexOf(resolvedKey);
  const currentIndex = rawIndex === -1 ? 0 : rawIndex;

  return (
    <View style={style} accessibilityRole="progressbar">
      <View style={styles.trackRow}>
        {stageKeys.map((key, index) => {
          const isDone = index < currentIndex;
          const isCurrent = index === currentIndex;
          const dotColor = isDone || isCurrent ? theme.colors.teal : theme.colors.border;

          return (
            <View key={key} style={styles.trackItem}>
              <View
                style={[
                  styles.dot,
                  { backgroundColor: dotColor },
                  isCurrent && [styles.dotCurrent, { borderColor: theme.colors.teal }],
                ]}
              />
              {index < stageKeys.length - 1 ? (
                <View
                  style={[styles.connector, { backgroundColor: isDone ? theme.colors.teal : theme.colors.border }]}
                />
              ) : null}
            </View>
          );
        })}
      </View>
      <View style={styles.labelRow}>
        {stageKeys.map((key, index) => {
          const isDone = index < currentIndex;
          const isCurrent = index === currentIndex;
          const labelColor = isCurrent ? theme.colors.text : isDone ? theme.colors.textSoft : theme.colors.textMuted;

          return (
            <Text
              key={key}
              numberOfLines={1}
              style={[styles.label, { color: labelColor }, isCurrent && styles.labelCurrent]}
            >
              {labels[key]}
            </Text>
          );
        })}
      </View>
    </View>
  );
}

const makeStyles = (theme: OrbiTheme) =>
  StyleSheet.create({
    trackRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    trackItem: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
    },
    dot: {
      width: 9,
      height: 9,
      borderRadius: 5,
    },
    dotCurrent: {
      width: 13,
      height: 13,
      borderRadius: 7,
      borderWidth: 2,
      backgroundColor: theme.colors.surface,
    },
    connector: {
      flex: 1,
      height: 2,
      marginHorizontal: 2,
      borderRadius: 1,
    },
    labelRow: {
      flexDirection: 'row',
      marginTop: 4,
    },
    label: {
      flex: 1,
      fontSize: 10,
      fontFamily: orbiTheme.typography.fontFamily.semibold,
      textAlign: 'center',
    },
    labelCurrent: {
      fontFamily: orbiTheme.typography.fontFamily.bold,
    },
  });
