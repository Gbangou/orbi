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
import { extractApiErrorMessage } from '@orbi/api';
import { orbiDemoAccessEnabled, orbiDemoAccounts } from '@orbi/config';
import { orbiTheme } from '@orbi/ui';
import { signInDriverAccount, signUpDriverAccount } from '../lib/auth';
import { OrbiLogo } from '../lib/orbi-logo';

export default function DriverAuthScreen() {
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isPasswordStrong = (pw: string) =>
    pw.length >= 8 &&
    /[A-Z]/.test(pw) &&
    /[a-z]/.test(pw) &&
    /\d/.test(pw) &&
    /[^A-Za-z0-9]/.test(pw);

  const canSubmit =
    Boolean(email.trim()) &&
    (mode === 'sign-in' ? password.length >= 8 : isPasswordStrong(password)) &&
    (mode === 'sign-in' || Boolean(fullName.trim()));

  function describeAuthError(error: unknown): string {
    if (error instanceof TypeError) {
      return 'Connexion impossible. Vérifiez votre réseau et réessayez.';
    }
    const message = error instanceof Error ? error.message.toLowerCase() : '';
    if (
      message.includes('network request failed') ||
      message.includes('fetch failed') ||
      message.includes('load failed') ||
      message.includes('networkerror')
    ) {
      return 'Connexion impossible. Vérifiez votre réseau et réessayez.';
    }
    return extractApiErrorMessage(error, 'Identifiants incorrects. Réessayez.');
  }

  async function handleSubmit() {
    setErrorMessage('');
    setIsSubmitting(true);
    const normalizedEmail = email.trim().toLowerCase();

    try {
      if (mode === 'sign-in') {
        await signInDriverAccount({ email: normalizedEmail, password });
        router.replace('/accueil');
      } else {
        await signUpDriverAccount({
          fullName: fullName.trim(),
          email: normalizedEmail,
          password,
        });
        router.replace('/onboarding');
      }
    } catch (error) {
      setErrorMessage(describeAuthError(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDemoSignIn() {
    setErrorMessage('');
    setIsSubmitting(true);
    try {
      await signInDriverAccount({
        email: orbiDemoAccounts.driver.email,
        password: orbiDemoAccounts.driver.password,
      });
      router.replace('/accueil');
    } catch (error) {
      setErrorMessage(describeAuthError(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.screen}
        keyboardShouldPersistTaps="handled"
      >
        {/* Logo */}
        <View style={styles.logoArea}>
          <OrbiLogo size="xl" orientation="vertical" tint={orbiTheme.colors.amber} />
          <Text style={styles.tagline}>Espace chauffeur Orbi</Text>
        </View>

        {/* Mode toggle */}
        <View style={styles.modeRow}>
          <Pressable
            onPress={() => { setMode('sign-in'); setErrorMessage(''); }}
            style={[styles.modeChip, mode === 'sign-in' && styles.modeChipActive]}
          >
            <Text style={[styles.modeChipLabel, mode === 'sign-in' && styles.modeChipLabelActive]}>
              Connexion
            </Text>
          </Pressable>
          <Pressable
            onPress={() => { setMode('sign-up'); setErrorMessage(''); }}
            style={[styles.modeChip, mode === 'sign-up' && styles.modeChipActive]}
          >
            <Text style={[styles.modeChipLabel, mode === 'sign-up' && styles.modeChipLabelActive]}>
              Créer un compte
            </Text>
          </Pressable>
        </View>

        {/* Form */}
        <View style={styles.form}>
          {mode === 'sign-up' && (
            <TextInput
              value={fullName}
              onChangeText={setFullName}
              placeholder="Nom complet"
              placeholderTextColor={orbiTheme.colors.muted}
              style={styles.input}
            />
          )}

          <TextInput
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="Adresse email"
            placeholderTextColor={orbiTheme.colors.muted}
            style={styles.input}
          />

          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="Mot de passe"
            placeholderTextColor={orbiTheme.colors.muted}
            style={styles.input}
          />

          {mode === 'sign-up' && (
            <Text style={styles.passwordHint}>
              Minimum 8 caractères · une majuscule · un chiffre · un caractère spécial (ex: !)
            </Text>
          )}

          {Boolean(errorMessage) && (
            <Text style={styles.errorText}>{errorMessage}</Text>
          )}

          <Pressable
            disabled={isSubmitting || !canSubmit}
            onPress={() => void handleSubmit()}
            style={[styles.primaryButton, (isSubmitting || !canSubmit) && styles.buttonDisabled]}
          >
            <Text style={styles.primaryButtonLabel}>
              {isSubmitting
                ? '...'
                : mode === 'sign-in'
                  ? 'Se connecter'
                  : 'Créer mon compte'}
            </Text>
          </Pressable>

          {orbiDemoAccessEnabled && (
            <Pressable
              onPress={() => void handleDemoSignIn()}
              disabled={isSubmitting}
              style={[styles.ghostButton, isSubmitting && styles.buttonDisabled]}
            >
              <Text style={styles.ghostButtonLabel}>Acces terrain securise</Text>
            </Pressable>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: orbiTheme.colors.background,
  },
  screen: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingVertical: 60,
    gap: 24,
  },
  logoArea: {
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  tagline: {
    color: orbiTheme.colors.muted,
    fontSize: 15,
    textAlign: 'center',
  },
  modeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  modeChip: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 12,
    backgroundColor: orbiTheme.colors.backgroundAlt,
    borderWidth: 1,
    borderColor: orbiTheme.colors.border,
    alignItems: 'center',
  },
  modeChipActive: {
    backgroundColor: orbiTheme.colors.amber,
    borderColor: orbiTheme.colors.amber,
  },
  modeChipLabel: {
    color: orbiTheme.colors.muted,
    fontWeight: '700',
    fontSize: 14,
  },
  modeChipLabelActive: {
    color: '#3b2205',
  },
  form: {
    gap: 12,
  },
  input: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: orbiTheme.colors.border,
    backgroundColor: orbiTheme.colors.backgroundAlt,
    color: orbiTheme.colors.text,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
  },
  errorText: {
    color: '#f87171',
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: 4,
  },
  primaryButton: {
    marginTop: 4,
    backgroundColor: orbiTheme.colors.amber,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryButtonLabel: {
    color: '#3b2205',
    fontWeight: '800',
    fontSize: 16,
  },
  ghostButton: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  ghostButtonLabel: {
    color: orbiTheme.colors.muted,
    fontSize: 13,
    fontWeight: '600',
  },
  passwordHint: {
    color: orbiTheme.colors.muted,
    fontSize: 11,
    lineHeight: 16,
    paddingHorizontal: 4,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
