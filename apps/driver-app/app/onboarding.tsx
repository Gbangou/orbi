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
  segment: { flex: 1, height: 4, borderRadius: 1 },
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
    <View style={step.container}>
      <Text style={step.title}>{title}</Text>
      {subtitle ? <Text style={step.subtitle}>{subtitle}</Text> : null}
      <View style={step.body}>{children}</View>
    </View>
  );
}

const makeStepStyles = (theme: OrbiTheme) => StyleSheet.create({
  container: {
    gap: 4,
    paddingHorizontal: 2,
    paddingVertical: 4,
    backgroundColor: '#FFFFFF',
  },
  title: { fontSize: 24, fontWeight: '900', fontFamily: 'Raleway_800ExtraBold', color: '#111111' },
  subtitle: { fontSize: 14, color: '#525252', fontFamily: 'Inter_400Regular', lineHeight: 20, marginTop: 4 },
  body: { gap: 14, marginTop: 18 },
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
          ? 'Connexion impossible. Verifiez votre reseau.'
          : resolveDisplayableApiErrorMessage(error, 'Impossible de soumettre le profil.'),
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
                  { code: '82%', title: '82% du tarif pour vous', desc: 'Commission claire. Revenu estime avant acceptation.' },
                  { code: 'Libre', title: 'Votre emploi du temps', desc: 'Passez en ligne quand vous voulez, sans horaire imposé.' },
                  { code: 'MM', title: 'Paiement Mobile Money', desc: 'Orange Money et Moov Money avec historique clair.' },
                  { code: 'Safe', title: 'Protection chauffeur', desc: 'SOS, suivi de trajet et support 7j/7.' },
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
                  message="Permis, carte grise, assurance et piece d'identite nationale seront verifies avant activation."
                />
              </StepContainer>
            )}

            {/* ── Step 2: Véhicule ── */}
            {currentStep === 2 && (
              <StepContainer title="Votre vehicule" subtitle="Ces informations sont verifiees avant activation.">

                {/* Vehicle type */}
                <View>
                  <Text style={styles.fieldLabel}>Type de vehicule</Text>
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
                            {isMoto ? '1 passager · Urbain' : '4 places · Climatisee'}
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
                  <Text style={styles.fieldLabel}>Modele</Text>
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
                  <Text style={styles.fieldLabel}>Numero de plaque</Text>
                  <TextInput
                    value={plateNumber}
                    onChangeText={(v) => setPlateNumber(v.toUpperCase())}
                    placeholder="11 AB 1234 BF"
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
              <StepContainer title="Vos informations" subtitle="Necessaires pour votre profil chauffeur et vos paiements.">

                <View>
                  <Text style={styles.fieldLabel}>Telephone</Text>
                  <TextInput
                    value={phoneNumber}
                    onChangeText={setPhoneNumber}
                    placeholder="+226 70 00 00 00"
                    placeholderTextColor={theme.colors.textMuted}
                    keyboardType="phone-pad"
                    style={styles.input}
                  />
                  <Text style={styles.fieldHint}>Ce numero sera utilise pour vos paiements Mobile Money.</Text>
                </View>

                <View>
                  <Text style={styles.fieldLabel}>Numero de permis de conduire</Text>
                  <TextInput
                    value={licenseNumber}
                    onChangeText={(v) => setLicenseNumber(v.toUpperCase())}
                    placeholder="BF-A-12345"
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
                    Votre profil sera examine par l'equipe Orbi sous 24-48h. Vous recevrez une notification des l'approbation.
                  </Text>
                </View>
              </StepContainer>
            )}

            {/* ── Step 4: Documents & confirmation ── */}
            {currentStep === 4 && (
              <StepContainer title="Documents requis" subtitle="Confirmez les documents disponibles. Ils seront vérifiés avant activation.">

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
                    title="Profil non soumis"
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
              label="Soumettre le profil"
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
  safe: { flex: 1, backgroundColor: '#FFFFFF' },
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
    backgroundColor: '#F3F3F3',
    alignItems: 'center', justifyContent: 'center',
  },
  stepLabel: { fontSize: 13, fontWeight: '700', fontFamily: 'Inter_600SemiBold', color: '#525252' },
  scroll: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 24, gap: 0 },

  // Benefits (step 1)
  benefitCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 14,
    borderRadius: 8,
    padding: 13,
    borderWidth: 1,
    borderColor: '#E8E8E8',
    backgroundColor: '#FFFFFF',
  },
  benefitBadge: {
    minWidth: 42,
    height: 34,
    borderRadius: 8,
    backgroundColor: '#F3F3F3',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  benefitBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    fontFamily: 'Inter_700Bold',
    color: '#111111',
  },
  benefitTitle: { fontSize: 14, fontWeight: '800', fontFamily: 'Inter_700Bold', color: '#111111' },
  benefitDesc: { fontSize: 12, color: '#525252', fontFamily: 'Inter_400Regular', marginTop: 2, lineHeight: 17 },

  // Field
  fieldLabel: { fontSize: 13, fontWeight: '800', fontFamily: 'Inter_700Bold', color: '#525252', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0 },
  fieldHint: { fontSize: 11, color: '#6B6B6B', fontFamily: 'Inter_400Regular', marginTop: 4 },
  input: {
    backgroundColor: '#F3F3F3',
    borderRadius: 8, borderWidth: 1, borderColor: '#E8E8E8',
    paddingHorizontal: 14, paddingVertical: 13,
    fontSize: 16, fontFamily: 'Inter_400Regular', color: '#111111',
  },

  // Vehicle type
  typeRow: { flexDirection: 'row', gap: 12 },
  typeCard: {
    flex: 1, alignItems: 'center', gap: 6, padding: 14,
    backgroundColor: '#F3F3F3',
    borderRadius: 8, borderWidth: 1.5, borderColor: '#E8E8E8',
  },
  typeLabel: { fontSize: 14, fontWeight: '800', fontFamily: 'Inter_700Bold', color: '#111111' },
  typeDesc: { fontSize: 11, color: '#6B6B6B', fontFamily: 'Inter_400Regular', textAlign: 'center' },

  // Chips
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: '#F3F3F3',
    borderWidth: 1, borderColor: '#E8E8E8',
  },
  chipActive: { backgroundColor: '#111111', borderColor: '#111111' },
  chipText: { fontSize: 13, fontWeight: '700', fontFamily: 'Inter_600SemiBold', color: '#525252' },
  chipTextActive: { color: theme.colors.textInverse },

  // Color swatches
  colorRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  colorSwatch: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: 'transparent' },
  colorSwatchSelected: { borderColor: theme.colors.text, borderWidth: 3 },
  colorLabel: { fontSize: 12, color: theme.colors.textMuted, fontFamily: 'Inter_400Regular', marginTop: 6 },

  // Info box
  infoBox: {
    backgroundColor: '#F7F7F7',
    borderRadius: 8, borderWidth: 1, borderColor: '#E8E8E8',
    padding: 14,
  },
  infoBoxText: { fontSize: 13, color: '#525252', fontFamily: 'Inter_400Regular', lineHeight: 19 },

  // Documents
  docCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    borderRadius: 8, borderWidth: 1, borderColor: '#E8E8E8',
    padding: 13, backgroundColor: '#F3F3F3',
  },
  docCardChecked: { borderColor: '#111111', backgroundColor: '#FFFFFF' },
  docCheck: {
    width: 26, height: 26, borderRadius: 13,
    borderWidth: 2, borderColor: '#CFCFCF',
    alignItems: 'center', justifyContent: 'center',
  },
  docCheckFilled: { backgroundColor: '#111111', borderColor: '#111111' },
  docLabel: { fontSize: 14, fontWeight: '700', fontFamily: 'Inter_600SemiBold', color: '#111111' },
  docDesc: { fontSize: 12, color: '#6B6B6B', fontFamily: 'Inter_400Regular', marginTop: 2 },

  // Summary
  summaryCard: {
    borderRadius: 8,
    padding: 14, gap: 6,
    borderWidth: 1,
    borderColor: '#E8E8E8',
    backgroundColor: '#FFFFFF',
  },
  summaryTitle: { fontSize: 13, fontWeight: '800', fontFamily: 'Inter_700Bold', color: '#111111', marginBottom: 4 },
  summaryLine: { fontSize: 13, color: '#525252', fontFamily: 'Inter_400Regular' },

  // CTA
  cta: {
    paddingHorizontal: 20, paddingBottom: 28, paddingTop: 12,
    gap: 10,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1, borderTopColor: '#E8E8E8',
  },
  ctaBtn: {
    borderRadius: 6,
    minHeight: 54,
    backgroundColor: '#111111',
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
