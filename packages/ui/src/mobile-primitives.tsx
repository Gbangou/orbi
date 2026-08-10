import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewProps,
  type ViewStyle,
} from 'react-native';
import { orbiTheme, type OrbiTheme } from './index';
import { useOrbiTheme } from './theme-context';

export type OrbiMobileTone = 'neutral' | 'teal' | 'amber' | 'sky' | 'danger';
export type OrbiMobileRole = 'rider' | 'driver' | 'neutral';
export type OrbiButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export type OrbiTextVariant =
  | 'display'
  | 'title'
  | 'section'
  | 'body'
  | 'label'
  | 'caption'
  | 'micro';
export type OrbiBadgeVariant = 'soft' | 'solid' | 'outline';

function makeToneTokens(theme: OrbiTheme): Record<
  OrbiMobileTone,
  { background: string; border: string; text: string; solid: string; inverse: string }
> {
  return {
    neutral: {
      background: theme.colors.surface,
      border: theme.colors.border,
      text: theme.colors.text,
      solid: theme.colors.text,
      inverse: theme.colors.textInverse,
    },
    teal: {
      background: theme.colors.accentLight,
      border: theme.colors.accentLight,
      text: theme.colors.accentDark,
      solid: theme.colors.teal,
      inverse: theme.colors.textInverse,
    },
    amber: {
      background: '#FFF4D8',
      border: '#F1D18A',
      text: theme.colors.warning,
      solid: theme.colors.warning,
      inverse: theme.colors.textInverse,
    },
    sky: {
      background: '#E8F1FB',
      border: '#BFD5EE',
      text: theme.colors.sky,
      solid: theme.colors.sky,
      inverse: theme.colors.textInverse,
    },
    danger: {
      background: '#FDE7E5',
      border: '#F3B8B2',
      text: theme.colors.danger,
      solid: theme.colors.danger,
      inverse: theme.colors.textInverse,
    },
  };
}

function fontFamily(theme: OrbiTheme, key: 'regular' | 'medium' | 'semibold' | 'bold' | 'brand') {
  const families = theme.typography.fontFamily as Record<string, string>;
  return families[key] ?? families.regular;
}

function typographyNumber(
  theme: OrbiTheme,
  key: 'hero' | 'title' | 'section' | 'body' | 'label' | 'caption' | 'small',
) {
  const value = theme.typography[key];
  return typeof value === 'number' ? value : orbiTheme.typography[key];
}

function lineHeight(theme: OrbiTheme, key: OrbiTextVariant) {
  const lineHeights = theme.typography.lineHeight as Record<string, number> | undefined;
  const mappedKey = key === 'display' ? 'display' : key === 'micro' ? 'micro' : key;
  return lineHeights?.[mappedKey] ?? undefined;
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
    ? token.inverse
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

export function OrbiText({
  children,
  variant = 'body',
  tone = 'default',
  weight = 'regular',
  style,
  ...textProps
}: {
  children: ReactNode;
  variant?: OrbiTextVariant;
  tone?: 'default' | 'muted' | 'soft' | 'inverse' | Exclude<OrbiMobileTone, 'neutral'>;
  weight?: 'regular' | 'medium' | 'semibold' | 'bold' | 'brand';
  style?: StyleProp<TextStyle>;
} & React.ComponentProps<typeof Text>) {
  const theme = useOrbiTheme();
  const toneColor =
    tone === 'muted'
      ? theme.colors.textMuted
      : tone === 'soft'
        ? theme.colors.textSoft
        : tone === 'inverse'
          ? theme.colors.textInverse
          : tone === 'default'
            ? theme.colors.text
            : makeToneTokens(theme)[tone].text;
  const fontSize =
    variant === 'display'
      ? typographyNumber(theme, 'hero')
      : variant === 'title'
        ? typographyNumber(theme, 'title')
        : variant === 'section'
          ? typographyNumber(theme, 'section')
          : variant === 'body'
            ? typographyNumber(theme, 'body')
            : variant === 'label'
              ? typographyNumber(theme, 'label')
              : variant === 'caption'
                ? typographyNumber(theme, 'caption')
                : typographyNumber(theme, 'small');

  return (
    <Text
      {...textProps}
      style={[
        {
          color: toneColor,
          fontFamily: fontFamily(theme, weight),
          fontSize,
          lineHeight: lineHeight(theme, variant),
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

export function OrbiTextField({
  label,
  helper,
  error,
  style,
  inputStyle,
  ...inputProps
}: TextInputProps & {
  label?: string;
  helper?: string | null;
  error?: string | null;
  style?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
}) {
  const theme = useOrbiTheme();
  const hasError = Boolean(error);

  return (
    <View style={[mobileField.wrap, style]}>
      {label ? <OrbiText variant="label" weight="semibold">{label}</OrbiText> : null}
      <TextInput
        {...inputProps}
        placeholderTextColor={inputProps.placeholderTextColor ?? theme.colors.textMuted}
        accessibilityHint={error ?? inputProps.accessibilityHint}
        style={[
          mobileField.input,
          {
            borderColor: hasError ? theme.colors.danger : theme.colors.border,
            color: theme.colors.text,
            fontFamily: fontFamily(theme, 'regular'),
          },
          inputStyle,
        ]}
      />
      {error ? (
        <OrbiText variant="caption" tone="danger">{error}</OrbiText>
      ) : helper ? (
        <OrbiText variant="caption" tone="muted">{helper}</OrbiText>
      ) : null}
    </View>
  );
}

export function OrbiBadge({
  label,
  tone = 'neutral',
  variant = 'soft',
  style,
}: {
  label: string;
  tone?: OrbiMobileTone;
  variant?: OrbiBadgeVariant;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useOrbiTheme();
  const token = makeToneTokens(theme)[tone];
  const solid = variant === 'solid';

  return (
    <View
      style={[
        mobileBadge.badge,
        {
          backgroundColor: solid ? token.solid : variant === 'outline' ? 'transparent' : token.background,
          borderColor: solid ? token.solid : token.border,
        },
        style,
      ]}
    >
      <Text
        numberOfLines={1}
        style={[
          mobileBadge.label,
          {
            color: solid ? token.inverse : token.text,
            fontFamily: fontFamily(theme, 'semibold'),
          },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

export function OrbiListItem({
  title,
  subtitle,
  meta,
  leading,
  trailing,
  style,
}: {
  title: string;
  subtitle?: string | null;
  meta?: string | null;
  leading?: ReactNode;
  trailing?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[mobileList.item, style]}>
      {leading ? <View style={mobileList.leading}>{leading}</View> : null}
      <View style={mobileList.copy}>
        <OrbiText variant="label" weight="semibold" numberOfLines={1}>{title}</OrbiText>
        {subtitle ? <OrbiText variant="caption" tone="muted" numberOfLines={2}>{subtitle}</OrbiText> : null}
      </View>
      {meta ? <OrbiText variant="caption" tone="muted" numberOfLines={1}>{meta}</OrbiText> : null}
      {trailing ? <View style={mobileList.trailing}>{trailing}</View> : null}
    </View>
  );
}

export function OrbiBottomSheet({
  children,
  style,
  showHandle = true,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  showHandle?: boolean;
}) {
  const theme = useOrbiTheme();

  return (
    <View style={[mobileSheet.sheet, { borderColor: theme.colors.border }, theme.shadows.sheet, style]}>
      {showHandle ? <View style={[mobileSheet.handle, { backgroundColor: theme.colors.border }]} /> : null}
      {children}
    </View>
  );
}

export function OrbiModalCard({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useOrbiTheme();
  return (
    <View style={mobileModal.backdrop}>
      <View style={[mobileModal.card, { borderColor: theme.colors.border }, theme.shadows.float, style]}>
        {children}
      </View>
    </View>
  );
}

export function OrbiSkeleton({
  width = '100%',
  height = 16,
  radius,
  style,
}: {
  width?: ViewStyle['width'];
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useOrbiTheme();
  return (
    <View
      accessibilityRole="progressbar"
      style={[
        {
          width,
          height,
          borderRadius: radius ?? theme.radius.sm,
          backgroundColor: theme.colors.backgroundAlt,
        },
        style,
      ]}
    />
  );
}

export function OrbiLoader({
  label,
  tone = 'teal',
  style,
}: {
  label?: string | null;
  tone?: Exclude<OrbiMobileTone, 'neutral'>;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useOrbiTheme();
  return (
    <View style={[mobileLoader.wrap, style]} accessibilityRole="progressbar">
      <ActivityIndicator color={makeToneTokens(theme)[tone].solid} />
      {label ? <OrbiText variant="caption" tone="muted">{label}</OrbiText> : null}
    </View>
  );
}

export function OrbiEmptyState({
  title,
  message,
  action,
  style,
}: {
  title: string;
  message?: string | null;
  action?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useOrbiTheme();
  return (
    <OrbiSurface style={[mobileEmpty.wrap, style]}>
      <View style={[mobileEmpty.marker, { backgroundColor: theme.colors.accentLight }]} />
      <OrbiText variant="section" weight="bold" style={mobileEmpty.title}>{title}</OrbiText>
      {message ? <OrbiText variant="label" tone="muted" style={mobileEmpty.message}>{message}</OrbiText> : null}
      {action ? <View style={mobileEmpty.action}>{action}</View> : null}
    </OrbiSurface>
  );
}

export function OrbiOfflineState({
  title,
  message,
  action,
  style,
}: {
  title: string;
  message?: string | null;
  action?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <OrbiSurface tone="amber" style={[mobileOffline.wrap, style]}>
      <OrbiBadge label={title} tone="amber" />
      {message ? <OrbiText variant="label" tone="soft">{message}</OrbiText> : null}
      {action ? <View>{action}</View> : null}
    </OrbiSurface>
  );
}

export function OrbiPrice({
  amount,
  label,
  helper,
  size = 'regular',
  style,
}: {
  amount: string;
  label?: string | null;
  helper?: string | null;
  size?: 'compact' | 'regular' | 'large';
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[mobilePrice.wrap, style]}>
      {label ? <OrbiText variant="caption" tone="muted" weight="semibold">{label}</OrbiText> : null}
      <OrbiText variant={size === 'large' ? 'title' : size === 'compact' ? 'section' : 'title'} weight="bold">
        {amount}
      </OrbiText>
      {helper ? <OrbiText variant="caption" tone="muted">{helper}</OrbiText> : null}
    </View>
  );
}

export function OrbiRouteSummary({
  pickupLabel,
  destinationLabel,
  meta,
  style,
}: {
  pickupLabel: string;
  destinationLabel: string;
  meta?: string | null;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useOrbiTheme();
  return (
    <View style={[mobileRoute.wrap, style]}>
      <View style={mobileRoute.track}>
        <View style={[mobileRoute.dot, { backgroundColor: theme.colors.teal }]} />
        <View style={[mobileRoute.line, { backgroundColor: theme.colors.border }]} />
        <View style={[mobileRoute.dot, { backgroundColor: theme.colors.text }]} />
      </View>
      <View style={mobileRoute.copy}>
        <OrbiText variant="label" weight="semibold" numberOfLines={1}>{pickupLabel}</OrbiText>
        {meta ? <OrbiText variant="caption" tone="muted" numberOfLines={1}>{meta}</OrbiText> : null}
        <OrbiText variant="label" weight="semibold" numberOfLines={1}>{destinationLabel}</OrbiText>
      </View>
    </View>
  );
}

export function OrbiPaymentSummary({
  methodLabel,
  statusLabel,
  amountLabel,
  referenceLabel,
  style,
}: {
  methodLabel: string;
  statusLabel: string;
  amountLabel: string;
  referenceLabel?: string | null;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <OrbiSurface style={[mobilePayment.wrap, style]}>
      <OrbiListItem title={amountLabel} subtitle={methodLabel} meta={statusLabel} />
      {referenceLabel ? <OrbiText variant="caption" tone="muted">{referenceLabel}</OrbiText> : null}
    </OrbiSurface>
  );
}

export function OrbiDriverSummary({
  name,
  vehicleLabel,
  rating,
  plate,
  action,
  style,
}: {
  name: string;
  vehicleLabel?: string | null;
  rating?: number | null;
  plate?: string | null;
  action?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[mobileDriver.wrap, style]}>
      <PersonBadge name={name} subtitle={vehicleLabel} rating={rating} plate={plate} style={mobileDriver.person} />
      {action ? <View style={mobileDriver.action}>{action}</View> : null}
    </View>
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
          <Text numberOfLines={2} style={[mobilePerson.subtitle, { fontFamily: orbiTheme.typography.fontFamily.regular, color: theme.colors.textMuted }]}>
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
    minWidth: 0,
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
    lineHeight: 16,
  },
});

const mobileField = StyleSheet.create({
  wrap: {
    gap: 6,
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
  },
});

const mobileBadge = StyleSheet.create({
  badge: {
    minHeight: 28,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignSelf: 'flex-start',
    justifyContent: 'center',
  },
  label: {
    fontSize: 12,
    lineHeight: 16,
  },
});

const mobileList = StyleSheet.create({
  item: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  leading: {
    flexShrink: 0,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  trailing: {
    flexShrink: 0,
  },
});

const mobileSheet = StyleSheet.create({
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 16,
    gap: 12,
  },
  handle: {
    width: 42,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 2,
  },
});

const mobileModal = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(17, 17, 17, 0.52)',
    justifyContent: 'flex-end',
    padding: 16,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
});

const mobileLoader = StyleSheet.create({
  wrap: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
});

const mobileEmpty = StyleSheet.create({
  wrap: {
    padding: 18,
    alignItems: 'center',
    gap: 8,
  },
  marker: {
    width: 38,
    height: 6,
    borderRadius: 3,
  },
  title: {
    textAlign: 'center',
  },
  message: {
    textAlign: 'center',
  },
  action: {
    marginTop: 6,
    alignSelf: 'stretch',
  },
});

const mobileOffline = StyleSheet.create({
  wrap: {
    padding: 14,
    gap: 8,
  },
});

const mobilePrice = StyleSheet.create({
  wrap: {
    gap: 2,
    minWidth: 0,
  },
});

const mobileRoute = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'stretch',
  },
  track: {
    alignItems: 'center',
    paddingVertical: 3,
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  line: {
    width: 2,
    flex: 1,
    minHeight: 20,
    marginVertical: 3,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
});

const mobilePayment = StyleSheet.create({
  wrap: {
    padding: 14,
    gap: 6,
  },
});

const mobileDriver = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  person: {
    flex: 1,
  },
  action: {
    flexShrink: 0,
  },
});

const mobileSurface = StyleSheet.create({
  surface: {
    borderRadius: 8,
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
    minHeight: 48,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
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
    padding: 12,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginTop: 4,
    flexShrink: 0,
  },
  copy: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 12,
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
