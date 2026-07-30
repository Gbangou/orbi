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
import { orbiTheme, type OrbiTheme } from './index';
import { useOrbiTheme } from './theme-context';

export type OrbiMobileTone = 'neutral' | 'teal' | 'amber' | 'sky' | 'danger';
export type OrbiMobileRole = 'rider' | 'driver' | 'neutral';
export type OrbiButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

function makeToneTokens(theme: OrbiTheme): Record<
  OrbiMobileTone,
  { background: string; border: string; text: string; solid: string }
> {
  return {
    neutral: {
      background: theme.colors.surface,
      border: theme.colors.border,
      text: theme.colors.text,
      solid: theme.colors.text,
    },
    teal: {
      background: 'rgba(0, 168, 132, 0.08)',
      border: 'rgba(0, 168, 132, 0.22)',
      text: theme.colors.accentDark,
      solid: theme.colors.teal,
    },
    amber: {
      background: theme.colors.surfaceSoft,
      border: theme.colors.border,
      text: theme.colors.text,
      solid: theme.colors.text,
    },
    sky: {
      background: theme.colors.surfaceSoft,
      border: theme.colors.border,
      text: theme.colors.text,
      solid: theme.colors.text,
    },
    danger: {
      background: theme.colors.surface,
      border: theme.colors.border,
      text: theme.colors.text,
      solid: theme.colors.text,
    },
  };
}

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
  const theme = useOrbiTheme();
  const backgroundColor =
    audience === 'rider'
      ? theme.colors.riderBackground
      : audience === 'driver'
        ? theme.colors.driverBackground
        : theme.colors.background;
  const chromeColor =
    audience === 'rider'
      ? theme.colors.riderChrome
      : audience === 'driver'
        ? theme.colors.driverChrome
        : theme.colors.backgroundAlt;

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
  const theme = useOrbiTheme();
  const token = makeToneTokens(theme)[tone];

  return (
    <View
      {...viewProps}
      style={[
        { backgroundColor: theme.colors.surface },
        mobileSurface.surface,
        { borderColor: token.border },
        tone !== 'neutral' ? { backgroundColor: token.background } : null,
        elevated ? theme.shadows.card : null,
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
  const theme = useOrbiTheme();
  const token = makeToneTokens(theme)[tone];
  const isPrimary = variant === 'primary';
  const isDanger = variant === 'danger';
  const isGhost = variant === 'ghost';
  const backgroundColor = isPrimary
    ? token.solid
    : isDanger
      ? makeToneTokens(theme).danger.background
      : isGhost
        ? 'transparent'
        : theme.colors.backgroundAlt;
  const borderColor = isPrimary
    ? token.solid
    : isDanger
      ? makeToneTokens(theme).danger.border
      : isGhost
        ? 'transparent'
        : theme.colors.border;
  const textColor = isPrimary
    ? '#FFFFFF'
    : isDanger
      ? theme.colors.text
      : tone === 'teal'
        ? theme.colors.accentDark
        : theme.colors.text;
  const isDisabled = disabled || loading;

  return (
    <Pressable
      {...pressableProps}
      disabled={isDisabled}
      accessibilityRole={pressableProps.accessibilityRole ?? 'button'}
      style={({ pressed }) => [
        mobileButton.button,
        { backgroundColor, borderColor },
        isPrimary ? theme.shadows.button : null,
        isDisabled ? mobileButton.disabled : null,
        pressed ? mobileButton.pressed : null,
        typeof style === 'function' ? style({ pressed }) : style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={textColor} />
      ) : (
        <Text style={[mobileButton.label, { fontFamily: orbiTheme.typography.fontFamily.bold, color: textColor }, labelStyle]}>
          {label}
        </Text>
      )}
      {helper ? (
        <Text
          style={[
            mobileButton.helper,
            { fontFamily: orbiTheme.typography.fontFamily.regular },
            { color: isPrimary ? 'rgba(255,255,255,0.72)' : theme.colors.textMuted },
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
  const theme = useOrbiTheme();
  const token = makeToneTokens(theme)[tone];

  return (
    <OrbiSurface tone={tone} style={[mobileBanner.banner, style]} {...viewProps}>
      <View style={[mobileBanner.dot, { backgroundColor: token.solid }]} />
      <View style={mobileBanner.copy}>
        <Text style={[mobileBanner.title, { fontFamily: orbiTheme.typography.fontFamily.bold, color: token.text }]}>{title}</Text>
        {message ? (
          <Text style={[mobileBanner.message, { fontFamily: orbiTheme.typography.fontFamily.regular, color: theme.colors.textSoft }]}>
            {message}
          </Text>
        ) : null}
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
  const theme = useOrbiTheme();
  const token = makeToneTokens(theme)[tone];

  return (
    <OrbiSurface tone={tone} style={[mobileMetric.tile, style]}>
      <Text
        style={[
          mobileMetric.label,
          { fontFamily: orbiTheme.typography.fontFamily.bold, color: theme.colors.textMuted },
          tone !== 'neutral' ? { color: token.text } : null,
        ]}
      >
        {label}
      </Text>
      <Text style={[mobileMetric.value, { fontFamily: orbiTheme.typography.fontFamily.bold, color: theme.colors.text }]}>{value}</Text>
      {helper ? (
        <Text style={[mobileMetric.helper, { fontFamily: orbiTheme.typography.fontFamily.regular, color: theme.colors.textMuted }]}>
          {helper}
        </Text>
      ) : null}
    </OrbiSurface>
  );
}

export function PersonBadge({
  name,
  subtitle,
  rating,
  plate,
  size = 44,
  style,
}: {
  name: string;
  subtitle?: string | null;
  rating?: number | null;
  plate?: string | null;
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useOrbiTheme();
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('') || '?';

  return (
    <View style={[mobilePerson.row, style]}>
      <View
        style={[
          mobilePerson.avatar,
          { width: size, height: size, borderRadius: size / 2, backgroundColor: theme.colors.accentLight },
        ]}
      >
        <Text style={[mobilePerson.initials, { fontFamily: orbiTheme.typography.fontFamily.bold, color: theme.colors.accentDark, fontSize: size * 0.38 }]}>
          {initials}
        </Text>
      </View>
      <View style={mobilePerson.copy}>
        <View style={mobilePerson.nameRow}>
          <Text numberOfLines={1} style={[mobilePerson.name, { fontFamily: orbiTheme.typography.fontFamily.bold, color: theme.colors.text }]}>
            {name}
          </Text>
          {rating != null ? (
            <View style={mobilePerson.ratingChip}>
              <Text style={[mobilePerson.ratingText, { fontFamily: orbiTheme.typography.fontFamily.bold, color: theme.colors.text }]}>
                ★ {rating.toFixed(1)}
              </Text>
            </View>
          ) : null}
        </View>
        {subtitle || plate ? (
          <Text numberOfLines={1} style={[mobilePerson.subtitle, { fontFamily: orbiTheme.typography.fontFamily.regular, color: theme.colors.textMuted }]}>
            {[subtitle, plate].filter(Boolean).join(' · ')}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const mobilePerson = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  initials: {
    letterSpacing: 0,
  },
  copy: {
    flex: 1,
    gap: 2,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  name: {
    fontSize: 15,
    flexShrink: 1,
  },
  ratingChip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: '#F1F1ED',
  },
  ratingText: {
    fontSize: 11,
  },
  subtitle: {
    fontSize: 12,
  },
});

const mobileSurface = StyleSheet.create({
  surface: {
    borderRadius: 16,
    borderWidth: 1,
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
    textAlign: 'center',
  },
  helper: {
    fontSize: 11,
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
    lineHeight: 18,
  },
  message: {
    fontSize: 12,
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
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  value: {
    fontSize: 19,
    fontWeight: '800',
  },
  helper: {
    fontSize: 11,
    lineHeight: 15,
  },
});
