import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { preventSensitiveScreenCapture, restoreSensitiveScreenCapture } from '../../lib/privacy/screen-capture';
import {
  createSupportTicketWithApi,
  fetchMyTrips,
  fetchDriverProfile,
  getMySupportTicketsWithApi,
  requestDriverDocumentUploadLinks,
  type DriverDocumentUploadLinksResponse,
  type DriverProfileResponse,
  type MyTripsResponse,
  type SupportTicket,
  upsertDriverOnboarding,
} from '@orbi/api';
import { maskEmailForDisplay } from '@orbi/domain';
import { router } from 'expo-router';
import { formatOperationalStatus, orbiCopy, type OrbiTheme } from '@orbi/ui';
import {
  OrbiButton,
  OrbiMetricTile,
  OrbiStatusBanner,
  OrbiSurface,
  useOrbiTheme,
  VehicleIllustration,
} from '@orbi/ui/native';
import { useTranslation } from '../../lib/i18n';
import {
  restoreDriverSession,
  signOutDriverAccount,
} from '../../lib/auth';
import {
  parseOptionalDriverVehicleYear,
  parseOptionalPositiveInteger,
} from '../../lib/driver-onboarding-safety';
import { useLiveRefresh } from '../../lib/use-live-refresh';
import { resolveDriverAppError } from '../../lib/session-feedback';
import {
  buildDriverProfileStatusLabel,
  resolveDriverActiveFlow,
} from '../../lib/driver-active-flow';
import {
  formatDriverOnboardingProgress,
  formatDriverProfileBytes,
  formatDriverProfileCount,
  formatDriverProfileDateTime,
  formatDriverProfileDistanceKm,
  formatDriverProfilePercent,
  formatDriverProfileRatioPercent,
  formatDriverProfileRating,
  resolveDriverProfileRatioTone,
} from '../../lib/driver-profile-signal';
import {
  fallbackDriverProfile,
  normalizeDriverProfileResponse,
} from '../../lib/driver-profile-normalizer';

const cityOptions = [
  'OUAGADOUGOU',
  'BOBO_DIOULASSO',
  'KOUDOUGOU',
  'BANFORA',
  'OUAHIGOUYA',
] as const;

const vehicleTypeOptions = ['MOTORCYCLE', 'CAR'] as const;
const serviceTierOptions = {
  MOTORCYCLE: ['MOTO_STANDARD'],
  CAR: ['CAR_STANDARD', 'CAR_COMFORT', 'CAR_XL'],
} as const;

const documentDescriptors = [
  {
    type: 'IDENTITY_DOCUMENT',
    label: 'Piece d identite',
    placeholder: 'ex: carte-identite.pdf',
  },
  {
    type: 'DRIVER_LICENSE',
    label: 'Permis de conduire',
    placeholder: 'ex: permis.pdf',
  },
  {
    type: 'VEHICLE_REGISTRATION',
    label: 'Carte grise',
    placeholder: 'ex: carte-grise.pdf',
  },
  {
    type: 'INSURANCE_PROOF',
    label: 'Assurance',
    placeholder: 'ex: assurance.pdf',
  },
  {
    type: 'SELFIE_VERIFICATION',
    label: 'Selfie de verification',
    placeholder: 'ex: selfie.jpg',
  },
] as const;
const touchHitSlop = { top: 8, right: 8, bottom: 8, left: 8 };

type DocumentType = (typeof documentDescriptors)[number]['type'];
type VehicleTypeOption = (typeof vehicleTypeOptions)[number];
type ServiceTierOption = (typeof serviceTierOptions)[VehicleTypeOption][number];
type DriverDocumentLink = DriverDocumentUploadLinksResponse['links'][number];

type OnboardingFormState = {
  phoneNumber: string;
  licenseNumber: string;
  city: (typeof cityOptions)[number];
  serviceRadiusKm: string;
  vehiclePlateNumber: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleColor: string;
  vehicleYear: string;
  vehicleSeats: string;
  vehicleType: VehicleTypeOption;
  vehicleTier: ServiceTierOption;
  documentFileNames: Record<DocumentType, string>;
};

function inferMimeType(fileName: string) {
  const normalized = fileName.trim().toLowerCase();

  if (normalized.endsWith('.pdf')) {
    return 'application/pdf';
  }

  if (normalized.endsWith('.png')) {
    return 'image/png';
  }

  if (normalized.endsWith('.jpg') || normalized.endsWith('.jpeg')) {
    return 'image/jpeg';
  }

  return 'application/octet-stream';
}

function buildInitialForm(profile: DriverProfileResponse): OnboardingFormState {
  const vehicles = Array.isArray(profile.profile.vehicles)
    ? profile.profile.vehicles
    : [];
  const documents = Array.isArray(profile.profile.onboarding.documents)
    ? profile.profile.onboarding.documents
    : [];
  const primaryVehicle = vehicles[0];
  const vehicleType = primaryVehicle?.type ?? 'CAR';
  const existingDocuments = Object.fromEntries(
    documentDescriptors.map((document) => {
      const existing = documents.find(
        (candidate) => candidate.type === document.type,
      );

      return [document.type, existing?.fileName ?? ''];
    }),
  ) as Record<DocumentType, string>;

  return {
    phoneNumber: profile.profile.phoneNumber ?? '',
    licenseNumber: '',
    city:
      (profile.profile.onboarding.city as OnboardingFormState['city'] | null) ??
      'OUAGADOUGOU',
    serviceRadiusKm:
      profile.profile.serviceRadiusKm !== null
        ? String(profile.profile.serviceRadiusKm)
        : '8',
    vehiclePlateNumber: primaryVehicle?.plateNumber ?? '',
    vehicleMake: primaryVehicle?.make ?? '',
    vehicleModel: primaryVehicle?.model ?? '',
    vehicleColor: primaryVehicle?.color ?? '',
    vehicleYear: '',
    vehicleSeats: '',
    vehicleType,
    vehicleTier:
      (primaryVehicle ? toApiTier(primaryVehicle.tier) : undefined) ??
      (vehicleType === 'MOTORCYCLE' ? 'MOTO_STANDARD' : 'CAR_STANDARD'),
    documentFileNames: existingDocuments,
  };
}

function formatDocumentLabel(type: DocumentType) {
  return documentDescriptors.find((document) => document.type === type)?.label ?? type;
}

function toApiTier(
  tier: DriverProfileResponse['profile']['vehicles'][number]['tier'],
): ServiceTierOption {
  return tier.replace(/-/g, '_') as ServiceTierOption;
}

function toDisplayTier(tier: ServiceTierOption) {
  return tier.replace(/_/g, '-') as DriverProfileResponse['profile']['vehicles'][number]['tier'];
}

export default function ProfilScreen() {
  const theme = useOrbiTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { t } = useTranslation();
  const td = (key: string, opts?: Record<string, unknown>): string => String(t(`driver.${key}`, opts as never));
  const [profile, setProfile] = useState<DriverProfileResponse>(fallbackDriverProfile);
  const [history, setHistory] = useState<MyTripsResponse | null>(null);
  const [form, setForm] = useState<OnboardingFormState>(
    buildInitialForm(fallbackDriverProfile),
  );
  const [status, setStatus] = useState('Chargement du profil chauffeur...');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPreparingDocuments, setIsPreparingDocuments] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [hasLoadedProfile, setHasLoadedProfile] = useState(false);
  const [profileTransitionLabel, setProfileTransitionLabel] = useState<string | null>(null);
  const [freshDocumentTypes, setFreshDocumentTypes] = useState<DocumentType[]>([]);
  const [freshReviewIds, setFreshReviewIds] = useState<string[]>([]);
  const [preparedDocumentLinks, setPreparedDocumentLinks] = useState<
    Partial<Record<DocumentType, DriverDocumentLink>>
  >({});
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [isOnboardingFormOpen, setIsOnboardingFormOpen] = useState(false);
  const [hasSetOnboardingFormDefault, setHasSetOnboardingFormDefault] = useState(false);
  const [isTicketFormOpen, setIsTicketFormOpen] = useState(false);
  const [isSubmittingTicket, setIsSubmittingTicket] = useState(false);
  const [ticketForm, setTicketForm] = useState({
    subject: '',
    description: '',
    category: 'other' as 'payment' | 'trip' | 'account' | 'driver' | 'safety' | 'other',
  });
  const previousReadinessRef = useRef<number | null>(null);
  const previousDocumentStatusesRef = useRef<Partial<Record<DocumentType, string>> | null>(null);
  const previousReviewIdsRef = useRef<string[] | null>(null);

  useEffect(() => {
    void loadProfile();
  }, []);

  useEffect(() => {
    preventSensitiveScreenCapture();
    return () => {
      restoreSensitiveScreenCapture();
    };
  }, []);

  useLiveRefresh(() => {
    if (!hasLoadedProfile) {
      return;
    }

    return loadProfile(true);
  }, 45000);

  useEffect(() => {
    const readiness = profile.profile.onboarding.readinessPercent;
    const previousReadiness = previousReadinessRef.current;

    if (previousReadiness !== null && readiness !== previousReadiness) {
      setProfileTransitionLabel(`Dossier ops mis a jour: readiness ${readiness}%.`);
    }

    previousReadinessRef.current = readiness;
  }, [profile.profile.onboarding.readinessPercent]);

  useEffect(() => {
    const nextDocumentStatuses = Object.fromEntries(
      profile.profile.onboarding.documents.map((document) => [document.type, document.status]),
    ) as Partial<Record<DocumentType, string>>;
    const previousDocumentStatuses = previousDocumentStatusesRef.current;

    if (previousDocumentStatuses) {
      const nextFreshDocumentTypes = profile.profile.onboarding.documents
        .filter((document) => previousDocumentStatuses[document.type] !== document.status)
        .map((document) => document.type);

      if (nextFreshDocumentTypes.length > 0) {
        setFreshDocumentTypes(nextFreshDocumentTypes);
        setProfileTransitionLabel('Un ou plusieurs justificatifs ont change de statut.');
      }
    }

    previousDocumentStatusesRef.current = nextDocumentStatuses;
  }, [profile.profile.onboarding.documents]);

  useEffect(() => {
    const nextReviewIds = profile.profile.onboarding.reviewTimeline.map((review) => review.id);
    const previousReviewIds = previousReviewIdsRef.current;

    if (previousReviewIds) {
      const nextFreshReviewIds = nextReviewIds.filter((reviewId) => !previousReviewIds.includes(reviewId));

      if (nextFreshReviewIds.length > 0) {
        setFreshReviewIds(nextFreshReviewIds);
        setProfileTransitionLabel('Une nouvelle decision operations vient d entrer dans la timeline.');
      }
    }

    previousReviewIdsRef.current = nextReviewIds;
  }, [profile.profile.onboarding.reviewTimeline]);

  useEffect(() => {
    if (!profileTransitionLabel) {
      return;
    }

    const timeout = setTimeout(() => {
      setProfileTransitionLabel(null);
    }, 5000);

    return () => clearTimeout(timeout);
  }, [profileTransitionLabel]);

  useEffect(() => {
    if (!freshDocumentTypes.length) {
      return;
    }

    const timeout = setTimeout(() => {
      setFreshDocumentTypes([]);
    }, 5000);

    return () => clearTimeout(timeout);
  }, [freshDocumentTypes]);

  useEffect(() => {
    if (!freshReviewIds.length) {
      return;
    }

    const timeout = setTimeout(() => {
      setFreshReviewIds([]);
    }, 5000);

    return () => clearTimeout(timeout);
  }, [freshReviewIds]);

  async function withDriverClient() {
    return restoreDriverSession();
  }

  function updateForm<Key extends keyof OnboardingFormState>(
    key: Key,
    value: OnboardingFormState[Key],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updateDocumentFileName(type: DocumentType, fileName: string) {
    setPreparedDocumentLinks((current) => {
      const next = { ...current };
      delete next[type];
      return next;
    });
    setForm((current) => ({
      ...current,
      documentFileNames: {
        ...current.documentFileNames,
        [type]: fileName,
      },
    }));
  }

  function updateVehicleType(type: VehicleTypeOption) {
    updateForm('vehicleType', type);
    updateForm(
      'vehicleTier',
      type === 'MOTORCYCLE' ? 'MOTO_STANDARD' : 'CAR_STANDARD',
    );
  }

  function validateForm() {
    if (!form.phoneNumber.trim()) {
      return 'Le numero de telephone est requis avant la soumission.';
    }

    if (!form.licenseNumber.trim()) {
      return 'Le numero de permis est requis.';
    }

    if (!form.serviceRadiusKm.trim()) {
      return 'Le rayon de service est requis.';
    }

    const parsedServiceRadiusKm = parseOptionalPositiveInteger(
      form.serviceRadiusKm,
    );

    if (parsedServiceRadiusKm === null) {
      return 'Le rayon de service doit etre un nombre positif.';
    }

    if (
      !form.vehiclePlateNumber.trim() ||
      !form.vehicleMake.trim() ||
      !form.vehicleModel.trim() ||
      !form.vehicleColor.trim()
    ) {
      return 'Les informations du vehicule principal doivent etre completes.';
    }

    const missingDocument = documentDescriptors.find(
      (document) => !form.documentFileNames[document.type].trim(),
    );

    if (missingDocument) {
      return `Le justificatif ${missingDocument.label.toLowerCase()} est requis.`;
    }

    if (
      form.vehicleYear.trim() &&
      parseOptionalDriverVehicleYear(form.vehicleYear) === null
    ) {
      return "L'annee du vehicule doit etre comprise entre 1990 et 2035.";
    }

    const parsedVehicleSeats = parseOptionalPositiveInteger(form.vehicleSeats);

    if (form.vehicleSeats.trim() && parsedVehicleSeats === null) {
      return 'Le nombre de places doit etre numerique.';
    }

    if (
      form.vehicleType === 'MOTORCYCLE' &&
      parsedVehicleSeats !== null &&
      parsedVehicleSeats > 2
    ) {
      return 'Une moto ne peut pas declarer plus de 2 places.';
    }

    return null;
  }

  async function prepareDocuments() {
    const validationError = validateForm();

    if (validationError) {
      setStatus(validationError);
      return null;
    }

    setIsPreparingDocuments(true);
    setStatus('Preparation des liens documentaires securises...');

    try {
      const { authClient } = await withDriverClient();
      const response = await requestDriverDocumentUploadLinks(authClient, {
        documents: documentDescriptors.map((document) => ({
          type: document.type,
          fileName: form.documentFileNames[document.type].trim(),
          mimeType: inferMimeType(form.documentFileNames[document.type]),
        })),
      });

      const nextPrepared = Object.fromEntries(
        documentDescriptors.map((document, index) => [
          document.type,
          response.links[index],
        ]),
      ) as Partial<Record<DocumentType, DriverDocumentLink>>;

      setPreparedDocumentLinks(nextPrepared);
      setStatus(
        'Liens documentaires securises prets avec contraintes visibles.',
      );

      return nextPrepared;
    } catch (error) {
      const feedback = await resolveDriverAppError(error, {
        fallback: 'Impossible de preparer les liens documentaires.',
      });
      setStatus(feedback.message);
      return null;
    } finally {
      setIsPreparingDocuments(false);
    }
  }

  async function loadProfile(silent = false) {
    if (!silent) {
      setIsRefreshing(true);
    }

    try {
      const { authClient } = await withDriverClient();
      const [profileResponse, historyResponse, ticketsResponse] = await Promise.all([
        fetchDriverProfile(authClient),
        fetchMyTrips(authClient),
        getMySupportTicketsWithApi(authClient),
      ]);
      const normalizedProfile = normalizeDriverProfileResponse(profileResponse);
      const nextTickets = Array.isArray(ticketsResponse.tickets)
        ? ticketsResponse.tickets
        : [];

      setProfile(normalizedProfile);
      setHistory(historyResponse);
      setTickets(nextTickets);
      setForm(buildInitialForm(normalizedProfile));
      setPreparedDocumentLinks({});
      setHasLoadedProfile(true);
      if (!hasSetOnboardingFormDefault) {
        // First load: open the form automatically only if there's nothing to edit yet —
        // returning drivers with a vehicle already on file get the compact summary instead.
        setIsOnboardingFormOpen(normalizedProfile.profile.vehicles.length === 0);
        setHasSetOnboardingFormDefault(true);
      }
      const flow = resolveDriverActiveFlow({
        history: historyResponse,
        offers: [],
        reservationNow: 0,
        driverProfileStatus: normalizedProfile.profile.status,
      });
      if (!silent) {
        setStatus(buildDriverProfileStatusLabel({ flow }));
      }
    } catch (error) {
      const feedback = await resolveDriverAppError(error, {
        network: orbiCopy.driverNetworkUnavailable,
        fallback: orbiCopy.serviceUnavailable,
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

  async function handleSubmitOnboarding() {
    const validationError = validateForm();

    if (validationError) {
      setStatus(validationError);
      return;
    }

    setIsSubmitting(true);
    setStatus('Soumission du dossier chauffeur aux operations...');

    const parsedServiceRadiusKm = parseOptionalPositiveInteger(
      form.serviceRadiusKm,
    );
    const parsedVehicleYear = parseOptionalDriverVehicleYear(form.vehicleYear);
    const parsedVehicleSeats = parseOptionalPositiveInteger(form.vehicleSeats);

    if (parsedServiceRadiusKm === null) {
      setStatus('Le rayon de service doit etre numerique.');
      setIsSubmitting(false);
      return;
    }

    try {
      const preparedLinks =
        Object.keys(preparedDocumentLinks).length === documentDescriptors.length
          ? preparedDocumentLinks
          : await prepareDocuments();

      if (!preparedLinks) {
        return;
      }

      const { authClient } = await withDriverClient();
      const response = await upsertDriverOnboarding(authClient, {
        phoneNumber: form.phoneNumber.trim(),
        licenseNumber: form.licenseNumber.trim(),
        city: form.city,
        serviceRadiusKm: parsedServiceRadiusKm,
        documents: {
          identityDocumentProvided: Boolean(
            form.documentFileNames.IDENTITY_DOCUMENT.trim(),
          ),
          driverLicenseProvided: Boolean(
            form.documentFileNames.DRIVER_LICENSE.trim(),
          ),
          vehicleRegistrationProvided: Boolean(
            form.documentFileNames.VEHICLE_REGISTRATION.trim(),
          ),
          insuranceProofProvided: Boolean(
            form.documentFileNames.INSURANCE_PROOF.trim(),
          ),
          selfieMatchProvided: Boolean(
            form.documentFileNames.SELFIE_VERIFICATION.trim(),
          ),
        },
        documentArtifacts: documentDescriptors.map((document) => ({
          type: document.type,
          fileName: form.documentFileNames[document.type].trim(),
          storageKey: preparedLinks[document.type]?.storageKey ?? '',
          mimeType: inferMimeType(form.documentFileNames[document.type]),
          expiresAt: preparedLinks[document.type]?.expiresAt,
          uploadSource: 'driver-app',
        })),
        vehicles: [
          {
            plateNumber: form.vehiclePlateNumber.trim(),
            make: form.vehicleMake.trim(),
            model: form.vehicleModel.trim(),
            color: form.vehicleColor.trim(),
            year: parsedVehicleYear ?? undefined,
            type: form.vehicleType,
            tier: form.vehicleTier,
            seats: parsedVehicleSeats ?? undefined,
          },
        ],
      });

      setProfile((current) => ({
        profile: {
          ...current.profile,
          phoneNumber: form.phoneNumber.trim(),
          serviceRadiusKm: parsedServiceRadiusKm,
          onboarding: response.onboarding,
          vehicles: [
            {
              id: current.profile.vehicles[0]?.id ?? 'primary-vehicle',
              plateNumber: form.vehiclePlateNumber.trim().toUpperCase(),
              make: form.vehicleMake.trim(),
              model: form.vehicleModel.trim(),
              color: form.vehicleColor.trim(),
              type: form.vehicleType,
              tier: toDisplayTier(form.vehicleTier),
              isActive: true,
            },
          ],
        },
      }));
      setStatus(
        'Dossier envoye. Les operations peuvent maintenant prendre la revue.',
      );
    } catch (error) {
      const feedback = await resolveDriverAppError(error, {
        fallback: "La soumission de l'onboarding a echoue.",
      });
      setStatus(feedback.message);
    } finally {
      setIsSubmitting(false);
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
      const { authClient } = await withDriverClient();
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
      const feedback = await resolveDriverAppError(error, {
        fallback: "L'envoi de votre demande a echoue. Reessayez.",
      });
      setStatus(feedback.message);
    } finally {
      setIsSubmittingTicket(false);
    }
  }

  async function handleSignOut() {
    setIsSigningOut(true);
    setStatus('Deconnexion du compte chauffeur...');

    try {
      await signOutDriverAccount();
      router.replace('/auth');
    } catch (error) {
      const feedback = await resolveDriverAppError(error, {
        fallback: "La deconnexion du compte chauffeur a echoue.",
      });
      setStatus(feedback.message);
    } finally {
      setIsSigningOut(false);
    }
  }

  const flow = resolveDriverActiveFlow({
    history,
    offers: [],
    reservationNow: 0,
    driverProfileStatus: profile.profile.status,
  });

  const initials = profile.profile.fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('') || 'OR';
  const maskedEmail = maskEmailForDisplay(profile.profile.email);

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{td('profile')}</Text>
        <View style={styles.headerRight}>
          {isRefreshing ? (
            <Text style={styles.headerLiveText}>sync</Text>
          ) : null}
          <OrbiButton
            onPress={() => void handleSignOut()}
            disabled={isSigningOut || isRefreshing || isSubmitting}
            loading={isSigningOut}
            style={styles.signOutBtn}
            label="Se deconnecter"
            variant="danger"
            tone="danger"
            labelStyle={styles.signOutBtnLabel}
          />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Section label: Identite */}
        <Text style={styles.sectionEyebrow}>Identite</Text>

        {/* User card */}
        <OrbiSurface style={styles.userCard} elevated>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarInitials}>{initials}</Text>
          </View>
          <View style={styles.userInfo}>
            <Text style={styles.userName}>
              {profile.profile.fullName || 'Chauffeur Orbi'}
            </Text>
            {maskedEmail ? (
              <Text style={styles.userEmail}>{maskedEmail}</Text>
            ) : null}
            <Text style={styles.privacyHint}>Identité masquée par défaut</Text>
          </View>
        </OrbiSurface>

        {/* Status row */}
        <OrbiSurface style={styles.statusRowCard}>
          <View style={styles.statusItem}>
            <Text style={styles.statusItemLabel}>Vérification</Text>
            <Text style={[styles.statusItemValue, { color: theme.colors.teal }]}>
              {formatOperationalStatus(profile.profile.verificationStatus)}
            </Text>
          </View>
          <View style={styles.statusDivider} />
          <View style={styles.statusItem}>
            <Text style={styles.statusItemLabel}>Statut</Text>
            <Text style={styles.statusItemValue}>
              {formatOperationalStatus(profile.profile.status)}
            </Text>
          </View>
          <View style={styles.statusDivider} />
          <View style={styles.statusItem}>
            <Text style={styles.statusItemLabel}>Dossier</Text>
            <Text style={[styles.statusItemValue, { color: theme.colors.amber }]}>
              {formatDriverProfilePercent(profile.profile.onboarding.readinessPercent)}
            </Text>
          </View>
        </OrbiSurface>

        {/* Driver performance stats */}
        <View style={styles.statsRow}>
          <OrbiMetricTile
            label="Courses"
            value={String(profile.profile.completedTripsCount)}
            style={styles.statCard}
          />
          <OrbiMetricTile
            label="Note"
            value={formatDriverProfileRating(profile.profile.averageRating, '—')}
            tone="amber"
            style={styles.statCard}
          />
          <OrbiMetricTile
            label="Taux acc."
            value={formatDriverProfileRatioPercent(
              profile.profile.dispatchSignal?.acceptanceRate,
            )}
            tone={resolveDriverProfileRatioTone(
              profile.profile.dispatchSignal?.acceptanceRate,
            )}
            style={styles.statCard}
          />
        </View>

        {/* Active mission */}
        {flow.activeTrip && flow.primaryRouteLabel ? (
          <OrbiStatusBanner
            tone="teal"
            title="Mission active"
            message={flow.primaryRouteLabel}
          />
        ) : null}

        {/* Suspension notice */}
        {flow.operationalStatus === 'SUSPENDED' ? (
          <OrbiStatusBanner
            tone="danger"
            title="Compte suspendu"
            message="Les opérations doivent lever le blocage avant reprise."
          />
        ) : null}

        {/* Status notice (shown when non-idle) */}
        {status && status !== 'Chargement du profil chauffeur...' ? (
          <OrbiStatusBanner
            tone="sky"
            title="Profil synchronisé"
            message={status}
          />
        ) : null}

      <OrbiSurface
        tone={profileTransitionLabel ? 'sky' : 'neutral'}
        style={styles.card}
      >
        <Text style={styles.name}>Onboarding securise</Text>
        <Text style={styles.meta}>
          {formatDriverOnboardingProgress(profile.profile.onboarding)}
        </Text>
        <Text style={styles.meta}>
          Ville: {profile.profile.onboarding.city ?? 'Non definie'}
        </Text>
        <Text style={styles.meta}>{profile.profile.onboarding.notes}</Text>
        {profileTransitionLabel ? (
          <OrbiStatusBanner
            tone="sky"
            title="Dossier mis à jour"
            message={profileTransitionLabel}
          />
        ) : null}
        {profile.profile.onboarding.checklist.map((item) => (
          <View key={item.id} style={styles.checklistRow}>
            <Text style={styles.checkLabel}>{item.label}</Text>
            <Text
              style={[
                styles.checkValue,
                item.completed
                  ? styles.checkValueDone
                  : styles.checkValuePending,
              ]}
            >
              {item.completed ? 'OK' : 'A fournir'}
            </Text>
          </View>
        ))}
      </OrbiSurface>

      <OrbiSurface style={styles.card}>
        <View style={styles.formHeaderRow}>
          <View style={styles.formHeaderText}>
            <Text style={styles.name}>Dossier et véhicule</Text>
            <Text style={styles.meta}>
              {profile.profile.vehicles.length > 0
                ? `${profile.profile.vehicles[0].type === 'MOTORCYCLE' ? 'Moto' : 'Voiture'} ${profile.profile.vehicles[0].make} ${profile.profile.vehicles[0].model} · ${profile.profile.vehicles[0].plateNumber}`
                : 'Aucun véhicule enregistré pour le moment.'}
            </Text>
          </View>
          <Pressable
            accessibilityLabel={isOnboardingFormOpen ? 'Réduire le formulaire du dossier' : 'Modifier le dossier et le véhicule'}
            accessibilityRole="button"
            hitSlop={touchHitSlop}
            onPress={() => setIsOnboardingFormOpen((open) => !open)}
            style={styles.editToggleBtn}
          >
            <Text style={styles.editToggleLabel}>{isOnboardingFormOpen ? 'Réduire' : 'Modifier'}</Text>
          </Pressable>
        </View>

        {isOnboardingFormOpen ? (
        <>
        <Text style={styles.meta}>
          Ce formulaire prepare les liens documentaires securises puis envoie le
          dossier complet a l equipe operations.
        </Text>

        <Text style={styles.fieldLabel}>Telephone</Text>
        <TextInput
          value={form.phoneNumber}
          onChangeText={(value) => updateForm('phoneNumber', value)}
          placeholder="+22670000000"
          placeholderTextColor={theme.colors.muted}
          keyboardType="phone-pad"
          style={styles.input}
        />

        <Text style={styles.fieldLabel}>Numero de permis</Text>
        <TextInput
          value={form.licenseNumber}
          onChangeText={(value) => updateForm('licenseNumber', value)}
          placeholder="BF-12345"
          placeholderTextColor={theme.colors.muted}
          style={styles.input}
        />

        <Text style={styles.fieldLabel}>Ville de service</Text>
        <View style={styles.optionRow}>
          {cityOptions.map((city) => (
            <Pressable
              key={city}
              accessibilityLabel={`Choisir la ville ${city.replace(/_/g, ' ')}`}
              accessibilityRole="button"
              hitSlop={touchHitSlop}
              onPress={() => updateForm('city', city)}
              style={[
                styles.pill,
                form.city === city ? styles.pillActive : styles.pillInactive,
              ]}
            >
              <Text
                style={[
                  styles.pillLabel,
                  form.city === city
                    ? styles.pillLabelActive
                    : styles.pillLabelInactive,
                ]}
              >
                {city.replace(/_/g, ' ')}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.fieldLabel}>Rayon de service (km)</Text>
        <TextInput
          value={form.serviceRadiusKm}
          onChangeText={(value) => updateForm('serviceRadiusKm', value)}
          placeholder="8"
          placeholderTextColor={theme.colors.muted}
          keyboardType="decimal-pad"
          style={styles.input}
        />

        <Text style={styles.sectionTitle}>{td('vehicle')}</Text>
        <View style={styles.optionRow}>
          {vehicleTypeOptions.map((type) => (
            <Pressable
              key={type}
              accessibilityLabel={`Choisir le type de vehicule ${type === 'MOTORCYCLE' ? 'Moto' : 'Voiture'}`}
              accessibilityRole="button"
              hitSlop={touchHitSlop}
              onPress={() => updateVehicleType(type)}
              style={[
                styles.pill,
                form.vehicleType === type
                  ? styles.pillActive
                  : styles.pillInactive,
              ]}
            >
              <VehicleIllustration tier={type === 'MOTORCYCLE' ? 'moto-standard' : 'car-standard'} width={26} height={20} />
              <Text
                style={[
                  styles.pillLabel,
                  form.vehicleType === type
                    ? styles.pillLabelActive
                    : styles.pillLabelInactive,
                ]}
              >
                {type === 'MOTORCYCLE' ? 'Moto' : 'Voiture'}
              </Text>
            </Pressable>
          ))}
        </View>

        <TextInput
          value={form.vehiclePlateNumber}
          onChangeText={(value) => updateForm('vehiclePlateNumber', value)}
          placeholder="Plaque d immatriculation"
          placeholderTextColor={theme.colors.muted}
          style={styles.input}
        />
        <TextInput
          value={form.vehicleMake}
          onChangeText={(value) => updateForm('vehicleMake', value)}
          placeholder="Marque"
          placeholderTextColor={theme.colors.muted}
          style={styles.input}
        />
        <TextInput
          value={form.vehicleModel}
          onChangeText={(value) => updateForm('vehicleModel', value)}
          placeholder="Modele"
          placeholderTextColor={theme.colors.muted}
          style={styles.input}
        />
        <TextInput
          value={form.vehicleColor}
          onChangeText={(value) => updateForm('vehicleColor', value)}
          placeholder="Couleur"
          placeholderTextColor={theme.colors.muted}
          style={styles.input}
        />

        <View style={styles.inlineInputs}>
          <TextInput
            value={form.vehicleYear}
            onChangeText={(value) => updateForm('vehicleYear', value)}
            placeholder="Annee"
            placeholderTextColor={theme.colors.muted}
            keyboardType="number-pad"
            style={[styles.input, styles.inlineInput]}
          />
          <TextInput
            value={form.vehicleSeats}
            onChangeText={(value) => updateForm('vehicleSeats', value)}
            placeholder="Places"
            placeholderTextColor={theme.colors.muted}
            keyboardType="number-pad"
            style={[styles.input, styles.inlineInput]}
          />
        </View>

        <Text style={styles.fieldLabel}>Niveau de service</Text>
        <View style={styles.optionRow}>
          {serviceTierOptions[form.vehicleType].map((tier) => (
            <Pressable
              key={tier}
              accessibilityLabel={`Choisir le niveau de service ${tier.replace(/_/g, ' ')}`}
              accessibilityRole="button"
              hitSlop={touchHitSlop}
              onPress={() => updateForm('vehicleTier', tier)}
              style={[
                styles.pill,
                form.vehicleTier === tier
                  ? styles.pillActive
                  : styles.pillInactive,
              ]}
            >
              <Text
                style={[
                  styles.pillLabel,
                  form.vehicleTier === tier
                    ? styles.pillLabelActive
                    : styles.pillLabelInactive,
                ]}
              >
                {tier.replace(/_/g, ' ')}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.sectionTitle}>{td('documents')}</Text>
        {documentDescriptors.map((document) => (
          <View key={document.type} style={styles.documentField}>
            <Text style={styles.fieldLabel}>{document.label}</Text>
            <TextInput
              value={form.documentFileNames[document.type]}
              onChangeText={(value) => updateDocumentFileName(document.type, value)}
              placeholder={document.placeholder}
              placeholderTextColor={theme.colors.muted}
              style={styles.input}
            />
            {preparedDocumentLinks[document.type] ? (
              <Text style={styles.documentHint}>
                Lien securise pret jusqu au{' '}
                {formatDriverProfileDateTime(preparedDocumentLinks[document.type]?.expiresAt)}
                . Limite:{' '}
                {formatDriverProfileBytes(
                  preparedDocumentLinks[document.type]?.constraints.maxBytes ?? 0,
                )}
                , formats:{' '}
                {preparedDocumentLinks[
                  document.type
                ]?.constraints.allowedExtensions.join(', ')}
              </Text>
            ) : (
              <Text style={styles.documentHint}>
                Renseignez un nom de fichier pour preparer le lien signe.
              </Text>
            )}
          </View>
        ))}

        <View style={styles.actionStack}>
          <OrbiButton
            accessibilityLabel="Preparer les liens documentaires securises"
            hitSlop={touchHitSlop}
            onPress={() => void prepareDocuments()}
            disabled={isPreparingDocuments || isSubmitting}
            loading={isPreparingDocuments}
            label="Preparer les liens documentaires"
            variant="secondary"
            tone="amber"
            style={styles.button}
            labelStyle={styles.secondaryButtonLabel}
          />
          <OrbiButton
            accessibilityLabel="Soumettre le dossier chauffeur aux operations"
            hitSlop={touchHitSlop}
            onPress={() => void handleSubmitOnboarding()}
            disabled={isSubmitting || isPreparingDocuments}
            loading={isSubmitting}
            label="Soumettre le dossier ops"
            tone="amber"
            style={styles.button}
            labelStyle={styles.primaryButtonLabel}
          />
        </View>
        </>
        ) : null}
      </OrbiSurface>

      <View style={styles.metricsRow}>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Rayon</Text>
          <Text style={styles.metricValue}>
            {formatDriverProfileDistanceKm(profile.profile.serviceRadiusKm, 'Non defini')}
          </Text>
          <Text style={styles.meta}>zone de prise en charge</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Note</Text>
          <Text style={styles.metricValue}>
            {formatDriverProfileRating(profile.profile.averageRating)}
          </Text>
          <Text style={styles.meta}>moyenne qualite</Text>
        </View>
      </View>

      <OrbiSurface style={styles.card}>
        <Text style={styles.name}>Vehicules actifs</Text>
        {profile.profile.vehicles.length ? (
          profile.profile.vehicles.map((vehicle) => (
            <View key={vehicle.id} style={styles.vehicleRow}>
              <Text style={styles.vehicleTitle}>
                {vehicle.type === 'MOTORCYCLE' ? 'Moto' : 'Voiture'}{' '}
                {vehicle.make} {vehicle.model}
              </Text>
              <Text style={styles.meta}>
                {vehicle.plateNumber} | {vehicle.color} | {formatOperationalStatus(vehicle.tier.replace(/-/g, '_'))}
              </Text>
            </View>
          ))
        ) : (
          <Text style={styles.meta}>
            Aucun vehicule synchronise pour le moment.
          </Text>
        )}
      </OrbiSurface>

      <OrbiSurface style={styles.card}>
        <Text style={styles.name}>Documents et revue</Text>
        {profile.profile.onboarding.documents.map((document) => (
          <View
            key={document.type}
            style={[
              styles.documentStatusRow,
              freshDocumentTypes.includes(document.type) ? styles.documentStatusRowFresh : null,
            ]}
          >
            <View style={styles.documentStatusText}>
              <Text style={styles.vehicleTitle}>
                {formatDocumentLabel(document.type)}
              </Text>
              {freshDocumentTypes.includes(document.type) ? (
                <Text style={styles.documentTransitionBadge}>Statut mis a jour</Text>
              ) : null}
              <Text style={styles.meta}>
                {document.fileName ?? 'Aucun fichier reference'}
              </Text>
              {document.rejectionReason ? (
                <Text style={styles.warningText}>{document.rejectionReason}</Text>
              ) : null}
            </View>
            <Text
              style={[
                styles.documentBadge,
                document.status === 'APPROVED'
                  ? styles.badgeSuccess
                  : document.status === 'REJECTED'
                    ? styles.badgeDanger
                    : styles.badgePending,
              ]}
            >
              {formatOperationalStatus(document.status)}
            </Text>
          </View>
        ))}

        {profile.profile.onboarding.reviewTimeline.map((review) => (
          <View
            key={review.id}
            style={[
              styles.timelineRow,
              freshReviewIds.includes(review.id) ? styles.timelineRowFresh : null,
            ]}
          >
            <Text style={styles.vehicleTitle}>{formatOperationalStatus(review.status)}</Text>
            <Text style={styles.meta}>
              {review.actorName} |{' '}
              {formatDriverProfileDateTime(review.createdAt)}
            </Text>
            {review.decisionReason ? (
              <Text style={styles.meta}>{review.decisionReason}</Text>
            ) : null}
          </View>
        ))}
      </OrbiSurface>

      {/* ── Support chauffeur ── */}
      <OrbiSurface style={styles.card}>
        <Text style={styles.heading}>Support</Text>
        <Text style={styles.meta}>
          Probleme de paiement, course litigieuse, vehicule ou compte ? Notre equipe repond sous 24h.
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
              placeholder="Sujet (ex: course non payee)"
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
            <View style={styles.chipRow}>
              {(['payment', 'trip', 'account', 'vehicle', 'safety', 'other'] as const).map((cat) => (
                <Pressable
                  key={cat}
                  style={[styles.chip, ticketForm.category === (cat === 'vehicle' ? 'driver' : cat) && styles.chipActive]}
                  onPress={() => setTicketForm((f) => ({ ...f, category: cat === 'vehicle' ? 'driver' : cat }))}
                >
                  <Text style={[styles.chipLabel, ticketForm.category === (cat === 'vehicle' ? 'driver' : cat) && styles.chipLabelActive]}>
                    {cat === 'payment' ? 'Paiement'
                      : cat === 'trip' ? 'Course'
                      : cat === 'account' ? 'Compte'
                      : cat === 'vehicle' ? 'Vehicule'
                      : cat === 'safety' ? 'Securite'
                      : 'Autre'}
                  </Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.actionRow}>
              <OrbiButton
                style={styles.primaryButton}
                onPress={() => void handleCreateTicket()}
                disabled={isSubmittingTicket}
                loading={isSubmittingTicket}
                label="Envoyer"
                tone="amber"
                labelStyle={styles.primaryButtonLabel}
              />
              <OrbiButton
                style={styles.secondaryButton}
                onPress={() => setIsTicketFormOpen(false)}
                disabled={isSubmittingTicket}
                label="Annuler"
                variant="secondary"
                tone="amber"
                labelStyle={styles.secondaryButtonLabel}
              />
            </View>
          </>
        ) : (
          <OrbiButton
            style={styles.secondaryButton}
            onPress={() => setIsTicketFormOpen(true)}
            label="Contacter le support"
            variant="secondary"
            tone="amber"
            labelStyle={styles.secondaryButtonLabel}
          />
        )}
      </OrbiSurface>

      <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (theme: OrbiTheme) => StyleSheet.create({
  // ── New consumer styles ────────────────────────────────────────────────────
  safe: { flex: 1, backgroundColor: theme.colors.driverBackground },
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
  headerLiveText: {
    fontSize: 11,
    fontWeight: '800',
    fontFamily: 'Inter_700Bold',
    color: theme.colors.amber,
    textTransform: 'uppercase',
  },
  signOutBtn: {
    borderRadius: 10,
    minHeight: 36,
    paddingHorizontal: 12,
  },
  signOutBtnLabel: {
    fontSize: 12,
  },
  content: { paddingHorizontal: 16, paddingTop: 12, gap: 12 },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,176,32,0.20)',
  },
  avatarCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: theme.colors.amber,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    fontSize: 18,
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
  privacyHint: {
    marginTop: 4,
    fontSize: 10,
    color: theme.colors.teal,
    fontFamily: 'Inter_600SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  statusRowCard: {
    flexDirection: 'row',
    backgroundColor: theme.colors.backgroundAlt,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden',
  },
  statusItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    gap: 3,
  },
  statusItemLabel: {
    fontSize: 10,
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  statusItemValue: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
    color: theme.colors.text,
    textAlign: 'center',
  },
  statusDivider: {
    width: 1,
    backgroundColor: theme.colors.border,
    alignSelf: 'stretch',
  },
  // Driver performance stats
  statsRow: { flexDirection: 'row', gap: 8 },
  statCard: {
    flex: 1,
    borderRadius: 14,
  },
  sectionEyebrow: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
    color: theme.colors.teal,
    textTransform: 'uppercase',
    letterSpacing: 0,
    paddingHorizontal: 2,
  },

  // ── Legacy styles (form sections below header) ─────────────────────────────
  screen: {
    paddingTop: 88,
    paddingHorizontal: 24,
    paddingBottom: 40,
    backgroundColor: theme.colors.background,
    gap: 14,
  },
  title: {
    color: theme.colors.text,
    fontSize: 32,
    fontWeight: '800',
  },
  subtitle: {
    color: theme.colors.muted,
  },
  heroBadgeRow: {
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
    backgroundColor: 'rgba(255, 59, 48, 0.07)',
    borderWidth: 1,
    borderColor: theme.colors.danger,
  },
  signOutButtonLabel: {
    color: theme.colors.danger,
    fontWeight: '700',
    fontSize: 13,
  },
  card: {
    borderRadius: 16,
    padding: 14,
    gap: 7,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
  },
  metricCard: {
    flexGrow: 1,
    minWidth: 150,
    backgroundColor: theme.colors.backgroundAlt,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 22,
    padding: 18,
    gap: 6,
  },
  metricLabel: {
    color: theme.colors.muted,
    textTransform: 'uppercase',
    fontSize: 12,
    letterSpacing: 0,
  },
  metricValue: {
    color: theme.colors.text,
    fontWeight: '800',
    fontSize: 22,
  },
  name: {
    color: theme.colors.text,
    fontSize: 17,
    fontWeight: '800',
  },
  formHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  formHeaderText: {
    flex: 1,
    gap: 2,
  },
  editToggleBtn: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: theme.colors.backgroundAlt,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  editToggleLabel: {
    color: theme.colors.amber,
    fontSize: 13,
    fontWeight: '700',
  },
  sectionTitle: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '800',
    marginTop: 8,
  },
  fieldLabel: {
    color: theme.colors.text,
    fontWeight: '700',
    fontSize: 13,
    marginTop: 6,
  },
  meta: {
    color: theme.colors.muted,
  },
  transitionMeta: {
    color: theme.colors.sky,
    fontWeight: '700',
    lineHeight: 19,
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
  optionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
  },
  pillActive: {
    backgroundColor: theme.colors.amber,
    borderColor: theme.colors.amber,
  },
  pillInactive: {
    backgroundColor: theme.colors.backgroundAlt,
    borderColor: theme.colors.border,
  },
  pillLabel: {
    fontWeight: '700',
    fontSize: 12,
  },
  pillLabelActive: {
    color: '#3b2205',
  },
  pillLabelInactive: {
    color: theme.colors.text,
  },
  inlineInputs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  inlineInput: {
    flexBasis: 128,
    flexGrow: 1,
    minWidth: 0,
  },
  documentField: {
    gap: 4,
  },
  documentHint: {
    color: theme.colors.teal,
    fontSize: 12,
  },
  actionStack: {
    gap: 10,
    marginTop: 10,
  },
  button: {
    borderRadius: 18,
    paddingHorizontal: 16,
    minHeight: 50,
  },
  primaryButton: {
    borderRadius: 12,
    minHeight: 44,
  },
  secondaryButton: {
    borderRadius: 12,
    minHeight: 44,
  },
  primaryButtonLabel: {
    fontSize: 13,
  },
  secondaryButtonLabel: {
    fontSize: 13,
  },
  vehicleRow: {
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    gap: 4,
  },
  checklistRow: {
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  checkLabel: {
    color: theme.colors.text,
    flex: 1,
  },
  checkValue: {
    fontWeight: '800',
  },
  checkValueDone: {
    color: theme.colors.teal,
  },
  checkValuePending: {
    color: theme.colors.amber,
  },
  vehicleTitle: {
    color: theme.colors.text,
    fontWeight: '700',
    fontSize: 16,
  },
  documentStatusRow: {
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
  },
  documentStatusRowFresh: {
    backgroundColor: theme.colors.backgroundAlt,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingBottom: 10,
    borderTopWidth: 0,
  },
  documentStatusText: {
    flex: 1,
    gap: 4,
  },
  documentTransitionBadge: {
    alignSelf: 'flex-start',
    color: theme.colors.sky,
    fontWeight: '800',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  documentBadge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 12,
    fontWeight: '800',
    overflow: 'hidden',
  },
  badgeSuccess: {
    backgroundColor: 'rgba(52, 211, 153, 0.18)',
    color: theme.colors.success,
  },
  badgeDanger: {
    backgroundColor: 'rgba(255, 59, 48, 0.08)',
    color: theme.colors.danger,
  },
  badgePending: {
    backgroundColor: 'rgba(245, 158, 11, 0.18)',
    color: theme.colors.amber,
  },
  timelineRow: {
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    gap: 4,
  },
  timelineRowFresh: {
    backgroundColor: theme.colors.backgroundAlt,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingBottom: 10,
    borderTopWidth: 0,
  },
  warningText: {
    color: theme.colors.amber,
  },
  heading: {
    color: theme.colors.text,
    fontWeight: '800',
    fontSize: 18,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 4,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.backgroundAlt,
  },
  chipActive: {
    borderColor: theme.colors.amber,
    backgroundColor: 'rgba(245, 158, 11, 0.14)',
  },
  chipLabel: {
    color: theme.colors.muted,
    fontWeight: '700',
    fontSize: 12,
  },
  chipLabelActive: {
    color: theme.colors.text,
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
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
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
    backgroundColor: 'rgba(251, 191, 36, 0.07)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.2)',
  },
  adminNoteLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0,
    color: theme.colors.amber,
    marginBottom: 4,
  },
  adminNoteText: {
    fontSize: 13,
    color: theme.colors.text,
    lineHeight: 18,
  },
});
