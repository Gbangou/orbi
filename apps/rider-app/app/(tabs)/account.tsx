import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, TextInput, View, Text, StyleSheet } from 'react-native';
import { changeLanguage, SUPPORTED_LANGUAGES, type SupportedLanguage, useTranslation } from '../../lib/i18n';
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

  const initials = profile.profile.fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('') || 'OR';

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Mon compte</Text>
        <View style={styles.headerRight}>
          {isRefreshing ? (
            <ActivityIndicator size="small" color={orbiTheme.colors.teal} />
          ) : null}
          <Pressable
            onPress={() => void handleSignOut()}
            disabled={isSigningOut || isRefreshing}
            style={styles.signOutBtn}
          >
            <Text style={styles.signOutBtnLabel}>
              {isSigningOut ? '...' : 'Déco.'}
            </Text>
          </Pressable>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* User card */}
        <View style={styles.userCard}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarInitials}>{initials}</Text>
          </View>
          <View style={styles.userInfo}>
            <Text style={styles.userName}>
              {profile.profile.fullName || 'Chargement…'}
            </Text>
            <Text style={styles.userEmail}>{profile.profile.email}</Text>
            {profile.profile.phoneNumber ? (
              <Text style={styles.userPhone}>{profile.profile.phoneNumber}</Text>
            ) : null}
          </View>
        </View>

        {/* Stats row */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>
              {profile.profile.stats.completedTrips}
            </Text>
            <Text style={styles.statLabel}>Courses</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>
              {profile.profile.stats.totalRideRequests}
            </Text>
            <Text style={styles.statLabel}>Demandes</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>
              {profile.profile.savedPlaces.length}
            </Text>
            <Text style={styles.statLabel}>Favoris</Text>
          </View>
        </View>

        {/* Active flow notice OR quick book CTA */}
        {flow.hasOpenFlow ? (
          <Pressable
            style={styles.flowBanner}
            onPress={() => router.push('/activity')}
          >
            <View style={styles.flowDot} />
            <Text style={styles.flowText} numberOfLines={1}>
              {flow.primaryStatusLabel}
              {flow.primaryRouteLabel ? ` — ${flow.primaryRouteLabel}` : ''}
            </Text>
            <Text style={styles.flowArrow}>›</Text>
          </Pressable>
        ) : (
          <Pressable
            style={styles.newTripBtn}
            onPress={() => router.push('/book')}
          >
            <Text style={styles.newTripBtnText}>+ Réserver une course</Text>
          </Pressable>
        )}

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Contact de confiance</Text>
          <View style={[
            styles.statusPill,
            profile.profile.trustedContact.status === 'READY'
              ? styles.statusPillReady
              : styles.statusPillPending,
          ]}>
            <Text style={[
              styles.statusPillText,
              profile.profile.trustedContact.status === 'READY'
                ? styles.statusPillTextReady
                : styles.statusPillTextPending,
            ]}>
              {profile.profile.trustedContact.status === 'READY' ? 'Configuré' : 'À définir'}
            </Text>
          </View>
        </View>
        <Text style={styles.cardMeta}>{profile.profile.trustedContact.safetyNote}</Text>
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

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Lieux enregistrés</Text>
        </View>
        <Text style={styles.cardMeta}>
          Ajoutez des lieux favoris pour les retrouver rapidement lors de vos réservations.
        </Text>
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
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Support</Text>
        </View>
        <Text style={styles.cardMeta}>
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

      {/* ── Langue ── */}
      <LanguageSelector />

      <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Language selector component ───────────────────────────────────────────────

function LanguageSelector() {
  const [current, setCurrent] = useState<SupportedLanguage>('fr');

  function handleSelect(lang: SupportedLanguage) {
    setCurrent(lang);
    void changeLanguage(lang);
  }

  return (
    <View style={langStyles.card}>
      <View style={langStyles.header}>
        <Text style={langStyles.title}>🌍 Langue</Text>
      </View>
      <View style={langStyles.chips}>
        {SUPPORTED_LANGUAGES.map((lang) => (
          <Pressable
            key={lang.code}
            onPress={() => handleSelect(lang.code)}
            style={[langStyles.chip, current === lang.code && langStyles.chipActive]}
          >
            <Text style={[langStyles.chipText, current === lang.code && langStyles.chipTextActive]}>
              {lang.nativeLabel}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const langStyles = StyleSheet.create({
  card: {
    backgroundColor: orbiTheme.colors.background,
    borderRadius: 16, borderWidth: 1, borderColor: orbiTheme.colors.border,
    padding: 16, gap: 12, marginHorizontal: 16,
  },
  header: { flexDirection: 'row', alignItems: 'center' },
  title: { fontSize: 15, fontWeight: '700', fontFamily: 'Inter_700Bold', color: orbiTheme.colors.text },
  chips: { flexDirection: 'row', gap: 8 },
  chip: {
    flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center',
    backgroundColor: orbiTheme.colors.backgroundAlt,
    borderWidth: 1, borderColor: orbiTheme.colors.border,
  },
  chipActive: { backgroundColor: orbiTheme.colors.text, borderColor: orbiTheme.colors.text },
  chipText: { fontSize: 13, fontWeight: '600', fontFamily: 'Inter_600SemiBold', color: orbiTheme.colors.textSoft },
  chipTextActive: { color: '#FFFFFF' },
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: orbiTheme.colors.background },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: orbiTheme.colors.border,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    fontFamily: 'Raleway_800ExtraBold',
    color: orbiTheme.colors.text,
  },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  signOutBtn: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(255,59,48,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,59,48,0.22)',
  },
  signOutBtnLabel: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
    color: orbiTheme.colors.danger,
  },

  content: { paddingHorizontal: 16, paddingTop: 16, gap: 14 },

  // User card
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: orbiTheme.colors.border,
    padding: 16,
    ...orbiTheme.shadows.card,
  },
  avatarCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: orbiTheme.colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    fontSize: 20,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
    color: '#FFFFFF',
  },
  userInfo: { flex: 1, gap: 2 },
  userName: {
    fontSize: 17,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
    color: orbiTheme.colors.text,
  },
  userEmail: {
    fontSize: 13,
    color: orbiTheme.colors.textSoft,
    fontFamily: 'Inter_400Regular',
  },
  userPhone: {
    fontSize: 13,
    color: orbiTheme.colors.textMuted,
    fontFamily: 'Inter_400Regular',
  },

  // Stats
  statsRow: { flexDirection: 'row', gap: 10 },
  statCard: {
    flex: 1,
    backgroundColor: orbiTheme.colors.backgroundAlt,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: orbiTheme.colors.border,
    padding: 12,
    alignItems: 'center',
    gap: 3,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '800',
    fontFamily: 'Inter_700Bold',
    color: orbiTheme.colors.text,
  },
  statLabel: {
    fontSize: 11,
    color: orbiTheme.colors.textMuted,
    fontFamily: 'Inter_400Regular',
  },

  // Flow banner
  flowBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(0,201,167,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(0,201,167,0.22)',
    borderRadius: 12,
    padding: 12,
  },
  flowDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: orbiTheme.colors.teal },
  flowText: { flex: 1, fontSize: 13, fontWeight: '500', fontFamily: 'Inter_500Medium', color: orbiTheme.colors.text },
  flowArrow: { fontSize: 20, color: orbiTheme.colors.teal },
  newTripBtn: {
    backgroundColor: orbiTheme.colors.text,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    ...orbiTheme.shadows.button,
  },
  newTripBtnText: {
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
    color: '#FFFFFF',
  },

  // Cards (cardHeader/Title/Meta use the existing card style below)
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
    color: orbiTheme.colors.text,
  },
  cardMeta: {
    fontSize: 13,
    color: orbiTheme.colors.textMuted,
    fontFamily: 'Inter_400Regular',
    lineHeight: 18,
  },

  // Status pill
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderWidth: 1,
  },
  statusPillReady: {
    backgroundColor: 'rgba(0,201,167,0.08)',
    borderColor: 'rgba(0,201,167,0.28)',
  },
  statusPillPending: {
    backgroundColor: 'rgba(255,149,0,0.08)',
    borderColor: 'rgba(255,149,0,0.28)',
  },
  statusPillText: { fontSize: 11, fontWeight: '700', fontFamily: 'Inter_700Bold' },
  statusPillTextReady: { color: orbiTheme.colors.teal },
  statusPillTextPending: { color: orbiTheme.colors.amber },

  // Form elements
  screen: { gap: 14 },
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
