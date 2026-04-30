import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, TextInput, View, Text, StyleSheet } from 'react-native';
import {
  createSavedPlaceWithApi,
  deleteSavedPlaceWithApi,
  fetchMyTrips,
  fetchRiderProfile,
  updateSavedPlaceWithApi,
  type MyTripsResponse,
  type RiderProfileResponse,
} from '@mobilis/api';
import { mobilisTheme } from '@mobilis/ui';
import { router } from 'expo-router';
import { restoreRiderSession, signOutRiderAccount } from '../lib/auth';
import { resolveRiderAppError } from '../lib/session-feedback';
import {
  buildRiderFlowTransitionLabel,
  buildRiderPeripheralStatusLabel,
  resolveRiderActiveFlow,
} from '../lib/rider-active-flow';
import {
  InsightBadge,
  LiveStatusBanner,
  MetricTile,
  SectionCard,
  SectionHeading,
} from '../lib/realtime-widgets';
import { RiderJourneySection } from '../lib/rider-journey';
import { useLiveRefresh } from '../lib/use-live-refresh';

const fallbackProfile: RiderProfileResponse = {
  profile: {
    id: 'fallback-rider',
    fullName: 'Awa Ouedraogo',
    email: 'rider@mobilis.app',
    phoneNumber: null,
    preferredTier: 'MOTO_STANDARD',
    emergencyPhone: null,
    savedPlaces: [
      { id: 'home', label: 'Maison', address: 'Ouagadougou, Patte d Oie', latitude: 12.3412, longitude: -1.5601 },
      { id: 'work', label: 'Bureau', address: 'Ouaga 2000', latitude: 12.3274, longitude: -1.5339 },
    ],
    stats: {
      totalRideRequests: 0,
      totalTrips: 0,
      completedTrips: 0,
      savedPlaces: 2,
    },
  },
};

export default function AccountScreen() {
  const [profile, setProfile] = useState<RiderProfileResponse>(fallbackProfile);
  const [history, setHistory] = useState<MyTripsResponse | null>(null);
  const [status, setStatus] = useState('Chargement du profil passager...');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isSavingPlace, setIsSavingPlace] = useState(false);
  const [accountTransitionLabel, setAccountTransitionLabel] = useState<string | null>(null);
  const [freshPlaceIds, setFreshPlaceIds] = useState<string[]>([]);
  const [editingPlaceId, setEditingPlaceId] = useState<string | null>(null);
  const [placeForm, setPlaceForm] = useState({
    label: '',
    address: '',
    latitude: '',
    longitude: '',
  });
  const previousSavedPlacesRef = useRef<RiderProfileResponse['profile']['savedPlaces'] | null>(null);
  const previousFlowStateRef = useRef<string | null>(null);

  useEffect(() => {
    void loadProfile();
  }, []);
  useLiveRefresh(() => loadProfile(true), 45000);

  useEffect(() => {
    const previousSavedPlaces = previousSavedPlacesRef.current;
    const nextSavedPlaces = profile.profile.savedPlaces;

    if (previousSavedPlaces) {
      const previousIds = previousSavedPlaces.map((place) => place.id);
      const nextIds = nextSavedPlaces.map((place) => place.id);

      const nextFreshPlaceIds = nextIds.filter((placeId) => !previousIds.includes(placeId));
      const removedPlaceIds = previousIds.filter((placeId) => !nextIds.includes(placeId));
      const updatedPlaces = nextSavedPlaces.filter((place) => {
        const previousPlace = previousSavedPlaces.find((candidate) => candidate.id === place.id);

        if (!previousPlace) {
          return false;
        }

        return (
          previousPlace.label !== place.label
          || previousPlace.address !== place.address
          || previousPlace.latitude !== place.latitude
          || previousPlace.longitude !== place.longitude
        );
      });

      if (nextFreshPlaceIds.length > 0) {
        setFreshPlaceIds(nextFreshPlaceIds);
        setAccountTransitionLabel(
          nextFreshPlaceIds.length > 1
            ? `${nextFreshPlaceIds.length} nouveaux favoris viennent d etre resynchronises.`
            : 'Un nouveau favori vient d etre resynchronise.',
        );
      } else if (removedPlaceIds.length > 0) {
        setAccountTransitionLabel(
          removedPlaceIds.length > 1
            ? `${removedPlaceIds.length} favoris ont disparu du profil actif.`
            : 'Un favori a disparu du profil actif.',
        );
      } else if (updatedPlaces.length > 0) {
        setFreshPlaceIds(updatedPlaces.map((place) => place.id));
        setAccountTransitionLabel(
          updatedPlaces.length > 1
            ? `${updatedPlaces.length} favoris viennent d etre mis a jour.`
            : 'Un favori vient d etre mis a jour.',
        );
      }
    }

    previousSavedPlacesRef.current = nextSavedPlaces;
  }, [profile.profile.savedPlaces]);

  useEffect(() => {
    if (!accountTransitionLabel) {
      return;
    }

    const timeout = setTimeout(() => {
      setAccountTransitionLabel(null);
    }, 5000);

    return () => clearTimeout(timeout);
  }, [accountTransitionLabel]);

  useEffect(() => {
    if (!freshPlaceIds.length) {
      return;
    }

    const timeout = setTimeout(() => {
      setFreshPlaceIds([]);
    }, 5000);

    return () => clearTimeout(timeout);
  }, [freshPlaceIds]);

  const flow = resolveRiderActiveFlow(history);

  useEffect(() => {
    const previousFlowState = previousFlowStateRef.current;
    const flowTransitionLabel = buildRiderFlowTransitionLabel(
      previousFlowState,
      flow.activeFlowState,
      'account',
    );

    if (flowTransitionLabel) {
      setAccountTransitionLabel(flowTransitionLabel);
    }

    previousFlowStateRef.current = flow.activeFlowState;
  }, [flow.activeFlowState]);

  async function loadProfile(silent = false) {
    if (!silent) {
      setIsRefreshing(true);
    }

    try {
      const { authClient } = await restoreRiderSession();
      const [profileResponse, historyResponse] = await Promise.all([
        fetchRiderProfile(authClient),
        fetchMyTrips(authClient),
      ]);
      setProfile(profileResponse);
      setHistory(historyResponse);
      if (!silent) {
        const nextFlow = resolveRiderActiveFlow(historyResponse);
        setStatus(
          buildRiderPeripheralStatusLabel({
            flow: nextFlow,
            surface: 'account',
            fullName: profileResponse.profile.fullName,
          }),
        );
      }
    } catch (error) {
      const feedback = await resolveRiderAppError(error, {
        network: 'Profil local de secours affiche en attendant la connexion API.',
        fallback: 'Profil local de secours affiche en attendant la connexion API.',
      });

      if (!silent) {
        setStatus(feedback.message);
      }
    } finally {
      if (!silent) {
        setIsRefreshing(false);
      }
    }
  }

  async function handleSignOut() {
    setIsSigningOut(true);
    setStatus('Deconnexion du compte passager...');

    try {
      await signOutRiderAccount();
      router.replace('/auth');
    } catch (error) {
      const feedback = await resolveRiderAppError(error, {
        fallback: "La deconnexion du compte passager a echoue.",
      });
      setStatus(feedback.message);
    } finally {
      setIsSigningOut(false);
    }
  }

  function resetPlaceForm() {
    setEditingPlaceId(null);
    setPlaceForm({
      label: '',
      address: '',
      latitude: '',
      longitude: '',
    });
  }

  function startEditingPlace(place: RiderProfileResponse['profile']['savedPlaces'][number]) {
    setEditingPlaceId(place.id);
    setPlaceForm({
      label: place.label,
      address: place.address,
      latitude:
        place.latitude !== null && place.latitude !== undefined
          ? String(place.latitude)
          : '',
      longitude:
        place.longitude !== null && place.longitude !== undefined
          ? String(place.longitude)
          : '',
    });
  }

  async function handleSavePlace() {
    if (!placeForm.label.trim() || !placeForm.address.trim()) {
      setStatus('Le libelle et l adresse du lieu sont obligatoires.');
      return;
    }

    const latitude = placeForm.latitude.trim()
      ? Number(placeForm.latitude)
      : undefined;
    const longitude = placeForm.longitude.trim()
      ? Number(placeForm.longitude)
      : undefined;

    if (
      latitude === undefined ||
      longitude === undefined ||
      Number.isNaN(latitude) ||
      Number.isNaN(longitude)
    ) {
      setStatus('Les coordonnees sont obligatoires pour enregistrer un lieu.');
      return;
    }

    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      setStatus('Les coordonnees doivent rester dans des bornes GPS valides.');
      return;
    }

    setIsSavingPlace(true);
    setStatus(
      editingPlaceId
        ? 'Mise a jour du lieu enregistre...'
        : 'Creation du lieu enregistre...',
    );

    try {
      const { authClient } = await restoreRiderSession();
      const payload = {
        label: placeForm.label.trim(),
        address: placeForm.address.trim(),
        latitude,
        longitude,
      };

      if (editingPlaceId) {
        await updateSavedPlaceWithApi(authClient, editingPlaceId, payload);
      } else {
        await createSavedPlaceWithApi(authClient, payload);
      }

      resetPlaceForm();
      await loadProfile();
      setStatus('Lieu enregistre synchronise avec succes.');
    } catch (error) {
      const feedback = await resolveRiderAppError(error, {
        fallback: "L'enregistrement du lieu a echoue.",
      });
      setStatus(feedback.message);
    } finally {
      setIsSavingPlace(false);
    }
  }

  async function handleDeletePlace(savedPlaceId: string) {
    setIsSavingPlace(true);
    setStatus('Suppression du lieu enregistre...');

    try {
      const { authClient } = await restoreRiderSession();
      await deleteSavedPlaceWithApi(authClient, savedPlaceId);
      if (editingPlaceId === savedPlaceId) {
        resetPlaceForm();
      }
      await loadProfile();
      setStatus('Lieu supprime avec succes.');
    } catch (error) {
      const feedback = await resolveRiderAppError(error, {
        fallback: 'La suppression du lieu a echoue.',
      });
      setStatus(feedback.message);
    } finally {
      setIsSavingPlace(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <Text style={styles.title}>Mon compte</Text>
      <LiveStatusBanner
        label="Compte"
        message={status}
        secondaryMessage={
          accountTransitionLabel
            ? accountTransitionLabel
            : flow.primaryRouteLabel
              ? `Flux actif: ${flow.primaryRouteLabel}.`
              : 'Votre profil, vos lieux enregistres et vos stats se resynchronisent regulierement avec la session passager.'
        }
        tone={accountTransitionLabel ? 'sky' : 'teal'}
      />
      <Pressable
        onPress={() => void loadProfile()}
        disabled={isRefreshing || isSigningOut}
        style={[styles.refreshButton, isRefreshing ? styles.refreshButtonDisabled : null]}
      >
        <Text style={styles.refreshButtonLabel}>
          {isRefreshing ? 'Actualisation...' : 'Actualiser le profil'}
        </Text>
      </Pressable>
      <Pressable
        onPress={() => void handleSignOut()}
        disabled={isSigningOut || isRefreshing}
        style={[styles.signOutButton, isSigningOut ? styles.refreshButtonDisabled : null]}
      >
        <Text style={styles.signOutButtonLabel}>
          {isSigningOut ? 'Deconnexion...' : 'Se deconnecter'}
        </Text>
      </Pressable>

      <SectionCard tone="sky">
        <SectionHeading
          eyebrow="Identite"
          title={profile.profile.fullName}
          description={profile.profile.email}
        />
        <View style={styles.insightRow}>
          <InsightBadge
            label="Service prefere"
            value={
              profile.profile.preferredTier === 'MOTO_STANDARD'
                ? 'Moto Express'
                : profile.profile.preferredTier ?? 'A definir'
            }
            tone="teal"
          />
          <InsightBadge
            label="Favoris"
            value={String(profile.profile.savedPlaces.length)}
            tone="sky"
          />
          <InsightBadge
            label="Flux actif"
            value={flow.primaryStatusLabel}
            tone={flow.hasOpenFlow ? 'amber' : 'teal'}
          />
          <InsightBadge
            label="Urgence"
            value={profile.profile.emergencyPhone ? 'Configure' : 'A definir'}
            tone={profile.profile.emergencyPhone ? 'teal' : 'amber'}
          />
        </View>
        <View style={styles.metricsRow}>
          <MetricTile
            label="Demandes"
            value={String(profile.profile.stats.totalRideRequests)}
            helper="reservations creees"
          />
          <MetricTile
            label="Completes"
            value={String(profile.profile.stats.completedTrips)}
            helper="trajets termines"
          />
          <MetricTile
            label="Lieux"
            value={String(profile.profile.stats.savedPlaces)}
            helper="favoris memorises"
          />
        </View>
      </SectionCard>

      <RiderJourneySection
        currentStep="account"
        description="Le compte partage maintenant le meme tunnel rider que l accueil, la reservation, la voix et le suivi."
      />

      <View style={[styles.card, accountTransitionLabel ? styles.cardHighlight : null]}>
        <Text style={styles.heading}>Lieux enregistres</Text>
        <Text style={styles.meta}>
          Ajoutez des coordonnees valides pour reutiliser rapidement vos lieux dans le flow de reservation.
        </Text>
        {flow.hasOpenFlow ? (
          <Text style={styles.flowMeta}>
            Reservation active: {flow.primaryStatusLabel}
            {flow.primaryRouteLabel ? ` - ${flow.primaryRouteLabel}` : ''}
          </Text>
        ) : null}
        {accountTransitionLabel ? (
          <Text style={styles.transitionMeta}>{accountTransitionLabel}</Text>
        ) : null}
        <TextInput
          value={placeForm.label}
          onChangeText={(value) => setPlaceForm((current) => ({ ...current, label: value }))}
          placeholder="Libelle du lieu"
          placeholderTextColor={mobilisTheme.colors.muted}
          style={styles.input}
        />
        <TextInput
          value={placeForm.address}
          onChangeText={(value) => setPlaceForm((current) => ({ ...current, address: value }))}
          placeholder="Adresse"
          placeholderTextColor={mobilisTheme.colors.muted}
          style={styles.input}
        />
        <View style={styles.metricsRow}>
          <TextInput
            value={placeForm.latitude}
            onChangeText={(value) => setPlaceForm((current) => ({ ...current, latitude: value }))}
            placeholder="Latitude"
            placeholderTextColor={mobilisTheme.colors.muted}
            keyboardType="decimal-pad"
            style={[styles.input, styles.coordInput]}
          />
          <TextInput
            value={placeForm.longitude}
            onChangeText={(value) => setPlaceForm((current) => ({ ...current, longitude: value }))}
            placeholder="Longitude"
            placeholderTextColor={mobilisTheme.colors.muted}
            keyboardType="decimal-pad"
            style={[styles.input, styles.coordInput]}
          />
        </View>
        <View style={styles.actionsRow}>
          <Pressable
            onPress={() => void handleSavePlace()}
            disabled={isSavingPlace}
            style={[styles.primaryAction, isSavingPlace ? styles.refreshButtonDisabled : null]}
          >
            <Text style={styles.primaryActionLabel}>
              {isSavingPlace ? 'Enregistrement...' : editingPlaceId ? 'Mettre a jour' : 'Ajouter un lieu'}
            </Text>
          </Pressable>
          {editingPlaceId ? (
            <Pressable
              onPress={resetPlaceForm}
              disabled={isSavingPlace}
              style={[styles.secondaryAction, isSavingPlace ? styles.refreshButtonDisabled : null]}
            >
              <Text style={styles.secondaryActionLabel}>Annuler</Text>
            </Pressable>
          ) : null}
        </View>
        {profile.profile.savedPlaces.map((place) => (
          <View
            key={place.id}
            style={[styles.placeRow, freshPlaceIds.includes(place.id) ? styles.placeRowFresh : null]}
          >
            <Text style={styles.placeLabel}>{place.label}</Text>
            {freshPlaceIds.includes(place.id) ? (
              <Text style={styles.placeTransitionBadge}>Favori resynchronise</Text>
            ) : null}
            <Text style={styles.meta}>{place.address}</Text>
            {place.latitude !== null && place.longitude !== null ? (
              <Text style={styles.meta}>
                {place.latitude}, {place.longitude}
              </Text>
            ) : null}
            <View style={styles.actionsRow}>
              <Pressable
                onPress={() => startEditingPlace(place)}
                disabled={isSavingPlace}
                style={styles.inlineAction}
              >
                <Text style={styles.inlineActionLabel}>Modifier</Text>
              </Pressable>
              <Pressable
                onPress={() => void handleDeletePlace(place.id)}
                disabled={isSavingPlace}
                style={styles.inlineDangerAction}
              >
                <Text style={styles.inlineDangerActionLabel}>Supprimer</Text>
              </Pressable>
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingTop: 88,
    paddingHorizontal: 24,
    paddingBottom: 40,
    backgroundColor: mobilisTheme.colors.background,
    gap: 14,
  },
  title: {
    color: mobilisTheme.colors.text,
    fontSize: 32,
    fontWeight: '800',
  },
  subtitle: {
    color: mobilisTheme.colors.muted,
  },
  insightRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  refreshButton: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: mobilisTheme.colors.backgroundAlt,
    borderWidth: 1,
    borderColor: mobilisTheme.colors.border,
  },
  refreshButtonDisabled: {
    opacity: 0.65,
  },
  refreshButtonLabel: {
    color: mobilisTheme.colors.text,
    fontWeight: '700',
    fontSize: 13,
  },
  signOutButton: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: 'rgba(248, 113, 113, 0.12)',
    borderWidth: 1,
    borderColor: mobilisTheme.colors.danger,
  },
  signOutButtonLabel: {
    color: mobilisTheme.colors.danger,
    fontWeight: '700',
    fontSize: 13,
  },
  card: {
    backgroundColor: mobilisTheme.colors.panel,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: mobilisTheme.colors.border,
    padding: 18,
    gap: 8,
  },
  cardHighlight: {
    borderColor: 'rgba(56, 189, 248, 0.42)',
    backgroundColor: 'rgba(56, 189, 248, 0.08)',
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
  },
  heading: {
    color: mobilisTheme.colors.text,
    fontWeight: '800',
    fontSize: 18,
  },
  meta: {
    color: mobilisTheme.colors.muted,
  },
  transitionMeta: {
    color: mobilisTheme.colors.sky,
    fontWeight: '700',
    lineHeight: 19,
  },
  flowMeta: {
    color: mobilisTheme.colors.text,
    fontWeight: '700',
    lineHeight: 20,
  },
  input: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: mobilisTheme.colors.border,
    backgroundColor: mobilisTheme.colors.backgroundAlt,
    color: mobilisTheme.colors.text,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  coordInput: {
    flexGrow: 1,
    minWidth: 140,
  },
  placeRow: {
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: mobilisTheme.colors.border,
    gap: 4,
  },
  placeRowFresh: {
    backgroundColor: 'rgba(56, 189, 248, 0.08)',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingBottom: 10,
    borderTopWidth: 0,
  },
  placeLabel: {
    color: mobilisTheme.colors.text,
    fontWeight: '700',
    fontSize: 16,
  },
  placeTransitionBadge: {
    alignSelf: 'flex-start',
    color: mobilisTheme.colors.sky,
    fontWeight: '800',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 6,
  },
  primaryAction: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: mobilisTheme.colors.teal,
  },
  primaryActionLabel: {
    color: '#052a28',
    fontWeight: '800',
    fontSize: 13,
  },
  secondaryAction: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: mobilisTheme.colors.backgroundAlt,
    borderWidth: 1,
    borderColor: mobilisTheme.colors.border,
  },
  secondaryActionLabel: {
    color: mobilisTheme.colors.text,
    fontWeight: '700',
    fontSize: 13,
  },
  inlineAction: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: mobilisTheme.colors.border,
    backgroundColor: mobilisTheme.colors.backgroundAlt,
  },
  inlineActionLabel: {
    color: mobilisTheme.colors.text,
    fontWeight: '700',
    fontSize: 12,
  },
  inlineDangerAction: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: mobilisTheme.colors.danger,
    backgroundColor: 'rgba(248, 113, 113, 0.12)',
  },
  inlineDangerActionLabel: {
    color: mobilisTheme.colors.danger,
    fontWeight: '700',
    fontSize: 12,
  },
});
