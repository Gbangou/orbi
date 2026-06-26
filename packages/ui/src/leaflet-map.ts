/**
 * Leaflet Map Builder — utilitaire partagé @orbi/ui
 *
 * Centralise la configuration Leaflet commune à tous les composants carte:
 *   - home-map-view (rider)
 *   - trip-map-view (rider + driver)
 *   - approach-map-view (driver)
 *   - driver-home-map-view (driver)
 *   - saved-places-map (rider)
 *   - live-ops-map (admin)
 *
 * Avant ce module: 6 fichiers avec 80% de code HTML/CSS/JS identique.
 * Après: chaque fichier importe les briques communes et ne définit
 * que ce qui lui est spécifique.
 */

// ── Versions et CDN ───────────────────────────────────────────────────────────

export const LEAFLET_VERSION = '1.9.4';
export const LEAFLET_CDN_BASE = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist`;
export const LEAFLET_CSS = `${LEAFLET_CDN_BASE}/leaflet.css`;
export const LEAFLET_JS = `${LEAFLET_CDN_BASE}/leaflet.js`;

// Tuiles CartoDB Voyager — légères, claires, sans clé API
export const CARTO_TILE_URL =
  'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
export const CARTO_ATTRIBUTION = '&copy; OpenStreetMap contributors &copy; CARTO';

// ── Centre par défaut — Ouagadougou ──────────────────────────────────────────

export const OUAGA_CENTER = { lat: 12.3647, lng: -1.5332 } as const;
export const DEFAULT_ZOOM = 14;
export const CLOSE_ZOOM = 16;

// ── CSS de base commun à toutes les cartes ────────────────────────────────────

export const BASE_MAP_CSS = `
*{margin:0;padding:0;box-sizing:border-box}
html,body,#map{width:100%;height:100%;background:#f4f4f0}
.leaflet-control-attribution,.leaflet-control-zoom{display:none}
`.trim();

// ── Animations CSS communes ───────────────────────────────────────────────────

export const PULSE_ANIMATION = `
@keyframes orbi-pulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.18);opacity:0.8}}
@keyframes orbi-glow-moto{0%,100%{filter:drop-shadow(0 2px 4px rgba(0,0,0,0.28))}50%{filter:drop-shadow(0 2px 8px rgba(0,0,0,0.42))}}
@keyframes orbi-glow-car{0%,100%{filter:drop-shadow(0 2px 5px rgba(0,0,0,0.24))}50%{filter:drop-shadow(0 3px 10px rgba(0,0,0,0.38))}}
.moto-svg{animation:orbi-glow-moto 2.2s ease-in-out infinite;display:block}
.car-svg{animation:orbi-glow-car 2.6s ease-in-out infinite;display:block}
.orbi-rider-dot{animation:orbi-pulse 2.4s ease-in-out infinite}
`.trim();

// ── SVG defs — gradients véhicules 3D ────────────────────────────────────────

export const VEHICLE_SVG_DEFS = `
<svg id="svgDefs" xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute;overflow:hidden"><defs>
  <linearGradient id="gMB" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#1a1a2e"/><stop offset="100%" stop-color="#111111"/></linearGradient>
  <linearGradient id="gMT" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#333344"/><stop offset="50%" stop-color="#4a4a5a"/><stop offset="100%" stop-color="#222233"/></linearGradient>
  <radialGradient id="gMW" cx="35%" cy="30%" r="65%"><stop offset="0%" stop-color="#555566"/><stop offset="100%" stop-color="#050508"/></radialGradient>
  <radialGradient id="gML" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="rgba(255,255,255,0.6)"/><stop offset="100%" stop-color="rgba(255,255,255,0)"/></radialGradient>
  <radialGradient id="gTL" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#ff9090"/><stop offset="55%" stop-color="#ff2020"/><stop offset="100%" stop-color="#990000" stop-opacity="0"/></radialGradient>
  <linearGradient id="gCB" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#e8eef6"/><stop offset="40%" stop-color="#c8d4e0"/><stop offset="100%" stop-color="#8898a8"/></linearGradient>
  <linearGradient id="gCH" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#f0f5fa"/><stop offset="100%" stop-color="#aabbc8"/></linearGradient>
  <linearGradient id="gCG" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#2a3a50" stop-opacity="0.95"/><stop offset="100%" stop-color="#0f1e30" stop-opacity="0.98"/></linearGradient>
  <radialGradient id="gCW" cx="35%" cy="30%" r="65%"><stop offset="0%" stop-color="#555566"/><stop offset="100%" stop-color="#080810"/></radialGradient>
</defs></svg>
`.trim();

// ── Builder HTML générique ────────────────────────────────────────────────────

export type MapHtmlOptions = {
  /** CSS additionnel injecté après BASE_MAP_CSS */
  extraCss?: string;
  /** JS injecté après l'init Leaflet (doit définir window.__orbiMapInit) */
  mapScript: string;
  /** Données sérialisées injectées comme window.__orbiMapConfig */
  configJson: string;
  /** Activer les animations véhicules (SVG defs + keyframes) */
  enableVehicleAnimations?: boolean;
};

/**
 * Construit le HTML complet d'une carte Leaflet WebView.
 *
 * @param opts - Options de configuration
 * @returns HTML complet prêt à être injecté dans un WebView
 */
export function buildLeafletMapHtml(opts: MapHtmlOptions): string {
  const vehicleAnimCss = opts.enableVehicleAnimations ? `\n${PULSE_ANIMATION}` : '';
  const svgDefs = opts.enableVehicleAnimations ? `\n${VEHICLE_SVG_DEFS}` : '';

  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no">
<link rel="stylesheet" href="${LEAFLET_CSS}"/>
<style>
${BASE_MAP_CSS}${vehicleAnimCss}
${opts.extraCss ?? ''}
</style>
</head>
<body>
<div id="map"></div>${svgDefs}
<script>window.__orbiMapConfig=${opts.configJson};</script>
<script src="${LEAFLET_JS}"></script>
<script>
(function(){
  var cfg=window.__orbiMapConfig;
  ${opts.mapScript}
})();
</script>
</body>
</html>`;
}

// ── Init Leaflet de base ──────────────────────────────────────────────────────

/**
 * Snippet JS qui initialise une carte Leaflet avec les tuiles CartoDB.
 * À inclure en début de chaque mapScript.
 */
export function buildLeafletInitScript(opts: {
  centerLat?: number;
  centerLng?: number;
  zoom?: number;
} = {}): string {
  const lat = opts.centerLat ?? OUAGA_CENTER.lat;
  const lng = opts.centerLng ?? OUAGA_CENTER.lng;
  const zoom = opts.zoom ?? DEFAULT_ZOOM;

  return `
  var map=L.map('map',{zoomControl:false,attributionControl:false}).setView([${lat},${lng}],${zoom});
  L.tileLayer('${CARTO_TILE_URL}',{maxZoom:19,subdomains:'abcd'}).addTo(map);
  `.trim();
}
