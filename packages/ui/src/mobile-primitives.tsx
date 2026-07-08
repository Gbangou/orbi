import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type StyleProp,
  type TextStyle,
  type ViewProps,
  type ViewStyle,
} from 'react-native';
import { orbiTheme } from './index';

export type OrbiMobileTone = 'neutral' | 'teal' | 'amber' | 'sky' | 'danger';
export type OrbiMobileRole = 'rider' | 'driver' | 'neutral';
export type OrbiButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

const toneTokens: Record<
  OrbiMobileTone,
  { background: string; border: string; text: string; solid: string }
> = {
  neutral: {
    background: '#FFFFFF',
    border: orbiTheme.colors.border,
    text: orbiTheme.colors.text,
    solid: orbiTheme.colors.text,
  },
  teal: {
    background: 'rgba(0, 194, 168, 0.11)',
    border: 'rgba(0, 194, 168, 0.32)',
    text: orbiTheme.colors.accentDark,
    solid: orbiTheme.colors.teal,
  },
  amber: {
    background: 'rgba(255, 176, 32, 0.13)',
    border: 'rgba(255, 176, 32, 0.34)',
    text: '#A86600',
    solid: orbiTheme.colors.amber,
  },
  sky: {
    background: 'rgba(61, 123, 255, 0.11)',
    border: 'rgba(61, 123, 255, 0.30)',
    text: orbiTheme.colors.sky,
    solid: orbiTheme.colors.sky,
  },
  danger: {
    background: 'rgba(240, 68, 94, 0.11)',
    border: 'rgba(240, 68, 94, 0.30)',
    text: orbiTheme.colors.danger,
    solid: orbiTheme.colors.danger,
  },
};

export function OrbiScreen({
  children,
  audience = 'neutral',
  chrome = true,
  style,
  ...viewProps
}: {
  children: ReactNode;
  audience?: OrbiMobileRole;
  chrome?: boolean;
  style?: StyleProp<ViewStyle>;
} & ViewProps) {
  const backgroundColor =
    audience === 'rider'
      ? orbiTheme.colors.riderBackground
      : audience === 'driver'
        ? orbiTheme.colors.driverBackground
        : orbiTheme.colors.background;
  const chromeColor =
    audience === 'rider'
      ? orbiTheme.colors.riderChrome
      : audience === 'driver'
        ? orbiTheme.colors.driverChrome
        : orbiTheme.colors.backgroundAlt;

  return (
    <SafeAreaView
      {...viewProps}
      style={[mobileScreen.screen, { backgroundColor }, style]}
    >
      {chrome ? (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <View style={[mobileScreen.topChrome, { backgroundColor: chromeColor }]} />
          <View style={[mobileScreen.bottomChrome, { backgroundColor: chromeColor }]} />
        </View>
      ) : null}
      <View style={mobileScreen.content}>{children}</View>
    </SafeAreaView>
  );
}

export function OrbiSurface({
  children,
  style,
  tone = 'neutral',
  elevated = false,
  ...viewProps
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  tone?: OrbiMobileTone;
  elevated?: boolean;
} & ViewProps) {
  const token = toneTokens[tone];

  return (
    <View
      {...viewProps}
      style={[
        mobileSurface.surface,
        { borderColor: token.border },
        tone !== 'neutral' ? { backgroundColor: token.background } : null,
        elevated ? orbiTheme.shadows.card : null,
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function OrbiButton({
  label,
  helper,
  variant = 'primary',
  tone = 'teal',
  loading = false,
  disabled,
  style,
  labelStyle,
  ...pressableProps
}: PressableProps & {
  label: string;
  helper?: string | null;
  variant?: OrbiButtonVariant;
  tone?: Exclude<OrbiMobileTone, 'neutral'>;
  loading?: boolean;
  labelStyle?: StyleProp<TextStyle>;
}) {
  const token = toneTokens[tone];
  const isPrimary = variant === 'primary';
  const isDanger = variant === 'danger';
  const isGhost = variant === 'ghost';
  const backgroundColor = isPrimary
    ? token.solid
    : isDanger
      ? toneTokens.danger.background
      : isGhost
        ? 'transparent'
        : orbiTheme.colors.backgroundAlt;
  const borderColor = isPrimary
    ? token.solid
    : isDanger
      ? toneTokens.danger.border
      : isGhost
        ? 'transparent'
        : orbiTheme.colors.border;
  const textColor = isPrimary
    ? tone === 'amber'
      ? '#3B2205'
      : '#FFFFFF'
    : isDanger
      ? orbiTheme.colors.danger
      : tone === 'teal'
        ? orbiTheme.colors.accentDark
        : orbiTheme.colors.text;
  const isDisabled = disabled || loading;

  return (
    <Pressable
      {...pressableProps}
      disabled={isDisabled}
      accessibilityRole={pressableProps.accessibilityRole ?? 'button'}
      style={({ pressed }) => [
        mobileButton.button,
        { backgroundColor, borderColor },
        isPrimary ? orbiTheme.shadows.button : null,
        isDisabled ? mobileButton.disabled : null,
        pressed ? mobileButton.pressed : null,
        typeof style === 'function' ? style({ pressed }) : style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={textColor} />
      ) : (
        <Text style={[mobileButton.label, { color: textColor }, labelStyle]}>
          {label}
        </Text>
      )}
      {helper ? (
        <Text
          style={[
            mobileButton.helper,
            { color: isPrimary ? 'rgba(255,255,255,0.70)' : orbiTheme.colors.textMuted },
          ]}
        >
          {helper}
        </Text>
      ) : null}
    </Pressable>
  );
}

export function OrbiStatusBanner({
  title,
  message,
  tone = 'teal',
  style,
  ...viewProps
}: {
  title: string;
  message?: string | null;
  tone?: Exclude<OrbiMobileTone, 'neutral'>;
  style?: StyleProp<ViewStyle>;
} & ViewProps) {
  const token = toneTokens[tone];

  return (
    <OrbiSurface tone={tone} style={[mobileBanner.banner, style]} {...viewProps}>
      <View style={[mobileBanner.dot, { backgroundColor: token.solid }]} />
      <View style={mobileBanner.copy}>
        <Text style={[mobileBanner.title, { color: token.text }]}>{title}</Text>
        {message ? <Text style={mobileBanner.message}>{message}</Text> : null}
      </View>
    </OrbiSurface>
  );
}

export function OrbiMetricTile({
  label,
  value,
  helper,
  tone = 'neutral',
  style,
}: {
  label: string;
  value: string;
  helper?: string | null;
  tone?: OrbiMobileTone;
  style?: StyleProp<ViewStyle>;
}) {
  const token = toneTokens[tone];

  return (
    <OrbiSurface tone={tone} style={[mobileMetric.tile, style]}>
      <Text style={[mobileMetric.label, tone !== 'neutral' ? { color: token.text } : null]}>
        {label}
      </Text>
      <Text style={mobileMetric.value}>{value}</Text>
      {helper ? <Text style={mobileMetric.helper}>{helper}</Text> : null}
    </OrbiSurface>
  );
}

const mobileSurface = StyleSheet.create({
  surface: {
    backgroundColor: orbiTheme.colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: orbiTheme.colors.border,
    overflow: 'hidden',
  },
});

const mobileScreen = StyleSheet.create({
  screen: {
    flex: 1,
    overflow: 'hidden',
  },
  content: {
    flex: 1,
  },
  topChrome: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 112,
    opacity: 0.42,
  },
  bottomChrome: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 96,
    opacity: 0.28,
  },
});

const mobileButton = StyleSheet.create({
  button: {
    minHeight: 52,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  pressed: {
    opacity: 0.88,
    transform: [{ scale: 0.985 }],
  },
  disabled: {
    opacity: 0.46,
  },
  label: {
    fontSize: 15,
    fontWeight: '800',
    fontFamily: orbiTheme.typography.fontFamily.bold,
    textAlign: 'center',
  },
  helper: {
    fontSize: 11,
    fontFamily: orbiTheme.typography.fontFamily.regular,
    textAlign: 'center',
  },
});

const mobileBanner = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 14,
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    marginTop: 4,
    flexShrink: 0,
  },
  copy: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 13,
    fontWeight: '800',
    fontFamily: orbiTheme.typography.fontFamily.bold,
    lineHeight: 18,
  },
  message: {
    fontSize: 12,
    color: orbiTheme.colors.textSoft,
    fontFamily: orbiTheme.typography.fontFamily.regular,
    lineHeight: 17,
  },
});

const mobileMetric = StyleSheet.create({
  tile: {
    padding: 14,
    gap: 3,
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
    fontFamily: orbiTheme.typography.fontFamily.bold,
    color: orbiTheme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  value: {
    fontSize: 19,
    fontWeight: '800',
    fontFamily: orbiTheme.typography.fontFamily.bold,
    color: orbiTheme.colors.text,
  },
  helper: {
    fontSize: 11,
    color: orbiTheme.colors.textMuted,
    fontFamily: orbiTheme.typography.fontFamily.regular,
    lineHeight: 15,
  },
});
