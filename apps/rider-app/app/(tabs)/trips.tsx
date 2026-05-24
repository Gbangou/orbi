import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { fetchMyTrips, type MyTripsResponse } from '@orbi/api';
import { formatXof, orbiTheme } from '@orbi/ui';
import { restoreRiderSession } from '../../lib/auth';
import { resolveRiderAppError } from '../../lib/session-feedback';

type TripItem = MyTripsResponse['recentTrips'][number];
type RequestItem = MyTripsResponse['pendingRequests'][number];

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { label: string; bg: string; color: string }> = {
    COMPLETED: { label: 'Terminee', bg: 'rgba(34,197,94,0.12)', color: '#86efac' },
    CANCELLED: { label: 'Annulee', bg: 'rgba(248,113,113,0.12)', color: '#fca5a5' },
    IN_PROGRESS: { label: 'En cours', bg: 'rgba(0,199,199,0.12)', color: '#67e8f9' },
    MATCHED: { label: 'Chauffeur trouve', bg: 'rgba(56,189,248,0.12)', color: '#7dd3fc' },
    DRIVER_ARRIVING: { label: 'Chauffeur en route', bg: 'rgba(56,189,248,0.12)', color: '#7dd3fc' },
  };
  const c = cfg[status] ?? { label: status, bg: 'rgba(148,163,184,0.1)', color: orbiTheme.colors.muted };
  return (
    <View style={[styles.badge, { backgroundColor: c.bg }]}>
      <Text style={[styles.badgeText, { color: c.color }]}>{c.label}</Text>
    </View>
  );
}

function TripCard({ trip, onPress }: { trip: TripItem; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed ? styles.cardPressed : null]}
    >
      <View style={styles.cardHeader}>
        <View style={styles.cardRoute}>
          <View style={styles.routePin}>
            <View style={[styles.routeDot, { backgroundColor: orbiTheme.colors.teal }]} />
            <View style={styles.routeVert} />
            <View style={[styles.routeDot, { backgroundColor: orbiTheme.colors.amber }]} />
          </View>
          <View style={styles.routeAddresses}>
            <Text style={styles.addressText} numberOfLines={1}>
              {trip.pickupAddress}
            </Text>
            <Text style={styles.addressText} numberOfLines={1}>
              {trip.destinationAddress}
            </Text>
          </View>
        </View>
        <StatusBadge status={trip.status} />
      </View>

      <View style={styles.cardMeta}>
        <Text style={styles.metaText}>{formatDate(trip.completedAt ?? trip.createdAt)}</Text>
        {trip.vehicleLabel ? (
          <Text style={styles.metaText}>{trip.vehicleLabel}</Text>
        ) : null}
        {trip.counterpartyName ? (
          <Text style={styles.metaText}>{trip.counterpartyName}</Text>
        ) : null}
      </View>

      {trip.amount > 0 ? (
        <View style={styles.cardFare}>
          <Text style={styles.fareAmount}>{formatXof(trip.amount)}</Text>
          <Text style={styles.fareCurrency}>{trip.currency}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

function RequestCard({ request }: { request: RequestItem }) {
  return (
    <View style={[styles.card, styles.cardRequest]}>
      <View style={styles.cardHeader}>
        <View style={styles.cardRoute}>
          <View style={styles.routePin}>
            <View style={[styles.routeDot, { backgroundColor: orbiTheme.colors.sky }]} />
            <View style={styles.routeVert} />
            <View style={[styles.routeDot, { backgroundColor: orbiTheme.colors.amber }]} />
          </View>
          <View style={styles.routeAddresses}>
            <Text style={styles.addressText} numberOfLines={1}>
              {request.pickupAddress}
            </Text>
            <Text style={styles.addressText} numberOfLines={1}>
              {request.destinationAddress}
            </Text>
          </View>
        </View>
        <StatusBadge status={request.status} />
      </View>
      <View style={styles.cardMeta}>
        <Text style={styles.metaText}>{formatDate(request.createdAt)}</Text>
        <Text style={[styles.metaText, { color: orbiTheme.colors.sky }]}>
          Recherche chauffeur...
        </Text>
      </View>
      {request.estimatedFare > 0 ? (
        <View style={styles.cardFare}>
          <Text style={styles.fareAmount}>{formatXof(request.estimatedFare)}</Text>
          <Text style={styles.fareCurrency}>estimé</Text>
        </View>
      ) : null}
    </View>
  );
}

export default function TripsScreen() {
  const router = useRouter();
  const [data, setData] = useState<MyTripsResponse | null>(null);
  const [status, setStatus] = useState('Chargement de l historique...');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadTrips = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const { authClient } = await restoreRiderSession();
      const response = await fetchMyTrips(authClient);
      setData(response);
      const total = response.stats.completedTrips + response.stats.cancelledTrips;
      setStatus(`${total} course${total !== 1 ? 's' : ''} au total · ${response.stats.completedTrips} terminee${response.stats.completedTrips !== 1 ? 's' : ''}`);
    } catch (error) {
      const feedback = await resolveRiderAppError(error, {
        network: 'Impossible de charger l historique. Verifiez la connexion.',
      });
      setStatus(feedback.message);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadTrips();
  }, [loadTrips]);

  const pendingRequests = data?.pendingRequests ?? [];
  const recentTrips = data?.recentTrips ?? [];
  const hasContent = pendingRequests.length > 0 || recentTrips.length > 0;

  return (
    <ScrollView
      contentContainerStyle={styles.screen}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={() => void loadTrips()}
          tintColor={orbiTheme.colors.teal}
          colors={[orbiTheme.colors.teal]}
        />
      }
    >
      <Text style={styles.eyebrow}>Orbi Passager</Text>
      <Text style={styles.title}>Mes trajets</Text>
      <Text style={styles.statusText}>{status}</Text>

      {/* Stats */}
      {data ? (
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: orbiTheme.colors.teal }]}>
              {data.stats.completedTrips}
            </Text>
            <Text style={styles.statLabel}>Terminees</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: orbiTheme.colors.sky }]}>
              {data.stats.activeTrips}
            </Text>
            <Text style={styles.statLabel}>Actives</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: orbiTheme.colors.amber }]}>
              {data.stats.cancelledTrips}
            </Text>
            <Text style={styles.statLabel}>Annulees</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: orbiTheme.colors.text }]}>
              {formatXof(data.stats.totalAmount)}
            </Text>
            <Text style={styles.statLabel}>Total depense</Text>
          </View>
        </View>
      ) : null}

      {/* Demandes en attente */}
      {pendingRequests.length > 0 ? (
        <>
          <Text style={styles.sectionTitle}>En attente de chauffeur</Text>
          {pendingRequests.map((req) => (
            <RequestCard key={req.id} request={req} />
          ))}
        </>
      ) : null}

      {/* Courses récentes */}
      {recentTrips.length > 0 ? (
        <>
          <Text style={styles.sectionTitle}>Courses recentes</Text>
          {recentTrips.map((trip) => (
            <TripCard
              key={trip.id}
              trip={trip}
              onPress={() => {
                if (trip.status === 'COMPLETED') {
                  router.push(`/receipt?tripId=${trip.id}`);
                } else {
                  router.push('/activity');
                }
              }}
            />
          ))}
        </>
      ) : null}

      {!hasContent && !isRefreshing ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Aucune course pour l instant</Text>
          <Text style={styles.emptyBody}>
            Vos trajets apparaissent ici apres votre premiere reservation.
          </Text>
          <Pressable
            style={styles.emptyAction}
            onPress={() => router.push('/book')}
          >
            <Text style={styles.emptyActionLabel}>Reserver maintenant</Text>
          </Pressable>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingTop: 72,
    paddingHorizontal: 18,
    paddingBottom: 40,
    backgroundColor: orbiTheme.colors.background,
    gap: 14,
  },
  eyebrow: {
    color: orbiTheme.colors.teal,
    textTransform: 'uppercase',
    letterSpacing: 2,
    fontSize: 11,
  },
  title: {
    color: orbiTheme.colors.text,
    fontSize: 30,
    fontWeight: '800',
  },
  statusText: {
    color: orbiTheme.colors.muted,
    fontSize: 13,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  statCard: {
    flex: 1,
    minWidth: 70,
    backgroundColor: orbiTheme.colors.backgroundAlt,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: orbiTheme.colors.border,
    padding: 10,
    alignItems: 'center',
    gap: 2,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '800',
  },
  statLabel: {
    color: orbiTheme.colors.muted,
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
  },
  sectionTitle: {
    color: orbiTheme.colors.text,
    fontSize: 16,
    fontWeight: '700',
    marginTop: 4,
  },
  card: {
    backgroundColor: orbiTheme.colors.backgroundAlt,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: orbiTheme.colors.border,
    padding: 14,
    gap: 10,
  },
  cardRequest: {
    borderColor: orbiTheme.colors.sky,
  },
  cardPressed: {
    opacity: 0.75,
    transform: [{ scale: 0.99 }],
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  cardRoute: {
    flex: 1,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  routePin: {
    alignItems: 'center',
    gap: 0,
    paddingTop: 2,
  },
  routeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  routeVert: {
    width: 1.5,
    height: 18,
    backgroundColor: orbiTheme.colors.border,
    marginVertical: 2,
  },
  routeAddresses: {
    flex: 1,
    gap: 6,
  },
  addressText: {
    color: orbiTheme.colors.text,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 16,
  },
  badge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
    flexShrink: 0,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  cardMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metaText: {
    color: orbiTheme.colors.muted,
    fontSize: 11,
  },
  cardFare: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  fareAmount: {
    color: orbiTheme.colors.amber,
    fontSize: 16,
    fontWeight: '800',
  },
  fareCurrency: {
    color: orbiTheme.colors.muted,
    fontSize: 11,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: 48,
    gap: 10,
  },
  emptyTitle: {
    color: orbiTheme.colors.text,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptyBody: {
    color: orbiTheme.colors.muted,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 260,
  },
  emptyAction: {
    marginTop: 8,
    backgroundColor: orbiTheme.colors.teal,
    borderRadius: 12,
    paddingHorizontal: 22,
    paddingVertical: 12,
  },
  emptyActionLabel: {
    color: '#0a0c0e',
    fontWeight: '800',
    fontSize: 14,
  },
});
