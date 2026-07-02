import { router } from 'expo-router';
import { useState } from 'react';
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
import { extractApiErrorMessage } from '@orbi/api';
import { orbiDemoAccessEnabled, orbiDemoAccounts } from '@orbi/config';
import { orbiTheme } from '@orbi/ui';
import { signInRiderAccount, signUpRiderAccount } from '../lib/auth';
import { OrbiLogo } from '../lib/orbi-logo';
import { useTranslation } from '../lib/i18n';

export default function RiderAuthScreen() {
  const { t } = useTranslation();
  const ta = (key: string) => t(`auth.${key}`);
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isPasswordStrong = (pw: string) =>
    pw.length >= 8 && /[A-Z]/.test(pw) && /[a-z]/.test(pw) && /\d/.test(pw) && /[^A-Za-z0-9]/.test(pw);

  const canSubmit =
    Boolean(email.trim()) &&
    (mode === 'sign-in' ? password.length >= 8 : isPasswordStrong(password)) &&
    (mode === 'sign-in' || Boolean(fullName.trim()));

  function describeAuthError(error: unknown): string {
    if (error instanceof TypeError) return 'Connexion impossible. Vérifiez votre réseau.';
    const message = error instanceof Error ? error.message.toLowerCase() : '';
    if (
      message.includes('network request failed') ||
      message.includes('fetch failed') ||
      message.includes('load failed')
    ) return 'Connexion impossible. Vérifiez votre réseau.';
    return extractApiErrorMessage(error, 'Identifiants incorrects. Réessayez.');
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
            <OrbiLogo size="lg" />
            <Text style={styles.tagline}>Votre course en quelques secondes</Text>
          </View>

          {/* Mode toggle */}
          <View style={styles.toggle}>
            <Pressable
              onPress={() => { setMode('sign-in'); setErrorMessage(''); }}
              style={[styles.toggleBtn, mode === 'sign-in' && styles.toggleBtnActive]}
            >
              <Text style={[styles.toggleLabel, mode === 'sign-in' && styles.toggleLabelActive]}>
                {ta('tabSignIn')}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => { setMode('sign-up'); setErrorMessage(''); }}
              style={[styles.toggleBtn, mode === 'sign-up' && styles.toggleBtnActive]}
            >
              <Text style={[styles.toggleLabel, mode === 'sign-up' && styles.toggleLabelActive]}>
                {ta('tabSignUp')}
              </Text>
            </Pressable>
          </View>

          {/* Form */}
          <View style={styles.form}>
            {mode === 'sign-up' ? (
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>{ta('fullName')}</Text>
                <TextInput
                  value={fullName}
                  onChangeText={setFullName}
                  placeholder={ta('namePlaceholder')}
                  placeholderTextColor={orbiTheme.colors.textMuted}
                  style={styles.input}
                  autoCapitalize="words"
                />
              </View>
            ) : null}

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>{ta('email')}</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                placeholder={ta('emailPlaceholder')}
                placeholderTextColor={orbiTheme.colors.textMuted}
                style={styles.input}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>{ta('password')}</Text>
              <View style={styles.passwordRow}>
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  placeholder={mode === 'sign-up' ? ta('passwordHint') : ta('passwordPlaceholder')}
                  placeholderTextColor={orbiTheme.colors.textMuted}
                  style={styles.passwordInput}
                />
                <Pressable
                  onPress={() => setShowPassword((v) => !v)}
                  hitSlop={8}
                  style={styles.eyeBtn}
                  accessibilityLabel={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                >
                  <Text style={styles.eyeText}>{showPassword ? '◉' : '○'}</Text>
                </Pressable>
              </View>
            </View>

            {Boolean(errorMessage) ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{errorMessage}</Text>
              </View>
            ) : null}

            <Pressable
              disabled={isSubmitting || !canSubmit}
              onPress={() => void handleSubmit()}
              style={({ pressed }) => [
                styles.primaryBtn,
                (isSubmitting || !canSubmit) && styles.primaryBtnDisabled,
                pressed && styles.primaryBtnPressed,
              ]}
            >
              <Text style={styles.primaryBtnLabel}>
                {isSubmitting
                  ? t('common.loading')
                  : mode === 'sign-in'
                    ? ta('signIn')
                    : ta('createAccount')}
              </Text>
            </Pressable>
          </View>

          {/* Demo access */}
          {orbiDemoAccessEnabled ? (
            <View style={styles.demoSection}>
              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerLabel}>Accès démo</Text>
                <View style={styles.dividerLine} />
              </View>
              <Pressable
                onPress={() => void handleDemoSignIn()}
                disabled={isSubmitting}
                style={({ pressed }) => [styles.demoBtn, pressed && styles.demoBtnPressed]}
              >
                <Text style={styles.demoBtnLabel}>Connexion compte de démonstration</Text>
              </Pressable>
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: orbiTheme.colors.background,
  },
  flex: {
    flex: 1,
  },
  scroll: {
    paddingHorizontal: 24,
    paddingTop: 48,
    paddingBottom: 48,
    gap: 28,
  },

  // Brand
  brand: {
    gap: 8,
    marginBottom: 4,
  },
  wordmark: {
    fontSize: 48,
    fontWeight: '800',
    color: orbiTheme.colors.text,
    letterSpacing: -1.5,
  },
  tagline: {
    fontSize: 16,
    color: orbiTheme.colors.textMuted,
    fontWeight: '400',
    fontFamily: 'Inter_400Regular',
  },

  // Mode toggle
  toggle: {
    flexDirection: 'row',
    backgroundColor: orbiTheme.colors.backgroundAlt,
    borderRadius: 12,
    padding: 3,
    gap: 2,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  toggleBtnActive: {
    backgroundColor: orbiTheme.colors.background,
    ...orbiTheme.shadows.card,
  },
  toggleLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: orbiTheme.colors.textMuted,
  },
  toggleLabelActive: {
    color: orbiTheme.colors.text,
  },

  // Form
  form: {
    gap: 14,
  },
  field: {
    gap: 6,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
    color: orbiTheme.colors.textSoft,
    paddingLeft: 2,
  },
  input: {
    backgroundColor: orbiTheme.colors.backgroundAlt,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: orbiTheme.colors.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
    color: orbiTheme.colors.text,
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: orbiTheme.colors.backgroundAlt,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: orbiTheme.colors.border,
    overflow: 'hidden',
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
    color: orbiTheme.colors.text,
  },
  eyeBtn: {
    paddingHorizontal: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyeText: {
    fontSize: 16,
    color: orbiTheme.colors.textMuted,
  },

  // Error
  errorBox: {
    backgroundColor: 'rgba(255, 59, 48, 0.08)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 59, 48, 0.2)',
    padding: 12,
  },
  errorText: {
    color: orbiTheme.colors.danger,
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },

  // Primary button
  primaryBtn: {
    backgroundColor: orbiTheme.colors.text,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
    ...orbiTheme.shadows.button,
  },
  primaryBtnDisabled: {
    opacity: 0.38,
  },
  primaryBtnPressed: {
    opacity: 0.82,
  },
  primaryBtnLabel: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
  },

  // Demo section
  demoSection: {
    gap: 14,
    marginTop: 4,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: orbiTheme.colors.border,
  },
  dividerLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: orbiTheme.colors.textMuted,
  },
  demoBtn: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: orbiTheme.colors.border,
    backgroundColor: orbiTheme.colors.background,
  },
  demoBtnPressed: {
    backgroundColor: orbiTheme.colors.backgroundAlt,
  },
  demoBtnLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: orbiTheme.colors.textSoft,
  },
});
