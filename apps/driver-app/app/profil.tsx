import { useEffect, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  fetchMyTrips,
  fetchDriverProfile,
  requestDriverDocumentUploadLinks,
  type DriverDocumentUploadLinksResponse,
  type DriverProfileResponse,
  type MyTripsResponse,
  upsertDriverOnboarding,
} from '@mobilis/api';
import { router } from 'expo-router';
import { formatOperationalStatus, mobilisTheme } from '@mobilis/ui';
import {
  InsightBadge,
  LiveStatusBanner,
  MetricTile,
  SectionCard,
  SectionHeading,
} from '../lib/realtime-widgets';
import { DriverJourneySection } from '../lib/driver-journey';
import {
  restoreDriverSession,
  signOutDriverAccount,
} from '../lib/auth';
import { useLiveRefresh } from '../lib/use-live-refresh';
import { resolveDriverAppError } from '../lib/session-feedback';
import {
  buildDriverProfileStatusLabel,
  resolveDriverActiveFlow,
} from '../lib/driver-active-flow';

const cityOptions = [
  'OUAGADOUGOU',
  'BOBO_DIOULASSO',
  'KOUDOUGOU',
  'BANFORA',
  'OUAHIGOUYA',
] as const;

const vehicleTypeOptions = ['MOTORCYCLE', 'CAR'] as const;
const serviceTierOptions = {
  MOTORCYCLE: ['MOTO_STANDARD', 'MOTO_PLUS'],
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

const fallbackProfile: DriverProfileResponse = {
  profile: {
    id: 'fallback-driver',
    fullName: 'Issa Driver',
    email: 'driver@mobilis.app',
    phoneNumber: null,
    status: 'ONLINE',
    verificationStatus: 'APPROVED',
    serviceRadiusKm: 8,
    averageRating: 4.8,
    completedTripsCount: 0,
    onboarding: {
      verificationStatus: 'APPROVED',
      reviewStatus: 'APPROVED',
      completedItems: 7,
      totalItems: 7,
      readinessPercent: 100,
      serviceRadiusKm: 8,
      city: 'OUAGADOUGOU',
      submittedAt: null,
      latestReviewAt: null,
      latestDecisionReason: 'Dossier valide.',
      reviewActorName: 'Equipe operations',
      notes: 'Profil approuve et pret pour les courses.',
      checklist: [
        { id: 'phone', label: 'Numero de telephone verifie', completed: true },
        {
          id: 'license',
          label: 'Permis de conduire renseigne et securise',
          completed: true,
        },
        { id: 'identity', label: 'Piece d identite securisee', completed: true },
        {
          id: 'vehicle-registration',
          label: 'Carte grise securisee',
          completed: true,
        },
        { id: 'insurance', label: 'Assurance securisee', completed: true },
        {
          id: 'selfie',
          label: 'Selfie de verification securise',
          completed: true,
        },
        { id: 'vehicle', label: 'Vehicule actif configure', completed: true },
      ],
      documents: [
        {
          type: 'IDENTITY_DOCUMENT',
          status: 'APPROVED',
          fileName: 'id-card.pdf',
          uploadedAt: null,
          expiresAt: null,
          reviewedAt: null,
          rejectionReason: null,
        },
        {
          type: 'DRIVER_LICENSE',
          status: 'APPROVED',
          fileName: 'license.pdf',
          uploadedAt: null,
          expiresAt: null,
          reviewedAt: null,
          rejectionReason: null,
        },
        {
          type: 'VEHICLE_REGISTRATION',
          status: 'APPROVED',
          fileName: 'registration.pdf',
          uploadedAt: null,
          expiresAt: null,
          reviewedAt: null,
          rejectionReason: null,
        },
        {
          type: 'INSURANCE_PROOF',
          status: 'APPROVED',
          fileName: 'insurance.pdf',
          uploadedAt: null,
          expiresAt: null,
          reviewedAt: null,
          rejectionReason: null,
        },
        {
          type: 'SELFIE_VERIFICATION',
          status: 'APPROVED',
          fileName: 'selfie.jpg',
          uploadedAt: null,
          expiresAt: null,
          reviewedAt: null,
          rejectionReason: null,
        },
      ],
      reviewTimeline: [
        {
          id: 'review-approved',
          status: 'APPROVED',
          actorName: 'Equipe operations',
          decisionReason: 'Dossier valide.',
          createdAt: '2026-04-18T08:30:00.000Z',
        },
      ],
    },
    vehicles: [
      {
        id: 'fallback-vehicle',
        plateNumber: '11 JD 9021',
        make: 'Toyota',
        model: 'Corolla',
        color: 'Blanc',
        type: 'CAR',
        tier: 'CAR_STANDARD',
        isActive: true,
      },
    ],
  },
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
  const primaryVehicle = profile.profile.vehicles[0];
  const vehicleType = primaryVehicle?.type ?? 'CAR';
  const existingDocuments = Object.fromEntries(
    documentDescriptors.map((document) => {
      const existing = profile.profile.onboarding.documents.find(
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

function parseOptionalPositiveInteger(value: string) {
  const normalized = value.trim();

  if (!normalized) {
    return null;
  }

  const parsed = Number.parseInt(normalized, 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
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
  const [profile, setProfile] = useState<DriverProfileResponse>(fallbackProfile);
  const [history, setHistory] = useState<MyTripsResponse | null>(null);
  const [form, setForm] = useState<OnboardingFormState>(
    buildInitialForm(fallbackProfile),
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
  const previousReadinessRef = useRef<number | null>(null);
  const previousDocumentStatusesRef = useRef<Partial<Record<DocumentType, string>> | null>(null);
  const previousReviewIdsRef = useRef<string[] | null>(null);

  useEffect(() => {
    void loadProfile();
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
      parseOptionalPositiveInteger(form.vehicleYear) === null
    ) {
      return "L'annee du vehicule doit etre numerique.";
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
      setStatus('Liens documentaires securises prets pour la soumission.');

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
      const [profileResponse, historyResponse] = await Promise.all([
        fetchDriverProfile(authClient),
        fetchMyTrips(authClient),
      ]);
      setProfile(profileResponse);
      setHistory(historyResponse);
      setForm(buildInitialForm(profileResponse));
      setPreparedDocumentLinks({});
      setHasLoadedProfile(true);
      const flow = resolveDriverActiveFlow({
        history: historyResponse,
        offers: [],
        reservationNow: 0,
        driverProfileStatus: profileResponse.profile.status,
      });
      if (!silent) {
        setStatus(buildDriverProfileStatusLabel({ flow }));
      }
    } catch (error) {
      const feedback = await resolveDriverAppError(error, {
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
    const parsedVehicleYear = parseOptionalPositiveInteger(form.vehicleYear);
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

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <Text style={styles.title}>Profil chauffeur</Text>
      <LiveStatusBanner
        label="Driver ops"
        message={status}
        secondaryMessage={
          profileTransitionLabel
            ? profileTransitionLabel
            : flow.activeTrip && flow.primaryRouteLabel
              ? `Mission active: ${flow.primaryRouteLabel}.`
              : flow.operationalStatus === 'SUSPENDED'
                ? 'Le compte est suspendu. Les operations doivent lever le blocage avant reprise du direct.'
                : 'Le dossier, les documents et les donnees vehicule restent alignes avec le backend et la revue operations.'
        }
        tone={profileTransitionLabel ? 'sky' : flow.operationalStatus === 'SUSPENDED' ? 'rose' : 'amber'}
      />
      <Pressable
        onPress={() => void loadProfile()}
        disabled={isRefreshing || isSubmitting || isSigningOut}
        style={[
          styles.refreshButton,
          isRefreshing || isSubmitting ? styles.refreshButtonDisabled : null,
        ]}
      >
        <Text style={styles.refreshButtonLabel}>
          {isRefreshing ? 'Actualisation...' : 'Actualiser le profil'}
        </Text>
      </Pressable>
      <Pressable
        onPress={() => void handleSignOut()}
        disabled={isSigningOut || isRefreshing || isSubmitting}
        style={[
          styles.signOutButton,
          isSigningOut ? styles.refreshButtonDisabled : null,
        ]}
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
        <View style={styles.heroBadgeRow}>
          <InsightBadge
            label="Verification"
            value={formatOperationalStatus(profile.profile.verificationStatus)}
            tone="teal"
          />
          <InsightBadge
            label="Profil"
            value={formatOperationalStatus(profile.profile.status)}
            tone="amber"
          />
          <InsightBadge
            label="Mission"
            value={flow.primaryStatusLabel}
            tone="sky"
          />
          <InsightBadge
            label="Readiness"
            value={`${profile.profile.onboarding.readinessPercent}%`}
            tone="sky"
          />
        </View>
        {flow.activeTrip && flow.primaryRouteLabel ? (
          <Text style={styles.subtitle}>Mission active: {flow.primaryRouteLabel}</Text>
        ) : null}
        <View style={styles.metricsRow}>
          <MetricTile
            label="Rayon"
            value={`${profile.profile.serviceRadiusKm ?? 'ND'} km`}
            helper="zone de prise en charge"
          />
          <MetricTile
            label="Note"
            value={String(profile.profile.averageRating ?? 'Nouvelle')}
            helper="moyenne qualite"
          />
          <MetricTile
            label="Vehicules"
            value={String(profile.profile.vehicles.length)}
            helper="vehicules synchronises"
          />
        </View>
      </SectionCard>

      <DriverJourneySection
        currentStep="profil"
        description="Le dossier operations reste connecte au meme tunnel que l acces, le cockpit, le dispatch et les revenus."
      />

      <View style={[styles.card, profileTransitionLabel ? styles.cardHighlight : null]}>
        <Text style={styles.name}>Onboarding securise</Text>
        <Text style={styles.meta}>
          Dossier {profile.profile.onboarding.completedItems}/
          {profile.profile.onboarding.totalItems} complete a{' '}
          {profile.profile.onboarding.readinessPercent}%
        </Text>
        <Text style={styles.meta}>
          Ville: {profile.profile.onboarding.city ?? 'Non definie'}
        </Text>
        <Text style={styles.meta}>{profile.profile.onboarding.notes}</Text>
        {profileTransitionLabel ? (
          <Text style={styles.transitionMeta}>{profileTransitionLabel}</Text>
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
      </View>

      <View style={styles.card}>
        <Text style={styles.name}>Soumettre ou mettre a jour le dossier</Text>
        <Text style={styles.meta}>
          Ce formulaire prepare les liens documentaires securises puis envoie le
          dossier complet a l equipe operations.
        </Text>

        <Text style={styles.fieldLabel}>Telephone</Text>
        <TextInput
          value={form.phoneNumber}
          onChangeText={(value) => updateForm('phoneNumber', value)}
          placeholder="+22670000000"
          placeholderTextColor={mobilisTheme.colors.muted}
          keyboardType="phone-pad"
          style={styles.input}
        />

        <Text style={styles.fieldLabel}>Numero de permis</Text>
        <TextInput
          value={form.licenseNumber}
          onChangeText={(value) => updateForm('licenseNumber', value)}
          placeholder="BF-12345"
          placeholderTextColor={mobilisTheme.colors.muted}
          style={styles.input}
        />

        <Text style={styles.fieldLabel}>Ville de service</Text>
        <View style={styles.optionRow}>
          {cityOptions.map((city) => (
            <Pressable
              key={city}
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
          placeholderTextColor={mobilisTheme.colors.muted}
          keyboardType="decimal-pad"
          style={styles.input}
        />

        <Text style={styles.sectionTitle}>Vehicule principal</Text>
        <View style={styles.optionRow}>
          {vehicleTypeOptions.map((type) => (
            <Pressable
              key={type}
              onPress={() => updateVehicleType(type)}
              style={[
                styles.pill,
                form.vehicleType === type
                  ? styles.pillActive
                  : styles.pillInactive,
              ]}
            >
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
          placeholderTextColor={mobilisTheme.colors.muted}
          style={styles.input}
        />
        <TextInput
          value={form.vehicleMake}
          onChangeText={(value) => updateForm('vehicleMake', value)}
          placeholder="Marque"
          placeholderTextColor={mobilisTheme.colors.muted}
          style={styles.input}
        />
        <TextInput
          value={form.vehicleModel}
          onChangeText={(value) => updateForm('vehicleModel', value)}
          placeholder="Modele"
          placeholderTextColor={mobilisTheme.colors.muted}
          style={styles.input}
        />
        <TextInput
          value={form.vehicleColor}
          onChangeText={(value) => updateForm('vehicleColor', value)}
          placeholder="Couleur"
          placeholderTextColor={mobilisTheme.colors.muted}
          style={styles.input}
        />

        <View style={styles.inlineInputs}>
          <TextInput
            value={form.vehicleYear}
            onChangeText={(value) => updateForm('vehicleYear', value)}
            placeholder="Annee"
            placeholderTextColor={mobilisTheme.colors.muted}
            keyboardType="number-pad"
            style={[styles.input, styles.inlineInput]}
          />
          <TextInput
            value={form.vehicleSeats}
            onChangeText={(value) => updateForm('vehicleSeats', value)}
            placeholder="Places"
            placeholderTextColor={mobilisTheme.colors.muted}
            keyboardType="number-pad"
            style={[styles.input, styles.inlineInput]}
          />
        </View>

        <Text style={styles.fieldLabel}>Niveau de service</Text>
        <View style={styles.optionRow}>
          {serviceTierOptions[form.vehicleType].map((tier) => (
            <Pressable
              key={tier}
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

        <Text style={styles.sectionTitle}>Justificatifs requis</Text>
        {documentDescriptors.map((document) => (
          <View key={document.type} style={styles.documentField}>
            <Text style={styles.fieldLabel}>{document.label}</Text>
            <TextInput
              value={form.documentFileNames[document.type]}
              onChangeText={(value) => updateDocumentFileName(document.type, value)}
              placeholder={document.placeholder}
              placeholderTextColor={mobilisTheme.colors.muted}
              style={styles.input}
            />
            {preparedDocumentLinks[document.type] ? (
              <Text style={styles.documentHint}>
                Lien securise pret jusqu au{' '}
                {new Date(
                  preparedDocumentLinks[document.type]?.expiresAt ?? '',
                ).toLocaleString('fr-FR')}
              </Text>
            ) : (
              <Text style={styles.documentHint}>
                Renseignez un nom de fichier pour preparer le lien signe.
              </Text>
            )}
          </View>
        ))}

        <View style={styles.actionStack}>
          <Pressable
            onPress={() => void prepareDocuments()}
            disabled={isPreparingDocuments || isSubmitting}
            style={[
              styles.button,
              styles.secondaryButton,
              isPreparingDocuments || isSubmitting ? styles.buttonDisabled : null,
            ]}
          >
            <Text style={styles.secondaryButtonLabel}>
              {isPreparingDocuments
                ? 'Preparation...'
                : 'Preparer les liens documentaires'}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => void handleSubmitOnboarding()}
            disabled={isSubmitting || isPreparingDocuments}
            style={[
              styles.button,
              styles.primaryButton,
              isSubmitting || isPreparingDocuments ? styles.buttonDisabled : null,
            ]}
          >
            <Text style={styles.primaryButtonLabel}>
              {isSubmitting ? 'Soumission...' : 'Soumettre le dossier ops'}
            </Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.metricsRow}>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Rayon</Text>
          <Text style={styles.metricValue}>
            {profile.profile.serviceRadiusKm ?? 'Non defini'} km
          </Text>
          <Text style={styles.meta}>zone de prise en charge</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Note</Text>
          <Text style={styles.metricValue}>
            {profile.profile.averageRating ?? 'Nouvelle activite'}
          </Text>
          <Text style={styles.meta}>moyenne qualite</Text>
        </View>
      </View>

      <View style={styles.card}>
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
      </View>

      <View style={styles.card}>
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
              {new Date(review.createdAt).toLocaleString('fr-FR')}
            </Text>
            {review.decisionReason ? (
              <Text style={styles.meta}>{review.decisionReason}</Text>
            ) : null}
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
  metricCard: {
    flexGrow: 1,
    minWidth: 150,
    backgroundColor: mobilisTheme.colors.backgroundAlt,
    borderWidth: 1,
    borderColor: mobilisTheme.colors.border,
    borderRadius: 22,
    padding: 18,
    gap: 6,
  },
  metricLabel: {
    color: mobilisTheme.colors.muted,
    textTransform: 'uppercase',
    fontSize: 12,
    letterSpacing: 1.5,
  },
  metricValue: {
    color: mobilisTheme.colors.text,
    fontWeight: '800',
    fontSize: 22,
  },
  name: {
    color: mobilisTheme.colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  sectionTitle: {
    color: mobilisTheme.colors.text,
    fontSize: 16,
    fontWeight: '800',
    marginTop: 8,
  },
  fieldLabel: {
    color: mobilisTheme.colors.text,
    fontWeight: '700',
    fontSize: 13,
    marginTop: 6,
  },
  meta: {
    color: mobilisTheme.colors.muted,
  },
  transitionMeta: {
    color: mobilisTheme.colors.sky,
    fontWeight: '700',
    lineHeight: 19,
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
  optionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pill: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
  },
  pillActive: {
    backgroundColor: mobilisTheme.colors.amber,
    borderColor: mobilisTheme.colors.amber,
  },
  pillInactive: {
    backgroundColor: mobilisTheme.colors.backgroundAlt,
    borderColor: mobilisTheme.colors.border,
  },
  pillLabel: {
    fontWeight: '700',
    fontSize: 12,
  },
  pillLabelActive: {
    color: '#3b2205',
  },
  pillLabelInactive: {
    color: mobilisTheme.colors.text,
  },
  inlineInputs: {
    flexDirection: 'row',
    gap: 10,
  },
  inlineInput: {
    flex: 1,
  },
  documentField: {
    gap: 4,
  },
  documentHint: {
    color: mobilisTheme.colors.teal,
    fontSize: 12,
  },
  actionStack: {
    gap: 10,
    marginTop: 10,
  },
  button: {
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  primaryButton: {
    backgroundColor: mobilisTheme.colors.amber,
  },
  secondaryButton: {
    backgroundColor: mobilisTheme.colors.backgroundAlt,
    borderWidth: 1,
    borderColor: mobilisTheme.colors.border,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  primaryButtonLabel: {
    color: '#3b2205',
    fontWeight: '800',
    textAlign: 'center',
  },
  secondaryButtonLabel: {
    color: mobilisTheme.colors.text,
    fontWeight: '700',
    textAlign: 'center',
  },
  vehicleRow: {
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: mobilisTheme.colors.border,
    gap: 4,
  },
  checklistRow: {
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: mobilisTheme.colors.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  checkLabel: {
    color: mobilisTheme.colors.text,
    flex: 1,
  },
  checkValue: {
    fontWeight: '800',
  },
  checkValueDone: {
    color: mobilisTheme.colors.teal,
  },
  checkValuePending: {
    color: mobilisTheme.colors.amber,
  },
  vehicleTitle: {
    color: mobilisTheme.colors.text,
    fontWeight: '700',
    fontSize: 16,
  },
  documentStatusRow: {
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: mobilisTheme.colors.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  documentStatusRowFresh: {
    backgroundColor: 'rgba(56, 189, 248, 0.08)',
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
    color: mobilisTheme.colors.sky,
    fontWeight: '800',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
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
    color: mobilisTheme.colors.success,
  },
  badgeDanger: {
    backgroundColor: 'rgba(248, 113, 113, 0.18)',
    color: mobilisTheme.colors.danger,
  },
  badgePending: {
    backgroundColor: 'rgba(245, 158, 11, 0.18)',
    color: mobilisTheme.colors.amber,
  },
  timelineRow: {
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: mobilisTheme.colors.border,
    gap: 4,
  },
  timelineRowFresh: {
    backgroundColor: 'rgba(56, 189, 248, 0.08)',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingBottom: 10,
    borderTopWidth: 0,
  },
  warningText: {
    color: mobilisTheme.colors.amber,
  },
});
