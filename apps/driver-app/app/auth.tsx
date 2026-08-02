import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
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
import { resolveMobileAuthErrorMessage } from '@orbi/api';
import type { OrbiTheme } from '@orbi/ui';
import { OrbiAuthIcon, OrbiButton, OrbiStatusBanner, useOrbiTheme } from '@orbi/ui/native';
import { signInDriverAccount, signUpDriverAccount } from '../lib/auth';
import { OrbiLogo } from '../lib/orbi-logo';
import { preventSensitiveScreenCapture, restoreSensitiveScreenCapture } from '../lib/privacy/screen-capture';

export default function DriverAuthScreen() {
  const theme = useOrbiTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    preventSensitiveScreenCapture();
    return () => {
      restoreSensitiveScreenCapture();
    };
  }, []);

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
    return resolveMobileAuthErrorMessage(error, {
      mode,
      appRoleLabel: 'chauffeur',
    });
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
          <OrbiLogo size="sm" tint="#111111" wordmarkColor="#111111" />
          <Text style={styles.tagline} numberOfLines={1}>
            Espace chauffeur Orbi
          </Text>
          <Text style={styles.trustLine} numberOfLines={2} ellipsizeMode="tail">
            Courses claires · Gains visibles · Terrain sécurisé
          </Text>
        </View>

        {/* Mode toggle */}
        <View style={styles.modeRow}>
          <Pressable
            onPress={() => { setMode('sign-in'); setErrorMessage(''); }}
            style={[styles.modeChip, mode === 'sign-in' && styles.modeChipActive]}
          >
            <Text
              style={[styles.modeChipLabel, mode === 'sign-in' && styles.modeChipLabelActive]}
              numberOfLines={1}
            >
              Connexion
            </Text>
          </Pressable>
          <Pressable
            onPress={() => { setMode('sign-up'); setErrorMessage(''); }}
            style={[styles.modeChip, mode === 'sign-up' && styles.modeChipActive]}
          >
            <Text
              style={[styles.modeChipLabel, mode === 'sign-up' && styles.modeChipLabelActive]}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              Créer un compte
            </Text>
          </Pressable>
        </View>

        {/* Form */}
        <View style={styles.form}>
          {mode === 'sign-up' && (
            <View style={styles.inputRow}>
              <OrbiAuthIcon name="user" color={theme.colors.textMuted} />
              <TextInput
                value={fullName}
                onChangeText={setFullName}
                placeholder="Nom complet"
                placeholderTextColor={theme.colors.muted}
                style={styles.input}
              />
            </View>
          )}

          <View style={styles.inputRow}>
            <OrbiAuthIcon name="mail" color={theme.colors.textMuted} />
            <TextInput
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="Adresse email"
              placeholderTextColor={theme.colors.muted}
              style={styles.input}
            />
          </View>

          <View style={styles.inputRow}>
            <OrbiAuthIcon name="lock" color={theme.colors.textMuted} />
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              placeholder="Mot de passe"
              placeholderTextColor={theme.colors.muted}
              style={styles.input}
            />
            <Pressable
              onPress={() => setShowPassword((v) => !v)}
              hitSlop={8}
              style={styles.eyeBtn}
              accessibilityLabel={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
            >
              <OrbiAuthIcon name={showPassword ? 'eye-off' : 'eye'} color={theme.colors.textMuted} />
            </Pressable>
          </View>

          {mode === 'sign-up' && (
            <Text style={styles.passwordHint} numberOfLines={2}>
              Minimum 8 caractères · une majuscule · un chiffre · un caractère spécial (ex: !)
            </Text>
          )}

          {Boolean(errorMessage) && (
            <OrbiStatusBanner
              tone="danger"
              title="Connexion refusée"
              message={errorMessage}
            />
          )}

          <OrbiButton
            disabled={isSubmitting || !canSubmit}
            onPress={() => void handleSubmit()}
            loading={isSubmitting}
            label={mode === 'sign-in' ? 'Se connecter' : 'Créer mon compte'}
            tone="amber"
            style={styles.primaryButton}
            labelStyle={styles.primaryButtonLabel}
          />

        </View>

        <Text style={styles.legalFooter} numberOfLines={3}>
          En continuant, vous acceptez les Conditions d&apos;utilisation et la
          Politique de confidentialité d&apos;Orbi.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (theme: OrbiTheme) => StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  screen: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 28,
    gap: 14,
  },
  logoArea: {
    alignItems: 'flex-start',
    gap: 5,
    marginBottom: 0,
  },
  tagline: {
    color: '#525252',
    fontSize: 14,
    textAlign: 'left',
  },
  trustLine: {
    color: '#111111',
    fontSize: 11.5,
    fontWeight: '800',
    textAlign: 'left',
  },
  modeRow: {
    flexDirection: 'row',
    gap: 6,
  },
  modeChip: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 9,
    backgroundColor: '#F3F3F3',
    borderWidth: 1,
    borderColor: '#E8E8E8',
    alignItems: 'center',
  },
  modeChipActive: {
    backgroundColor: '#111111',
    borderColor: '#111111',
  },
  modeChipLabel: {
    color: '#6B6B6B',
    fontWeight: '700',
    fontSize: 13,
  },
  modeChipLabelActive: {
    color: '#FFFFFF',
  },
  form: {
    gap: 10,
    padding: 0,
    borderWidth: 0,
    backgroundColor: '#FFFFFF',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E8E8E8',
    backgroundColor: '#F3F3F3',
    paddingHorizontal: 13,
  },
  input: {
    flex: 1,
    color: '#111111',
    paddingVertical: 11,
    fontSize: 15,
  },
  eyeBtn: {
    paddingVertical: 12,
    paddingLeft: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButton: {
    marginTop: 2,
    borderRadius: 6,
    minHeight: 48,
    backgroundColor: '#111111',
  },
  primaryButtonLabel: {
    fontSize: 15,
  },
  passwordHint: {
    color: '#6B6B6B',
    fontSize: 11,
    lineHeight: 16,
    paddingHorizontal: 4,
  },
  legalFooter: {
    color: '#6B6B6B',
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
    paddingHorizontal: 12,
    marginTop: 2,
  },
});
