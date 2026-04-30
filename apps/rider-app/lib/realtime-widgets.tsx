import type { ReactNode } from 'react';
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
import { mobilisTheme } from '@mobilis/ui';

type Tone = 'teal' | 'amber' | 'sky' | 'rose';

const toneStyles = {
  teal: {
    backgroundColor: 'rgba(45, 212, 191, 0.12)',
    borderColor: 'rgba(45, 212, 191, 0.32)',
    textColor: mobilisTheme.colors.teal,
    solidBackground: mobilisTheme.colors.teal,
    solidTextColor: '#052a28',
    solidMutedTextColor: 'rgba(5, 42, 40, 0.72)',
  },
  amber: {
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderColor: 'rgba(245, 158, 11, 0.32)',
    textColor: mobilisTheme.colors.amber,
    solidBackground: mobilisTheme.colors.amber,
    solidTextColor: '#3b2205',
    solidMutedTextColor: 'rgba(59, 34, 5, 0.72)',
  },
  sky: {
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    borderColor: 'rgba(56, 189, 248, 0.32)',
    textColor: mobilisTheme.colors.sky,
    solidBackground: mobilisTheme.colors.sky,
    solidTextColor: '#082f49',
    solidMutedTextColor: 'rgba(8, 47, 73, 0.72)',
  },
  rose: {
    backgroundColor: 'rgba(251, 113, 133, 0.12)',
    borderColor: 'rgba(251, 113, 133, 0.32)',
    textColor: mobilisTheme.colors.rose,
    solidBackground: mobilisTheme.colors.rose,
    solidTextColor: '#4a1020',
    solidMutedTextColor: 'rgba(74, 16, 32, 0.72)',
  },
} as const;

function resolvePressableStyle(
  style: PressableProps['style'],
  state: PressableStateCallbackType,
): StyleProp<ViewStyle> | undefined {
  return typeof style === 'function' ? style(state) : style;
}

export function LiveStatusPill({
  label,
  tone = 'teal',
}: {
  label: string;
  tone?: Tone;
}) {
  const toneStyle = toneStyles[tone];

  return (
    <View
      style={[
        styles.pill,
        {
          backgroundColor: toneStyle.backgroundColor,
          borderColor: toneStyle.borderColor,
        },
      ]}
    >
      <View style={[styles.dot, { backgroundColor: toneStyle.textColor }]} />
      <Text style={[styles.pillLabel, { color: toneStyle.textColor }]}>
        {label}
      </Text>
    </View>
  );
}

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
  return (
    <View style={styles.banner}>
      <LiveStatusPill label={label} tone={tone} />
      <Text style={styles.bannerMessage}>{message}</Text>
      {secondaryMessage ? (
        <Text style={styles.bannerSecondary}>{secondaryMessage}</Text>
      ) : null}
    </View>
  );
}

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
  return (
    <View
      style={[
        styles.heroCard,
        isHighlighted ? styles.heroCardHighlight : null,
      ]}
    >
      <View style={styles.heroTopRow}>
        <Text style={styles.heroLabel}>{eyebrow}</Text>
        <LiveStatusPill label={liveLabel} tone={liveTone} />
      </View>
      <Text style={styles.heroTitle}>{title}</Text>
      <Text style={styles.heroMeta}>{message}</Text>
      {syncMessage ? <Text style={styles.heroSyncMeta}>{syncMessage}</Text> : null}
      {transitionMessage ? (
        <Text style={styles.heroTransitionMeta}>{transitionMessage}</Text>
      ) : null}
      {children}
    </View>
  );
}

export function MetricTile({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper?: string | null;
}) {
  return (
    <View style={styles.metricTile}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
      {helper ? <Text style={styles.metricHelper}>{helper}</Text> : null}
    </View>
  );
}

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
  const toneStyle = toneStyles[tone];

  return (
    <View
      style={[
        styles.metricCard,
        {
          backgroundColor: toneStyle.backgroundColor,
          borderColor: toneStyle.borderColor,
        },
      ]}
    >
      <Text style={[styles.metricCardLabel, { color: toneStyle.textColor }]}>
        {label}
      </Text>
      <Text style={styles.metricCardValue}>{value}</Text>
      {helper ? <Text style={styles.metricCardHelper}>{helper}</Text> : null}
    </View>
  );
}

export function QuickActionCard({
  eyebrow,
  title,
  description,
  tone = 'teal',
  emphasis = 'secondary',
  style,
  ...pressableProps
}: PressableProps & {
  eyebrow?: string;
  title: string;
  description?: string | null;
  tone?: Tone;
  emphasis?: 'primary' | 'secondary';
}) {
  const toneStyle = toneStyles[tone];
  const isPrimary = emphasis === 'primary';

  return (
    <Pressable
      {...pressableProps}
      style={(state) => [
        styles.actionCard,
        isPrimary
          ? {
              backgroundColor: toneStyle.solidBackground,
              borderColor: toneStyle.solidBackground,
            }
          : {
              backgroundColor: mobilisTheme.colors.panel,
              borderColor: toneStyle.borderColor,
            },
        state.pressed ? styles.actionCardPressed : null,
        resolvePressableStyle(style, state),
      ]}
    >
      {eyebrow ? (
        <Text
          style={[
            styles.actionEyebrow,
            {
              color: isPrimary
                ? toneStyle.solidTextColor
                : toneStyle.textColor,
            },
          ]}
        >
          {eyebrow}
        </Text>
      ) : null}
      <Text
        style={[
          styles.actionTitle,
          {
            color: isPrimary
              ? toneStyle.solidTextColor
              : mobilisTheme.colors.text,
          },
        ]}
      >
        {title}
      </Text>
      {description ? (
        <Text
          style={[
            styles.actionDescription,
            {
              color: isPrimary
                ? toneStyle.solidMutedTextColor
                : mobilisTheme.colors.muted,
            },
          ]}
        >
          {description}
        </Text>
      ) : null}
    </Pressable>
  );
}

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
  insights?: Array<{
    label: string;
    value: string;
    tone?: Tone;
  }>;
  detailLines?: string[];
  note?: string | null;
  noteTone?: Tone;
  isHighlighted?: boolean;
  children?: ReactNode;
}) {
  const noteStyle = toneStyles[noteTone];

  return (
    <View
      style={[
        styles.routeCard,
        isHighlighted ? styles.routeCardHighlight : null,
      ]}
    >
      <View style={styles.routeTopRow}>
        <Text style={styles.routeEyebrow}>{eyebrow}</Text>
        {badgeLabel ? (
          <LiveStatusPill label={badgeLabel} tone={badgeTone} />
        ) : null}
      </View>
      <View style={styles.routeTitleRow}>
        <Text style={styles.routeTitle}>{title}</Text>
        {titleAside ? (
          <Text
            style={[
              styles.routeTitleAside,
              titleAsideColor ? { color: titleAsideColor } : null,
            ]}
          >
            {titleAside}
          </Text>
        ) : null}
      </View>
      <Text style={styles.routeDescription}>{description}</Text>
      {insights?.length ? (
        <View style={styles.routeInsights}>
          {insights.map((insight) => {
            const toneStyle = toneStyles[insight.tone ?? 'sky'];

            return (
              <View
                key={`${insight.label}:${insight.value}`}
                style={[
                  styles.routeInsightChip,
                  {
                    backgroundColor: toneStyle.backgroundColor,
                    borderColor: toneStyle.borderColor,
                  },
                ]}
              >
                <Text style={styles.routeInsightLabel}>{insight.label}</Text>
                <Text
                  style={[
                    styles.routeInsightValue,
                    { color: toneStyle.textColor },
                  ]}
                >
                  {insight.value}
                </Text>
              </View>
            );
          })}
        </View>
      ) : null}
      {detailLines?.length ? (
        <View style={styles.routeDetails}>
          {detailLines.map((line) => (
            <Text key={line} style={styles.routeDetailLine}>
              {line}
            </Text>
          ))}
        </View>
      ) : null}
      {note ? (
        <Text style={[styles.routeNote, { color: noteStyle.textColor }]}>
          {note}
        </Text>
      ) : null}
      {children}
    </View>
  );
}

export function TransitionNoticeCard({
  label,
  message,
  tone = 'sky',
}: {
  label: string;
  message: string;
  tone?: Tone;
}) {
  const toneStyle = toneStyles[tone];

  return (
    <View
      style={[
        styles.transitionNotice,
        {
          backgroundColor: toneStyle.backgroundColor,
          borderColor: toneStyle.borderColor,
        },
      ]}
    >
      <Text style={styles.transitionNoticeLabel}>{label}</Text>
      <Text style={styles.transitionNoticeText}>{message}</Text>
    </View>
  );
}

export function LiveTimeline({
  events,
  freshEventIds = [],
}: {
  events: Array<{
    id: string;
    label: string;
    createdAt: string;
  }>;
  freshEventIds?: string[];
}) {
  return (
    <View style={styles.timeline}>
      {events.map((event) => (
        <View
          key={event.id}
          style={[
            styles.timelineRow,
            freshEventIds.includes(event.id) ? styles.timelineRowFresh : null,
          ]}
        >
          <Text style={styles.timelineLabel}>{event.label}</Text>
          <Text style={styles.timelineMeta}>
            {new Date(event.createdAt).toLocaleTimeString('fr-FR', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function FlowActionButton({
  label,
  tone = 'sky',
  emphasis = 'secondary',
  style,
  ...pressableProps
}: PressableProps & {
  label: string;
  tone?: Tone;
  emphasis?: 'primary' | 'secondary' | 'ghost';
}) {
  const toneStyle = toneStyles[tone];

  return (
    <Pressable
      {...pressableProps}
      style={(state) => [
        styles.flowActionButton,
        emphasis === 'primary'
          ? {
              backgroundColor: toneStyle.solidBackground,
              borderColor: toneStyle.solidBackground,
            }
          : emphasis === 'ghost'
            ? {
                backgroundColor: toneStyle.backgroundColor,
                borderColor: toneStyle.borderColor,
              }
            : {
                backgroundColor: mobilisTheme.colors.backgroundAlt,
                borderColor: mobilisTheme.colors.border,
              },
        state.pressed ? styles.flowActionButtonPressed : null,
        resolvePressableStyle(style, state),
      ]}
    >
      <Text
        style={[
          styles.flowActionButtonLabel,
          emphasis === 'primary'
            ? { color: toneStyle.solidTextColor }
            : emphasis === 'ghost'
              ? { color: toneStyle.textColor }
              : { color: mobilisTheme.colors.text },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function SectionCard({
  children,
  tone = 'sky',
}: {
  children: ReactNode;
  tone?: Tone;
}) {
  const toneStyle = toneStyles[tone];

  return (
    <View
      style={[
        styles.sectionCard,
        {
          backgroundColor: toneStyle.backgroundColor,
          borderColor: toneStyle.borderColor,
        },
      ]}
    >
      {children}
    </View>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string;
  title: string;
  description?: string | null;
}) {
  return (
    <View style={styles.sectionHeading}>
      {eyebrow ? <Text style={styles.sectionEyebrow}>{eyebrow}</Text> : null}
      <Text style={styles.sectionTitle}>{title}</Text>
      {description ? (
        <Text style={styles.sectionDescription}>{description}</Text>
      ) : null}
    </View>
  );
}

export function InsightBadge({
  label,
  value,
  tone = 'sky',
}: {
  label: string;
  value: string;
  tone?: Tone;
}) {
  const toneStyle = toneStyles[tone];

  return (
    <View
      style={[
        styles.insightBadge,
        {
          backgroundColor: toneStyle.backgroundColor,
          borderColor: toneStyle.borderColor,
        },
      ]}
    >
      <Text style={styles.insightLabel}>{label}</Text>
      <Text style={[styles.insightValue, { color: toneStyle.textColor }]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: mobilisTheme.colors.panel,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: mobilisTheme.colors.border,
    padding: 16,
    gap: 6,
  },
  heroCard: {
    borderRadius: 26,
    backgroundColor: mobilisTheme.colors.panel,
    borderWidth: 1,
    borderColor: mobilisTheme.colors.border,
    padding: 20,
    gap: 8,
  },
  heroCardHighlight: {
    borderColor: 'rgba(56, 189, 248, 0.42)',
    backgroundColor: 'rgba(56, 189, 248, 0.08)',
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  heroLabel: {
    color: mobilisTheme.colors.teal,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  heroTitle: {
    color: mobilisTheme.colors.text,
    fontWeight: '800',
    fontSize: 20,
  },
  heroMeta: {
    color: mobilisTheme.colors.muted,
  },
  heroSyncMeta: {
    color: mobilisTheme.colors.sky,
    fontWeight: '700',
  },
  heroTransitionMeta: {
    color: mobilisTheme.colors.sky,
    fontWeight: '700',
    lineHeight: 19,
  },
  pill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  pillLabel: {
    fontWeight: '800',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  bannerMessage: {
    color: mobilisTheme.colors.text,
    fontWeight: '700',
    lineHeight: 20,
  },
  bannerSecondary: {
    color: mobilisTheme.colors.muted,
  },
  metricTile: {
    flexGrow: 1,
    minWidth: 110,
    backgroundColor: mobilisTheme.colors.backgroundAlt,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: mobilisTheme.colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
  },
  metricLabel: {
    color: mobilisTheme.colors.muted,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  metricValue: {
    color: mobilisTheme.colors.text,
    fontWeight: '800',
    fontSize: 15,
  },
  metricHelper: {
    color: mobilisTheme.colors.muted,
    fontSize: 12,
    lineHeight: 17,
  },
  metricCard: {
    flexGrow: 1,
    minWidth: 150,
    borderRadius: 22,
    borderWidth: 1,
    padding: 18,
    gap: 6,
  },
  metricCardLabel: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    fontWeight: '700',
  },
  metricCardValue: {
    color: mobilisTheme.colors.text,
    fontWeight: '800',
    fontSize: 24,
  },
  metricCardHelper: {
    color: mobilisTheme.colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  actionCard: {
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingVertical: 16,
    gap: 6,
  },
  actionCardPressed: {
    opacity: 0.92,
  },
  actionEyebrow: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1.3,
    fontWeight: '800',
  },
  actionTitle: {
    fontSize: 16,
    fontWeight: '800',
    lineHeight: 21,
  },
  actionDescription: {
    fontSize: 13,
    lineHeight: 18,
  },
  routeCard: {
    borderRadius: 22,
    padding: 18,
    backgroundColor: mobilisTheme.colors.panel,
    borderWidth: 1,
    borderColor: mobilisTheme.colors.border,
    gap: 10,
  },
  routeCardHighlight: {
    borderColor: 'rgba(56, 189, 248, 0.4)',
    backgroundColor: 'rgba(56, 189, 248, 0.07)',
  },
  routeTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  routeEyebrow: {
    color: mobilisTheme.colors.textSoft,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1.3,
    fontWeight: '800',
  },
  routeTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  routeTitle: {
    color: mobilisTheme.colors.text,
    fontSize: 18,
    fontWeight: '800',
    flex: 1,
  },
  routeTitleAside: {
    color: mobilisTheme.colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  routeDescription: {
    color: mobilisTheme.colors.muted,
    lineHeight: 19,
  },
  routeInsights: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  routeInsightChip: {
    minWidth: 96,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 3,
  },
  routeInsightLabel: {
    color: mobilisTheme.colors.textSoft,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1.1,
    fontWeight: '700',
  },
  routeInsightValue: {
    fontSize: 14,
    fontWeight: '800',
  },
  routeDetails: {
    gap: 5,
  },
  routeDetailLine: {
    color: mobilisTheme.colors.muted,
    lineHeight: 18,
  },
  routeNote: {
    fontWeight: '700',
    lineHeight: 19,
  },
  transitionNotice: {
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
  },
  transitionNoticeLabel: {
    color: mobilisTheme.colors.text,
    fontWeight: '800',
  },
  transitionNoticeText: {
    color: mobilisTheme.colors.muted,
    lineHeight: 18,
  },
  timeline: {
    gap: 8,
    marginTop: 6,
  },
  timelineRow: {
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: mobilisTheme.colors.border,
    gap: 2,
  },
  timelineRowFresh: {
    backgroundColor: 'rgba(56, 189, 248, 0.08)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingBottom: 8,
    borderTopWidth: 0,
  },
  timelineLabel: {
    color: mobilisTheme.colors.text,
    fontWeight: '700',
  },
  timelineMeta: {
    color: mobilisTheme.colors.muted,
    fontSize: 12,
  },
  flowActionButton: {
    marginTop: 8,
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  flowActionButtonPressed: {
    opacity: 0.92,
  },
  flowActionButtonLabel: {
    fontWeight: '700',
    textAlign: 'center',
  },
  sectionCard: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 18,
    gap: 12,
  },
  sectionHeading: {
    gap: 6,
  },
  sectionEyebrow: {
    color: mobilisTheme.colors.textSoft,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1.4,
  },
  sectionTitle: {
    color: mobilisTheme.colors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  sectionDescription: {
    color: mobilisTheme.colors.muted,
    lineHeight: 19,
  },
  insightBadge: {
    minWidth: 116,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  insightLabel: {
    color: mobilisTheme.colors.textSoft,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  insightValue: {
    fontSize: 15,
    fontWeight: '800',
  },
});
