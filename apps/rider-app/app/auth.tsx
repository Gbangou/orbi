import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { resolveMobileAuthErrorMessage } from '@orbi/api';
import { orbiDemoAccessEnabled, orbiDemoAccounts } from '@orbi/config';
import type { OrbiTheme } from '@orbi/ui';
import { OrbiAuthIcon, OrbiButton, OrbiStatusBanner, OrbiSurface, useOrbiTheme } from '@orbi/ui/native';
import { signInRiderAccount, signUpRiderAccount } from '../lib/auth';
import { OrbiLogo } from '../lib/orbi-logo';
import { useTranslation } from '../lib/i18n';
import { preventSensitiveScreenCapture, restoreSensitiveScreenCapture } from '../lib/privacy/screen-capture';

export default function RiderAuthScreen() {
  const theme = useOrbiTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { t } = useTranslation();
  const ta = (key: string) => t(`auth.${key}`);
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
    pw.length >= 8 && /[A-Z]/.test(pw) && /[a-z]/.test(pw) && /\d/.test(pw) && /[^A-Za-z0-9]/.test(pw);

  const canSubmit =
    Boolean(email.trim()) &&
    (mode === 'sign-in' ? password.length >= 8 : isPasswordStrong(password)) &&
    (mode === 'sign-in' || Boolean(fullName.trim()));

  function describeAuthError(error: unknown): string {
    return resolveMobileAuthErrorMessage(error, {
      mode,
      appRoleLabel: 'passager',
    });
  }

  async function handleSubmit() {
    setErrorMessage('');
    setIsSubmitting(true);
    const normalizedEmail = email.trim().toLowerCase();
    try {
      if (mode === 'sign-in') {
        await signInRiderAccount({ email: normalizedEmail, password });
      } else {
        await signUpRiderAccount({ fullName: fullName.trim(), email: normalizedEmail, password });
      }
      router.replace('/home');
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
      await signInRiderAccount({
        email: orbiDemoAccounts.rider.email,
        password: orbiDemoAccounts.rider.password,
      });
      router.replace('/home');
    } catch (error) {
      setErrorMessage(describeAuthError(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Wordmark */}
          <View style={styles.brand}>
            <OrbiLogo size="md" />
            <Text style={styles.tagline} numberOfLines={1}>
              Votre course en quelques secondes
            </Text>
            <Text style={styles.trustLine} numberOfLines={2} ellipsizeMode="tail">
              Prix clair · Chauffeur proche · Départ rapide
            </Text>
          </View>

          {/* Mode toggle */}
          <View style={styles.toggle}>
            <Pressable
              onPress={() => { setMode('sign-in'); setErrorMessage(''); }}
              style={[styles.toggleBtn, mode === 'sign-in' && styles.toggleBtnActive]}
            >
              <Text
                style={[styles.toggleLabel, mode === 'sign-in' && styles.toggleLabelActive]}
                numberOfLines={1}
              >
                {ta('tabSignIn')}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => { setMode('sign-up'); setErrorMessage(''); }}
              style={[styles.toggleBtn, mode === 'sign-up' && styles.toggleBtnActive]}
            >
              <Text
                style={[styles.toggleLabel, mode === 'sign-up' && styles.toggleLabelActive]}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {ta('tabSignUp')}
              </Text>
            </Pressable>
          </View>

          {/* Form */}
          <OrbiSurface style={styles.form} elevated>
            {mode === 'sign-up' ? (
              <View style={styles.inputRow}>
                <OrbiAuthIcon name="user" color={theme.colors.textMuted} />
                <TextInput
                  value={fullName}
                  onChangeText={setFullName}
                  placeholder={ta('namePlaceholder')}
                  placeholderTextColor={theme.colors.textMuted}
                  style={styles.input}
                  autoCapitalize="words"
                />
              </View>
            ) : null}

            <View style={styles.inputRow}>
              <OrbiAuthIcon name="mail" color={theme.colors.textMuted} />
              <TextInput
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                placeholder={ta('emailPlaceholder')}
                placeholderTextColor={theme.colors.textMuted}
                style={styles.input}
              />
            </View>

            <View style={styles.inputRow}>
              <OrbiAuthIcon name="lock" color={theme.colors.textMuted} />
              <TextInput
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                placeholder={mode === 'sign-up' ? ta('passwordHint') : ta('passwordPlaceholder')}
                placeholderTextColor={theme.colors.textMuted}
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

            {Boolean(errorMessage) ? (
              <OrbiStatusBanner
                tone="danger"
                title="Connexion refusée"
                message={errorMessage}
              />
            ) : null}

            <OrbiButton
              disabled={isSubmitting || !canSubmit}
              onPress={() => void handleSubmit()}
              loading={isSubmitting}
              label={mode === 'sign-in' ? ta('signIn') : ta('createAccount')}
              tone="teal"
              style={styles.primaryBtn}
              labelStyle={styles.primaryBtnLabel}
            />
          </OrbiSurface>

          {/* Demo access */}
          {orbiDemoAccessEnabled ? (
            <View style={styles.demoSection}>
              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerLabel}>Accès démo</Text>
                <View style={styles.dividerLine} />
              </View>
              <OrbiButton
                onPress={() => void handleDemoSignIn()}
                disabled={isSubmitting}
                loading={isSubmitting}
                label="Compte de démonstration"
                variant="secondary"
                tone="teal"
                style={styles.demoBtn}
                labelStyle={styles.demoBtnLabel}
              />
            </View>
          ) : null}

          <Text style={styles.legalFooter} numberOfLines={3}>
            En continuant, vous acceptez les Conditions d&apos;utilisation et la
            Politique de confidentialité d&apos;Orbi.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const makeStyles = (theme: OrbiTheme) => StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: theme.colors.riderBackground,
  },
  flex: {
    flex: 1,
  },
  scroll: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 28,
    gap: 18,
  },

  // Brand
  brand: {
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  wordmark: {
    fontSize: 48,
    fontWeight: '800',
    color: theme.colors.text,
    letterSpacing: 0,
  },
  tagline: {
    fontSize: 15,
    color: theme.colors.textMuted,
    fontWeight: '400',
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
  },
  trustLine: {
    fontSize: 12,
    color: theme.colors.teal,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
    textAlign: 'center',
  },

  // Mode toggle
  toggle: {
    flexDirection: 'row',
    backgroundColor: theme.colors.backgroundAlt,
    borderRadius: 14,
    padding: 3,
    gap: 2,
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  toggleBtnActive: {
    backgroundColor: theme.colors.riderBackground,
    ...theme.shadows.card,
  },
  toggleLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.textMuted,
  },
  toggleLabelActive: {
    color: theme.colors.text,
  },

  // Form
  form: {
    gap: 12,
    padding: 12,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: theme.colors.backgroundAlt,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 14,
  },
  input: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 13,
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
    color: theme.colors.text,
  },
  eyeBtn: {
    paddingVertical: 14,
    paddingLeft: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Primary button
  primaryBtn: {
    marginTop: 4,
    borderRadius: 12,
    minHeight: 54,
  },
  primaryBtnLabel: {
    fontSize: 16,
  },

  // Demo section
  demoSection: {
    gap: 10,
    marginTop: 0,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: theme.colors.border,
  },
  dividerLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.textMuted,
  },
  demoBtn: {
    borderRadius: 12,
    minHeight: 50,
  },
  demoBtnLabel: {
    fontSize: 14,
  },
  legalFooter: {
    color: theme.colors.textMuted,
    fontSize: 11.5,
    lineHeight: 17,
    textAlign: 'center',
    paddingHorizontal: 12,
    marginTop: 2,
  },
});
