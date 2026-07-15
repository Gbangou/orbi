import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { fetchNearbyDrivers, type NearbyDriverMarker } from '@orbi/api';
import {
  serializeHtmlScriptJson,
  shouldAllowLocalMapWebViewRequest,
  type OrbiTheme,
} from '@orbi/ui';
import { ErrorBoundary, useOrbiTheme } from '@orbi/ui/native';
import { createRiderPublicClient } from './auth';
import { enqueueRiderMapError } from './map-error-reporting';
import { hasMapCoordinatePair, normalizeMapCoordinatePair } from './map-coordinate';

const TypedWebView = WebView as any;

const OUAGA_LAT = 12.3647;
const OUAGA_LNG = -1.5332;
const REFRESH_INTERVAL_MS = 15_000;

export interface HomeMapViewProps {
  riderLat?: number | null;
  riderLng?: number | null;
  style?: object;
  onDriversUpdate?: (count: number) => void;
}

function buildHomeMapHtml(cfg: {
  riderLat: number | null;
  riderLng: number | null;
  drivers: NearbyDriverMarker[];
}): string {
  const config = serializeHtmlScriptJson(cfg);
  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body,#map{width:100%;height:100%;background:#f4f4f0}
.leaflet-control-attribution,.leaflet-control-zoom{display:none}
@keyframes pulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.18);opacity:0.8}}
@keyframes glowMoto{0%,100%{filter:drop-shadow(0 2px 4px rgba(0,0,0,0.28))}50%{filter:drop-shadow(0 2px 8px rgba(0,0,0,0.42))}}
@keyframes glowCar{0%,100%{filter:drop-shadow(0 2px 5px rgba(0,0,0,0.24))}50%{filter:drop-shadow(0 3px 10px rgba(0,0,0,0.38))}}
.moto-svg{animation:glowMoto 2.2s ease-in-out infinite;display:block}
.car-svg{animation:glowCar 2.6s ease-in-out infinite;display:block}
.rider-dot{animation:pulse 2.4s ease-in-out infinite}
</style>
</head>
<body>
<div id="map"></div>
<svg id="svgDefs" xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute;overflow:hidden"><defs>
  <linearGradient id="gMB" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#1a1a2e"/><stop offset="100%" stop-color="#111111"/></linearGradient>
  <linearGradient id="gMT" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#333344"/><stop offset="50%" stop-color="#4a4a5a"/><stop offset="100%" stop-color="#222233"/></linearGradient>
  <radialGradient id="gMW" cx="35%" cy="30%" r="65%"><stop offset="0%" stop-color="#555566"/><stop offset="100%" stop-color="#050508"/></radialGradient>
  <radialGradient id="gML" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="rgba(255,255,255,0.6)"/><stop offset="100%" stop-color="rgba(255,255,255,0)" /></radialGradient>
  <radialGradient id="gTL" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#ff9090"/><stop offset="55%" stop-color="#ff2020"/><stop offset="100%" stop-color="#990000" stop-opacity="0"/></radialGradient>
  <filter id="fHG" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  <linearGradient id="gCB" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#e8eef6"/><stop offset="40%" stop-color="#c8d4e0"/><stop offset="100%" stop-color="#8898a8"/></linearGradient>
  <linearGradient id="gCH" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#f0f5fa"/><stop offset="100%" stop-color="#aabbc8"/></linearGradient>
  <linearGradient id="gCR" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#d0dae6"/><stop offset="100%" stop-color="#6a7e90"/></linearGradient>
  <linearGradient id="gCG" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#2a3a50" stop-opacity="0.95"/><stop offset="100%" stop-color="#0f1e30" stop-opacity="0.98"/></linearGradient>
  <radialGradient id="gCW" cx="35%" cy="30%" r="65%"><stop offset="0%" stop-color="#555566"/><stop offset="100%" stop-color="#080810"/></radialGradient>
  <radialGradient id="gHL" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#ffffff"/><stop offset="55%" stop-color="#cce0ff"/><stop offset="100%" stop-color="#60a0ff" stop-opacity="0"/></radialGradient>
</defs></svg>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
var CFG=${config};
var map=L.map('map',{zoomControl:false,attributionControl:false});
L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',{maxZoom:19,subdomains:['a','b','c','d']}).addTo(map);
var riderMarker=null;
var driverMarkers={};

var MOTO_SVG='<svg class="moto-svg" xmlns="http://www.w3.org/2000/svg" width="24" height="52" viewBox="0 0 24 52"><ellipse cx="12" cy="8" rx="7.5" ry="6.5" fill="url(#gMW)"/><ellipse cx="12" cy="8" rx="4" ry="3.5" fill="none" stroke="rgba(120,135,145,0.55)" stroke-width="1.2"/><circle cx="12" cy="8" r="1.4" fill="#5a5a6a"/><ellipse cx="12" cy="44" rx="7.5" ry="6.5" fill="url(#gMW)"/><ellipse cx="12" cy="44" rx="4" ry="3.5" fill="none" stroke="rgba(120,135,145,0.55)" stroke-width="1.2"/><circle cx="12" cy="44" r="1.4" fill="#5a5a6a"/><path d="M8.5,14 Q6,17 6,22 L6.5,30 Q7.5,34 9,36 L15,36 Q16.5,34 17.5,30 L18,22 Q18,17 15.5,14Z" fill="url(#gMB)"/><ellipse cx="12" cy="22" rx="5" ry="6" fill="url(#gMT)"/><path d="M10,34 Q12,37 14,34 L14,42 Q12,43.5 10,42Z" fill="rgba(8,18,18,0.85)"/><path d="M4,13.5 Q7.5,11.5 12,11.5 Q16.5,11.5 20,13.5" stroke="rgba(0,0,0,0.7)" stroke-width="2.5" stroke-linecap="round" fill="none"/><circle cx="4" cy="13.5" r="1.8" fill="#333"/><circle cx="20" cy="13.5" r="1.8" fill="#333"/><ellipse cx="12" cy="12" rx="4" ry="2.5" fill="url(#gML)" filter="url(#fHG)"/><rect x="9.5" y="45.5" width="5" height="2" rx="1" fill="url(#gTL)"/></svg>';

var CAR_SVG='<svg class="car-svg" xmlns="http://www.w3.org/2000/svg" width="40" height="72" viewBox="0 0 40 72"><rect x="0" y="7" width="8" height="13" rx="4" fill="url(#gCW)"/><rect x="32" y="7" width="8" height="13" rx="4" fill="url(#gCW)"/><rect x="0" y="52" width="8" height="13" rx="4" fill="url(#gCW)"/><rect x="32" y="52" width="8" height="13" rx="4" fill="url(#gCW)"/><rect x="2" y="9" width="4" height="9" rx="2" fill="#9aa4b0" opacity="0.6"/><rect x="34" y="9" width="4" height="9" rx="2" fill="#9aa4b0" opacity="0.6"/><rect x="2" y="54" width="4" height="9" rx="2" fill="#9aa4b0" opacity="0.6"/><rect x="34" y="54" width="4" height="9" rx="2" fill="#9aa4b0" opacity="0.6"/><rect x="7" y="4" width="26" height="64" rx="11" fill="url(#gCB)"/><path d="M8,4 Q20,2 32,4 L32,17 Q20,15.5 8,17Z" fill="url(#gCH)"/><rect x="9.5" y="14" width="21" height="13" rx="4" fill="url(#gCG)"/><path d="M12,15.5 Q20,14 28,15.5" stroke="rgba(255,255,255,0.28)" stroke-width="1.5" fill="none"/><rect x="8" y="28" width="4" height="16" rx="2" fill="url(#gCG)" opacity="0.85"/><rect x="28" y="28" width="4" height="16" rx="2" fill="url(#gCG)" opacity="0.85"/><rect x="12" y="27" width="16" height="18" rx="3" fill="url(#gCR)"/><path d="M14,29.5 Q20,28 26,29.5" stroke="rgba(255,255,255,0.4)" stroke-width="1.2" fill="none"/><rect x="9.5" y="45" width="21" height="13" rx="4" fill="url(#gCG)"/><path d="M8,58 Q20,60.5 32,58 L32,68 Q20,70.5 8,68Z" fill="rgba(155,175,192,0.6)"/><rect x="8.5" y="4.5" width="7" height="2.5" rx="1.2" fill="url(#gHL)" filter="url(#fHG)"/><rect x="24.5" y="4.5" width="7" height="2.5" rx="1.2" fill="url(#gHL)" filter="url(#fHG)"/><path d="M10,8.5 L17,8.5 M23,8.5 L30,8.5" stroke="rgba(180,215,255,0.65)" stroke-width="0.9" stroke-linecap="round"/><rect x="8.5" y="65" width="7" height="2.5" rx="1.2" fill="url(#gTL)"/><rect x="24.5" y="65" width="7" height="2.5" rx="1.2" fill="url(#gTL)"/></svg>';

var RIDER_SVG='<div class="rider-dot" style="width:22px;height:22px;border-radius:11px;background:#111111;border:3px solid #FFFFFF;box-shadow:0 2px 10px rgba(0,0,0,0.35)"></div>';

function motoIcon(){return L.divIcon({html:MOTO_SVG,iconSize:[24,52],iconAnchor:[12,26],className:''})}
function carIcon(){return L.divIcon({html:CAR_SVG,iconSize:[40,72],iconAnchor:[20,36],className:''})}
function riderIcon(){return L.divIcon({html:RIDER_SVG,iconSize:[22,22],iconAnchor:[11,11],className:''})}

function initMap(cfg){
  var centerLat=cfg.riderLat!==null?cfg.riderLat:12.3647;
  var centerLng=cfg.riderLng!==null?cfg.riderLng:-1.5332;
  var zoom=cfg.riderLat!==null?15:13;
  map.setView([centerLat,centerLng],zoom);
  if(cfg.riderLat!==null&&cfg.riderLng!==null){
    riderMarker=L.marker([cfg.riderLat,cfg.riderLng],{icon:riderIcon(),zIndexOffset:1000}).addTo(map);
  }
  cfg.drivers.forEach(function(d){
    var icon=d.vehicleType==='MOTORCYCLE'||d.vehicleType==='MOTO'?motoIcon():carIcon();
    driverMarkers[d.id]=L.marker([d.latitude,d.longitude],{icon:icon}).addTo(map);
  });
}

function updateRider(lat,lng){
  if(!riderMarker){riderMarker=L.marker([lat,lng],{icon:riderIcon(),zIndexOffset:1000}).addTo(map)}
  else{riderMarker.setLatLng([lat,lng])}
  map.panTo([lat,lng],{animate:true,duration:0.6});
}

function updateDrivers(drivers){
  var seen={};
  drivers.forEach(function(d){
    seen[d.id]=true;
    if(driverMarkers[d.id]){driverMarkers[d.id].setLatLng([d.latitude,d.longitude])}
    else{
      var icon=d.vehicleType==='MOTORCYCLE'||d.vehicleType==='MOTO'?motoIcon():carIcon();
      driverMarkers[d.id]=L.marker([d.latitude,d.longitude],{icon:icon}).addTo(map);
    }
  });
  Object.keys(driverMarkers).forEach(function(id){
    if(!seen[id]){map.removeLayer(driverMarkers[id]);delete driverMarkers[id];}
  });
}

function isCoord(v){return typeof v==='number'&&isFinite(v)}
function onMsg(e){
  try{
    var m=JSON.parse(e.data);
    if(m.type==='UPDATE_RIDER'&&isCoord(m.lat)&&isCoord(m.lng)){updateRider(m.lat,m.lng)}
    if(m.type==='UPDATE_DRIVERS'&&Array.isArray(m.drivers)){updateDrivers(m.drivers.filter(function(d){return d&&isCoord(d.latitude)&&isCoord(d.longitude)}))}
  }catch(x){}
}
document.addEventListener('message',onMsg);
window.addEventListener('message',onMsg);
initMap(CFG);
</script>
</body>
</html>`;
}

export function HomeMapView({ riderLat, riderLng, style, onDriversUpdate }: HomeMapViewProps) {
  const theme = useOrbiTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const webRef = useRef<WebView>(null);
  const [drivers, setDrivers] = useState<NearbyDriverMarker[]>([]);
  const rider = useMemo(
    () => normalizeMapCoordinatePair({ latitude: riderLat, longitude: riderLng }),
    [riderLat, riderLng],
  );
  const htmlRef = useRef<string>(
    buildHomeMapHtml({
      riderLat: rider?.latitude ?? null,
      riderLng: rider?.longitude ?? null,
      drivers: [],
    }),
  );

  const refreshDrivers = useCallback(async () => {
    try {
      const client = createRiderPublicClient();
      const lat = rider?.latitude ?? OUAGA_LAT;
      const lng = rider?.longitude ?? OUAGA_LNG;
      const response = await fetchNearbyDrivers(client, { lat, lng, radiusKm: 5 });
      const list = response.drivers.filter((driver) =>
        hasMapCoordinatePair({
          latitude: driver.latitude,
          longitude: driver.longitude,
        }),
      );
      setDrivers(list);
      onDriversUpdate?.(list.length);
      if (webRef.current) {
        webRef.current.postMessage(
          JSON.stringify({ type: 'UPDATE_DRIVERS', drivers: list }),
        );
      }
    } catch (error) {
      enqueueRiderMapError(error, { surface: 'home-map', action: 'refresh-drivers' });
    }
  }, [rider, onDriversUpdate]);

  useEffect(() => {
    void refreshDrivers();
    const interval = setInterval(() => void refreshDrivers(), REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refreshDrivers]);

  useEffect(() => {
    if (rider && webRef.current) {
      webRef.current.postMessage(
        JSON.stringify({ type: 'UPDATE_RIDER', lat: rider.latitude, lng: rider.longitude }),
      );
    }
  }, [rider]);

  function renderDegradedPanel() {
    const hasLocation = hasMapCoordinatePair({ latitude: riderLat, longitude: riderLng });

    return (
      <View style={[styles.container, styles.webFallback, style]}>
        <View style={styles.mapGrid} />
        <View style={styles.radar}>
          <View style={[styles.radarRing, styles.radarRingLarge]} />
          <View style={[styles.radarRing, styles.radarRingMedium]} />
          <View style={styles.riderDot} />
          {drivers.slice(0, 6).map((driver, index) => (
            <View
              key={driver.id}
              style={[
                styles.driverDot,
                index % 2 === 0 ? styles.driverDotCar : styles.driverDotMoto,
                {
                  left: `${24 + ((index * 17) % 52)}%`,
                  top: `${24 + ((index * 23) % 48)}%`,
                },
              ]}
            />
          ))}
        </View>
        <View style={styles.fallbackPanel}>
          <Text style={styles.fallbackEyebrow}>Disponibilite</Text>
          <Text style={styles.fallbackTitle}>
            {drivers.length > 0
              ? `${drivers.length} chauffeur${drivers.length > 1 ? 's' : ''} proche${drivers.length > 1 ? 's' : ''}`
              : 'Recherche chauffeurs'}
          </Text>
          <Text style={styles.fallbackMeta} numberOfLines={2}>
            {hasLocation
              ? 'Position rider active. Carte dynamique disponible sur mobile natif.'
              : 'Ouagadougou charge par defaut pendant la localisation.'}
          </Text>
        </View>
      </View>
    );
  }

  if (Platform.OS === 'web') {
    return renderDegradedPanel();
  }

  return (
    <ErrorBoundary
      fallback={renderDegradedPanel()}
      onError={(error) =>
        enqueueRiderMapError(error, { surface: 'home-map', action: 'render-crash' })
      }
    >
      <View style={[styles.container, style]}>
        <TypedWebView
          ref={webRef}
          source={{ html: htmlRef.current }}
          scrollEnabled={false}
          style={styles.webview}
          javaScriptEnabled
          originWhitelist={['about:blank', 'https://*']}
          onShouldStartLoadWithRequest={(request: { url: string }) =>
            shouldAllowLocalMapWebViewRequest(request.url)
          }
          onError={(event: { nativeEvent?: { description?: string; code?: number } }) => {
            enqueueRiderMapError(
              new Error(event.nativeEvent?.description ?? 'Home map WebView error'),
              {
                surface: 'home-map',
                code: event.nativeEvent?.code ?? null,
              },
            );
          }}
          onHttpError={(event: {
            nativeEvent?: { statusCode?: number; description?: string; url?: string };
          }) => {
            enqueueRiderMapError(
              new Error(event.nativeEvent?.description ?? 'Home map HTTP error'),
              {
                surface: 'home-map',
                statusCode: event.nativeEvent?.statusCode ?? null,
                url: event.nativeEvent?.url ?? null,
              },
            );
          }}
          allowsInlineMediaPlayback
        />
      </View>
    </ErrorBoundary>
  );
}

const makeStyles = (theme: OrbiTheme) => StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
  webFallback: {
    minHeight: 220,
    backgroundColor: '#f4f7f3',
    borderRadius: 18,
  },
  mapGrid: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#f4f7f3',
  },
  radar: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radarRing: {
    position: 'absolute',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(0, 184, 148, 0.22)',
    backgroundColor: 'rgba(0, 184, 148, 0.05)',
  },
  radarRingLarge: {
    width: '76%',
    aspectRatio: 1,
  },
  radarRingMedium: {
    width: '48%',
    aspectRatio: 1,
  },
  riderDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#071311',
    borderWidth: 3,
    borderColor: '#ffffff',
    shadowColor: '#071311',
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  driverDot: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  driverDotCar: {
    backgroundColor: '#f59e0b',
  },
  driverDotMoto: {
    backgroundColor: theme.colors.teal,
  },
  fallbackPanel: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 14,
    gap: 3,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
  },
  fallbackEyebrow: {
    color: theme.colors.teal,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  fallbackTitle: {
    color: '#071311',
    fontSize: 15,
    fontWeight: '900',
  },
  fallbackMeta: {
    color: theme.colors.textMuted,
    fontSize: 12,
    lineHeight: 16,
  },
  webview: {
    flex: 1,
    backgroundColor: '#f4f4f0',
  },
});
