import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, TextInput, View, Text, StyleSheet } from 'react-native';
import { changeLanguage, SUPPORTED_LANGUAGES, type SupportedLanguage, useTranslation } from '../../lib/i18n';
import { preventSensitiveScreenCapture, restoreSensitiveScreenCapture } from '../../lib/privacy/screen-capture';
import {
  createTrustedContactWithApi,
  createSavedPlaceWithApi,
  createSupportTicketWithApi,
  deleteTrustedContactWithApi,
  deleteSavedPlaceWithApi,
  fetchMyTrips,
  fetchRiderProfile,
  fetchWalletBalanceWithApi,
  initiateWalletTopUpWithApi,
  getMySupportTicketsWithApi,
  updateTrustedContactEntryWithApi,
  updateTrustedContactWithApi,
  updateSavedPlaceWithApi,
  type MyTripsResponse,
  type RiderProfileResponse,
  type SupportTicket,
  type WalletBalanceResponse,
} from '@orbi/api';
import {
  maskEmailForDisplay,
  maskPhoneForDisplay,
} from '@orbi/domain';
import type { OrbiTheme } from '@orbi/ui';
import {
  OrbiButton,
  OrbiMetricTile,
  OrbiStatusBanner,
  OrbiSurface,
  useOrbiTheme,
} from '@orbi/ui/native';
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
    trustedContacts: [],
    savedPlaces: [],
    stats: {
      totalRideRequests: 0,
      totalTrips: 0,
      completedTrips: 0,
      savedPlaces: 0,
    },
  },
};

function ForwardGlyph() {
  const theme = useOrbiTheme();
  const accountIcon = useMemo(() => makeAccountIconStyles(theme), [theme]);
  return (
    <View style={accountIcon.forwardWrap}>
      <View style={[accountIcon.forwardLine, accountIcon.forwardLineTop]} />
      <View style={[accountIcon.forwardLine, accountIcon.forwardLineBottom]} />
    </View>
  );
}

export default function AccountScreen() {
  const theme = useOrbiTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const walletStyles = useMemo(() => makeWalletStyles(theme), [theme]);
  const [profile, setProfile] = useState<RiderProfileResponse>(fallbackProfile);
  const [history, setHistory] = useState<MyTripsResponse | null>(null);
  const [walletBalance, setWalletBalance] = useState<WalletBalanceResponse | null>(null);
  const [showTopUp, setShowTopUp] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState('');
  const [topUpPhone, setTopUpPhone] = useState('');
  const [topUpNetwork, setTopUpNetwork] = useState<'ORANGE_BFA' | 'MOOV_BFA'>('ORANGE_BFA');
  const [isTopUpSubmitting, setIsTopUpSubmitting] = useState(false);
  const [topUpError, setTopUpError] = useState('');
  const [status, setStatus] = useState('Chargement du profil passager...');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isSavingPlace, setIsSavingPlace] = useState(false);
  const [isGeocodingPlace, setIsGeocodingPlace] = useState(false);
  const [isSavingTrustedContact, setIsSavingTrustedContact] = useState(false);
  const [isSavingTrustedRoster, setIsSavingTrustedRoster] = useState(false);
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
  const [trustedRosterForm, setTrustedRosterForm] = useState({
    label: '',
    phoneNumber: '',
    priority: 2,
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
    preventSensitiveScreenCapture();
    return () => {
      restoreSensitiveScreenCapture();
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
      const [profileResponse, historyResponse, ticketsResponse, walletResp] = await Promise.all([
        fetchRiderProfile(authClient),
        fetchMyTrips(authClient),
        getMySupportTicketsWithApi(authClient).catch(() => ({ tickets: [] as SupportTicket[] })),
        fetchWalletBalanceWithApi(authClient).catch(() => null),
      ]);
      setWalletBalance(walletResp);
      setProfile(profileResponse);
      setTickets(ticketsResponse?.tickets ?? []);
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

  async function handleTopUp() {
    const amount = parseInt(topUpAmount, 10);
    if (!amount || amount < 500) {
      setTopUpError('Montant minimum : 500 XOF');
      return;
    }
    if (!topUpPhone.replace(/\D/g, '') || topUpPhone.replace(/\D/g, '').length < 8) {
      setTopUpError('Numéro de téléphone invalide');
      return;
    }
    setTopUpError('');
    setIsTopUpSubmitting(true);
    try {
      const { authClient } = await restoreRiderSession();
      await initiateWalletTopUpWithApi(authClient, {
        amountXof: amount,
        mobileMoneyNetwork: topUpNetwork,
        customerPhoneNumber: topUpPhone.replace(/\D/g, ''),
      });
      setShowTopUp(false);
      setTopUpAmount('');
      setTopUpPhone('');
      // Refresh wallet balance
      const wallet = await fetchWalletBalanceWithApi(authClient).catch(() => null);
      setWalletBalance(wallet);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Rechargement échoué';
      setTopUpError(msg);
    } finally {
      setIsTopUpSubmitting(false);
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

  async function handleCreateTrustedContactEntry() {
    if (isSavingTrustedRoster) {
      return;
    }

    const phoneNumber = trustedRosterForm.phoneNumber.trim();
    const label = trustedRosterForm.label.trim() || 'Contact de confiance';

    if (!/^\+226[0-9]{8}$/.test(phoneNumber)) {
      setStatus('Le contact doit etre un numero Burkina au format +226XXXXXXXX.');
      return;
    }

    if (activeTrustedContacts.length >= 3) {
      setStatus('Vous pouvez garder au maximum 3 contacts de confiance actifs.');
      return;
    }

    setIsSavingTrustedRoster(true);
    setStatus('Ajout du contact de confiance...');

    try {
      const { authClient } = await restoreRiderSession();
      await createTrustedContactWithApi(authClient, {
        label,
        phoneNumber,
        priority: trustedRosterForm.priority,
      });
      setTrustedRosterForm({ label: '', phoneNumber: '', priority: 2 });
      await loadProfile();
      setStatus('Contact de confiance ajoute et audite.');
    } catch (error) {
      const feedback = await resolveRiderAppError(error, {
        fallback: "L'ajout du contact de confiance a echoue.",
      });
      setStatus(feedback.message);
    } finally {
      setIsSavingTrustedRoster(false);
    }
  }

  async function handlePrioritizeTrustedContactEntry(
    contact: RiderProfileResponse['profile']['trustedContacts'][number],
  ) {
    if (isSavingTrustedRoster || !contact.id || contact.priority === 1) {
      return;
    }

    setIsSavingTrustedRoster(true);
    setStatus('Mise a jour de la priorite du contact...');

    try {
      const { authClient } = await restoreRiderSession();
      await updateTrustedContactEntryWithApi(authClient, contact.id, {
        priority: 1,
      });
      await loadProfile();
      setStatus('Contact principal mis a jour.');
    } catch (error) {
      const feedback = await resolveRiderAppError(error, {
        fallback: 'La priorite du contact n a pas pu etre modifiee.',
      });
      setStatus(feedback.message);
    } finally {
      setIsSavingTrustedRoster(false);
    }
  }

  async function handleDeactivateTrustedContactEntry(
    contact: RiderProfileResponse['profile']['trustedContacts'][number],
  ) {
    if (isSavingTrustedRoster || !contact.id) {
      return;
    }

    setIsSavingTrustedRoster(true);
    setStatus('Retrait du contact de confiance...');

    try {
      const { authClient } = await restoreRiderSession();
      await deleteTrustedContactWithApi(authClient, contact.id);
      await loadProfile();
      setStatus('Contact de confiance retire.');
    } catch (error) {
      const feedback = await resolveRiderAppError(error, {
        fallback: 'Le retrait du contact de confiance a echoue.',
      });
      setStatus(feedback.message);
    } finally {
      setIsSavingTrustedRoster(false);
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
  const maskedEmail = maskEmailForDisplay(profile.profile.email);
  const maskedPhone = maskPhoneForDisplay(profile.profile.phoneNumber);
  const activeTrustedContacts = profile.profile.trustedContacts
    .filter((contact) => contact.isActive)
    .sort((a, b) => a.priority - b.priority);
  const trustedContactCountLabel =
    activeTrustedContacts.length > 0
      ? `${activeTrustedContacts.length} contact${activeTrustedContacts.length > 1 ? 's' : ''} actif${activeTrustedContacts.length > 1 ? 's' : ''}`
      : 'Aucun contact actif';

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Mon compte</Text>
        <View style={styles.headerRight}>
          {isRefreshing ? (
            <ActivityIndicator size="small" color={theme.colors.teal} />
          ) : null}
          <Pressable
            onPress={() => void loadProfile(false)}
            disabled={isRefreshing}
            style={{ display: 'none' }}
            accessibilityLabel="account-refresh"
          >
            <Text>refresh</Text>
          </Pressable>
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

      {/* Status feedback — shown for errors and transitions */}
      {status && !status.includes('Chargement') ? (
        <OrbiStatusBanner
          tone="sky"
          title="Compte synchronisé"
          message={status}
          style={styles.accountStatusBanner}
          accessibilityLabel="account-status"
        />
      ) : null}

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* User card */}
        <OrbiSurface style={styles.userCard} elevated>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarInitials}>{initials}</Text>
          </View>
          <View style={styles.userInfo}>
            <Text style={styles.userName}>
              {profile.profile.fullName || 'Compte Orbi'}
            </Text>
            {maskedEmail ? (
              <Text style={styles.userEmail}>{maskedEmail}</Text>
            ) : null}
            {maskedPhone ? (
              <Text style={styles.userPhone}>{maskedPhone}</Text>
            ) : null}
            <Text style={styles.privacyHint}>Identité masquée par défaut</Text>
          </View>
        </OrbiSurface>

        {/* Stats row */}
        <View style={styles.statsRow}>
          <OrbiMetricTile
            label="Courses"
            value={String(profile.profile.stats.completedTrips)}
            style={styles.statCard}
          />
          <OrbiMetricTile
            label="Demandes"
            value={String(profile.profile.stats.totalRideRequests)}
            style={styles.statCard}
          />
          <OrbiMetricTile
            label="Favoris"
            value={String(profile.profile.savedPlaces.length)}
            tone={profile.profile.savedPlaces.length > 0 ? 'teal' : 'neutral'}
            style={styles.statCard}
          />
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
            <ForwardGlyph />
          </Pressable>
        ) : (
          <OrbiButton
            onPress={() => router.push('/book')}
            label="Réserver une course"
            tone="teal"
            style={styles.newTripBtn}
            labelStyle={styles.newTripBtnText}
          />
        )}

        {/* ── Wallet Orbi ── */}
        <OrbiSurface tone="teal" style={walletStyles.card}>
          <View style={walletStyles.row}>
            <View>
              <Text style={walletStyles.label}>Wallet Orbi</Text>
              <Text style={walletStyles.balance}>
                {walletBalance !== null
                  ? `${walletBalance.balance.toLocaleString('fr-BF')} XOF`
                  : '— XOF'}
              </Text>
            </View>
            <OrbiButton
              onPress={() => { setShowTopUp(true); setTopUpError(''); }}
              label="Recharger"
              tone="teal"
              style={walletStyles.rechargeBtn}
              labelStyle={walletStyles.rechargeBtnLabel}
            />
          </View>
          {walletBalance?.isLocked ? (
            <OrbiStatusBanner
              tone="amber"
              title="Wallet temporairement verrouillé"
              message="Certaines opérations peuvent nécessiter une vérification support."
            />
          ) : null}
        </OrbiSurface>

        {/* ── Top-up modal/sheet ── */}
        {showTopUp ? (
          <View style={walletStyles.topUpSheet}>
            <Text style={walletStyles.topUpTitle}>Recharger le Wallet</Text>

            {/* Network selector */}
            <View style={walletStyles.networkRow}>
              {(['ORANGE_BFA', 'MOOV_BFA'] as const).map((net) => (
                <Pressable
                  key={net}
                  onPress={() => setTopUpNetwork(net)}
                  style={[walletStyles.networkChip, topUpNetwork === net && walletStyles.networkChipActive]}
                >
                  <Text style={[walletStyles.networkLabel, topUpNetwork === net && walletStyles.networkLabelActive]}>
                    {net === 'ORANGE_BFA' ? 'Orange Money' : 'Moov Money'}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Amount */}
            <TextInput
              style={walletStyles.input}
              value={topUpAmount}
              onChangeText={setTopUpAmount}
              placeholder="Montant en XOF (min. 500)"
              keyboardType="numeric"
              placeholderTextColor={theme.colors.textMuted}
            />

            {/* Phone */}
            <View style={walletStyles.phoneRow}>
              <Text style={walletStyles.phonePrefix}>+226</Text>
              <TextInput
                style={walletStyles.phoneInput}
                value={topUpPhone}
                onChangeText={setTopUpPhone}
                placeholder="Numéro Mobile Money"
                keyboardType="phone-pad"
                maxLength={13}
                placeholderTextColor={theme.colors.textMuted}
              />
            </View>

            {topUpError ? (
              <Text style={walletStyles.errorText}>{topUpError}</Text>
            ) : null}

            <View style={walletStyles.topUpActions}>
              <OrbiButton
                onPress={() => setShowTopUp(false)}
                label="Annuler"
                variant="secondary"
                tone="teal"
                style={walletStyles.cancelBtn}
                labelStyle={walletStyles.cancelBtnLabel}
              />
              <OrbiButton
                onPress={() => void handleTopUp()}
                disabled={isTopUpSubmitting}
                loading={isTopUpSubmitting}
                label="Confirmer"
                tone="teal"
                style={walletStyles.confirmBtn}
                labelStyle={walletStyles.confirmBtnLabel}
              />
            </View>
          </View>
        ) : null}

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
        <View style={styles.trustedContactsPanel}>
          <View style={styles.trustedContactsPanelHeader}>
            <Text style={styles.trustedContactsPanelTitle}>Contacts suivis</Text>
            <Text style={styles.trustedContactsCount}>{trustedContactCountLabel}</Text>
          </View>
          {activeTrustedContacts.length > 0 ? (
            activeTrustedContacts.map((contact, index) => (
              <View style={styles.trustedContactRow} key={`${contact.phoneNumber}-${contact.priority}`}>
                <View style={styles.trustedContactRank}>
                  <Text style={styles.trustedContactRankLabel}>{index + 1}</Text>
                </View>
                <View style={styles.trustedContactInfo}>
                  <Text style={styles.trustedContactName}>{contact.label}</Text>
                  <Text style={styles.trustedContactPhone}>
                    {maskPhoneForDisplay(contact.phoneNumber)}
                  </Text>
                </View>
                {contact.priority === 1 ? (
                  <Text style={styles.trustedContactBadge}>Principal</Text>
                ) : null}
                {contact.id ? (
                  <View style={styles.trustedContactActions}>
                    {contact.priority !== 1 ? (
                      <Pressable
                        onPress={() => void handlePrioritizeTrustedContactEntry(contact)}
                        disabled={isSavingTrustedRoster}
                        style={[
                          styles.trustedContactSmallAction,
                          isSavingTrustedRoster ? styles.refreshButtonDisabled : null,
                        ]}
                      >
                        <Text style={styles.trustedContactSmallActionLabel}>Prioriser</Text>
                      </Pressable>
                    ) : null}
                    <Pressable
                      onPress={() => void handleDeactivateTrustedContactEntry(contact)}
                      disabled={isSavingTrustedRoster}
                      style={[
                        styles.trustedContactSmallAction,
                        styles.trustedContactDangerAction,
                        isSavingTrustedRoster ? styles.refreshButtonDisabled : null,
                      ]}
                    >
                      <Text style={styles.trustedContactDangerActionLabel}>Retirer</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            ))
          ) : (
            <Text style={styles.trustedContactsEmpty}>
              Ajoutez un numero Burkina pour preparer le partage trajet.
            </Text>
          )}
          <Text style={styles.trustedContactsHint}>
            Le contact en priorite 1 recoit le partage automatique en premier.
          </Text>
        </View>
        <View style={styles.trustedContactEditor}>
          <Text style={styles.trustedContactsPanelTitle}>Ajouter un contact</Text>
          <TextInput
            value={trustedRosterForm.label}
            onChangeText={(value) =>
              setTrustedRosterForm((current) => ({ ...current, label: value }))
            }
            placeholder="Nom du contact"
            placeholderTextColor={theme.colors.muted}
            maxLength={40}
            style={styles.input}
          />
          <TextInput
            value={trustedRosterForm.phoneNumber}
            onChangeText={(value) =>
              setTrustedRosterForm((current) => ({ ...current, phoneNumber: value }))
            }
            placeholder="+22670000002"
            placeholderTextColor={theme.colors.muted}
            keyboardType="phone-pad"
            style={styles.input}
          />
          <View style={styles.modeRow}>
            {([1, 2, 3] as const).map((priority) => (
              <Pressable
                key={priority}
                onPress={() =>
                  setTrustedRosterForm((current) => ({ ...current, priority }))
                }
                style={[
                  styles.modeChip,
                  trustedRosterForm.priority === priority ? styles.modeChipActive : null,
                ]}
              >
                <Text
                  style={[
                    styles.modeChipLabel,
                    trustedRosterForm.priority === priority ? styles.modeChipLabelActive : null,
                  ]}
                >
                  Priorite {priority}
                </Text>
              </Pressable>
            ))}
          </View>
          <Pressable
            onPress={() => void handleCreateTrustedContactEntry()}
            disabled={isSavingTrustedRoster || activeTrustedContacts.length >= 3}
            style={[
              styles.secondaryAction,
              isSavingTrustedRoster || activeTrustedContacts.length >= 3
                ? styles.refreshButtonDisabled
                : null,
            ]}
          >
            <Text style={styles.secondaryActionLabel}>
              {isSavingTrustedRoster ? 'Synchronisation...' : 'Ajouter un contact'}
            </Text>
          </Pressable>
        </View>
        <TextInput
          value={trustedContactForm.phoneNumber}
          onChangeText={(value) =>
            setTrustedContactForm((current) => ({ ...current, phoneNumber: value }))
          }
          placeholder="+22670000001"
          placeholderTextColor={theme.colors.muted}
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
          placeholderTextColor={theme.colors.muted}
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
          placeholderTextColor={theme.colors.muted}
          style={styles.input}
        />
        <TextInput
          value={placeForm.address}
          onChangeText={(value) => setPlaceForm((current) => ({ ...current, address: value, latitude: '', longitude: '' }))}
          placeholder="Adresse (ex: Patte d'Oie, Ouagadougou)"
          placeholderTextColor={theme.colors.muted}
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
            {isGeocodingPlace ? 'Localisation...' : placeForm.latitude ? 'Adresse relocalisée' : 'Localiser l\'adresse'}
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
            placeholderTextColor={theme.colors.muted}
            keyboardType="decimal-pad"
            style={[styles.input, styles.coordinateInput]}
          />
          <TextInput
            value={placeForm.longitude}
            onChangeText={(value) =>
              setPlaceForm((current) => ({ ...current, longitude: value }))
            }
            placeholder="Longitude"
            placeholderTextColor={theme.colors.muted}
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
              placeholderTextColor={theme.colors.muted}
              value={ticketForm.subject}
              onChangeText={(v) => setTicketForm((f) => ({ ...f, subject: v }))}
              maxLength={120}
              editable={!isSubmittingTicket}
            />
            <TextInput
              style={[styles.input, styles.ticketDescInput]}
              placeholder="Decrivez votre probleme en detail..."
              placeholderTextColor={theme.colors.muted}
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
              <OrbiButton
                style={[styles.primaryAction, isSubmittingTicket && { opacity: 0.6 }]}
                onPress={() => void handleCreateTicket()}
                disabled={isSubmittingTicket}
                loading={isSubmittingTicket}
                label="Envoyer la demande"
                tone="teal"
                labelStyle={styles.primaryActionLabel}
              />
              <OrbiButton
                style={styles.secondaryAction}
                onPress={() => setIsTicketFormOpen(false)}
                disabled={isSubmittingTicket}
                label="Annuler"
                variant="secondary"
                tone="teal"
                labelStyle={styles.secondaryActionLabel}
              />
            </View>
          </>
        ) : (
          <OrbiButton
            style={styles.secondaryAction}
            onPress={() => setIsTicketFormOpen(true)}
            label="Contacter le support"
            variant="secondary"
            tone="teal"
            labelStyle={styles.secondaryActionLabel}
          />
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
  const theme = useOrbiTheme();
  const langStyles = useMemo(() => makeLangStyles(theme), [theme]);
  const [current, setCurrent] = useState<SupportedLanguage>('fr');

  function handleSelect(lang: SupportedLanguage) {
    setCurrent(lang);
    void changeLanguage(lang);
  }

  return (
    <View style={langStyles.card}>
      <View style={langStyles.header}>
        <Text style={langStyles.title}>Langue</Text>
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

const makeLangStyles = (theme: OrbiTheme) => StyleSheet.create({
  card: {
    backgroundColor: theme.colors.riderBackground,
    borderRadius: 16, borderWidth: 1, borderColor: theme.colors.border,
    padding: 16, gap: 12, marginHorizontal: 16,
  },
  header: { flexDirection: 'row', alignItems: 'center' },
  title: { fontSize: 15, fontWeight: '700', fontFamily: 'Inter_700Bold', color: theme.colors.text },
  chips: { flexDirection: 'row', gap: 8 },
  chip: {
    flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center',
    backgroundColor: theme.colors.backgroundAlt,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  chipActive: { backgroundColor: theme.colors.text, borderColor: theme.colors.text },
  chipText: { fontSize: 13, fontWeight: '600', fontFamily: 'Inter_600SemiBold', color: theme.colors.textSoft },
  chipTextActive: { color: theme.colors.textInverse },
});

const makeStyles = (theme: OrbiTheme) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.riderBackground },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    fontFamily: 'Raleway_800ExtraBold',
    color: theme.colors.text,
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
    color: theme.colors.danger,
  },

  content: { paddingHorizontal: 16, paddingTop: 12, gap: 12 },
  accountStatusBanner: {
    marginHorizontal: 16,
    marginTop: 8,
  },

  // User card
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(0,201,167,0.18)',
    padding: 14,
    ...theme.shadows.card,
  },
  avatarCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: theme.colors.accentDark,
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
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
    color: theme.colors.text,
  },
  userEmail: {
    fontSize: 13,
    color: theme.colors.textSoft,
    fontFamily: 'Inter_400Regular',
  },
  userPhone: {
    fontSize: 13,
    color: theme.colors.textMuted,
    fontFamily: 'Inter_400Regular',
  },
  privacyHint: {
    marginTop: 4,
    fontSize: 10,
    color: theme.colors.teal,
    fontFamily: 'Inter_600SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 0,
  },

  // Stats
  statsRow: { flexDirection: 'row', gap: 8 },
  statCard: {
    flex: 1,
    borderRadius: 14,
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
  flowDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.teal },
  flowText: { flex: 1, fontSize: 13, fontWeight: '500', fontFamily: 'Inter_500Medium', color: theme.colors.text },
  newTripBtn: {
    borderRadius: 14,
    minHeight: 50,
  },
  newTripBtnText: {
    fontSize: 16,
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
    color: theme.colors.text,
  },
  cardMeta: {
    fontSize: 13,
    color: theme.colors.textMuted,
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
  statusPillTextReady: { color: theme.colors.teal },
  statusPillTextPending: { color: theme.colors.amber },

  // Form elements
  screen: { gap: 14 },
  title: {
    color: theme.colors.text,
    fontSize: 32,
    fontWeight: '800',
  },
  subtitle: {
    color: theme.colors.muted,
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
    backgroundColor: theme.colors.backgroundAlt,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  refreshButtonDisabled: {
    opacity: 0.65,
  },
  refreshButtonLabel: {
    color: theme.colors.text,
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
    borderColor: theme.colors.danger,
  },
  signOutButtonLabel: {
    color: theme.colors.danger,
    fontWeight: '700',
    fontSize: 13,
  },
  card: {
    backgroundColor: theme.colors.panel,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 18,
    gap: 8,
  },
  cardHighlight: {
    borderColor: theme.colors.teal,
    backgroundColor: theme.colors.accentLight,
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
  trustedContactsPanel: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.backgroundAlt,
    padding: 12,
    gap: 10,
  },
  trustedContactsPanelHeader: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  trustedContactsPanelTitle: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '800',
  },
  trustedContactsCount: {
    color: theme.colors.teal,
    fontSize: 12,
    fontWeight: '800',
  },
  trustedContactRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  trustedContactRank: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(20,184,166,0.14)',
  },
  trustedContactRankLabel: {
    color: theme.colors.teal,
    fontSize: 12,
    fontWeight: '900',
  },
  trustedContactInfo: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  trustedContactName: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  trustedContactPhone: {
    color: theme.colors.textSoft,
    fontSize: 12,
    fontWeight: '600',
  },
  trustedContactBadge: {
    color: theme.colors.textInverse,
    backgroundColor: theme.colors.text,
    borderRadius: 999,
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 11,
    fontWeight: '800',
  },
  trustedContactActions: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingLeft: 40,
  },
  trustedContactSmallAction: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: theme.colors.panel,
  },
  trustedContactSmallActionLabel: {
    color: theme.colors.text,
    fontSize: 11,
    fontWeight: '800',
  },
  trustedContactDangerAction: {
    borderColor: 'rgba(239,68,68,0.35)',
    backgroundColor: 'rgba(239,68,68,0.08)',
  },
  trustedContactDangerActionLabel: {
    color: theme.colors.danger,
    fontSize: 11,
    fontWeight: '800',
  },
  trustedContactsEmpty: {
    color: theme.colors.muted,
    fontSize: 12,
    lineHeight: 17,
  },
  trustedContactsHint: {
    color: theme.colors.muted,
    fontSize: 11,
    lineHeight: 16,
  },
  trustedContactEditor: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: 'rgba(56,189,248,0.06)',
    padding: 12,
    gap: 10,
  },
  heading: {
    color: theme.colors.text,
    fontWeight: '800',
    fontSize: 18,
  },
  meta: {
    color: theme.colors.muted,
  },
  transitionMeta: {
    color: theme.colors.sky,
    fontWeight: '700',
    lineHeight: 19,
  },
  flowMeta: {
    color: theme.colors.text,
    fontWeight: '700',
    lineHeight: 20,
  },
  input: {
    minWidth: 0,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.backgroundAlt,
    color: theme.colors.text,
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
    color: theme.colors.sky,
    fontWeight: '700',
    fontSize: 13,
  },
  coordConfirm: {
    color: theme.colors.teal,
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: 2,
  },
  coordinateRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  coordinateInput: {
    flexBasis: 128,
    flexGrow: 1,
    minWidth: 0,
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
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.backgroundAlt,
  },
  modeChipActive: {
    borderColor: theme.colors.text,
    backgroundColor: theme.colors.text,
  },
  modeChipLabel: {
    color: theme.colors.textSoft,
    fontWeight: '700',
    fontSize: 12,
  },
  modeChipLabelActive: {
    color: theme.colors.textInverse,
  },
  placeRow: {
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
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
    color: theme.colors.text,
    fontWeight: '700',
    fontSize: 16,
  },
  placeTransitionBadge: {
    alignSelf: 'flex-start',
    color: theme.colors.sky,
    fontWeight: '800',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0,
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
    backgroundColor: theme.colors.text,
    ...theme.shadows.button,
  },
  primaryActionLabel: {
    color: theme.colors.textInverse,
    fontWeight: '700',
    fontSize: 13,
  },
  secondaryAction: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: theme.colors.backgroundAlt,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  secondaryActionLabel: {
    color: theme.colors.text,
    fontWeight: '700',
    fontSize: 13,
  },
  inlineAction: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.backgroundAlt,
  },
  inlineActionLabel: {
    color: theme.colors.text,
    fontWeight: '700',
    fontSize: 12,
  },
  inlineDangerAction: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: theme.colors.danger,
    backgroundColor: 'rgba(248, 113, 113, 0.12)',
  },
  inlineDangerActionLabel: {
    color: theme.colors.danger,
    fontWeight: '700',
    fontSize: 12,
  },
  ticketRow: {
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    gap: 4,
  },
  ticketHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ticketSubject: {
    flex: 1,
    color: theme.colors.text,
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
    color: theme.colors.muted,
    fontWeight: '700',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0,
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
    letterSpacing: 0,
    color: theme.colors.teal,
    marginBottom: 4,
  },
  adminNoteText: {
    fontSize: 13,
    color: theme.colors.text,
    lineHeight: 18,
  },
});

const makeWalletStyles = (theme: OrbiTheme) => StyleSheet.create({
  card: {
    backgroundColor: 'rgba(0,201,167,0.05)',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(0,201,167,0.20)',
    padding: 16,
    gap: 8,
    marginHorizontal: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
    color: theme.colors.teal,
    textTransform: 'uppercase',
    letterSpacing: 0,
    marginBottom: 2,
  },
  balance: {
    fontSize: 22,
    fontWeight: '800',
    fontFamily: 'Inter_700Bold',
    color: theme.colors.text,
  },
  rechargeBtn: {
    backgroundColor: theme.colors.teal,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  rechargeBtnPressed: { opacity: 0.85 },
  rechargeBtnLabel: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
    fontFamily: 'Inter_700Bold',
  },
  lockedText: {
    fontSize: 12,
    color: '#FF9500',
    fontFamily: 'Inter_500Medium',
  },

  // Top-up form
  topUpSheet: {
    backgroundColor: theme.colors.backgroundAlt,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 16,
    marginHorizontal: 16,
    gap: 12,
  },
  topUpTitle: {
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
    color: theme.colors.text,
  },
  networkRow: { flexDirection: 'row', gap: 8 },
  networkChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
  },
  networkChipActive: {
    borderColor: theme.colors.teal,
    backgroundColor: 'rgba(0,201,167,0.06)',
  },
  networkLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.textSoft,
    fontFamily: 'Inter_600SemiBold',
  },
  networkLabelActive: { color: theme.colors.teal },
  input: {
    backgroundColor: theme.colors.backgroundAlt,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: theme.colors.text,
  },
  phoneRow: {
    flexDirection: 'row',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    overflow: 'hidden',
  },
  phonePrefix: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.textSoft,
    borderRightWidth: 1,
    borderRightColor: theme.colors.border,
    backgroundColor: theme.colors.backgroundDim,
  },
  phoneInput: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
    color: theme.colors.text,
  },
  errorText: {
    fontSize: 12,
    color: '#FF3B30',
    fontFamily: 'Inter_400Regular',
  },
  topUpActions: { flexDirection: 'row', gap: 10 },
  cancelBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
  },
  cancelBtnLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.textSoft,
  },
  confirmBtn: {
    flex: 2,
    backgroundColor: theme.colors.teal,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  confirmBtnDisabled: { opacity: 0.45 },
  confirmBtnPressed: { opacity: 0.85 },
  confirmBtnLabel: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
  },
});

const makeAccountIconStyles = (theme: OrbiTheme) => StyleSheet.create({
  forwardWrap: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  forwardLine: {
    position: 'absolute',
    width: 10,
    height: 2.5,
    borderRadius: 999,
    backgroundColor: theme.colors.teal,
    right: 3,
  },
  forwardLineTop: {
    transform: [{ rotate: '45deg' }, { translateY: -3 }],
  },
  forwardLineBottom: {
    transform: [{ rotate: '-45deg' }, { translateY: 3 }],
  },
});
