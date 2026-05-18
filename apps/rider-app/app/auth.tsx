import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { extractApiErrorMessage } from '@orbi/api';
import { orbiDemoAccessEnabled, orbiDemoAccounts } from '@orbi/config';
import { orbiTheme } from '@orbi/ui';
import { signInRiderAccount, signUpRiderAccount } from '../lib/auth';
import { RiderJourneySection } from '../lib/rider-journey';
import {
  InsightBadge,
  LiveStatusBanner,
  SectionCard,
  SectionHeading,
} from '../lib/realtime-widgets';

export default function RiderAuthScreen() {
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState(
    'Connectez-vous pour suivre vos reservations et votre historique.',
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const canSubmit =
    Boolean(email.trim()) &&
    password.length >= 8 &&
    (mode === 'sign-in' || Boolean(fullName.trim()));

  function applyDemoAccount() {
    setFullName('Awa Ouedraogo');
    setEmail(orbiDemoAccounts.rider.email);
    setPassword(orbiDemoAccounts.rider.password);
    setStatus('Compte demo passager precharge pour ouvrir rapidement une session.');
  }

  async function handleDemoSignIn() {
    setFullName('Awa Ouedraogo');
    setEmail(orbiDemoAccounts.rider.email);
    setPassword(orbiDemoAccounts.rider.password);
    setMode('sign-in');
    setIsSubmitting(true);
    setStatus('Connexion immediate du compte demo passager...');

    try {
      await signInRiderAccount({
        email: orbiDemoAccounts.rider.email,
        password: orbiDemoAccounts.rider.password,
      });
      setStatus('Session passager active.');
      router.replace('/home');
    } catch (error) {
      setStatus(describeAuthError(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  function describeAuthError(error: unknown) {
    if (error instanceof TypeError) {
      return 'Connexion reseau indisponible. Verifiez le backend avant de relancer la session passager.';
    }

    const message = error instanceof Error ? error.message.toLowerCase() : '';

    if (
      message.includes('network request failed') ||
      message.includes('fetch failed') ||
      message.includes('load failed') ||
      message.includes('networkerror')
    ) {
      return 'Connexion reseau indisponible. Verifiez le backend avant de relancer la session passager.';
    }

    return extractApiErrorMessage(
      error,
      "Impossible d'ouvrir la session passager.",
    );
  }

  async function handleSubmit() {
    setIsSubmitting(true);
    setStatus(
      mode === 'sign-in'
        ? 'Connexion du compte passager...'
        : 'Creation du compte passager...',
    );

    try {
      if (mode === 'sign-in') {
        await signInRiderAccount({
          email: email.trim(),
          password,
        });
      } else {
        await signUpRiderAccount({
          fullName: fullName.trim(),
          email: email.trim(),
          password,
        });
      }

      setStatus('Session passager active.');
      router.replace('/home');
    } catch (error) {
      setStatus(describeAuthError(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <Text style={styles.eyebrow}>Orbi Passager</Text>
      <Text style={styles.title}>Connexion et compte</Text>
      <LiveStatusBanner
        label="Acces passager"
        message={status}
        secondaryMessage="Le compte passager donne acces a la reservation, au suivi live, a la voix et a l historique."
      />
      {orbiDemoAccessEnabled ? (
        <View style={styles.quickActionPanel}>
          <View style={styles.quickActionCopy}>
            <Text style={styles.quickActionTitle}>Entrer maintenant</Text>
            <Text style={styles.quickActionMeta}>
              Lance une vraie session rider demo puis ouvre le cockpit.
            </Text>
          </View>
          <Pressable
            onPress={() => void handleDemoSignIn()}
            disabled={isSubmitting}
            style={[styles.quickActionButton, isSubmitting ? styles.buttonDisabled : null]}
          >
            <Text style={styles.quickActionButtonLabel}>
              {isSubmitting ? 'Connexion...' : 'Demo rider'}
            </Text>
          </Pressable>
        </View>
      ) : null}

      <SectionCard tone="sky">
        <SectionHeading
          eyebrow="Parcours"
          title="Reprenez vos trajets sans friction"
          description={
            orbiDemoAccessEnabled
              ? 'Connexion, inscription et compte demo volontaire dans une entree plus nette pour lancer rapidement une reservation.'
              : 'Connexion et inscription dans une entree plus nette pour lancer rapidement une reservation.'
          }
        />
        <View style={styles.insightRow}>
          <InsightBadge label="Booking" value="Prix clairs" tone="teal" />
          <InsightBadge label="Suivi" value="Temps reel" tone="sky" />
          <InsightBadge label="Paiement" value="Mobile Money" tone="amber" />
        </View>
      </SectionCard>

      <RiderJourneySection
        currentStep="auth"
        description="Commencez ici, puis laissez le tunnel passager vous guider vers l accueil, la reservation, la voix et le suivi."
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
            {mode === 'sign-in' ? 'Reprendre votre session' : 'Creer un compte passager'}
          </Text>
          <Text style={styles.cardMeta}>
            {mode === 'sign-in'
              ? orbiDemoAccessEnabled
                ? 'Reconnectez-vous avec vos identifiants ou chargez explicitement le compte demo.'
                : 'Reconnectez-vous avec vos identifiants.'
              : 'Le compte vous permettra ensuite de reserver et sauvegarder vos lieux favoris.'}
          </Text>
        </View>

        {mode === 'sign-up' ? (
          <>
            <Text style={styles.label}>Nom complet</Text>
            <TextInput
              value={fullName}
              onChangeText={setFullName}
              placeholder="Awa Ouedraogo"
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
          placeholder="rider@orbi.app"
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
    color: orbiTheme.colors.teal,
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
    borderColor: 'rgba(45, 212, 191, 0.32)',
    backgroundColor: 'rgba(45, 212, 191, 0.1)',
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
    backgroundColor: orbiTheme.colors.teal,
  },
  quickActionButtonLabel: {
    color: '#052a28',
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
    backgroundColor: orbiTheme.colors.teal,
    borderColor: orbiTheme.colors.teal,
  },
  modeChipLabel: {
    color: orbiTheme.colors.text,
    fontWeight: '700',
  },
  modeChipLabelActive: {
    color: '#052a28',
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
    backgroundColor: orbiTheme.colors.teal,
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 18,
  },
  primaryButtonLabel: {
    color: '#052a28',
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
  buttonDisabled: {
    opacity: 0.65,
  },
});
