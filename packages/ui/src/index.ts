export const orbiDesignTokens = {
  color: {
    ink: "#111111",
    inkSoft: "#333333",
    inkMuted: "#666666",
    canvas: "#FFFFFF",
    canvasSubtle: "#F7F7F5",
    canvasMuted: "#EFEFEC",
    line: "#DEDEDA",
    lineSoft: "rgba(17, 17, 17, 0.08)",
    brand: "#0A8F6A",
    brandStrong: "#067A59",
    brandSoft: "rgba(10, 143, 106, 0.12)",
    warning: "#8A5A00",
    warningSoft: "#FFF4D8",
    danger: "#B42318",
    dangerSoft: "#FDE7E5",
    info: "#255C99",
    infoSoft: "#E8F1FB",
    success: "#0A8F6A",
    successSoft: "#E7F6F1",
    overlay: "rgba(17, 17, 17, 0.52)",
  },
  type: {
    family: {
      regular: "Inter_400Regular",
      medium: "Inter_500Medium",
      semibold: "Inter_600SemiBold",
      bold: "Inter_700Bold",
      brand: "Raleway_800ExtraBold",
    },
    size: {
      display: 28,
      title: 22,
      section: 18,
      body: 16,
      label: 14,
      caption: 12,
      micro: 11,
    },
    lineHeight: {
      display: 34,
      title: 28,
      section: 24,
      body: 22,
      label: 20,
      caption: 17,
      micro: 15,
    },
  },
  space: {
    none: 0,
    xxs: 4,
    xs: 8,
    sm: 12,
    md: 16,
    lg: 20,
    xl: 24,
    xxl: 32,
    screen: 16,
  },
  radius: {
    none: 0,
    xs: 4,
    sm: 6,
    md: 8,
    lg: 12,
    sheet: 20,
    pill: 999,
  },
  touch: {
    min: 44,
    comfortable: 48,
    large: 56,
  },
  shadow: {
    none: {
      shadowColor: "#000000",
      shadowOpacity: 0,
      shadowRadius: 0,
      shadowOffset: { width: 0, height: 0 },
      elevation: 0,
    },
    card: {
      shadowColor: "#000000",
      shadowOpacity: 0.05,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 },
      elevation: 1,
    },
    sheet: {
      shadowColor: "#000000",
      shadowOpacity: 0.12,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: -3 },
      elevation: 8,
    },
    button: {
      shadowColor: "#000000",
      shadowOpacity: 0.08,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
      elevation: 2,
    },
    float: {
      shadowColor: "#000000",
      shadowOpacity: 0.10,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: 4,
    },
  },
  opacity: {
    disabled: 0.48,
    pressed: 0.86,
    muted: 0.68,
  },
} as const;

export type OrbiDesignTokens = typeof orbiDesignTokens;

export const orbiTheme = {
  colors: {
    // Field UI kit: white canvas, black actions, grey inputs, one live accent.
    background: "#FFFFFF",
    backgroundAlt: orbiDesignTokens.color.canvasSubtle,
    backgroundDim: orbiDesignTokens.color.canvasMuted,
    riderBackground: "#FFFFFF",
    driverBackground: "#FFFFFF",
    riderChrome: "#FFFFFF",
    driverChrome: "#FFFFFF",

    // Surfaces
    panel: "#FFFFFF",
    surface: "#FFFFFF",
    panelSoft: orbiDesignTokens.color.canvasSubtle,
    surfaceSoft: orbiDesignTokens.color.canvasSubtle,
    surfaceStrong: orbiDesignTokens.color.canvasMuted,

    // Text hierarchy
    text: orbiDesignTokens.color.ink,
    textMuted: orbiDesignTokens.color.inkMuted,
    textSoft: orbiDesignTokens.color.inkSoft,
    muted: orbiDesignTokens.color.inkMuted,

    teal: orbiDesignTokens.color.brand,
    accentDark: orbiDesignTokens.color.brandStrong,
    accentLight: orbiDesignTokens.color.brandSoft,

    // Semantic aliases stay available, but keep the app visually restrained.
    amber: orbiDesignTokens.color.warning,
    sky: orbiDesignTokens.color.info,
    rose: orbiDesignTokens.color.danger,
    success: orbiDesignTokens.color.success,
    danger: orbiDesignTokens.color.danger,
    warning: orbiDesignTokens.color.warning,
    sos: orbiDesignTokens.color.danger,

    // Borders
    border: orbiDesignTokens.color.line,
    borderSoft: orbiDesignTokens.color.lineSoft,

    // Overlay
    overlay: orbiDesignTokens.color.overlay,
    overlayLight: "rgba(0, 0, 0, 0.08)",

    // Inverse
    textInverse: "#FFFFFF",
  },
  gradients: {
    hero: ["#FFFFFF", "#F5F5F5"],
    accent: ["#000000", "#333333"],
    warm: ["#000000", "#333333"],
  },
  radius: {
    card: orbiDesignTokens.radius.md,
    button: orbiDesignTokens.radius.md,
    pill: orbiDesignTokens.radius.pill,
    panel: orbiDesignTokens.radius.sheet,
    input: orbiDesignTokens.radius.md,
  },
  spacing: {
    xs: orbiDesignTokens.space.xs,
    sm: orbiDesignTokens.space.sm,
    md: orbiDesignTokens.space.md,
    lg: orbiDesignTokens.space.xl,
    xl: orbiDesignTokens.space.xxl,
    xxl: 48,
  },
  typography: {
    hero: orbiDesignTokens.type.size.display,
    title: orbiDesignTokens.type.size.title,
    section: orbiDesignTokens.type.size.section,
    body: orbiDesignTokens.type.size.body,
    label: orbiDesignTokens.type.size.label,
    caption: orbiDesignTokens.type.size.caption,
    small: orbiDesignTokens.type.size.micro,
    lineHeight: orbiDesignTokens.type.lineHeight,
    fontFamily: orbiDesignTokens.type.family,
  },
  shadows: {
    card: orbiDesignTokens.shadow.card,
    sheet: orbiDesignTokens.shadow.sheet,
    button: orbiDesignTokens.shadow.button,
    float: orbiDesignTokens.shadow.float,
  },
  touch: orbiDesignTokens.touch,
  opacity: orbiDesignTokens.opacity,
} as const;

// ── Dark theme palette ────────────────────────────────────────────────────────
// Mirrors orbiTheme structure but with dark backgrounds (Bolt/Uber dark style)

export const orbiThemeDark = {
  colors: {
    background: "#06100E",
    backgroundAlt: "#0B1B18",
    backgroundDim: "#102622",
    riderBackground: "#06131C",
    driverBackground: "#161007",
    riderChrome: "#0B2230",
    driverChrome: "#231806",

    panel: "#0B1715",
    surface: "#0B1715",
    panelSoft: "#102622",
    surfaceSoft: "#102622",
    surfaceStrong: "#17352F",

    text: "#F5FFFC",
    textMuted: "#7F918D",
    textSoft: "#B6C6C1",
    muted: "#7F918D",

    teal: "#00D8B5",
    accentDark: "#00B894",
    accentLight: "rgba(0, 216, 181, 0.15)",

    amber: "#F7B731",
    sky: "#4C8DFF",
    rose: "#FF5A5F",
    success: "#00D8B5",
    danger: "#FF5A5F",
    warning: "#F7B731",

    border: "#1D3A34",
    borderSoft: "rgba(245, 255, 252, 0.07)",

    overlay: "rgba(0, 0, 0, 0.72)",
    overlayLight: "rgba(255, 255, 255, 0.08)",

    textInverse: "#000000",
  },
  gradients: orbiTheme.gradients,
  radius: orbiTheme.radius,
  spacing: orbiTheme.spacing,
  typography: orbiTheme.typography,
  touch: orbiTheme.touch,
  opacity: orbiTheme.opacity,
  shadows: {
    card: {
      shadowColor: "#000000",
      shadowOpacity: 0.28,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 4 },
      elevation: 6,
    },
    sheet: {
      shadowColor: "#000000",
      shadowOpacity: 0.48,
      shadowRadius: 28,
      shadowOffset: { width: 0, height: -6 },
      elevation: 16,
    },
    button: {
      shadowColor: "#000000",
      shadowOpacity: 0.36,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 4,
    },
    float: {
      shadowColor: "#000000",
      shadowOpacity: 0.36,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 3 },
      elevation: 8,
    },
  },
} as const;

// Structural type — allows different literal color values across light/dark themes
export type OrbiThemeColors = Record<string, string>;
export type OrbiThemeShadow = {
  shadowColor: string;
  shadowOpacity: number;
  shadowRadius: number;
  shadowOffset: { width: number; height: number };
  elevation: number;
};
export type OrbiTheme = {
  colors: OrbiThemeColors;
  gradients: Record<string, readonly string[]>;
  radius: Record<string, number>;
  spacing: Record<string, number>;
  typography: Record<string, number | Record<string, string> | Record<string, number>>;
  shadows: Record<string, OrbiThemeShadow>;
  touch: Record<string, number>;
  opacity: Record<string, number>;
};

export const orbiCopy = {
  riderHeadline: "Bougez vite, payez clair, restez suivi.",
  driverHeadline: "Recevez les bonnes courses, gardez le controle.",
  adminHeadline: "Controlez les courses, les paiements et la confiance.",
  voiceHeadline: "Dites le lieu. Orbi prepare le trajet.",
  riderNetworkUnavailable:
    "Connexion instable. Orbi garde votre écran prêt et relancera la mise à jour automatiquement.",
  driverNetworkUnavailable:
    "Connexion instable. Le cockpit reste prêt et reprendra les offres dès que le réseau revient.",
  serviceUnavailable:
    "Service momentanement indisponible. Reessayez dans un instant.",
} as const;

export const orbiLayout = {
  maxContentWidth: 1240,
  maxReadableWidth: 760,
  appHorizontalPadding: 24,
} as const;

export function createGlassPanel(opacity = 1) {
  return {
    backgroundColor: `rgba(255, 255, 255, ${opacity})`,
    borderWidth: 1,
    borderColor: orbiTheme.colors.border,
    borderRadius: orbiTheme.radius.panel,
  } as const;
}

export function formatXof(amount: number) {
  return new Intl.NumberFormat("fr-BF", {
    style: "currency",
    currency: "XOF",
    maximumFractionDigits: 0,
  }).format(amount);
}

type RealtimeAudience = "driver" | "rider";
type RealtimeConnectionScope =
  | "driver"
  | "rider"
  | "admin-live-ops"
  | "admin-support"
  | "admin-onboarding"
  | "admin-feature-flags"
  | "admin-health";
type RealtimeConnectionState = "active" | "connected" | "reconnecting";

const realtimeLabelsByAudience: Record<
  RealtimeAudience,
  Record<string, string>
> = {
  driver: {
    "trip.created": "Une reservation est devenue une course active.",
    "trip.updated": "La course chauffeur a avance d etape.",
    "trip.pickup-code-verified": "Le code de prise en charge a ete confirme.",
    "trip.incident-reported":
      "Un incident de course a ete signale.",
    "ride-request.created": "Une nouvelle demande compatible est arrivee.",
    "ride-request.cancelled": "Une demande vient d etre annulee.",
    "ride-request.reservation-assigned":
      "Une nouvelle offre est disponible.",
    "ride-request.reservation-released":
      "Cette reservation n est plus disponible.",
    "ride-request.reservation-expired":
      "Une reservation a expire.",
  },
  rider: {
    "trip.created": "Votre demande a trouve un chauffeur.",
    "trip.updated": "Votre trajet vient d avancer d etape.",
    "trip.pickup-code-verified":
      "Le depart est confirme, la course est en cours.",
    "trip.incident-reported": "Un incident a ete signale pour votre trajet.",
    "ride-request.created": "Votre demande est bien enregistree.",
    "ride-request.cancelled": "Votre demande a ete annulee.",
    "ride-request.reservation-assigned":
      "Un chauffeur vient d etre reserve pour votre demande.",
    "ride-request.reservation-released":
      "Le systeme cherche un nouveau chauffeur pour vous.",
    "ride-request.reservation-expired":
      "La fenetre precedente a expire, la recherche reprend.",
  },
};

export function describeRealtimeEvent(
  audience: RealtimeAudience,
  eventType: string,
) {
  return (
    realtimeLabelsByAudience[audience][eventType] ??
    (audience === "driver"
      ? "Les missions viennent d etre mises a jour."
      : "Votre trajet vient d etre mis a jour.")
  );
}

const realtimeConnectionCopy: Record<
  RealtimeConnectionScope,
  Record<RealtimeConnectionState, string>
> = {
  driver: {
    active: "Missions a jour.",
    connected: "Missions a jour.",
    reconnecting: "Mise a jour en cours.",
  },
  rider: {
    active: "Trajet a jour.",
    connected: "Trajet a jour.",
    reconnecting: "Mise a jour en cours.",
  },
  "admin-live-ops": {
    active: "Flux live ops temps reel actif.",
    connected: "Console live ops synchronisee en temps reel.",
    reconnecting: "Le flux live ops se reconnecte automatiquement.",
  },
  "admin-support": {
    active: "Flux support temps reel actif.",
    connected: "File support synchronisee en temps reel.",
    reconnecting: "Le flux support se reconnecte automatiquement.",
  },
  "admin-onboarding": {
    active: "Flux onboarding temps reel actif.",
    connected: "File onboarding synchronisee en temps reel.",
    reconnecting: "Le flux onboarding se reconnecte automatiquement.",
  },
  "admin-feature-flags": {
    active: "Flux feature flags temps reel actif.",
    connected: "Feature flags synchronisees en temps reel.",
    reconnecting: "Le flux feature flags se reconnecte automatiquement.",
  },
  "admin-health": {
    active: "Flux health watchdog temps reel actif.",
    connected: "Sante systeme synchronisee en temps reel.",
    reconnecting: "Le flux health watchdog se reconnecte automatiquement.",
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
  return isRealtimeSyncing ? "Mise a jour" : liveLabel;
}

const FRENCH_STATUS: Record<string, string> = {
  REQUESTED: "En attente",
  MATCHED: "Chauffeur assigné",
  DRIVER_ARRIVING: "Chauffeur en route",
  IN_PROGRESS: "En cours",
  COMPLETED: "Terminé",
  CANCELLED: "Annulé",
  APPROVED: "Approuvé",
  PENDING: "En attente",
  REJECTED: "Refusé",
  SUSPENDED: "Suspendu",
  ONLINE: "Disponible",
  OFFLINE: "Hors ligne",
  BUSY: "Occupé",
  MOTORCYCLE: "Moto",
  MOTO: "Moto",
  CAR: "Voiture",
  MOTO_STANDARD: "Moto",
  CLEAR: "Normal",
  WARNING: "Attention",
  CRITICAL: "Critique",
  UNKNOWN: "Inconnu",
  VERIFIED: "Vérifié",
  UNVERIFIED: "Non vérifié",
};

export function formatOperationalStatus(status: string) {
  return (
    FRENCH_STATUS[status.toUpperCase()] ??
    status
      .toLowerCase()
      .split("_")
      .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
      .join(" ")
  );
}

export function escapeHtmlText(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function serializeHtmlScriptJson(value: unknown) {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

const allowedMapWebViewHosts = new Set([
  "unpkg.com",
  "tile.openstreetmap.org",
  "a.tile.openstreetmap.org",
  "b.tile.openstreetmap.org",
  "c.tile.openstreetmap.org",
  // CartoDB Positron / Voyager (clean light tiles)
  "a.basemaps.cartocdn.com",
  "b.basemaps.cartocdn.com",
  "c.basemaps.cartocdn.com",
  "d.basemaps.cartocdn.com",
  "basemaps.cartocdn.com",
  // OSRM routing
  "router.project-osrm.org",
]);

export const localMapWebViewOriginWhitelist = [
  "about:blank",
  "about:srcdoc",
  "https://unpkg.com",
  "https://tile.openstreetmap.org",
  "https://a.tile.openstreetmap.org",
  "https://b.tile.openstreetmap.org",
  "https://c.tile.openstreetmap.org",
  "https://a.basemaps.cartocdn.com",
  "https://b.basemaps.cartocdn.com",
  "https://c.basemaps.cartocdn.com",
  "https://d.basemaps.cartocdn.com",
  "https://basemaps.cartocdn.com",
  "https://router.project-osrm.org",
] as const;

export function shouldAllowLocalMapWebViewRequest(url: string) {
  if (!url || url === "about:blank" || url === "about:srcdoc") {
    return true;
  }

  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" &&
      allowedMapWebViewHosts.has(parsed.hostname)
    );
  } catch {
    return false;
  }
}

// ── Dark mode helpers ─────────────────────────────────────────────────────────
// Apps call resolveTheme(colorScheme) from their _layout.tsx to get the right
// palette, then pass it via Context or store it in state.
//
// Usage in _layout.tsx:
//   import { useColorScheme } from 'react-native';
//   import { resolveTheme } from '@orbi/ui';
//   const theme = resolveTheme(useColorScheme());

export function resolveTheme(
  colorScheme: 'light' | 'dark' | null | undefined,
): OrbiTheme {
  return colorScheme === 'dark' ? orbiThemeDark : orbiTheme;
}

// ── Leaflet map builder — partagé entre toutes les vues carte ─────────────────
export {
  LEAFLET_VERSION,
  LEAFLET_CDN_BASE,
  LEAFLET_CSS,
  LEAFLET_JS,
  CARTO_TILE_URL,
  OUAGA_CENTER,
  DEFAULT_ZOOM,
  CLOSE_ZOOM,
  BASE_MAP_CSS,
  PULSE_ANIMATION,
  VEHICLE_SVG_DEFS,
  buildLeafletMapHtml,
  buildLeafletInitScript,
  buildTripRouteScript,
  formatTripRouteDistance,
  formatTripRouteDuration,
  type MapHtmlOptions,
  type RouteInfoMessage,
} from './leaflet-map';

export { ORBI_MAP_VEHICLE_CSS, ORBI_MAP_VEHICLE_SCRIPT } from './map-vehicle-icons';
