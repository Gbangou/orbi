import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, TextInput, View, Text, StyleSheet } from 'react-native';
import {
  preventScreenCaptureAsync,
  allowScreenCaptureAsync,
} from 'expo-screen-capture';
import {
  createSavedPlaceWithApi,
  createSupportTicketWithApi,
  deleteSavedPlaceWithApi,
  fetchMyTrips,
  fetchRiderProfile,
  getMySupportTicketsWithApi,
  updateTrustedContactWithApi,
  updateSavedPlaceWithApi,
  type MyTripsResponse,
  type RiderProfileResponse,
  type SupportTicket,
} from '@orbi/api';
import { orbiTheme } from '@orbi/ui';
import { router } from 'expo-router';
import { restoreRiderSession, signOutRiderAccount } from '../../lib/auth';
import {
  buildSavedPlacePayload,
  buildTrustedContactPayload,
  type TrustedContactShareMode,
} from '../../lib/account-safety';
import { resolveRiderAppError } from '../../lib/session-feedback';
import {
  buildRiderFlowTransitionLabel,
  buildRiderPeripheralStatusLabel,
  resolveRiderActiveFlow,
} from '../../lib/rider-active-flow';
import {
  InsightBadge,
  LiveStatusBanner,
  MetricTile,
  SectionCard,
  SectionHeading,
} from '../../lib/realtime-widgets';
import { useLiveRefresh } from '../../lib/use-live-refresh';
import { SavedPlacesMap } from '../../lib/saved-places-map';

const fallbackProfile: RiderProfileResponse = {
  profile: {
    id: 'loading',
    fullName: '',
    email: '',
    phoneNumber: null,
    preferredTier: 'MOTO_STANDARD',
    emergencyPhone: null,
    trustedContact: {
      phoneNumber: null,
      shareMode: 'DISABLED',
      status: 'MISSING',
      safetyNote: 'Ajoutez un numéro Burkina pour accélérer le partage en cas de trajet sensible.',
    },
    savedPlaces: [],
    stats: {
      totalRideRequests: 0,
      totalTrips: 0,
      completedTrips: 0,
      savedPlaces: 0,
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
  const [isGeocodingPlace, setIsGeocodingPlace] = useState(false);
  const [isSavingTrustedContact, setIsSavingTrustedContact] = useState(false);
  const [accountTransitionLabel, setAccountTransitionLabel] = useState<string | null>(null);
  const [freshPlaceIds, setFreshPlaceIds] = useState<string[]>([]);
  const [editingPlaceId, setEditingPlaceId] = useState<string | null>(null);
  const [placeForm, setPlaceForm] = useState({
    label: '',
    address: '',
    latitude: '',
    longitude: '',
  });
  const [trustedContactForm, setTrustedContactForm] = useState({
    phoneNumber: '',
    shareMode: 'MANUAL' as TrustedContactShareMode,
    notes: '',
  });
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [isTicketFormOpen, setIsTicketFormOpen] = useState(false);
  const [isSubmittingTicket, setIsSubmittingTicket] = useState(false);
  const [ticketForm, setTicketForm] = useState({
    subject: '',
    description: '',
    category: 'other' as 'payment' | 'trip' | 'account' | 'driver' | 'safety' | 'other',
  });
  const previousSavedPlacesRef = useRef<RiderProfileResponse['profile']['savedPlaces'] | null>(null);
  const previousFlowStateRef = useRef<string | null>(null);

  useEffect(() => {
    void preventScreenCaptureAsync();
    return () => {
      void allowScreenCaptureAsync();
    };
  }, []);

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
      const [profileResponse, historyResponse, ticketsResponse] = await Promise.all([
        fetchRiderProfile(authClient),
        fetchMyTrips(authClient),
        getMySupportTicketsWithApi(authClient),
      ]);
      setProfile(profileResponse);
      setTickets(ticketsResponse.tickets);
      setTrustedContactForm({
        phoneNumber: profileResponse.profile.trustedContact.phoneNumber ?? '',
        shareMode:
          profileResponse.profile.trustedContact.shareMode === 'DISABLED'
            ? 'MANUAL'
            : profileResponse.profile.trustedContact.shareMode,
        notes: '',
      });
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

  async function handleCreateTicket() {
    if (isSubmittingTicket) return;
    if (ticketForm.subject.trim().length < 5) {
      setStatus('Le sujet doit faire au moins 5 caracteres.');
      return;
    }
    if (ticketForm.description.trim().length < 10) {
      setStatus('La description doit faire au moins 10 caracteres.');
      return;
    }
    setIsSubmittingTicket(true);
    setStatus('Envoi de votre demande au support...');
    try {
      const { authClient } = await restoreRiderSession();
      const result = await createSupportTicketWithApi(authClient, {
        subject: ticketForm.subject.trim(),
        description: ticketForm.description.trim(),
        category: ticketForm.category,
      });
      setTickets((prev) => [result.ticket, ...prev]);
      setTicketForm({ subject: '', description: '', category: 'other' });
      setIsTicketFormOpen(false);
      setStatus('Demande envoyee. Notre equipe vous repondra rapidement.');
    } catch (error) {
      const feedback = await resolveRiderAppError(error, {
        fallback: "L'envoi de votre demande a echoue. Reessayez.",
      });
      setStatus(feedback.message);
    } finally {
      setIsSubmittingTicket(false);
    }
  }

  async function geocodePlaceAddress() {
    const address = placeForm.address.trim();
    if (!address) {
      setStatus('Entrez une adresse avant de localiser.');
      return;
    }
    setIsGeocodingPlace(true);
    try {
      const params = new URLSearchParams({
        q: `${address}, Burkina Faso`,
        format: 'json',
        limit: '1',
        countrycodes: 'bf',
        addressdetails: '1',
      });
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?${params.toString()}`,
        { headers: { 'Accept-Language': 'fr', 'User-Agent': 'OrbiApp/1.0' }, signal: AbortSignal.timeout(8000) },
      );
      const data: Array<{ lat: string; lon: string; display_name: string }> = await response.json();
      if (!data.length) {
        setStatus('Adresse introuvable. Essayez avec plus de détails (ex: quartier, ville).');
        return;
      }
      const result = data[0];
      setPlaceForm((current) => ({
        ...current,
        latitude: result.lat,
        longitude: result.lon,
      }));
      const shortName = result.display_name.split(', ').slice(0, 2).join(', ');
      setStatus(`Localisé: ${shortName}`);
    } catch {
      setStatus('Localisation impossible. Vérifiez votre connexion internet.');
    } finally {
      setIsGeocodingPlace(false);
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
    if (isSavingPlace) {
      return;
    }

    const validation = buildSavedPlacePayload(placeForm);
    if (!validation.ok) {
      setStatus(validation.message);
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
      if (editingPlaceId) {
        await updateSavedPlaceWithApi(authClient, editingPlaceId, validation.payload);
      } else {
        await createSavedPlaceWithApi(authClient, validation.payload);
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

  async function handleSaveTrustedContact() {
    if (isSavingTrustedContact) {
      return;
    }

    const validation = buildTrustedContactPayload(trustedContactForm);
    if (!validation.ok) {
      setStatus(validation.message);
      return;
    }
    const hasPhoneNumber = Boolean(validation.payload.phoneNumber);

    setIsSavingTrustedContact(true);
    setStatus(
      hasPhoneNumber
        ? 'Synchronisation du contact de confiance...'
        : 'Desactivation du contact de confiance...',
    );

    try {
      const { authClient } = await restoreRiderSession();
      await updateTrustedContactWithApi(authClient, validation.payload);
      await loadProfile();
      setStatus(
        hasPhoneNumber
          ? 'Contact de confiance configure et audite.'
          : 'Contact de confiance desactive.',
      );
    } catch (error) {
      const feedback = await resolveRiderAppError(error, {
        fallback: "La mise a jour du contact de confiance a echoue.",
      });
      setStatus(feedback.message);
    } finally {
      setIsSavingTrustedContact(false);
    }
  }

  async function handleDisableTrustedContact() {
    if (isSavingTrustedContact) {
      return;
    }

    setTrustedContactForm({
      phoneNumber: '',
      shareMode: 'MANUAL',
      notes: 'Desactivation demandee depuis le compte rider.',
    });
    setIsSavingTrustedContact(true);
    setStatus('Desactivation du contact de confiance...');

    try {
      const { authClient } = await restoreRiderSession();
      await updateTrustedContactWithApi(authClient, {
        notes: 'Desactivation demandee depuis le compte rider.',
      });
      await loadProfile();
      setStatus('Contact de confiance desactive.');
    } catch (error) {
      const feedback = await resolveRiderAppError(error, {
        fallback: "La desactivation du contact de confiance a echoue.",
      });
      setStatus(feedback.message);
    } finally {
      setIsSavingTrustedContact(false);
    }
  }

  async function handleDeletePlace(savedPlaceId: string) {
    if (isSavingPlace) {
      return;
    }

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
          title={profile.profile.fullName}
          subtitle={profile.profile.email}
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
            value={profile.profile.trustedContact.status === 'READY' ? 'Configure' : 'A definir'}
            tone={profile.profile.trustedContact.status === 'READY' ? 'teal' : 'amber'}
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

      <View style={styles.card}>
        <Text style={styles.heading}>Contact de confiance</Text>
        <Text style={styles.meta}>{profile.profile.trustedContact.safetyNote}</Text>
        <View style={styles.trustedStatusRow}>
          <InsightBadge
            label="Etat"
            value={profile.profile.trustedContact.status === 'READY' ? 'Pret' : 'A definir'}
            tone={profile.profile.trustedContact.status === 'READY' ? 'teal' : 'amber'}
          />
          <InsightBadge
            label="Partage"
            value={
              profile.profile.trustedContact.shareMode === 'ALL_TRIPS'
                ? 'Tous trajets'
                : profile.profile.trustedContact.shareMode === 'NIGHT'
                  ? 'Nuit'
                  : profile.profile.trustedContact.shareMode === 'MANUAL'
                    ? 'Manuel'
                    : 'Desactive'
            }
            tone="sky"
          />
        </View>
        <TextInput
          value={trustedContactForm.phoneNumber}
          onChangeText={(value) =>
            setTrustedContactForm((current) => ({ ...current, phoneNumber: value }))
          }
          placeholder="+22670000001"
          placeholderTextColor={orbiTheme.colors.muted}
          keyboardType="phone-pad"
          style={styles.input}
        />
        <View style={styles.modeRow}>
          {(['MANUAL', 'NIGHT', 'ALL_TRIPS'] as const).map((mode) => (
            <Pressable
              key={mode}
              onPress={() =>
                setTrustedContactForm((current) => ({ ...current, shareMode: mode }))
              }
              style={[
                styles.modeChip,
                trustedContactForm.shareMode === mode ? styles.modeChipActive : null,
              ]}
            >
              <Text
                style={[
                  styles.modeChipLabel,
                  trustedContactForm.shareMode === mode ? styles.modeChipLabelActive : null,
                ]}
              >
                {mode === 'ALL_TRIPS' ? 'Tous trajets' : mode === 'NIGHT' ? 'Nuit' : 'Manuel'}
              </Text>
            </Pressable>
          ))}
        </View>
        <TextInput
          value={trustedContactForm.notes}
          onChangeText={(value) =>
            setTrustedContactForm((current) => ({ ...current, notes: value }))
          }
          placeholder="Note ops courte, facultative"
          placeholderTextColor={orbiTheme.colors.muted}
          maxLength={120}
          style={styles.input}
        />
        <View style={styles.actionsRow}>
          <Pressable
            onPress={() => void handleSaveTrustedContact()}
            disabled={isSavingTrustedContact}
            style={[styles.primaryAction, isSavingTrustedContact ? styles.refreshButtonDisabled : null]}
          >
            <Text style={styles.primaryActionLabel}>
              {isSavingTrustedContact ? 'Synchronisation...' : 'Enregistrer le contact'}
            </Text>
          </Pressable>
          {profile.profile.trustedContact.status === 'READY' ? (
            <Pressable
              onPress={() => void handleDisableTrustedContact()}
              disabled={isSavingTrustedContact}
              style={[styles.secondaryAction, isSavingTrustedContact ? styles.refreshButtonDisabled : null]}
            >
              <Text style={styles.secondaryActionLabel}>Desactiver</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

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
          placeholderTextColor={orbiTheme.colors.muted}
          style={styles.input}
        />
        <TextInput
          value={placeForm.address}
          onChangeText={(value) => setPlaceForm((current) => ({ ...current, address: value, latitude: '', longitude: '' }))}
          placeholder="Adresse (ex: Patte d'Oie, Ouagadougou)"
          placeholderTextColor={orbiTheme.colors.muted}
          style={styles.input}
        />
        <Pressable
          onPress={() => void geocodePlaceAddress()}
          disabled={isGeocodingPlace || isSavingPlace || !placeForm.address.trim()}
          style={[
            styles.geocodeButton,
            (isGeocodingPlace || !placeForm.address.trim()) && styles.refreshButtonDisabled,
          ]}
        >
          <Text style={styles.geocodeButtonLabel}>
            {isGeocodingPlace ? 'Localisation...' : placeForm.latitude ? 'Relocalisé ✓' : 'Localiser l\'adresse'}
          </Text>
        </Pressable>
        {placeForm.latitude ? (
          <Text style={styles.coordConfirm}>
            Position trouvée · prêt à enregistrer
          </Text>
        ) : null}
        <View style={styles.coordinateRow}>
          <TextInput
            value={placeForm.latitude}
            onChangeText={(value) =>
              setPlaceForm((current) => ({ ...current, latitude: value }))
            }
            placeholder="Latitude"
            placeholderTextColor={orbiTheme.colors.muted}
            keyboardType="decimal-pad"
            style={[styles.input, styles.coordinateInput]}
          />
          <TextInput
            value={placeForm.longitude}
            onChangeText={(value) =>
              setPlaceForm((current) => ({ ...current, longitude: value }))
            }
            placeholder="Longitude"
            placeholderTextColor={orbiTheme.colors.muted}
            keyboardType="decimal-pad"
            style={[styles.input, styles.coordinateInput]}
          />
        </View>
        <View style={styles.actionsRow}>
          <Pressable
            onPress={() => void handleSavePlace()}
            disabled={isSavingPlace || !placeForm.latitude}
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
        <SavedPlacesMap
          places={profile.profile.savedPlaces.map((p) => ({
            id: p.id,
            label: p.label,
            latitude: p.latitude ?? null,
            longitude: p.longitude ?? null,
          }))}
          height={200}
          onPlaceSelect={(placeId) => {
            const place = profile.profile.savedPlaces.find((p) => p.id === placeId);
            if (place) startEditingPlace(place);
          }}
        />
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

      {/* ── Support ── */}
      <View style={styles.card}>
        <Text style={styles.heading}>Support</Text>
        <Text style={styles.meta}>
          Un probleme avec une course, un paiement ou votre compte ? Notre equipe repond en moins de 24h.
        </Text>

        {tickets.map((ticket) => (
          <View key={ticket.id} style={styles.ticketRow}>
            <View style={styles.ticketHeader}>
              <Text style={styles.ticketSubject} numberOfLines={1}>{ticket.subject}</Text>
              <View style={[
                styles.ticketBadge,
                ticket.status === 'RESOLVED' || ticket.status === 'CLOSED'
                  ? styles.ticketBadgeClosed
                  : ticket.status === 'IN_REVIEW'
                    ? styles.ticketBadgeReview
                    : styles.ticketBadgeOpen,
              ]}>
                <Text style={styles.ticketBadgeLabel}>
                  {ticket.status === 'OPEN' ? 'Ouvert'
                    : ticket.status === 'IN_REVIEW' ? 'En cours'
                    : ticket.status === 'RESOLVED' ? 'Resolu'
                    : 'Ferme'}
                </Text>
              </View>
            </View>
            <Text style={styles.meta} numberOfLines={2}>{ticket.description}</Text>
            {ticket.adminNote ? (
              <View style={styles.adminNoteBox}>
                <Text style={styles.adminNoteLabel}>Reponse du support</Text>
                <Text style={styles.adminNoteText}>{ticket.adminNote}</Text>
              </View>
            ) : null}
          </View>
        ))}

        {isTicketFormOpen ? (
          <>
            <TextInput
              style={styles.input}
              placeholder="Sujet (ex: paiement debite deux fois)"
              placeholderTextColor={orbiTheme.colors.muted}
              value={ticketForm.subject}
              onChangeText={(v) => setTicketForm((f) => ({ ...f, subject: v }))}
              maxLength={120}
              editable={!isSubmittingTicket}
            />
            <TextInput
              style={[styles.input, styles.ticketDescInput]}
              placeholder="Decrivez votre probleme en detail..."
              placeholderTextColor={orbiTheme.colors.muted}
              value={ticketForm.description}
              onChangeText={(v) => setTicketForm((f) => ({ ...f, description: v }))}
              maxLength={2000}
              multiline
              numberOfLines={4}
              editable={!isSubmittingTicket}
            />
            <View style={styles.modeRow}>
              {(['payment', 'trip', 'account', 'driver', 'safety', 'other'] as const).map((cat) => (
                <Pressable
                  key={cat}
                  style={[styles.modeChip, ticketForm.category === cat && styles.modeChipActive]}
                  onPress={() => setTicketForm((f) => ({ ...f, category: cat }))}
                >
                  <Text style={[styles.modeChipLabel, ticketForm.category === cat && styles.modeChipLabelActive]}>
                    {cat === 'payment' ? 'Paiement'
                      : cat === 'trip' ? 'Course'
                      : cat === 'account' ? 'Compte'
                      : cat === 'driver' ? 'Chauffeur'
                      : cat === 'safety' ? 'Securite'
                      : 'Autre'}
                  </Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.actionsRow}>
              <Pressable
                style={[styles.primaryAction, isSubmittingTicket && { opacity: 0.6 }]}
                onPress={() => void handleCreateTicket()}
                disabled={isSubmittingTicket}
              >
                <Text style={styles.primaryActionLabel}>
                  {isSubmittingTicket ? 'Envoi...' : 'Envoyer la demande'}
                </Text>
              </Pressable>
              <Pressable
                style={styles.secondaryAction}
                onPress={() => setIsTicketFormOpen(false)}
                disabled={isSubmittingTicket}
              >
                <Text style={styles.secondaryActionLabel}>Annuler</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <Pressable
            style={styles.secondaryAction}
            onPress={() => setIsTicketFormOpen(true)}
          >
            <Text style={styles.secondaryActionLabel}>Contacter le support</Text>
          </Pressable>
        )}
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
    gap: 14,
  },
  title: {
    color: orbiTheme.colors.text,
    fontSize: 32,
    fontWeight: '800',
  },
  subtitle: {
    color: orbiTheme.colors.muted,
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
    backgroundColor: orbiTheme.colors.backgroundAlt,
    borderWidth: 1,
    borderColor: orbiTheme.colors.border,
  },
  refreshButtonDisabled: {
    opacity: 0.65,
  },
  refreshButtonLabel: {
    color: orbiTheme.colors.text,
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
    borderColor: orbiTheme.colors.danger,
  },
  signOutButtonLabel: {
    color: orbiTheme.colors.danger,
    fontWeight: '700',
    fontSize: 13,
  },
  card: {
    backgroundColor: orbiTheme.colors.panel,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: orbiTheme.colors.border,
    padding: 18,
    gap: 8,
  },
  cardHighlight: {
    borderColor: orbiTheme.colors.teal,
    backgroundColor: orbiTheme.colors.accentLight,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
  },
  trustedStatusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  heading: {
    color: orbiTheme.colors.text,
    fontWeight: '800',
    fontSize: 18,
  },
  meta: {
    color: orbiTheme.colors.muted,
  },
  transitionMeta: {
    color: orbiTheme.colors.sky,
    fontWeight: '700',
    lineHeight: 19,
  },
  flowMeta: {
    color: orbiTheme.colors.text,
    fontWeight: '700',
    lineHeight: 20,
  },
  input: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: orbiTheme.colors.border,
    backgroundColor: orbiTheme.colors.backgroundAlt,
    color: orbiTheme.colors.text,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  geocodeButton: {
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: 'rgba(56,189,248,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.3)',
    alignItems: 'center',
  },
  geocodeButtonLabel: {
    color: orbiTheme.colors.sky,
    fontWeight: '700',
    fontSize: 13,
  },
  coordConfirm: {
    color: orbiTheme.colors.teal,
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: 2,
  },
  coordinateRow: {
    flexDirection: 'row',
    gap: 10,
  },
  coordinateInput: {
    flex: 1,
  },
  modeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  modeChip: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: orbiTheme.colors.border,
    backgroundColor: orbiTheme.colors.backgroundAlt,
  },
  modeChipActive: {
    borderColor: orbiTheme.colors.text,
    backgroundColor: orbiTheme.colors.text,
  },
  modeChipLabel: {
    color: orbiTheme.colors.textSoft,
    fontWeight: '700',
    fontSize: 12,
  },
  modeChipLabelActive: {
    color: '#FFFFFF',
  },
  placeRow: {
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: orbiTheme.colors.border,
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
    color: orbiTheme.colors.text,
    fontWeight: '700',
    fontSize: 16,
  },
  placeTransitionBadge: {
    alignSelf: 'flex-start',
    color: orbiTheme.colors.sky,
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
    paddingHorizontal: 16,
    paddingVertical: 11,
    backgroundColor: orbiTheme.colors.text,
    ...orbiTheme.shadows.button,
  },
  primaryActionLabel: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  secondaryAction: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: orbiTheme.colors.backgroundAlt,
    borderWidth: 1,
    borderColor: orbiTheme.colors.border,
  },
  secondaryActionLabel: {
    color: orbiTheme.colors.text,
    fontWeight: '700',
    fontSize: 13,
  },
  inlineAction: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: orbiTheme.colors.border,
    backgroundColor: orbiTheme.colors.backgroundAlt,
  },
  inlineActionLabel: {
    color: orbiTheme.colors.text,
    fontWeight: '700',
    fontSize: 12,
  },
  inlineDangerAction: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: orbiTheme.colors.danger,
    backgroundColor: 'rgba(248, 113, 113, 0.12)',
  },
  inlineDangerActionLabel: {
    color: orbiTheme.colors.danger,
    fontWeight: '700',
    fontSize: 12,
  },
  ticketRow: {
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: orbiTheme.colors.border,
    gap: 4,
  },
  ticketHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ticketSubject: {
    flex: 1,
    color: orbiTheme.colors.text,
    fontWeight: '700',
    fontSize: 14,
  },
  ticketBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  ticketBadgeOpen: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
  },
  ticketBadgeReview: {
    backgroundColor: 'rgba(251, 191, 36, 0.15)',
  },
  ticketBadgeClosed: {
    backgroundColor: 'rgba(100, 116, 139, 0.15)',
  },
  ticketBadgeLabel: {
    color: orbiTheme.colors.muted,
    fontWeight: '700',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  ticketDescInput: {
    minHeight: 90,
    textAlignVertical: 'top',
  },
  adminNoteBox: {
    marginTop: 8,
    padding: 10,
    backgroundColor: 'rgba(56, 189, 248, 0.07)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.2)',
  },
  adminNoteLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: orbiTheme.colors.teal,
    marginBottom: 4,
  },
  adminNoteText: {
    fontSize: 13,
    color: orbiTheme.colors.text,
    lineHeight: 18,
  },
});
