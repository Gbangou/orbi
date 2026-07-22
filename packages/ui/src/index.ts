export const orbiTheme = {
  colors: {
    // Backgrounds
    background: "#F7FAFC",
    backgroundAlt: "#EEF4F3",
    backgroundDim: "#DDE8E6",
    riderBackground: "#F5FBFF",
    driverBackground: "#FFF9ED",
    riderChrome: "#EAF6FF",
    driverChrome: "#FFF0D6",

    // Surfaces
    panel: "#FFFFFF",
    surface: "#FFFFFF",
    panelSoft: "#F1F6F8",
    surfaceSoft: "#F1F6F8",
    surfaceStrong: "#DFEBEF",

    // Text hierarchy
    text: "#07111F",
    textMuted: "#75818B",
    textSoft: "#394653",
    muted: "#75818B",

    // Orbi brand: graphite mobility, emerald trust, electric blue clarity, gold energy.
    teal: "#00C2A8",
    accentDark: "#007C69",
    accentLight: "rgba(0, 194, 168, 0.12)",

    // Semantic
    amber: "#FFB020",
    sky: "#3D7BFF",
    rose: "#F0445E",
    success: "#00C2A8",
    danger: "#F0445E",
    warning: "#FFB020",

    // Borders
    border: "#D8E4E8",
    borderSoft: "rgba(7, 17, 31, 0.07)",

    // Overlay
    overlay: "rgba(0, 0, 0, 0.48)",
    overlayLight: "rgba(0, 0, 0, 0.08)",

    // Inverse
    textInverse: "#FFFFFF",
  },
  gradients: {
    hero: ["#F7FAFC", "#FFFFFF"],
    accent: ["#007C69", "#00E0C2"],
    warm: ["#FFB020", "#FF7A1A"],
  },
  radius: {
    card: 16,
    button: 12,
    pill: 999,
    panel: 20,
    input: 12,
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
    hero: 36,
    title: 28,
    section: 20,
    body: 16,
    label: 14,
    caption: 13,
    small: 11,
    fontFamily: {
      regular: 'Inter_400Regular',
      medium: 'Inter_500Medium',
      semibold: 'Inter_600SemiBold',
      bold: 'Inter_700Bold',
      brand: 'Raleway_800ExtraBold',
    },
  },
  shadows: {
    card: {
      shadowColor: "#07111F",
      shadowOpacity: 0.09,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 8 },
      elevation: 7,
    },
    sheet: {
      shadowColor: "#07111F",
      shadowOpacity: 0.15,
      shadowRadius: 30,
      shadowOffset: { width: 0, height: -6 },
      elevation: 16,
    },
    button: {
      shadowColor: "#07111F",
      shadowOpacity: 0.20,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 5 },
      elevation: 5,
    },
    float: {
      shadowColor: "#07111F",
      shadowOpacity: 0.14,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 6 },
      elevation: 9,
    },
  },
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
  typography: Record<string, number | Record<string, string>>;
  shadows: Record<string, OrbiThemeShadow>;
};

export const orbiCopy = {
  riderHeadline: "Bougez vite, payez clair, restez suivi.",
  driverHeadline: "Recevez les bonnes courses, gardez le controle.",
  adminHeadline: "Controlez les courses, les paiements et la confiance.",
  voiceHeadline: "Dites le lieu. Orbi prepare le trajet.",
  riderNetworkUnavailable:
    "Connexion instable. Orbi garde votre ecran pret et relancera la synchronisation automatiquement.",
  driverNetworkUnavailable:
    "Connexion instable. Le cockpit reste pret et reprendra les offres des que le reseau revient.",
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
    "trip.created": "Une reservation est devenue une course en direct.",
    "trip.updated": "La course chauffeur a avance d etape.",
    "trip.pickup-code-verified": "Le code de prise en charge a ete confirme.",
    "trip.incident-reported":
      "Un incident de course a ete remonte aux operations.",
    "ride-request.created": "Une nouvelle demande compatible est arrivee.",
    "ride-request.cancelled": "Une demande vient d etre retiree du flux.",
    "ride-request.reservation-assigned":
      "Une nouvelle offre est disponible.",
    "ride-request.reservation-released":
      "Une reservation vous a ete retiree et remise au flux.",
    "ride-request.reservation-expired":
      "Une reservation a expire et le flux a ete resynchronise.",
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
      ? "Le direct chauffeur vient d etre mis a jour."
      : "Votre trajet vient d etre mis a jour en direct.")
  );
}

const realtimeConnectionCopy: Record<
  RealtimeConnectionScope,
  Record<RealtimeConnectionState, string>
> = {
  driver: {
    active: "Flux chauffeur temps reel actif.",
    connected: "Flux chauffeur connecte en temps reel.",
    reconnecting: "Le flux chauffeur se reconnecte automatiquement.",
  },
  rider: {
    active: "Flux passager temps reel actif.",
    connected: "Flux passager connecte en temps reel.",
    reconnecting: "Le flux passager se reconnecte automatiquement.",
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
  return isRealtimeSyncing ? "Resync live" : liveLabel;
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
