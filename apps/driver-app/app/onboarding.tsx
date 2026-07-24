import { router } from 'expo-router';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { preventSensitiveScreenCapture, restoreSensitiveScreenCapture } from '../lib/privacy/screen-capture';
import {
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { upsertDriverOnboarding, resolveDisplayableApiErrorMessage } from '@orbi/api';
import type { OrbiTheme } from '@orbi/ui';
import { OrbiButton, OrbiScreen, OrbiStatusBanner, OrbiSurface, safeHaptics, useOrbiTheme, VehicleIllustration } from '@orbi/ui/native';
import { restoreDriverSession } from '../lib/auth';
import { parseDriverVehicleYear } from '../lib/driver-onboarding-safety';

// ── Constantes marché Burkina Faso ────────────────────────────────────────────

const MOTO_MAKES = ['Honda', 'Yamaha', 'TVS', 'Bajaj', 'Suzuki', 'Kawasaki'];
const CAR_MAKES = ['Toyota', 'Hyundai', 'Kia', 'Suzuki', 'Volkswagen', 'Nissan'];
const MOTO_MODELS: Record<string, string[]> = {
  Honda: ['CB125', 'CG125', 'Wave110'],
  Yamaha: ['Crypton', 'FZ125', 'YB125Z'],
  TVS: ['HLX125', 'Star City+', 'Apache RTR'],
  Bajaj: ['Boxer', 'Pulsar 125', 'Platina'],
  Suzuki: ['GD110S', 'Gixxer', 'DR 125'],
  Kawasaki: ['Discover 125', 'KLX110', 'W175'],
};
const CAR_MODELS: Record<string, string[]> = {
  Toyota: ['Corolla', 'Yaris', 'Auris', 'Avensis'],
  Hyundai: ['Accent', 'Elantra', 'i10', 'Tucson'],
  Kia: ['Rio', 'Picanto', 'Cerato', 'Sportage'],
  Suzuki: ['Dzire', 'Swift', 'Vitara', 'Alto'],
  Volkswagen: ['Polo', 'Golf', 'Passat', 'Tiguan'],
  Nissan: ['Almera', 'Micra', 'Note', 'Tiida'],
};
const COLORS = [
  { label: 'Rouge', hex: '#EF4444' },
  { label: 'Blanc', hex: '#F1F5F9' },
  { label: 'Noir', hex: '#111111' },
  { label: 'Gris', hex: '#64748B' },
  { label: 'Bleu', hex: '#3B82F6' },
  { label: 'Vert', hex: '#22C55E' },
  { label: 'Jaune', hex: '#EAB308' },
  { label: 'Marron', hex: '#92400E' },
];
const CITIES = [
  { id: 'OUAGADOUGOU', label: 'Ouagadougou' },
  { id: 'BOBO_DIOULASSO', label: 'Bobo-Dioulasso' },
  { id: 'KOUDOUGOU', label: 'Koudougou' },
  { id: 'BANFORA', label: 'Banfora' },
  { id: 'OUAHIGOUYA', label: 'Ouahigouya' },
];

// ── Progress bar ───────────────────────────────────────────────────────────────

const ProgressBar = memo(({ step, total }: { step: number; total: number }) => {
  const theme = useOrbiTheme();
  return (
    <View style={progress.track}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={[
            progress.segment,
            { backgroundColor: i < step ? theme.colors.amber : theme.colors.border },
          ]}
        />
      ))}
    </View>
  );
});

const progress = StyleSheet.create({
  track: { flexDirection: 'row', gap: 4, marginBottom: 4 },
  segment: { flex: 1, height: 4, borderRadius: 2 },
});

function BackGlyph() {
  const theme = useOrbiTheme();
  const onboardingIcon = useMemo(() => makeOnboardingIconStyles(theme), [theme]);
  return (
    <View style={onboardingIcon.backWrap}>
      <View style={[onboardingIcon.backLine, onboardingIcon.backLineTop]} />
      <View style={[onboardingIcon.backLine, onboardingIcon.backLineBottom]} />
    </View>
  );
}

function CheckGlyph() {
  const theme = useOrbiTheme();
  const onboardingIcon = useMemo(() => makeOnboardingIconStyles(theme), [theme]);
  return (
    <View style={onboardingIcon.checkWrap}>
      <View style={[onboardingIcon.checkLine, onboardingIcon.checkLineShort]} />
      <View style={[onboardingIcon.checkLine, onboardingIcon.checkLineLong]} />
    </View>
  );
}

// ── Step card container ────────────────────────────────────────────────────────

function StepContainer({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  const theme = useOrbiTheme();
  const step = useMemo(() => makeStepStyles(theme), [theme]);
  return (
    <OrbiSurface style={step.container} elevated>
      <Text style={step.title}>{title}</Text>
      {subtitle ? <Text style={step.subtitle}>{subtitle}</Text> : null}
      <View style={step.body}>{children}</View>
    </OrbiSurface>
  );
}

const makeStepStyles = (theme: OrbiTheme) => StyleSheet.create({
  container: { gap: 4, padding: 16 },
  title: { fontSize: 26, fontWeight: '800', fontFamily: 'Raleway_800ExtraBold', color: theme.colors.text },
  subtitle: { fontSize: 15, color: theme.colors.textSoft, fontFamily: 'Inter_400Regular', lineHeight: 22, marginTop: 4 },
  body: { gap: 16, marginTop: 20 },
});

// ── Main wizard ───────────────────────────────────────────────────────────────

const TOTAL_STEPS = 4;

export default function DriverOnboardingScreen() {
  const theme = useOrbiTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [currentStep, setCurrentStep] = useState(1);
  const slideAnim = useRef(new Animated.Value(0)).current;

  // Step 2: Vehicle info
  const [vehicleType, setVehicleType] = useState<'MOTORCYCLE' | 'CAR'>('MOTORCYCLE');
  const [selectedMake, setSelectedMake] = useState('');
  const [selectedModel, setSelectedModel] = useState('');
  const [plateNumber, setPlateNumber] = useState('');
  const [selectedColor, setSelectedColor] = useState('Noir');
  const [vehicleYear, setVehicleYear] = useState('2020');

  // Step 3: Personal info
  const [phoneNumber, setPhoneNumber] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [selectedCity, setSelectedCity] = useState('OUAGADOUGOU');

  // Step 4: Documents checklist
  const [docs, setDocs] = useState({
    identity: false,
    license: false,
    registration: false,
    insurance: false,
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    preventSensitiveScreenCapture();
    return () => {
      restoreSensitiveScreenCapture();
    };
  }, []);

  const makes = vehicleType === 'MOTORCYCLE' ? MOTO_MAKES : CAR_MAKES;
  const models = vehicleType === 'MOTORCYCLE'
    ? (MOTO_MODELS[selectedMake] ?? [])
    : (CAR_MODELS[selectedMake] ?? []);

  const canGoNext = useCallback(() => {
    if (currentStep === 2) {
      return plateNumber.trim().length >= 2 && selectedMake !== '' && selectedModel !== '';
    }
    if (currentStep === 3) {
      return phoneNumber.trim().length >= 8 && licenseNumber.trim().length >= 4;
    }
    return true;
  }, [currentStep, plateNumber, selectedMake, selectedModel, phoneNumber, licenseNumber]);

  function animateStep(direction: 1 | -1) {
    slideAnim.stopAnimation();
    slideAnim.setValue(direction * 40);
    Animated.spring(slideAnim, {
      toValue: 0,
      tension: 65,
      friction: 9,
      useNativeDriver: false,
    }).start();
  }

  function goNext() {
    if (!canGoNext()) return;
    safeHaptics.impact('light');
    animateStep(1);
    setCurrentStep((s) => s + 1);
  }

  function goBack() {
    safeHaptics.impact('light');
    animateStep(-1);
    setCurrentStep((s) => s - 1);
  }

  async function handleSubmit() {
    setErrorMessage('');
    setIsSubmitting(true);
    safeHaptics.impact('medium');

    try {
      const { authClient } = await restoreDriverSession();
      const isMoto = vehicleType === 'MOTORCYCLE';

      await upsertDriverOnboarding(authClient, {
        licenseNumber: licenseNumber.trim().toUpperCase(),
        phoneNumber: phoneNumber.trim(),
        city: selectedCity as any,
        serviceRadiusKm: 15,
        documents: {
          identityDocumentProvided: docs.identity,
          driverLicenseProvided: docs.license,
          vehicleRegistrationProvided: docs.registration,
          insuranceProofProvided: docs.insurance,
          selfieMatchProvided: false,
        },
        vehicles: [
          {
            plateNumber: plateNumber.trim().toUpperCase(),
            make: selectedMake || (isMoto ? 'Honda' : 'Toyota'),
            model: selectedModel || (isMoto ? 'CB125' : 'Corolla'),
            color: selectedColor,
            year: parseDriverVehicleYear(vehicleYear),
            type: vehicleType,
            tier: isMoto ? 'MOTO_STANDARD' : 'CAR_STANDARD',
            seats: isMoto ? 2 : 4,
          },
        ],
      });

      safeHaptics.notify('success');
      router.replace('/accueil');
    } catch (error) {
      setErrorMessage(
        error instanceof TypeError
          ? 'Connexion impossible. Vérifiez votre réseau.'
          : resolveDisplayableApiErrorMessage(error, 'Impossible de soumettre le dossier.'),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <OrbiScreen audience="driver" style={styles.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

        {/* Header */}
        <View style={styles.header}>
          {currentStep > 1 ? (
            <Pressable onPress={goBack} style={styles.backBtn} hitSlop={12}>
              <BackGlyph />
            </Pressable>
          ) : <View style={{ width: 40 }} />}
          <Text style={styles.stepLabel}>Étape {currentStep}/{TOTAL_STEPS}</Text>
          <View style={{ width: 40 }} />
        </View>

        <ProgressBar step={currentStep} total={TOTAL_STEPS} />

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View style={{ transform: [{ translateX: slideAnim }] }}>

            {/* ── Step 1: Bienvenue ── */}
            {currentStep === 1 && (
              <StepContainer
                title="Rejoignez Orbi"
                subtitle="Le service de courses connecté du Burkina Faso. Fixez vos horaires, gardez le contrôle de vos revenus."
              >
                {[
                  { code: '82%', title: '82% du tarif pour vous', desc: 'Commission claire. Revenu estimé avant acceptation.' },
                  { code: 'Libre', title: 'Votre emploi du temps', desc: 'Passez en ligne quand vous voulez, sans horaire imposé.' },
                  { code: 'MM', title: 'Paiement Mobile Money', desc: 'Orange Money et Moov Money avec suivi admin.' },
                  { code: 'Safe', title: 'Protection chauffeur', desc: 'SOS, suivi de trajet et support ops 7j/7.' },
                ].map((item) => (
                  <OrbiSurface key={item.title} style={styles.benefitCard}>
                    <View style={styles.benefitBadge}>
                      <Text style={styles.benefitBadgeText}>{item.code}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.benefitTitle} numberOfLines={1} ellipsizeMode="tail">
                        {item.title}
                      </Text>
                      <Text style={styles.benefitDesc} numberOfLines={2} ellipsizeMode="tail">
                        {item.desc}
                      </Text>
                    </View>
                  </OrbiSurface>
                ))}

                <OrbiStatusBanner
                  tone="amber"
                  title="Documents requis"
                  message="Permis, carte grise, assurance et pièce d'identité nationale seront vérifiés par les opérations."
                />
              </StepContainer>
            )}

            {/* ── Step 2: Véhicule ── */}
            {currentStep === 2 && (
              <StepContainer title="Votre véhicule" subtitle="Ces informations sont vérifiées par l'équipe Orbi avant activation.">

                {/* Vehicle type */}
                <View>
                  <Text style={styles.fieldLabel}>Type de véhicule</Text>
                  <View style={styles.typeRow}>
                    {(['MOTORCYCLE', 'CAR'] as const).map((type) => {
                      const isMoto = type === 'MOTORCYCLE';
                      const color = isMoto ? theme.colors.teal : theme.colors.amber;
                      const isSelected = vehicleType === type;
                      return (
                        <Pressable
                          key={type}
                          onPress={() => { setVehicleType(type); setSelectedMake(''); setSelectedModel(''); }}
                          style={[styles.typeCard, isSelected && { borderColor: color, backgroundColor: color + '12' }]}
                        >
                          <VehicleIllustration tier={isMoto ? 'moto-standard' : 'car-standard'} width={72} height={54} />
                          <Text style={[styles.typeLabel, isSelected && { color }]} numberOfLines={1}>
                            {isMoto ? 'Moto' : 'Voiture'}
                          </Text>
                          <Text style={styles.typeDesc} numberOfLines={1} ellipsizeMode="tail">
                            {isMoto ? '1 passager · Urbain' : '4 places · Climatisée'}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                {/* Make */}
                <View>
                  <Text style={styles.fieldLabel}>Marque</Text>
                  <View style={styles.chipGrid}>
                    {makes.map((make) => (
                      <Pressable
                        key={make}
                        onPress={() => { setSelectedMake(make); setSelectedModel(''); }}
                        style={[styles.chip, selectedMake === make && styles.chipActive]}
                      >
                        <Text style={[styles.chipText, selectedMake === make && styles.chipTextActive]}>{make}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>

                {/* Model */}
                {selectedMake !== '' && (
                  <View>
                    <Text style={styles.fieldLabel}>Modèle</Text>
                    <View style={styles.chipGrid}>
                      {models.map((model) => (
                        <Pressable
                          key={model}
                          onPress={() => setSelectedModel(model)}
                          style={[styles.chip, selectedModel === model && styles.chipActive]}
                        >
                          <Text style={[styles.chipText, selectedModel === model && styles.chipTextActive]}>{model}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                )}

                {/* Year */}
                <View>
                  <Text style={styles.fieldLabel}>Année</Text>
                  <View style={styles.chipGrid}>
                    {['2019', '2020', '2021', '2022', '2023', '2024'].map((y) => (
                      <Pressable key={y} onPress={() => setVehicleYear(y)} style={[styles.chip, vehicleYear === y && styles.chipActive]}>
                        <Text style={[styles.chipText, vehicleYear === y && styles.chipTextActive]}>{y}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>

                {/* Plate */}
                <View>
                  <Text style={styles.fieldLabel}>Numéro de plaque</Text>
                  <TextInput
                    value={plateNumber}
                    onChangeText={(v) => setPlateNumber(v.toUpperCase())}
                    placeholder="Ex : 11 AB 1234 BF"
                    placeholderTextColor={theme.colors.textMuted}
                    style={styles.input}
                    autoCapitalize="characters"
                  />
                </View>

                {/* Color */}
                <View>
                  <Text style={styles.fieldLabel}>Couleur</Text>
                  <View style={styles.colorRow}>
                    {COLORS.map((c) => (
                      <Pressable
                        key={c.label}
                        onPress={() => setSelectedColor(c.label)}
                        style={[
                          styles.colorSwatch,
                          { backgroundColor: c.hex },
                          selectedColor === c.label && styles.colorSwatchSelected,
                        ]}
                      />
                    ))}
                  </View>
                  <Text style={styles.colorLabel}>{selectedColor}</Text>
                </View>
              </StepContainer>
            )}

            {/* ── Step 3: Informations personnelles ── */}
            {currentStep === 3 && (
              <StepContainer title="Vos informations" subtitle="Nécessaires pour votre dossier chauffeur et vos paiements.">

                <View>
                  <Text style={styles.fieldLabel}>Téléphone</Text>
                  <TextInput
                    value={phoneNumber}
                    onChangeText={setPhoneNumber}
                    placeholder="+226 70 00 00 00"
                    placeholderTextColor={theme.colors.textMuted}
                    keyboardType="phone-pad"
                    style={styles.input}
                  />
                  <Text style={styles.fieldHint}>Ce numéro sera utilisé pour vos paiements Mobile Money.</Text>
                </View>

                <View>
                  <Text style={styles.fieldLabel}>Numéro de permis de conduire</Text>
                  <TextInput
                    value={licenseNumber}
                    onChangeText={(v) => setLicenseNumber(v.toUpperCase())}
                    placeholder="Ex : BF-A-12345"
                    placeholderTextColor={theme.colors.textMuted}
                    style={styles.input}
                    autoCapitalize="characters"
                  />
                </View>

                <View>
                  <Text style={styles.fieldLabel}>Ville de service</Text>
                  <View style={styles.chipGrid}>
                    {CITIES.map((city) => (
                      <Pressable
                        key={city.id}
                        onPress={() => setSelectedCity(city.id)}
                        style={[styles.chip, selectedCity === city.id && styles.chipActive]}
                      >
                        <Text style={[styles.chipText, selectedCity === city.id && styles.chipTextActive]}>
                          {city.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>

                <View style={styles.infoBox}>
                  <Text style={styles.infoBoxText}>
                    Votre dossier sera examiné par l'équipe Orbi sous 24-48h. Vous recevrez une notification dès l'approbation.
                  </Text>
                </View>
              </StepContainer>
            )}

            {/* ── Step 4: Documents & confirmation ── */}
            {currentStep === 4 && (
              <StepContainer title="Documents requis" subtitle="Confirmez les documents que vous avez à disposition. Ils seront vérifiés lors de la revue de votre dossier.">

                {([
                  { key: 'identity' as const, label: "Pièce d'identité nationale", desc: "CNI ou passeport valide" },
                  { key: 'license' as const, label: "Permis de conduire", desc: "Catégorie A (moto) ou B (voiture)" },
                  { key: 'registration' as const, label: "Carte grise", desc: "Document de propriété du véhicule" },
                  { key: 'insurance' as const, label: "Attestation d'assurance", desc: "En cours de validité" },
                ]).map((doc) => (
                  <Pressable
                    key={doc.key}
                    onPress={() => {
                      safeHaptics.impact('light');
                      setDocs((prev) => ({ ...prev, [doc.key]: !prev[doc.key] }));
                    }}
                    style={[styles.docCard, docs[doc.key] && styles.docCardChecked]}
                  >
                    <View style={[styles.docCheck, docs[doc.key] && styles.docCheckFilled]}>
                      {docs[doc.key] ? <CheckGlyph /> : null}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[styles.docLabel, docs[doc.key] && { color: theme.colors.teal }]}
                        numberOfLines={1}
                        ellipsizeMode="tail"
                      >
                        {doc.label}
                      </Text>
                      <Text style={styles.docDesc} numberOfLines={1} ellipsizeMode="tail">
                        {doc.desc}
                      </Text>
                    </View>
                  </Pressable>
                ))}

                {/* Summary card */}
                <OrbiSurface style={styles.summaryCard}>
                  <Text style={styles.summaryTitle}>Récapitulatif</Text>
                  <Text style={styles.summaryLine} numberOfLines={1} ellipsizeMode="tail">Véhicule : {selectedMake} {selectedModel} {vehicleYear}</Text>
                  <Text style={styles.summaryLine} numberOfLines={1}>Plaque : {plateNumber || '—'}</Text>
                  <Text style={styles.summaryLine} numberOfLines={1} ellipsizeMode="tail">Ville : {CITIES.find(c => c.id === selectedCity)?.label}</Text>
                  <Text style={styles.summaryLine} numberOfLines={1}>Téléphone : {phoneNumber || '—'}</Text>
                </OrbiSurface>

                {errorMessage ? (
                  <OrbiStatusBanner
                    tone="danger"
                    title="Dossier non soumis"
                    message={errorMessage}
                  />
                ) : null}
              </StepContainer>
            )}
          </Animated.View>
        </ScrollView>

        {/* CTA */}
        <View style={styles.cta}>
          {currentStep < TOTAL_STEPS ? (
            <OrbiButton
              onPress={goNext}
              disabled={!canGoNext()}
              label="Continuer"
              tone="amber"
              style={styles.ctaBtn}
              labelStyle={styles.ctaBtnLabel}
            />
          ) : (
            <OrbiButton
              onPress={() => void handleSubmit()}
              disabled={isSubmitting}
              loading={isSubmitting}
              label="Soumettre le dossier"
              tone="amber"
              style={styles.ctaBtn}
              labelStyle={styles.ctaBtnLabel}
            />
          )}
          {currentStep === 1 ? (
            <OrbiButton
              onPress={() => router.back()}
              label="Plus tard"
              variant="ghost"
              tone="amber"
              style={styles.ghostBtn}
              labelStyle={styles.ghostBtnLabel}
            />
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </OrbiScreen>
  );
}

const makeStyles = (theme: OrbiTheme) => StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: theme.colors.backgroundAlt,
    alignItems: 'center', justifyContent: 'center',
  },
  stepLabel: { fontSize: 13, fontWeight: '600', fontFamily: 'Inter_600SemiBold', color: theme.colors.textMuted },
  scroll: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 24, gap: 0 },

  // Benefits (step 1)
  benefitCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 14,
    borderRadius: 14,
    padding: 14,
  },
  benefitBadge: {
    minWidth: 42,
    height: 34,
    borderRadius: 10,
    backgroundColor: 'rgba(242,169,0,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  benefitBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    fontFamily: 'Inter_700Bold',
    color: '#8A5900',
  },
  benefitTitle: { fontSize: 14, fontWeight: '700', fontFamily: 'Inter_700Bold', color: theme.colors.text },
  benefitDesc: { fontSize: 12, color: theme.colors.textSoft, fontFamily: 'Inter_400Regular', marginTop: 2, lineHeight: 17 },

  // Field
  fieldLabel: { fontSize: 13, fontWeight: '700', fontFamily: 'Inter_700Bold', color: theme.colors.textSoft, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0 },
  fieldHint: { fontSize: 11, color: theme.colors.textMuted, fontFamily: 'Inter_400Regular', marginTop: 4 },
  input: {
    backgroundColor: theme.colors.backgroundAlt,
    borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border,
    paddingHorizontal: 14, paddingVertical: 13,
    fontSize: 16, fontFamily: 'Inter_400Regular', color: theme.colors.text,
  },

  // Vehicle type
  typeRow: { flexDirection: 'row', gap: 12 },
  typeCard: {
    flex: 1, alignItems: 'center', gap: 6, padding: 16,
    backgroundColor: theme.colors.backgroundAlt,
    borderRadius: 16, borderWidth: 2, borderColor: theme.colors.border,
  },
  typeLabel: { fontSize: 14, fontWeight: '700', fontFamily: 'Inter_700Bold', color: theme.colors.text },
  typeDesc: { fontSize: 11, color: theme.colors.textMuted, fontFamily: 'Inter_400Regular', textAlign: 'center' },

  // Chips
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: theme.colors.backgroundAlt,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  chipActive: { backgroundColor: theme.colors.text, borderColor: theme.colors.text },
  chipText: { fontSize: 13, fontWeight: '600', fontFamily: 'Inter_600SemiBold', color: theme.colors.textSoft },
  chipTextActive: { color: theme.colors.textInverse },

  // Color swatches
  colorRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  colorSwatch: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: 'transparent' },
  colorSwatchSelected: { borderColor: theme.colors.text, borderWidth: 3 },
  colorLabel: { fontSize: 12, color: theme.colors.textMuted, fontFamily: 'Inter_400Regular', marginTop: 6 },

  // Info box
  infoBox: {
    backgroundColor: 'rgba(0,122,255,0.06)',
    borderRadius: 12, borderWidth: 1, borderColor: 'rgba(0,122,255,0.18)',
    padding: 14,
  },
  infoBoxText: { fontSize: 13, color: theme.colors.textSoft, fontFamily: 'Inter_400Regular', lineHeight: 19 },

  // Documents
  docCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    borderRadius: 14, borderWidth: 1.5, borderColor: theme.colors.border,
    padding: 14, backgroundColor: theme.colors.backgroundAlt,
  },
  docCardChecked: { borderColor: theme.colors.teal, backgroundColor: 'rgba(0,201,167,0.04)' },
  docCheck: {
    width: 26, height: 26, borderRadius: 13,
    borderWidth: 2, borderColor: theme.colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  docCheckFilled: { backgroundColor: theme.colors.teal, borderColor: theme.colors.teal },
  docLabel: { fontSize: 14, fontWeight: '600', fontFamily: 'Inter_600SemiBold', color: theme.colors.text },
  docDesc: { fontSize: 12, color: theme.colors.textMuted, fontFamily: 'Inter_400Regular', marginTop: 2 },

  // Summary
  summaryCard: {
    borderRadius: 14,
    padding: 14, gap: 6,
  },
  summaryTitle: { fontSize: 13, fontWeight: '700', fontFamily: 'Inter_700Bold', color: theme.colors.text, marginBottom: 4 },
  summaryLine: { fontSize: 13, color: theme.colors.textSoft, fontFamily: 'Inter_400Regular' },

  // CTA
  cta: {
    paddingHorizontal: 20, paddingBottom: 28, paddingTop: 12,
    gap: 10,
    backgroundColor: theme.colors.driverBackground,
    borderTopWidth: 1, borderTopColor: theme.colors.border,
  },
  ctaBtn: {
    borderRadius: 14,
    minHeight: 54,
  },
  ctaBtnLabel: { fontSize: 17 },
  ghostBtn: { minHeight: 38 },
  ghostBtnLabel: { fontSize: 14 },
});

const makeOnboardingIconStyles = (theme: OrbiTheme) => StyleSheet.create({
  backWrap: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backLine: {
    position: 'absolute',
    width: 12,
    height: 2.5,
    borderRadius: 999,
    backgroundColor: theme.colors.text,
    left: 3,
  },
  backLineTop: {
    transform: [{ rotate: '-45deg' }, { translateY: -4 }],
  },
  backLineBottom: {
    transform: [{ rotate: '45deg' }, { translateY: 4 }],
  },
  checkWrap: {
    width: 15,
    height: 12,
  },
  checkLine: {
    position: 'absolute',
    height: 2.5,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
  },
  checkLineShort: {
    width: 6,
    left: 1,
    top: 7,
    transform: [{ rotate: '45deg' }],
  },
  checkLineLong: {
    width: 12,
    left: 5,
    top: 5,
    transform: [{ rotate: '-45deg' }],
  },
});
