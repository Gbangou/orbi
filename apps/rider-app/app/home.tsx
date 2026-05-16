import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  fetchMyTrips,
  fetchRideOptionsPreview,
  riderRideOptions,
  type MyTripsResponse,
  type RideOption,
} from '@orbi/api';
import {
  describeRealtimeEvent,
  describeRealtimeConnection,
  formatRealtimeBadgeLabel,
  formatXof,
  orbiCopy,
  orbiTheme,
} from '@orbi/ui';
import {
  DashboardMetricCard,
  LiveHeroCard,
  MetricTile,
  QuickActionCard,
  RouteSignalCard,
} from '../lib/realtime-widgets';
import { RiderJourneySection } from '../lib/rider-journey';
import { restoreRiderSession } from '../lib/auth';
import { useLiveRefresh } from '../lib/use-live-refresh';
import { useRiderRealtimeStream } from '../lib/use-rider-realtime-stream';
import { createOrbiApiClient } from '@orbi/api';
import {
  orbiRuntimeConfig,
  resolveOrbiApiBaseUrlForRuntime,
} from '@orbi/config';
import { resolveRiderAppError } from '../lib/session-feedback';
import {
  buildRiderFlowTransitionLabel,
  buildRiderHomeStatusLabel,
  resolveRiderActiveFlow,
} from '../lib/rider-active-flow';

function buildRideOptionInsights(option: RideOption): Array<{
  label: string;
  value: string;
  tone?: 'teal' | 'amber' | 'sky' | 'rose';
}> {
  return [
    {
      label: 'Vehicule',
      value: option.category === 'motorcycle' ? 'Moto' : 'Voiture',
      tone: option.category === 'motorcycle' ? 'teal' : 'amber',
    },
    {
      label: 'Capacite',
      value: option.capacity,
      tone: 'sky',
    },
    {
      label: 'Arrivee',
      value: `${option.etaMinutes} min`,
      tone: 'teal',
    },
  ];
}

function buildRideOptionDetailLines(option: RideOption) {
  const lines = [
    option.paymentMethods?.length
      ? `Paiement: ${option.paymentMethods.join(', ')}`
      : null,
    option.fareBreakdown
      ? `Base ${formatXof(option.fareBreakdown.baseFare)} + frais ${formatXof(option.fareBreakdown.bookingFee)}`
      : null,
    option.fareBreakdown?.driverPickupDistanceIncludedInFare === false
      ? 'Approche chauffeur: dispatch et ETA, sans frais cache'
      : null,
  ];

  return lines.filter((line): line is string => Boolean(line));
}

export default function RiderHomeScreen() {
  const router = useRouter();
  const [options, setOptions] = useState<RideOption[]>(riderRideOptions);
  const [history, setHistory] = useState<MyTripsResponse | null>(null);
  const [statusLabel, setStatusLabel] = useState('Connexion du compte passager de demonstration...');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isRealtimeSyncing, setIsRealtimeSyncing] = useState(false);
  const [flowTransitionLabel, setFlowTransitionLabel] = useState<string | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const previousFlowStateRef = useRef<string | null>(null);

  const loadHomeContext = useCallback(async (silent = false) => {
    const client = createOrbiApiClient(resolveOrbiApiBaseUrlForRuntime(), {
      version: orbiRuntimeConfig.apiVersion,
    });

    if (!silent) {
      setIsRefreshing(true);
    }

    try {
      const { authClient, me, session } = await restoreRiderSession();
      setSessionToken(session.sessionToken);
      const [response, historyResponse] = await Promise.all([
        fetchRideOptionsPreview(client, {
          distanceKm: 5.8,
          durationMinutes: 16,
          vehicleType: 'MOTORCYCLE',
          paymentMethod: 'MOBILE_MONEY',
          zone: 'URBAN_CORE',
          isPeakHour: true,
          activeDriverCount: 8,
          openRequestCount: 11,
        }),
        fetchMyTrips(authClient),
      ]);

      setOptions(response.options);
      setHistory(historyResponse);
      const flow = resolveRiderActiveFlow(historyResponse);

      if (!silent) {
        setStatusLabel(
          buildRiderHomeStatusLabel({
            flow,
            fullName: me.user.fullName,
            optionCount: response.options.length,
          }),
        );
      }
    } catch (error) {
      const feedback = await resolveRiderAppError(error, {
        network: 'Preview locale active en attendant la connexion API.',
      });

      if (feedback.shouldClearSessionToken) {
        setSessionToken(null);
      }

      if (!silent) {
        setStatusLabel(feedback.message);
      }
    } finally {
      if (silent) {
        setIsRealtimeSyncing(false);
      }
      if (!silent) {
        setIsRefreshing(false);
      }
    }
  }, []);

  useLiveRefresh(() => loadHomeContext(true), 25000);
  useRiderRealtimeStream(
    sessionToken,
    (eventType) => {
      setIsRealtimeSyncing(true);
      setStatusLabel(describeRealtimeEvent('rider', eventType));
      void loadHomeContext(true);
    },
    {
      onHeartbeat: () => {
        setStatusLabel(describeRealtimeConnection('rider', 'active'));
      },
      onOpen: () => {
        setIsRealtimeSyncing(false);
        setStatusLabel(describeRealtimeConnection('rider', 'connected'));
      },
      onError: () => {
        setIsRealtimeSyncing(false);
        setStatusLabel(describeRealtimeConnection('rider', 'reconnecting'));
      },
    },
  );

  const flow = resolveRiderActiveFlow(history);
  const { activeTrip, activeRequest, activeFlowState, primaryStatusLabel } = flow;

  useEffect(() => {
    const previousFlowState = previousFlowStateRef.current;
    setFlowTransitionLabel(
      buildRiderFlowTransitionLabel(previousFlowState, activeFlowState, 'home'),
    );

    previousFlowStateRef.current = activeFlowState;
  }, [activeFlowState]);

  useEffect(() => {
    if (!flowTransitionLabel) {
      return;
    }

    const timeout = setTimeout(() => {
      setFlowTransitionLabel(null);
    }, 5000);

    return () => clearTimeout(timeout);
  }, [flowTransitionLabel]);

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <Text style={styles.eyebrow}>Orbi Passager</Text>
      <Text style={styles.title}>{orbiCopy.riderHeadline}</Text>
      <Text style={styles.body}>
        Commandez moto et voiture depuis une seule experience premium pour Android, iPhone et web.
      </Text>

      <LiveHeroCard
        eyebrow="Trajet actuel"
        isHighlighted={Boolean(flowTransitionLabel)}
        liveLabel={formatRealtimeBadgeLabel('Suivi direct', isRealtimeSyncing)}
        liveTone={isRealtimeSyncing ? 'sky' : 'teal'}
        message={statusLabel}
        syncMessage={
          isRealtimeSyncing
            ? 'Resynchronisation en cours apres une mise a jour temps reel.'
            : null
        }
        title={
          activeTrip
            ? `${activeTrip.pickupAddress} vers ${activeTrip.destinationAddress}`
            : activeRequest
              ? `${activeRequest.pickupAddress} vers ${activeRequest.destinationAddress}`
              : 'Universite Joseph Ki-Zerbo vers Ouaga 2000'
        }
        transitionMessage={flowTransitionLabel}
      >
        <View style={styles.heroStats}>
          <MetricTile
            label="Flux"
            value={flow.hasOpenFlow ? primaryStatusLabel : 'Pret'}
          />
          <MetricTile
            label="Historique"
            value={`${history?.stats.completedTrips ?? 0} courses`}
          />
        </View>
        {activeTrip ? (
          <>
            <Text style={styles.heroSafety}>
              Partage de trajet actif. Code de prise en charge a verifier avant le depart.
            </Text>
            {activeTrip.pickupCode ? (
              <Text style={styles.heroCode}>Code de prise en charge: {activeTrip.pickupCode}</Text>
            ) : null}
          </>
        ) : null}
        <Pressable
          onPress={() => void loadHomeContext()}
          style={[styles.inlineButton, isRefreshing ? styles.inlineButtonDisabled : null]}
          disabled={isRefreshing}
        >
          <Text style={styles.inlineButtonLabel}>
            {isRefreshing ? 'Actualisation...' : 'Actualiser les donnees'}
          </Text>
        </Pressable>
      </LiveHeroCard>

      <View style={styles.primaryActions}>
        <QuickActionCard
          eyebrow="Reservation"
          title="Reserver maintenant"
          description={
            flow.hasOpenFlow
              ? 'Consulter le flux actif avant de creer une nouvelle demande.'
              : 'Choisir un trajet, un service et un paiement.'
          }
          tone="teal"
          emphasis="primary"
          onPress={() => router.push('/book')}
        />
        <QuickActionCard
          eyebrow="Suivi"
          title="Voir l activite"
          description="Suivre la course, la timeline et les incidents."
          tone="sky"
          onPress={() => router.push('/activity')}
        />
      </View>

      <View style={styles.metricsRow}>
        <DashboardMetricCard
          label="Actif"
          value={String(history?.stats.activeTrips ?? 0)}
          helper="trajet ou demande en cours"
          tone="teal"
        />
        <DashboardMetricCard
          label="Completes"
          value={String(history?.stats.completedTrips ?? 0)}
          helper="courses terminees"
          tone="sky"
        />
      </View>

      <Text style={styles.sectionTitle}>Services recommandes</Text>
      {options.map((option) => (
        <RouteSignalCard
          key={option.id}
          eyebrow="Service recommande"
          badgeLabel={option.badge ?? null}
          badgeTone={option.category === 'motorcycle' ? 'teal' : 'amber'}
          title={option.title}
          titleAside={formatXof(option.fare)}
          titleAsideColor={option.accent}
          description={`Trajet estime avec ${option.category === 'motorcycle' ? 'moto' : 'voiture'} premium, disponible rapidement depuis votre zone.`}
          insights={buildRideOptionInsights(option)}
          detailLines={buildRideOptionDetailLines(option)}
          note={option.safetyNote}
          noteTone="teal"
        />
      ))}

      <RiderJourneySection
        currentStep="home"
        description={
          activeTrip || activeRequest
            ? 'Le tunnel rider reste coherent meme pendant une reservation active, avec les memes CTA du cockpit au suivi.'
            : 'Depuis l accueil, vous pouvez enchainer reservation, voice et suivi avec les memes reperes visuels.'
        }
      />
      <View style={styles.actions}>
        <QuickActionCard
          eyebrow="Compte"
          title="Profil et lieux enregistres"
          description="Gerer vos informations, domiciles et points favoris."
          tone="teal"
          onPress={() => router.push('/account')}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingTop: 88,
    paddingHorizontal: 24,
    paddingBottom: 40,
    backgroundColor: orbiTheme.colors.background,
    gap: 16,
  },
  eyebrow: {
    color: orbiTheme.colors.teal,
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  title: {
    color: orbiTheme.colors.text,
    fontSize: 38,
    lineHeight: 40,
    fontWeight: '800',
  },
  body: {
    color: orbiTheme.colors.muted,
    lineHeight: 23,
    marginBottom: 8,
  },
  heroStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 4,
  },
  heroSafety: {
    color: orbiTheme.colors.teal,
    lineHeight: 19,
  },
  heroCode: {
    color: orbiTheme.colors.text,
    fontWeight: '800',
    fontSize: 18,
    letterSpacing: 2,
  },
  inlineButton: {
    marginTop: 8,
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: orbiTheme.colors.backgroundAlt,
    borderWidth: 1,
    borderColor: orbiTheme.colors.border,
  },
  inlineButtonDisabled: {
    opacity: 0.65,
  },
  inlineButtonLabel: {
    color: orbiTheme.colors.text,
    fontWeight: '700',
    fontSize: 13,
  },
  sectionTitle: {
    color: orbiTheme.colors.text,
    fontSize: 20,
    fontWeight: '700',
    marginTop: 8,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
  },
  primaryActions: {
    gap: 12,
  },
  actions: {
    gap: 12,
    marginTop: 8,
  },
});
