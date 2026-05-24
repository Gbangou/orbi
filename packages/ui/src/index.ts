export const orbiTheme = {
  colors: {
    background: '#07111d',
    backgroundAlt: '#0d1828',
    panel: '#0f1d30',
    surface: '#0f1d30',
    panelSoft: '#132338',
    surfaceSoft: '#132338',
    surfaceStrong: '#182b43',
    text: '#f8fafc',
    muted: '#94a3b8',
    textMuted: '#94a3b8',
    textSoft: '#cbd5e1',
    teal: '#2dd4bf',
    amber: '#f59e0b',
    sky: '#38bdf8',
    rose: '#fb7185',
    success: '#34d399',
    danger: '#f87171',
    border: '#24364d',
    borderSoft: 'rgba(148, 163, 184, 0.18)',
    overlay: 'rgba(7, 17, 29, 0.72)',
  },
  gradients: {
    hero: ['#0b1d33', '#07111d'],
    accent: ['#2dd4bf', '#38bdf8'],
    warm: ['#f59e0b', '#fb7185'],
  },
  radius: {
    card: 24,
    button: 18,
    pill: 999,
    panel: 28,
  },
  spacing: {
    xs: 8,
    sm: 12,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
  },
  typography: {
    hero: 38,
    title: 32,
    section: 20,
    body: 16,
    caption: 12,
  },
  shadows: {
    card: {
      shadowColor: '#020617',
      shadowOpacity: 0.25,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 12 },
      elevation: 10,
    },
  },
} as const;

export const orbiCopy = {
  riderHeadline: 'Moto quand chaque minute compte. Voiture quand le confort compte.',
  driverHeadline: 'De meilleures courses, une conduite plus claire, des revenus mieux maitrises.',
  adminHeadline: 'Pilotez la mobilite urbaine avec confiance entre motos et voitures.',
  voiceHeadline: 'Parlez naturellement. Orbi transforme la voix en trajet.',
} as const;

export const orbiLayout = {
  maxContentWidth: 1240,
  maxReadableWidth: 760,
  appHorizontalPadding: 24,
} as const;

export function createGlassPanel(opacity = 0.78) {
  return {
    backgroundColor: `rgba(15, 29, 48, ${opacity})`,
    borderWidth: 1,
    borderColor: orbiTheme.colors.border,
    borderRadius: orbiTheme.radius.panel,
  } as const;
}

export function formatXof(amount: number) {
  return new Intl.NumberFormat('fr-BF', {
    style: 'currency',
    currency: 'XOF',
    maximumFractionDigits: 0,
  }).format(amount);
}

type RealtimeAudience = 'driver' | 'rider';
type RealtimeConnectionScope =
  | 'driver'
  | 'rider'
  | 'admin-live-ops'
  | 'admin-support'
  | 'admin-onboarding'
  | 'admin-feature-flags'
  | 'admin-health';
type RealtimeConnectionState = 'active' | 'connected' | 'reconnecting';

const realtimeLabelsByAudience: Record<
  RealtimeAudience,
  Record<string, string>
> = {
  driver: {
    'trip.created': 'Une reservation est devenue une course en direct.',
    'trip.updated': 'La course chauffeur a avance d etape.',
    'trip.pickup-code-verified':
      'Le code de prise en charge a ete confirme.',
    'trip.incident-reported':
      'Un incident de course a ete remonte aux operations.',
    'ride-request.created': 'Une nouvelle demande compatible est arrivee.',
    'ride-request.cancelled': 'Une demande vient d etre retiree du flux.',
    'ride-request.reservation-assigned':
      'Le dispatch vient de vous reserver une offre.',
    'ride-request.reservation-released':
      'Une reservation vous a ete retiree et remise au flux.',
    'ride-request.reservation-expired':
      'Une reservation a expire et le flux a ete resynchronise.',
  },
  rider: {
    'trip.created': 'Votre demande a trouve un chauffeur.',
    'trip.updated': 'Votre trajet vient d avancer d etape.',
    'trip.pickup-code-verified':
      'Le depart est confirme, la course est en cours.',
    'trip.incident-reported':
      'Un incident a ete signale pour votre trajet.',
    'ride-request.created': 'Votre demande est bien enregistree.',
    'ride-request.cancelled': 'Votre demande a ete annulee.',
    'ride-request.reservation-assigned':
      'Un chauffeur vient d etre orbie pour votre demande.',
    'ride-request.reservation-released':
      'Le systeme cherche un nouveau chauffeur pour vous.',
    'ride-request.reservation-expired':
      'La fenetre precedente a expire, la recherche reprend.',
  },
};

export function describeRealtimeEvent(
  audience: RealtimeAudience,
  eventType: string,
) {
  return (
    realtimeLabelsByAudience[audience][eventType] ??
    (audience === 'driver'
      ? 'Le direct chauffeur vient d etre mis a jour.'
      : 'Votre trajet vient d etre mis a jour en direct.')
  );
}

const realtimeConnectionCopy: Record<
  RealtimeConnectionScope,
  Record<RealtimeConnectionState, string>
> = {
  driver: {
    active: 'Flux chauffeur temps reel actif.',
    connected: 'Flux chauffeur connecte en temps reel.',
    reconnecting: 'Le flux chauffeur se reconnecte automatiquement.',
  },
  rider: {
    active: 'Flux passager temps reel actif.',
    connected: 'Flux passager connecte en temps reel.',
    reconnecting: 'Le flux passager se reconnecte automatiquement.',
  },
  'admin-live-ops': {
    active: 'Flux live ops temps reel actif.',
    connected: 'Console live ops synchronisee en temps reel.',
    reconnecting: 'Le flux live ops se reconnecte automatiquement.',
  },
  'admin-support': {
    active: 'Flux support temps reel actif.',
    connected: 'File support synchronisee en temps reel.',
    reconnecting: 'Le flux support se reconnecte automatiquement.',
  },
  'admin-onboarding': {
    active: 'Flux onboarding temps reel actif.',
    connected: 'File onboarding synchronisee en temps reel.',
    reconnecting: 'Le flux onboarding se reconnecte automatiquement.',
  },
  'admin-feature-flags': {
    active: 'Flux feature flags temps reel actif.',
    connected: 'Feature flags synchronisees en temps reel.',
    reconnecting: 'Le flux feature flags se reconnecte automatiquement.',
  },
  'admin-health': {
    active: 'Flux health watchdog temps reel actif.',
    connected: 'Sante systeme synchronisee en temps reel.',
    reconnecting: 'Le flux health watchdog se reconnecte automatiquement.',
  },
};

export function describeRealtimeConnection(
  scope: RealtimeConnectionScope,
  state: RealtimeConnectionState,
) {
  return realtimeConnectionCopy[scope][state];
}

export function formatRealtimeBadgeLabel(
  liveLabel: string,
  isRealtimeSyncing: boolean,
) {
  return isRealtimeSyncing ? 'Resync live' : liveLabel;
}

export function formatOperationalStatus(status: string) {
  return status
    .toLowerCase()
    .split('_')
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(' ');
}

export function escapeHtmlText(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function serializeHtmlScriptJson(value: unknown) {
  return JSON.stringify(value)
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029');
}

const allowedMapWebViewHosts = new Set([
  'unpkg.com',
  'tile.openstreetmap.org',
  'a.tile.openstreetmap.org',
  'b.tile.openstreetmap.org',
  'c.tile.openstreetmap.org',
  'router.project-osrm.org',
]);

export function shouldAllowLocalMapWebViewRequest(url: string) {
  if (!url || url === 'about:blank' || url === 'about:srcdoc') {
    return true;
  }

  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && allowedMapWebViewHosts.has(parsed.hostname);
  } catch {
    return false;
  }
}
