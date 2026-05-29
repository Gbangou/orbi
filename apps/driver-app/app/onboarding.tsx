import { router } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { upsertDriverOnboarding, extractApiErrorMessage } from '@orbi/api';
import { orbiTheme } from '@orbi/ui';
import { restoreDriverSession } from '../lib/auth';
import { OrbiLogo } from '../lib/orbi-logo';

type VehicleCategory = 'MOTORCYCLE' | 'CAR';

const COLORS = [
  { label: 'Rouge', value: 'Rouge', hex: '#ef4444' },
  { label: 'Blanc', value: 'Blanc', hex: '#f1f5f9' },
  { label: 'Noir', value: 'Noir', hex: '#1e293b' },
  { label: 'Gris', value: 'Gris', hex: '#64748b' },
  { label: 'Bleu', value: 'Bleu', hex: '#3b82f6' },
  { label: 'Vert', value: 'Vert', hex: '#22c55e' },
];

function MotoIcon({ accent }: { accent: string }) {
  return (
    <View style={iconStyles.motoContainer}>
      <View style={[iconStyles.motoWheel, { borderColor: accent }]} />
      <View style={[iconStyles.motoBody, { backgroundColor: accent + '33', borderColor: accent }]} />
      <View style={[iconStyles.motoHandlebar, { backgroundColor: accent }]} />
      <View style={[iconStyles.motoWheelR, { borderColor: accent }]} />
    </View>
  );
}

function CarIcon({ accent }: { accent: string }) {
  return (
    <View style={iconStyles.carContainer}>
      <View style={[iconStyles.carBody, { backgroundColor: accent + '33', borderColor: accent }]} />
      <View style={[iconStyles.carRoof, { backgroundColor: accent + '66' }]} />
      <View style={[iconStyles.carWheelFL, { borderColor: accent }]} />
      <View style={[iconStyles.carWheelFR, { borderColor: accent }]} />
      <View style={[iconStyles.carWheelRL, { borderColor: accent }]} />
      <View style={[iconStyles.carWheelRR, { borderColor: accent }]} />
    </View>
  );
}

export default function DriverOnboardingScreen() {
  const [vehicleType, setVehicleType] = useState<VehicleCategory>('MOTORCYCLE');
  const [plateNumber, setPlateNumber] = useState('');
  const [selectedColor, setSelectedColor] = useState('Rouge');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const canSubmit = plateNumber.trim().length >= 2 && !isSubmitting;

  async function handleSubmit() {
    setErrorMessage('');
    setIsSubmitting(true);

    try {
      const { authClient } = await restoreDriverSession();
      const isMoto = vehicleType === 'MOTORCYCLE';
      const ts = Date.now().toString(36).slice(-4).toUpperCase();

      await upsertDriverOnboarding(authClient, {
        licenseNumber: `FIELD-${ts}`,
        city: 'OUAGADOUGOU',
        serviceRadiusKm: 15,
        documents: {
          identityDocumentProvided: false,
          driverLicenseProvided: false,
          vehicleRegistrationProvided: false,
          insuranceProofProvided: false,
          selfieMatchProvided: false,
        },
        vehicles: [
          {
            plateNumber: plateNumber.trim().toUpperCase(),
            make: isMoto ? 'Honda' : 'Toyota',
            model: isMoto ? 'CB125' : 'Corolla',
            color: selectedColor,
            year: 2022,
            type: vehicleType,
            tier: isMoto ? 'MOTO_STANDARD' : 'CAR_STANDARD',
            seats: isMoto ? 2 : 4,
          },
        ],
      });

      router.replace('/accueil');
    } catch (error) {
      if (error instanceof TypeError) {
        setErrorMessage('Connexion impossible. Vérifiez votre réseau.');
      } else {
        setErrorMessage(
          extractApiErrorMessage(error, 'Impossible d\'enregistrer le véhicule.'),
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  const accent = vehicleType === 'MOTORCYCLE' ? orbiTheme.colors.teal : orbiTheme.colors.amber;

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.screen}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <OrbiLogo size="sm" tint={orbiTheme.colors.amber} />

        <View style={styles.header}>
          <Text style={styles.title}>Votre véhicule</Text>
          <Text style={styles.subtitle}>
            Configurez votre véhicule pour commencer à recevoir des courses.
          </Text>
        </View>

        {/* Vehicle type */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Type de véhicule</Text>
          <View style={styles.typeRow}>
            <Pressable
              style={[
                styles.typeCard,
                vehicleType === 'MOTORCYCLE' && { borderColor: orbiTheme.colors.teal, backgroundColor: 'rgba(45,212,191,0.08)' },
              ]}
              onPress={() => setVehicleType('MOTORCYCLE')}
            >
              <MotoIcon accent={orbiTheme.colors.teal} />
              <Text style={[styles.typeLabel, vehicleType === 'MOTORCYCLE' && { color: orbiTheme.colors.teal }]}>
                Moto
              </Text>
              <Text style={styles.typeDesc}>Urbain · Solo · Rapide</Text>
            </Pressable>

            <Pressable
              style={[
                styles.typeCard,
                vehicleType === 'CAR' && { borderColor: orbiTheme.colors.amber, backgroundColor: 'rgba(245,158,11,0.08)' },
              ]}
              onPress={() => setVehicleType('CAR')}
            >
              <CarIcon accent={orbiTheme.colors.amber} />
              <Text style={[styles.typeLabel, vehicleType === 'CAR' && { color: orbiTheme.colors.amber }]}>
                Voiture
              </Text>
              <Text style={styles.typeDesc}>4 places · Confort</Text>
            </Pressable>
          </View>
        </View>

        {/* Plate number */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Immatriculation</Text>
          <TextInput
            style={[styles.input, { borderColor: plateNumber ? accent : orbiTheme.colors.border }]}
            value={plateNumber}
            onChangeText={setPlateNumber}
            placeholder="Ex: AB-1234-BF"
            placeholderTextColor={orbiTheme.colors.muted}
            autoCapitalize="characters"
            returnKeyType="done"
          />
          <Text style={styles.inputHint}>Format Burkina Faso (lettres et chiffres)</Text>
        </View>

        {/* Color */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Couleur</Text>
          <View style={styles.colorRow}>
            {COLORS.map((color) => (
              <Pressable
                key={color.value}
                onPress={() => setSelectedColor(color.value)}
                style={[
                  styles.colorDot,
                  { backgroundColor: color.hex },
                  selectedColor === color.value && styles.colorDotSelected,
                ]}
              />
            ))}
          </View>
          <Text style={[styles.inputHint, { marginTop: 6 }]}>
            Couleur sélectionnée: {selectedColor}
          </Text>
        </View>

        {Boolean(errorMessage) && (
          <Text style={styles.errorText}>{errorMessage}</Text>
        )}

        <Pressable
          style={[
            styles.submitButton,
            { backgroundColor: accent },
            (!canSubmit) && styles.buttonDisabled,
          ]}
          onPress={() => void handleSubmit()}
          disabled={!canSubmit}
        >
          <Text style={[styles.submitLabel, vehicleType === 'MOTORCYCLE' ? styles.submitLabelTeal : styles.submitLabelAmber]}>
            {isSubmitting ? 'Enregistrement...' : 'Confirmer et continuer'}
          </Text>
        </Pressable>

        <Text style={styles.note}>
          Vous pourrez modifier ces informations depuis votre profil à tout moment.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const iconStyles = StyleSheet.create({
  motoContainer: { width: 56, height: 44, position: 'relative', alignItems: 'center', justifyContent: 'center' },
  motoWheel: { position: 'absolute', left: 2, top: 10, width: 16, height: 16, borderRadius: 8, borderWidth: 2, backgroundColor: 'transparent' },
  motoBody: { width: 34, height: 10, borderRadius: 6, borderWidth: 1.5, marginBottom: 2 },
  motoHandlebar: { width: 22, height: 3, borderRadius: 2 },
  motoWheelR: { position: 'absolute', right: 2, bottom: 4, width: 16, height: 16, borderRadius: 8, borderWidth: 2, backgroundColor: 'transparent' },
  carContainer: { width: 56, height: 44, position: 'relative', alignItems: 'center', justifyContent: 'center' },
  carBody: { width: 50, height: 24, borderRadius: 6, borderWidth: 1.5 },
  carRoof: { position: 'absolute', top: 4, width: 32, height: 14, borderRadius: 4 },
  carWheelFL: { position: 'absolute', bottom: 2, left: 4, width: 12, height: 12, borderRadius: 6, borderWidth: 2, backgroundColor: 'transparent' },
  carWheelFR: { position: 'absolute', bottom: 2, right: 4, width: 12, height: 12, borderRadius: 6, borderWidth: 2, backgroundColor: 'transparent' },
  carWheelRL: { position: 'absolute', top: 2, left: 4, width: 12, height: 12, borderRadius: 6, borderWidth: 2, backgroundColor: 'transparent' },
  carWheelRR: { position: 'absolute', top: 2, right: 4, width: 12, height: 12, borderRadius: 6, borderWidth: 2, backgroundColor: 'transparent' },
});

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: orbiTheme.colors.background,
  },
  screen: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 56,
    paddingBottom: 48,
    gap: 24,
  },
  header: {
    gap: 8,
  },
  title: {
    color: orbiTheme.colors.text,
    fontSize: 32,
    fontWeight: '800',
    lineHeight: 36,
  },
  subtitle: {
    color: orbiTheme.colors.muted,
    fontSize: 15,
    lineHeight: 22,
  },
  section: {
    gap: 10,
  },
  sectionLabel: {
    color: orbiTheme.colors.text,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  typeRow: {
    flexDirection: 'row',
    gap: 12,
  },
  typeCard: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: orbiTheme.colors.border,
    backgroundColor: orbiTheme.colors.backgroundAlt,
    paddingVertical: 18,
    paddingHorizontal: 12,
    alignItems: 'center',
    gap: 8,
  },
  typeLabel: {
    color: orbiTheme.colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  typeDesc: {
    color: orbiTheme.colors.muted,
    fontSize: 11,
    textAlign: 'center',
  },
  input: {
    borderRadius: 14,
    borderWidth: 1.5,
    backgroundColor: orbiTheme.colors.backgroundAlt,
    color: orbiTheme.colors.text,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    letterSpacing: 1,
    fontWeight: '600',
  },
  inputHint: {
    color: orbiTheme.colors.muted,
    fontSize: 12,
    marginTop: 2,
  },
  colorRow: {
    flexDirection: 'row',
    gap: 14,
    flexWrap: 'wrap',
  },
  colorDot: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorDotSelected: {
    borderColor: orbiTheme.colors.text,
    transform: [{ scale: 1.15 }],
  },
  errorText: {
    color: '#f87171',
    fontSize: 13,
    textAlign: 'center',
  },
  submitButton: {
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  submitLabel: {
    fontSize: 16,
    fontWeight: '800',
  },
  submitLabelTeal: {
    color: '#052a28',
  },
  submitLabelAmber: {
    color: '#3b2205',
  },
  note: {
    color: orbiTheme.colors.muted,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
});
