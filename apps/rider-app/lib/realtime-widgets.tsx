import { useMemo, type ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type PressableStateCallbackType,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { type OrbiTheme } from '@orbi/ui';
import { useOrbiTheme } from '@orbi/ui/native';
import { formatRiderTimelineTime } from './rider-display-format';

type Tone = 'teal' | 'amber' | 'sky' | 'rose';

const toneTokens = {
  teal: {
    bg: '#F5F5F5',
    border: '#E0E0E0',
    text: '#000000',
    dot: '#0AA373',
    solidBg: '#111111',
    solidText: '#FFFFFF',
  },
  amber: {
    bg: '#F5F5F5',
    border: '#E0E0E0',
    text: '#000000',
    dot: '#000000',
    solidBg: '#111111',
    solidText: '#FFFFFF',
  },
  sky: {
    bg: '#F5F5F5',
    border: '#E0E0E0',
    text: '#000000',
    dot: '#000000',
    solidBg: '#111111',
    solidText: '#FFFFFF',
  },
  rose: {
    bg: '#F5F5F5',
    border: '#E0E0E0',
    text: '#000000',
    dot: '#000000',
    solidBg: '#111111',
    solidText: '#FFFFFF',
  },
} as const;

function resolvePressableStyle(
  style: PressableProps['style'],
  state: PressableStateCallbackType,
): StyleProp<ViewStyle> | undefined {
  return typeof style === 'function' ? style(state) : style;
}

// ── Status pill ───────────────────────────────────────────────────────────────

export function LiveStatusPill({
  label,
  tone = 'teal',
}: {
  label: string;
  tone?: Tone;
}) {
  const t = toneTokens[tone];
  return (
    <View style={[pill.wrap, { backgroundColor: t.bg, borderColor: t.border }]}>
      <View style={[pill.dot, { backgroundColor: t.dot }]} />
      <Text style={[pill.label, { color: t.text }]}>{label}</Text>
    </View>
  );
}

const pill = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0,
  },
});

// ── Live status banner ────────────────────────────────────────────────────────

export function LiveStatusBanner({
  label,
  message,
  secondaryMessage,
  tone = 'teal',
}: {
  label: string;
  message: string;
  secondaryMessage?: string | null;
  tone?: Tone;
}) {
  const theme = useOrbiTheme();
  const banner = useMemo(() => makeBannerStyles(theme), [theme]);
  return (
    <View style={banner.wrap}>
      <LiveStatusPill label={label} tone={tone} />
      <Text style={banner.message}>{message}</Text>
      {secondaryMessage ? (
        <Text style={banner.secondary}>{secondaryMessage}</Text>
      ) : null}
    </View>
  );
}

const makeBannerStyles = (theme: OrbiTheme) => StyleSheet.create({
  wrap: {
    backgroundColor: theme.colors.backgroundAlt,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  message: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
  secondary: {
    color: theme.colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
});

// ── Live hero card ────────────────────────────────────────────────────────────

export function LiveHeroCard({
  eyebrow,
  liveLabel,
  title,
  message,
  liveTone = 'teal',
  isHighlighted = false,
  syncMessage,
  transitionMessage,
  children,
}: {
  eyebrow: string;
  liveLabel: string;
  title: string;
  message: string;
  liveTone?: Tone;
  isHighlighted?: boolean;
  syncMessage?: string | null;
  transitionMessage?: string | null;
  children?: ReactNode;
}) {
  const theme = useOrbiTheme();
  const hero = useMemo(() => makeHeroStyles(theme), [theme]);
  return (
    <View style={[hero.wrap, isHighlighted && hero.wrapHighlight]}>
      <View style={hero.topRow}>
        <Text style={hero.eyebrow}>{eyebrow}</Text>
        <LiveStatusPill label={liveLabel} tone={liveTone} />
      </View>
      <Text style={hero.title}>{title}</Text>
      <Text style={hero.message}>{message}</Text>
      {syncMessage ? <Text style={hero.sync}>{syncMessage}</Text> : null}
      {transitionMessage ? <Text style={hero.transition}>{transitionMessage}</Text> : null}
      {children}
    </View>
  );
}

const makeHeroStyles = (theme: OrbiTheme) => StyleSheet.create({
  wrap: {
    backgroundColor: theme.colors.surface,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 15,
    gap: 7,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  wrapHighlight: {
    borderColor: theme.colors.text,
    borderWidth: 1,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    color: theme.colors.text,
    lineHeight: 24,
  },
  message: {
    fontSize: 14,
    color: theme.colors.textSoft,
    lineHeight: 20,
  },
  sync: {
    fontSize: 12,
    color: theme.colors.sky,
    fontWeight: '600',
  },
  transition: {
    fontSize: 12,
    color: theme.colors.teal,
    fontWeight: '600',
  },
});

// ── Metric tile ───────────────────────────────────────────────────────────────

export function MetricTile({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper?: string | null;
}) {
  const theme = useOrbiTheme();
  const metric = useMemo(() => makeMetricStyles(theme), [theme]);
  return (
    <View style={metric.wrap}>
      <Text style={metric.label}>{label}</Text>
      <Text style={metric.value}>{value}</Text>
      {helper ? <Text style={metric.helper}>{helper}</Text> : null}
    </View>
  );
}

const makeMetricStyles = (theme: OrbiTheme) => StyleSheet.create({
  wrap: {
    backgroundColor: theme.colors.backgroundAlt,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 2,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  value: {
    fontSize: 20,
    fontWeight: '800',
    color: theme.colors.text,
  },
  helper: {
    fontSize: 11,
    color: theme.colors.textMuted,
  },
});

// ── Dashboard metric card ─────────────────────────────────────────────────────

export function DashboardMetricCard({
  label,
  value,
  helper,
  tone = 'sky',
}: {
  label: string;
  value: string;
  helper?: string | null;
  tone?: Tone;
}) {
  const theme = useOrbiTheme();
  const dmc = useMemo(() => makeDmcStyles(theme), [theme]);
  const t = toneTokens[tone];
  return (
    <View style={[dmc.wrap, { backgroundColor: t.bg, borderColor: t.border }]}>
      <Text style={[dmc.label, { color: t.text }]}>{label}</Text>
      <Text style={dmc.value}>{value}</Text>
      {helper ? <Text style={dmc.helper}>{helper}</Text> : null}
    </View>
  );
}

const makeDmcStyles = (theme: OrbiTheme) => StyleSheet.create({
  wrap: {
    flex: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 11,
    gap: 4,
    borderWidth: 1,
    minWidth: 90,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  value: {
    fontSize: 21,
    fontWeight: '800',
    color: theme.colors.text,
  },
  helper: {
    fontSize: 11,
    color: theme.colors.textMuted,
    lineHeight: 14,
  },
});

// ── Quick action card ─────────────────────────────────────────────────────────

type QuickActionCardProps = PressableProps & {
  eyebrow?: string;
  title: string;
  description?: string | null;
  tone?: Tone;
  emphasis?: 'primary' | 'secondary' | 'ghost';
};

export function QuickActionCard({
  eyebrow,
  title,
  description,
  emphasis = 'secondary',
  style,
  accessibilityLabel,
  accessibilityRole,
  hitSlop,
  ...rest
}: QuickActionCardProps) {
  const theme = useOrbiTheme();
  const qac = useMemo(() => makeQacStyles(theme), [theme]);
  const isPrimary = emphasis === 'primary';

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityRole={accessibilityRole ?? 'button'}
      hitSlop={hitSlop ?? 8}
      {...rest}
      style={(state) => [
        qac.wrap,
        isPrimary ? qac.primary : qac.secondary,
        state.pressed && qac.pressed,
        resolvePressableStyle(style, state),
      ]}
    >
      {eyebrow ? (
        <Text style={[qac.eyebrow, isPrimary ? qac.eyebrowPrimary : null]}>
          {eyebrow}
        </Text>
      ) : null}
      <Text style={[qac.title, isPrimary ? qac.titlePrimary : null]}>
        {title}
      </Text>
      {description ? (
        <Text style={[qac.desc, isPrimary ? qac.descPrimary : null]}>
          {description}
        </Text>
      ) : null}
    </Pressable>
  );
}

const makeQacStyles = (theme: OrbiTheme) => StyleSheet.create({
  wrap: {
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 4,
  },
  primary: {
    backgroundColor: theme.colors.text,
    borderWidth: 0,
  },
  secondary: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  pressed: {
    opacity: 0.85,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  eyebrowPrimary: {
    color: theme.colors.textInverse + '8C',
  },
  title: {
    fontSize: 15,
    fontWeight: '800',
    color: theme.colors.text,
  },
  titlePrimary: {
    color: theme.colors.textInverse,
  },
  desc: {
    fontSize: 13,
    color: theme.colors.textSoft,
    lineHeight: 18,
    marginTop: 2,
  },
  descPrimary: {
    color: 'rgba(255,255,255,0.65)',
  },
});

// ── Route / service signal card ───────────────────────────────────────────────

export function RouteSignalCard({
  eyebrow,
  badgeLabel,
  badgeTone = 'sky',
  title,
  titleAside,
  titleAsideColor,
  description,
  insights,
  detailLines,
  note,
  noteTone = 'teal',
  isHighlighted = false,
  children,
}: {
  eyebrow: string;
  badgeLabel?: string | null;
  badgeTone?: Tone;
  title: string;
  titleAside?: string | null;
  titleAsideColor?: string;
  description: string;
  insights?: Array<{ label: string; value: string; tone?: Tone }>;
  detailLines?: string[];
  note?: string | null;
  noteTone?: Tone;
  isHighlighted?: boolean;
  children?: ReactNode;
}) {
  const theme = useOrbiTheme();
  const rsc = useMemo(() => makeRscStyles(theme), [theme]);
  const nt = toneTokens[noteTone];

  return (
    <View style={[rsc.wrap, isHighlighted && rsc.wrapHighlight]}>
      <View style={rsc.topRow}>
        <Text style={rsc.eyebrow}>{eyebrow}</Text>
        {badgeLabel ? <LiveStatusPill label={badgeLabel} tone={badgeTone} /> : null}
      </View>

      <View style={rsc.titleRow}>
        <Text style={rsc.title} numberOfLines={2}>{title}</Text>
        {titleAside ? (
          <Text style={[rsc.titleAside, titleAsideColor ? { color: titleAsideColor } : null]}>
            {titleAside}
          </Text>
        ) : null}
      </View>

      <Text style={rsc.description}>{description}</Text>

      {insights?.length ? (
        <View style={rsc.chips}>
          {insights.map((ins) => {
            const t = toneTokens[ins.tone ?? 'sky'];
            return (
              <View
                key={`${ins.label}:${ins.value}`}
                style={[rsc.chip, { backgroundColor: t.bg, borderColor: t.border }]}
              >
                <Text style={rsc.chipLabel}>{ins.label}</Text>
                <Text style={[rsc.chipValue, { color: t.text }]}>{ins.value}</Text>
              </View>
            );
          })}
        </View>
      ) : null}

      {detailLines?.map((line) => (
        <Text key={line} style={rsc.detail}>{line}</Text>
      ))}

      {note ? (
        <View style={[rsc.note, { backgroundColor: nt.bg, borderColor: nt.border }]}>
          <Text style={[rsc.noteText, { color: nt.text }]}>{note}</Text>
        </View>
      ) : null}

      {children}
    </View>
  );
}

const makeRscStyles = (theme: OrbiTheme) => StyleSheet.create({
  wrap: {
    backgroundColor: theme.colors.surface,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  wrapHighlight: {
    borderColor: theme.colors.text,
    borderWidth: 1,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: 8,
  },
  title: {
    flex: 1,
    fontSize: 16,
    fontWeight: '800',
    color: theme.colors.text,
    lineHeight: 22,
  },
  titleAside: {
    fontSize: 17,
    fontWeight: '800',
    color: theme.colors.text,
  },
  description: {
    fontSize: 13,
    color: theme.colors.textSoft,
    lineHeight: 18,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
    gap: 1,
  },
  chipLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  chipValue: {
    fontSize: 13,
    fontWeight: '700',
  },
  detail: {
    fontSize: 12,
    color: theme.colors.textMuted,
    lineHeight: 16,
  },
  note: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 10,
  },
  noteText: {
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 17,
  },
});

// ── Section card ──────────────────────────────────────────────────────────────

export function SectionCard({
  children,
  style,
  tone,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  tone?: Tone;
}) {
  const theme = useOrbiTheme();
  const sc = useMemo(() => makeScStyles(theme), [theme]);
  const t = tone ? toneTokens[tone] : null;
  return (
    <View style={[
      sc.wrap,
      t ? { backgroundColor: t.bg, borderColor: t.border } : null,
      style,
    ]}>
      {children}
    </View>
  );
}

const makeScStyles = (theme: OrbiTheme) => StyleSheet.create({
  wrap: {
    backgroundColor: theme.colors.surface,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
});

// ── Section heading ───────────────────────────────────────────────────────────

export function SectionHeading({
  title,
  subtitle,
  description,
  action,
  onAction,
}: {
  title: string;
  subtitle?: string | null;
  description?: string | null;
  eyebrow?: string | null;
  action?: string | null;
  onAction?: () => void;
}) {
  const theme = useOrbiTheme();
  const sh = useMemo(() => makeShStyles(theme), [theme]);
  const sub = subtitle ?? description ?? null;
  return (
    <View style={sh.wrap}>
      <View style={sh.text}>
        <Text style={sh.title}>{title}</Text>
        {sub ? <Text style={sh.subtitle}>{sub}</Text> : null}
      </View>
      {action ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text style={sh.action}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const makeShStyles = (theme: OrbiTheme) => StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  text: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: theme.colors.text,
  },
  subtitle: {
    fontSize: 13,
    color: theme.colors.textMuted,
  },
  action: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.teal,
  },
});

// ── Flow action button ────────────────────────────────────────────────────────

export function FlowActionButton({
  label,
  sublabel,
  tone = 'teal',
  emphasis = 'primary',
  disabled,
  onPress,
  style,
}: {
  label: string;
  sublabel?: string | null;
  tone?: Tone;
  emphasis?: 'primary' | 'secondary' | 'ghost';
  disabled?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useOrbiTheme();
  const fab = useMemo(() => makeFabStyles(theme), [theme]);
  const isDark = emphasis === 'primary';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        fab.wrap,
        isDark ? fab.dark : fab.light,
        pressed && fab.pressed,
        disabled && fab.disabled,
        style,
      ]}
      accessibilityRole="button"
    >
      <Text style={[fab.label, isDark ? fab.labelDark : fab.labelLight]}>
        {label}
      </Text>
      {sublabel ? (
        <Text style={[fab.sub, isDark ? fab.subDark : fab.subLight]}>
          {sublabel}
        </Text>
      ) : null}
    </Pressable>
  );
}

const makeFabStyles = (theme: OrbiTheme) => StyleSheet.create({
  wrap: {
    borderRadius: 6,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
    gap: 3,
  },
  dark: {
    backgroundColor: theme.colors.text,
  },
  light: {
    backgroundColor: theme.colors.backgroundAlt,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  pressed: {
    opacity: 0.82,
  },
  disabled: {
    opacity: 0.4,
  },
  label: {
    fontSize: 16,
    fontWeight: '700',
  },
  labelDark: {
    color: theme.colors.textInverse,
  },
  labelLight: {
    color: theme.colors.text,
  },
  sub: {
    fontSize: 12,
  },
  subDark: {
    color: theme.colors.textInverse + '99',
  },
  subLight: {
    color: theme.colors.textMuted,
  },
});

// ── Insight badge ─────────────────────────────────────────────────────────────

export function InsightBadge({
  label,
  value,
  tone = 'teal',
}: {
  label: string;
  value?: string;
  tone?: Tone;
}) {
  const t = toneTokens[tone];
  return (
    <View style={[ib.wrap, { backgroundColor: t.bg, borderColor: t.border }]}>
      {value ? (
        <>
          <Text style={[ib.sublabel, { color: t.text }]}>{label}</Text>
          <Text style={[ib.value, { color: t.text }]}>{value}</Text>
        </>
      ) : (
        <Text style={[ib.label, { color: t.text }]}>{label}</Text>
      )}
    </View>
  );
}

const ib = StyleSheet.create({
  wrap: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignSelf: 'flex-start',
    gap: 1,
  },
  sublabel: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0,
    opacity: 0.7,
  },
  value: {
    fontSize: 13,
    fontWeight: '700',
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
  },
});

// ── Live route progress card ──────────────────────────────────────────────────

export function LiveRouteProgressCard({
  title,
  stateLabel,
  distanceLabel,
  progressPercent,
  freshnessLabel,
  coordinateLabel,
  etaLabel,
}: {
  title: string;
  stateLabel: string;
  distanceLabel: string;
  progressPercent: number;
  freshnessLabel: string;
  coordinateLabel: string;
  etaLabel?: string;
  accuracyLabel?: string;
  speedLabel?: string;
}) {
  const theme = useOrbiTheme();
  const lrp = useMemo(() => makeLrpStyles(theme), [theme]);
  const pct = Math.min(100, Math.max(0, progressPercent));
  return (
    <View style={lrp.wrap}>
      <View style={lrp.topRow}>
        <Text style={lrp.title}>{title}</Text>
        <View style={lrp.statePill}>
          <Text style={lrp.stateText}>{stateLabel}</Text>
        </View>
      </View>

      <View style={lrp.track}>
        <View style={[lrp.fill, { width: `${pct}%` as any }]} />
      </View>

      <View style={lrp.metrics}>
        <View style={lrp.metric}>
          <Text style={lrp.metricLabel}>Distance</Text>
          <Text style={lrp.metricValue}>{distanceLabel}</Text>
        </View>
        {etaLabel ? (
          <View style={lrp.metric}>
            <Text style={lrp.metricLabel}>ETA</Text>
            <Text style={lrp.metricValue}>{etaLabel}</Text>
          </View>
        ) : null}
        <View style={lrp.metric}>
          <Text style={lrp.metricLabel}>Signal</Text>
          <Text style={lrp.metricValue}>{freshnessLabel}</Text>
        </View>
      </View>

      <Text style={lrp.coord}>{coordinateLabel}</Text>
    </View>
  );
}

const makeLrpStyles = (theme: OrbiTheme) => StyleSheet.create({
  wrap: {
    backgroundColor: theme.colors.surface,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.text,
  },
  statePill: {
    backgroundColor: toneTokens.teal.bg,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: toneTokens.teal.border,
  },
  stateText: {
    fontSize: 11,
    fontWeight: '700',
    color: toneTokens.teal.text,
  },
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.backgroundDim,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: theme.colors.teal,
  },
  metrics: {
    flexDirection: 'row',
    gap: 12,
  },
  metric: {
    flex: 1,
    gap: 2,
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  metricValue: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.text,
  },
  coord: {
    fontSize: 12,
    color: theme.colors.textMuted,
  },
});

// ── Live timeline ─────────────────────────────────────────────────────────────

export function LiveTimeline({
  events,
  freshEventIds,
}: {
  events: Array<{ id: string; label: string; createdAt: string }>;
  freshEventIds?: Set<string> | string[];
}) {
  const theme = useOrbiTheme();
  const lt = useMemo(() => makeLtStyles(theme), [theme]);
  if (!events.length) return null;

  return (
    <View style={lt.wrap}>
      <Text style={lt.heading}>Historique</Text>
      {events.map((event, idx) => {
        const isFresh = Array.isArray(freshEventIds)
          ? freshEventIds.includes(event.id)
          : freshEventIds?.has(event.id);
        const isLast = idx === events.length - 1;
        return (
          <View key={event.id} style={lt.row}>
            <View style={lt.dotCol}>
              <View style={[lt.dot, isFresh && lt.dotFresh]} />
              {!isLast ? <View style={lt.line} /> : null}
            </View>
            <View style={[lt.content, isLast && lt.contentLast]}>
              <Text style={[lt.label, isFresh && lt.labelFresh]}>
                {event.label}
              </Text>
              <Text style={lt.time}>
                {formatRiderTimelineTime(event.createdAt)}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const makeLtStyles = (theme: OrbiTheme) => StyleSheet.create({
  wrap: {
    backgroundColor: theme.colors.surface,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 0,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  heading: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0,
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
    minHeight: 36,
  },
  dotCol: {
    width: 20,
    alignItems: 'center',
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.colors.backgroundDim,
    borderWidth: 2,
    borderColor: theme.colors.border,
    marginTop: 3,
  },
  dotFresh: {
    backgroundColor: theme.colors.teal,
    borderColor: theme.colors.teal,
  },
  line: {
    flex: 1,
    width: 2,
    backgroundColor: theme.colors.border,
    marginTop: 3,
  },
  content: {
    flex: 1,
    paddingBottom: 12,
    gap: 2,
  },
  contentLast: {
    paddingBottom: 0,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: theme.colors.textSoft,
    lineHeight: 20,
  },
  labelFresh: {
    color: theme.colors.text,
    fontWeight: '700',
  },
  time: {
    fontSize: 11,
    color: theme.colors.textMuted,
  },
});

// ── Transition notice card ────────────────────────────────────────────────────

export function TransitionNoticeCard({
  label,
  message,
  tone = 'teal',
}: {
  label?: string | null;
  message: string;
  tone?: Tone;
}) {
  const t = toneTokens[tone];
  return (
    <View style={[tnc.wrap, { backgroundColor: t.bg, borderColor: t.border }]}>
      <View style={[tnc.dot, { backgroundColor: t.dot }]} />
      <View style={{ flex: 1 }}>
        {label ? <Text style={[tnc.text, { color: t.text, fontWeight: '700' }]}>{label}</Text> : null}
        <Text style={[tnc.text, { color: t.text }]}>{message}</Text>
      </View>
    </View>
  );
}

const tnc = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    flexShrink: 0,
  },
  text: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
});
