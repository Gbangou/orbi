import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { extractApiErrorMessage } from '@orbi/api';
import { orbiDemoAccessEnabled, orbiDemoAccounts } from '@orbi/config';
import { orbiTheme } from '@orbi/ui';
import { signInDriverAccount, signUpDriverAccount } from '../lib/auth';
import { DriverJourneySection } from '../lib/driver-journey';
import {
  InsightBadge,
  LiveStatusBanner,
  SectionCard,
  SectionHeading,
} from '../lib/realtime-widgets';

export default function DriverAuthScreen() {
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState(
    'Connectez-vous pour gerer les offres, les revenus et l onboarding.',
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const canSubmit =
    Boolean(email.trim()) &&
    password.length >= 8 &&
    (mode === 'sign-in' || Boolean(fullName.trim()));
  const authChecklist = [
    email.trim()
      ? 'Email pret'
      : 'Saisissez un email pour ouvrir une session reelle.',
    password.length >= 8
      ? 'Mot de passe pret'
      : 'Le mot de passe doit contenir au moins 8 caracteres.',
    mode === 'sign-in' || fullName.trim()
      ? mode === 'sign-in'
        ? 'Connexion prete'
        : 'Nom complet pret'
      : 'Ajoutez le nom complet pour creer le profil chauffeur.',
  ];

  function applyDemoAccount() {
    setFullName('Issa Driver');
    setEmail(orbiDemoAccounts.driver.email);
    setPassword(orbiDemoAccounts.driver.password);
    setStatus('Compte demo chauffeur precharge pour accelerer la connexion.');
  }

  async function handleDemoSignIn() {
    setFullName('Issa Driver');
    setEmail(orbiDemoAccounts.driver.email);
    setPassword(orbiDemoAccounts.driver.password);
    setMode('sign-in');
    setIsSubmitting(true);
    setStatus('Connexion immediate du compte demo chauffeur...');

    try {
      await signInDriverAccount({
        email: orbiDemoAccounts.driver.email,
        password: orbiDemoAccounts.driver.password,
      });
      setStatus('Session chauffeur active.');
      router.replace('/accueil');
    } catch (error) {
      setStatus(describeAuthError(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  function describeAuthError(error: unknown) {
    if (error instanceof TypeError) {
      return 'Connexion reseau indisponible. Verifiez le backend avant de relancer la session chauffeur.';
    }

    const message = error instanceof Error ? error.message.toLowerCase() : '';

    if (
      message.includes('network request failed') ||
      message.includes('fetch failed') ||
      message.includes('load failed') ||
      message.includes('networkerror')
    ) {
      return 'Connexion reseau indisponible. Verifiez le backend avant de relancer la session chauffeur.';
    }

    return extractApiErrorMessage(
      error,
      "Impossible d'ouvrir la session chauffeur.",
    );
  }

  async function handleSubmit() {
    setIsSubmitting(true);
    setStatus(
      mode === 'sign-in'
        ? 'Connexion du compte chauffeur...'
        : 'Creation du compte chauffeur...',
    );

    try {
      if (mode === 'sign-in') {
        await signInDriverAccount({
          email: email.trim(),
          password,
        });
      } else {
        await signUpDriverAccount({
          fullName: fullName.trim(),
          email: email.trim(),
          password,
        });
      }

      setStatus('Session chauffeur active.');
      router.replace('/accueil');
    } catch (error) {
      setStatus(describeAuthError(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <Text style={styles.eyebrow}>Orbi Chauffeur</Text>
      <Text style={styles.title}>Connexion et activation</Text>
      <LiveStatusBanner
        label="Acces securise"
        message={status}
        secondaryMessage="Le compte chauffeur ouvre l acces aux offres live, aux revenus et au pilotage du dossier operations."
        tone="amber"
      />
      {orbiDemoAccessEnabled ? (
        <View style={styles.quickActionPanel}>
          <View style={styles.quickActionCopy}>
            <Text style={styles.quickActionTitle}>Entrer maintenant</Text>
            <Text style={styles.quickActionMeta}>
              Lance une vraie session chauffeur demo puis ouvre le cockpit.
            </Text>
          </View>
          <Pressable
            onPress={() => void handleDemoSignIn()}
            disabled={isSubmitting}
            style={[styles.quickActionButton, isSubmitting ? styles.buttonDisabled : null]}
          >
            <Text style={styles.quickActionButtonLabel}>
              {isSubmitting ? 'Connexion...' : 'Demo driver'}
            </Text>
          </Pressable>
        </View>
      ) : null}

      <SectionCard tone="sky">
        <SectionHeading
          eyebrow="Parcours"
          title="Entrez dans votre cockpit chauffeur"
          description={
            orbiDemoAccessEnabled
              ? 'Connexion, bascule inscription et compte demo volontaire pour tester ou reprendre une session sans friction.'
              : 'Connexion et bascule inscription pour reprendre une session sans friction.'
          }
        />
        <View style={styles.insightRow}>
          <InsightBadge label="Flux" value="Offres live" tone="teal" />
          <InsightBadge label="Finance" value="Revenus clairs" tone="amber" />
          <InsightBadge label="Trust ops" value="Onboarding" tone="sky" />
        </View>
      </SectionCard>

      <DriverJourneySection
        currentStep="auth"
        description="Le chauffeur commence ici, puis retrouve ensuite le cockpit, les offres live, les revenus et le dossier ops dans le meme tunnel."
      />

      <View style={styles.modeRow}>
        {(['sign-in', 'sign-up'] as const).map((value) => (
          <Pressable
            key={value}
            onPress={() => setMode(value)}
            style={[
              styles.modeChip,
              mode === value ? styles.modeChipActive : null,
            ]}
          >
            <Text
              style={[
                styles.modeChipLabel,
                mode === value ? styles.modeChipLabelActive : null,
              ]}
            >
              {value === 'sign-in' ? 'Connexion' : 'Inscription'}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>
            {mode === 'sign-in' ? 'Reprendre la session' : 'Creer un profil chauffeur'}
          </Text>
          <Text style={styles.cardMeta}>
            {mode === 'sign-in'
              ? orbiDemoAccessEnabled
                ? 'Utilisez vos identifiants ou chargez explicitement le compte demo.'
                : 'Utilisez vos identifiants chauffeur.'
              : 'Le compte vous permettra ensuite de completer le dossier et le vehicule.'}
          </Text>
        </View>

        {mode === 'sign-up' ? (
          <>
            <Text style={styles.label}>Nom complet</Text>
            <TextInput
              value={fullName}
              onChangeText={setFullName}
              placeholder="Issa Driver"
              placeholderTextColor={orbiTheme.colors.muted}
              style={styles.input}
            />
          </>
        ) : null}

        <Text style={styles.label}>Email</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="driver@orbi.app"
          placeholderTextColor={orbiTheme.colors.muted}
          style={styles.input}
        />

        <Text style={styles.label}>Mot de passe</Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder="Mot de passe"
          placeholderTextColor={orbiTheme.colors.muted}
          style={styles.input}
        />

        {orbiDemoAccessEnabled ? (
          <Pressable
            onPress={applyDemoAccount}
            disabled={isSubmitting}
            style={[styles.secondaryButton, isSubmitting ? styles.buttonDisabled : null]}
          >
            <Text style={styles.secondaryButtonLabel}>Utiliser le compte demo</Text>
          </Pressable>
        ) : null}

        <View style={styles.formReadiness}>
          {authChecklist.map((item) => (
            <Text key={item} style={styles.formReadinessText}>
              {item}
            </Text>
          ))}
        </View>

        <Pressable
          disabled={isSubmitting || !canSubmit}
          onPress={() => void handleSubmit()}
          style={[
            styles.primaryButton,
            isSubmitting || !canSubmit ? styles.buttonDisabled : null,
          ]}
        >
          <Text style={styles.primaryButtonLabel}>
            {isSubmitting
              ? 'Traitement...'
              : mode === 'sign-in'
                ? 'Se connecter'
                : 'Creer mon compte'}
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingTop: 96,
    paddingHorizontal: 24,
    paddingBottom: 40,
    backgroundColor: orbiTheme.colors.background,
    gap: 16,
  },
  eyebrow: {
    color: orbiTheme.colors.amber,
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  title: {
    color: orbiTheme.colors.text,
    fontSize: 34,
    fontWeight: '800',
  },
  subtitle: {
    color: orbiTheme.colors.muted,
    lineHeight: 20,
  },
  quickActionPanel: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.34)',
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    padding: 16,
    gap: 12,
  },
  quickActionCopy: {
    gap: 4,
  },
  quickActionTitle: {
    color: orbiTheme.colors.text,
    fontWeight: '900',
    fontSize: 18,
  },
  quickActionMeta: {
    color: orbiTheme.colors.muted,
    lineHeight: 18,
  },
  quickActionButton: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 11,
    backgroundColor: orbiTheme.colors.amber,
  },
  quickActionButtonLabel: {
    color: '#3b2205',
    fontWeight: '900',
  },
  insightRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  modeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  modeChip: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: orbiTheme.colors.backgroundAlt,
    borderWidth: 1,
    borderColor: orbiTheme.colors.border,
  },
  modeChipActive: {
    backgroundColor: orbiTheme.colors.amber,
    borderColor: orbiTheme.colors.amber,
  },
  modeChipLabel: {
    color: orbiTheme.colors.text,
    fontWeight: '700',
  },
  modeChipLabelActive: {
    color: '#3b2205',
  },
  card: {
    backgroundColor: orbiTheme.colors.panel,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: orbiTheme.colors.border,
    padding: 18,
    gap: 10,
  },
  cardHeader: {
    gap: 4,
    marginBottom: 4,
  },
  cardTitle: {
    color: orbiTheme.colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  cardMeta: {
    color: orbiTheme.colors.muted,
    lineHeight: 18,
  },
  label: {
    color: orbiTheme.colors.text,
    fontWeight: '700',
    fontSize: 13,
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
  primaryButton: {
    marginTop: 8,
    backgroundColor: orbiTheme.colors.amber,
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 18,
  },
  primaryButtonLabel: {
    color: '#3b2205',
    fontWeight: '800',
    textAlign: 'center',
  },
  secondaryButton: {
    marginTop: 4,
    backgroundColor: orbiTheme.colors.backgroundAlt,
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: orbiTheme.colors.border,
  },
  secondaryButtonLabel: {
    color: orbiTheme.colors.text,
    fontWeight: '700',
    textAlign: 'center',
  },
  formReadiness: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: orbiTheme.colors.border,
    backgroundColor: 'rgba(15, 23, 42, 0.32)',
    padding: 12,
    gap: 4,
  },
  formReadinessText: {
    color: orbiTheme.colors.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.65,
  },
});
