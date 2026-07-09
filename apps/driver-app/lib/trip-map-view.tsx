import { useEffect, useMemo, useRef } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import {
  serializeHtmlScriptJson,
  shouldAllowLocalMapWebViewRequest,
  type OrbiTheme,
} from '@orbi/ui';
import { useOrbiTheme } from '@orbi/ui/native';
import { enqueueDriverMapError } from './map-error-reporting';

const TypedWebView = WebView as any;

export interface TripMapViewProps {
  pickupLat: number | null | undefined;
  pickupLng: number | null | undefined;
  destLat: number | null | undefined;
  destLng: number | null | undefined;
  driverLat: number | null | undefined;
  driverLng: number | null | undefined;
  vehicleTier?: string | null | undefined;
  style?: object;
}

function buildMapHtml(cfg: {
  pickupLat: number | null;
  pickupLng: number | null;
  destLat: number | null;
  destLng: number | null;
  driverLat: number | null;
  driverLng: number | null;
  vehicleTier: string | null;
}): string {
  const config = serializeHtmlScriptJson(cfg);
  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body,#map{width:100%;height:100%;background:#eef3f1}
.leaflet-tile-pane{filter:saturate(.92) contrast(1.02)}
.leaflet-control-attribution,.leaflet-control-zoom{display:none}
@keyframes pulse{0%{box-shadow:0 0 0 0 rgba(0,199,199,.7)}70%{box-shadow:0 0 0 14px rgba(0,199,199,0)}100%{box-shadow:0 0 0 0 rgba(0,199,199,0)}}
.vehicle-wrap{position:relative;display:flex;flex-direction:column;align-items:center;gap:2px;transform:translateZ(0)}
.vehicle-halo{position:absolute;left:50%;top:50%;width:28px;height:28px;margin:-14px 0 0 -14px;border-radius:999px;background:rgba(0,184,148,.18);animation:pulse 1.7s ease-in-out infinite}
.vehicle-svg{position:relative;display:block;filter:drop-shadow(0 8px 10px rgba(0,0,0,.38))}
.pickup-pin{display:flex;align-items:center;gap:4px}
.pickup-pin-dot{width:10px;height:10px;background:#22c55e;border-radius:50%;border:2px solid #16a34a;flex-shrink:0}
.pickup-pin-label{background:rgba(10,12,14,.9);color:#86efac;font-family:-apple-system,sans-serif;font-size:10px;font-weight:700;padding:2px 6px;border-radius:4px;letter-spacing:.3px;white-space:nowrap}
.dest-pin{display:flex;align-items:center;gap:4px}
.dest-pin-dot{width:10px;height:10px;background:#f59e0b;border-radius:50%;border:2px solid #d97706;flex-shrink:0}
.dest-pin-label{background:rgba(10,12,14,.9);color:#fcd34d;font-family:-apple-system,sans-serif;font-size:10px;font-weight:700;padding:2px 6px;border-radius:4px;letter-spacing:.3px;white-space:nowrap}
.you-label{position:relative;background:rgba(7,19,17,.94);color:#b8fff0;font-family:-apple-system,sans-serif;font-size:10px;font-weight:800;padding:3px 7px;border-radius:7px;white-space:nowrap;border:1px solid rgba(0,184,148,.24);box-shadow:0 4px 10px rgba(0,0,0,.24)}
</style>
</head>
<body>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
var CFG=${config};
var map=L.map('map',{zoomControl:false,attributionControl:false});
L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',{maxZoom:19,subdomains:['a','b','c','d']}).addTo(map);
var driverMarker=null,pickupMarker=null,destMarker=null,routeLine=null;

var VEHICLE_ICONS={'moto-standard':'<svg class="vehicle-svg" xmlns="http://www.w3.org/2000/svg" width="26" height="58" viewBox="0 0 26 58"><defs><linearGradient id="dmsB" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#0f172a"/><stop offset="52%" stop-color="#00B894"/><stop offset="100%" stop-color="#111827"/></linearGradient><radialGradient id="dmsW" cx="35%" cy="30%" r="70%"><stop offset="0%" stop-color="#56606d"/><stop offset="100%" stop-color="#05070a"/></radialGradient></defs><ellipse cx="13" cy="54" rx="10" ry="3.5" fill="#000" opacity=".24"/><ellipse cx="13" cy="8" rx="7.5" ry="6.5" fill="url(#dmsW)"/><ellipse cx="13" cy="49" rx="7.5" ry="6.5" fill="url(#dmsW)"/><path d="M9 15q-2 4-2 10l1 8q1 4 3 5h4q3-1 3-5l1-8q0-6-2-10z" fill="url(#dmsB)"/><ellipse cx="13" cy="21" rx="5" ry="6.5" fill="#172033"/><path d="M11 37q2 2.5 4 0v8q-2 2-4 0z" fill="#070b12"/><rect x="5" y="16" width="16" height="4" rx="2" fill="#00B894"/><ellipse cx="13" cy="12" rx="3.5" ry="2" fill="#fff7c2"/><rect x="10" y="51" width="6" height="2" rx="1" fill="#ff3b30"/></svg>','car-standard':'<svg class="vehicle-svg" xmlns="http://www.w3.org/2000/svg" width="42" height="74" viewBox="0 0 42 74"><defs><linearGradient id="dcsB" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#F2F5F8"/><stop offset="45%" stop-color="#E0E4EC"/><stop offset="100%" stop-color="#C8CDD8"/></linearGradient><linearGradient id="dcsG" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#405a74"/><stop offset="100%" stop-color="#0b1622"/></linearGradient><radialGradient id="dcsW" cx="35%" cy="30%" r="70%"><stop offset="0%" stop-color="#6c7480"/><stop offset="100%" stop-color="#07090d"/></radialGradient></defs><ellipse cx="21" cy="68" rx="18" ry="5" fill="#000" opacity=".26"/><rect x="1" y="7" width="8" height="14" rx="4" fill="url(#dcsW)"/><rect x="33" y="7" width="8" height="14" rx="4" fill="url(#dcsW)"/><rect x="1" y="52" width="8" height="14" rx="4" fill="url(#dcsW)"/><rect x="33" y="52" width="8" height="14" rx="4" fill="url(#dcsW)"/><path d="M8 7Q21 2 34 7v55Q21 70 8 62z" fill="url(#dcsB)"/><path d="M10 7Q21 3 32 7v12Q21 9 10 11z" fill="#FFFFFF" opacity=".7"/><rect x="11" y="14" width="20" height="13" rx="4" fill="url(#dcsG)"/><rect x="9" y="29" width="5" height="14" rx="2.5" fill="#9098A8" opacity=".8"/><rect x="28" y="29" width="5" height="14" rx="2.5" fill="#9098A8" opacity=".8"/><rect x="13" y="28" width="16" height="18" rx="4" fill="#C8CDD8"/><rect x="11" y="46" width="20" height="12" rx="4" fill="url(#dcsG)"/><rect x="10" y="4" width="7" height="3" rx="1.5" fill="#FFFDE7"/><rect x="25" y="4" width="7" height="3" rx="1.5" fill="#FFFDE7"/><rect x="10" y="64" width="7" height="3" rx="1.5" fill="#ff3b30"/><rect x="25" y="64" width="7" height="3" rx="1.5" fill="#ff3b30"/></svg>','car-comfort':'<svg class="vehicle-svg" xmlns="http://www.w3.org/2000/svg" width="42" height="74" viewBox="0 0 42 74"><defs><linearGradient id="dccB" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#4A5068"/><stop offset="45%" stop-color="#22242E"/><stop offset="100%" stop-color="#0C0E18"/></linearGradient><linearGradient id="dccG" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#405a74"/><stop offset="100%" stop-color="#0b1622"/></linearGradient><radialGradient id="dccW" cx="35%" cy="30%" r="70%"><stop offset="0%" stop-color="#6c7480"/><stop offset="100%" stop-color="#07090d"/></radialGradient></defs><ellipse cx="21" cy="68" rx="18" ry="5" fill="#000" opacity=".26"/><rect x="1" y="7" width="8" height="14" rx="4" fill="url(#dccW)"/><rect x="33" y="7" width="8" height="14" rx="4" fill="url(#dccW)"/><rect x="1" y="52" width="8" height="14" rx="4" fill="url(#dccW)"/><rect x="33" y="52" width="8" height="14" rx="4" fill="url(#dccW)"/><path d="M8 7Q21 2 34 7v55Q21 70 8 62z" fill="url(#dccB)"/><path d="M10 7Q21 3 32 7v12Q21 9 10 11z" fill="#7080C8" opacity=".4"/><rect x="11" y="14" width="20" height="13" rx="4" fill="url(#dccG)"/><rect x="9" y="29" width="5" height="14" rx="2.5" fill="#141620" opacity=".9"/><rect x="28" y="29" width="5" height="14" rx="2.5" fill="#141620" opacity=".9"/><rect x="13" y="28" width="16" height="18" rx="4" fill="#1A1E2C"/><rect x="11" y="46" width="20" height="12" rx="4" fill="url(#dccG)"/><rect x="10" y="4" width="7" height="3" rx="1.5" fill="#FFFDE7"/><rect x="25" y="4" width="7" height="3" rx="1.5" fill="#FFFDE7"/><rect x="10" y="64" width="7" height="3" rx="1.5" fill="#ff3b30"/><rect x="25" y="64" width="7" height="3" rx="1.5" fill="#ff3b30"/></svg>','car-xl':'<svg class="vehicle-svg" xmlns="http://www.w3.org/2000/svg" width="46" height="74" viewBox="0 0 46 74"><defs><linearGradient id="dxlB" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#F8F7F4"/><stop offset="45%" stop-color="#E6E4DE"/><stop offset="100%" stop-color="#CCCAC4"/></linearGradient><linearGradient id="dxlG" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#405a74"/><stop offset="100%" stop-color="#0b1622"/></linearGradient><radialGradient id="dxlW" cx="35%" cy="30%" r="70%"><stop offset="0%" stop-color="#6c7480"/><stop offset="100%" stop-color="#07090d"/></radialGradient></defs><ellipse cx="23" cy="68" rx="20" ry="5" fill="#000" opacity=".28"/><rect x="0" y="7" width="8" height="14" rx="4" fill="url(#dxlW)"/><rect x="38" y="7" width="8" height="14" rx="4" fill="url(#dxlW)"/><rect x="0" y="52" width="8" height="14" rx="4" fill="url(#dxlW)"/><rect x="38" y="52" width="8" height="14" rx="4" fill="url(#dxlW)"/><path d="M8 7Q23 2 38 7v55Q23 70 8 62z" fill="url(#dxlB)"/><path d="M10 7Q23 3 36 7v12Q23 9 10 11z" fill="#F0C860" opacity=".55"/><rect x="11" y="14" width="24" height="13" rx="4" fill="url(#dxlG)"/><rect x="9" y="29" width="5" height="14" rx="2.5" fill="#9A9890" opacity=".85"/><rect x="32" y="29" width="5" height="14" rx="2.5" fill="#9A9890" opacity=".85"/><rect x="13" y="28" width="20" height="18" rx="4" fill="#C8C6C0"/><rect x="11" y="46" width="24" height="12" rx="4" fill="url(#dxlG)"/><rect x="8" y="16" width="2" height="38" rx="1" fill="#94A3B8" opacity=".7"/><rect x="36" y="16" width="2" height="38" rx="1" fill="#94A3B8" opacity=".7"/><rect x="11" y="4" width="7" height="3" rx="1.5" fill="#FFFDE7"/><rect x="28" y="4" width="7" height="3" rx="1.5" fill="#FFFDE7"/><rect x="11" y="64" width="7" height="3" rx="1.5" fill="#ff3b30"/><rect x="28" y="64" width="7" height="3" rx="1.5" fill="#ff3b30"/></svg>'};
var VEHICLE_SIZES={'moto-standard':[78,88],'car-standard':[86,92],'car-comfort':[86,92],'car-xl':[92,88]};
var VEHICLE_ANCHORS={'moto-standard':[39,38],'car-standard':[43,42],'car-comfort':[43,42],'car-xl':[46,38]};
function getTier(){var t=(CFG.vehicleTier||'').toUpperCase().replace(/-/g,'_');if(t.indexOf('MOTO')>=0)return 'moto-standard';if(t==='CAR_XL')return 'car-xl';if(t==='CAR_COMFORT')return 'car-comfort';if(t==='CAR_STANDARD')return 'car-standard';return 'car-standard'}
function driverIcon(){var tier=getTier();return L.divIcon({html:'<div class="vehicle-wrap"><span class="vehicle-halo"></span>'+VEHICLE_ICONS[tier]+'<span class="you-label">Vous</span></div>',iconSize:VEHICLE_SIZES[tier],iconAnchor:VEHICLE_ANCHORS[tier],className:''})}
function pickupIcon(){return L.divIcon({html:'<div class="pickup-pin"><div class="pickup-pin-dot"></div><div class="pickup-pin-label">Prise en charge</div></div>',iconSize:[110,18],iconAnchor:[5,9],className:''})}
function destIcon(){return L.divIcon({html:'<div class="dest-pin"><div class="dest-pin-dot"></div><div class="dest-pin-label">Destination</div></div>',iconSize:[90,18],iconAnchor:[5,9],className:''})}

function drawFallbackLine(lat1,lng1,lat2,lng2){
  if(routeLine){map.removeLayer(routeLine)}
  routeLine=L.polyline([[lat1,lng1],[lat2,lng2]],{color:'#00B894',weight:3,opacity:.55,dashArray:'9 6'}).addTo(map);
}

function fetchOsrmRoute(lat1,lng1,lat2,lng2){
  var url='https://router.project-osrm.org/route/v1/driving/'+lng1+','+lat1+';'+lng2+','+lat2+'?geometries=geojson&overview=full';
  fetch(url,{signal:AbortSignal.timeout(6000)})
    .then(function(r){return r.json()})
    .then(function(data){
      if(data.routes&&data.routes[0]&&data.routes[0].geometry&&data.routes[0].geometry.coordinates){
        var coords=data.routes[0].geometry.coordinates.map(function(c){return[c[1],c[0]]});
        if(routeLine){map.removeLayer(routeLine)}
        routeLine=L.polyline(coords,{color:'#00B894',weight:4,opacity:.88}).addTo(map);
      }else{drawFallbackLine(lat1,lng1,lat2,lng2)}
    })
    .catch(function(){drawFallbackLine(lat1,lng1,lat2,lng2)});
}

function initMap(cfg){
  var bounds=[];
  if(cfg.pickupLat&&cfg.pickupLng){pickupMarker=L.marker([cfg.pickupLat,cfg.pickupLng],{icon:pickupIcon()}).addTo(map);bounds.push([cfg.pickupLat,cfg.pickupLng])}
  if(cfg.destLat&&cfg.destLng){destMarker=L.marker([cfg.destLat,cfg.destLng],{icon:destIcon()}).addTo(map);bounds.push([cfg.destLat,cfg.destLng])}
  if(cfg.pickupLat&&cfg.pickupLng&&cfg.destLat&&cfg.destLng){
    fetchOsrmRoute(cfg.pickupLat,cfg.pickupLng,cfg.destLat,cfg.destLng);
  }
  if(cfg.driverLat&&cfg.driverLng){driverMarker=L.marker([cfg.driverLat,cfg.driverLng],{icon:driverIcon()}).addTo(map);bounds.push([cfg.driverLat,cfg.driverLng])}
  if(bounds.length){map.fitBounds(bounds,{padding:[44,44]})}else{map.setView([12.3647,-1.5332],13)}
}

function updateDriver(lat,lng){
  if(!driverMarker){driverMarker=L.marker([lat,lng],{icon:driverIcon()}).addTo(map)}
  else{driverMarker.setLatLng([lat,lng])}
  map.panTo([lat,lng],{animate:true,duration:.55});
}

function onMsg(e){try{var m=JSON.parse(e.data);if(m.type==='UPDATE_DRIVER'&&m.lat&&m.lng){updateDriver(m.lat,m.lng)}}catch(x){}}
document.addEventListener('message',onMsg);
window.addEventListener('message',onMsg);

initMap(CFG);
</script>
</body>
</html>`;
}

export function TripMapView({
  pickupLat,
  pickupLng,
  destLat,
  destLng,
  driverLat,
  driverLng,
  vehicleTier,
  style,
}: TripMapViewProps) {
  const theme = useOrbiTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const webRef = useRef<WebView>(null);
  const htmlRef = useRef<string>(
    buildMapHtml({
      pickupLat: pickupLat ?? null,
      pickupLng: pickupLng ?? null,
      destLat: destLat ?? null,
      destLng: destLng ?? null,
      driverLat: driverLat ?? null,
      driverLng: driverLng ?? null,
      vehicleTier: vehicleTier ?? null,
    }),
  );

  useEffect(() => {
    if (driverLat && driverLng && webRef.current) {
      webRef.current.postMessage(
        JSON.stringify({ type: 'UPDATE_DRIVER', lat: driverLat, lng: driverLng }),
      );
    }
  }, [driverLat, driverLng]);

  if (Platform.OS === 'web') {
    const hasRoute = Number.isFinite(pickupLat) && Number.isFinite(destLat);
    const hasDriver = Number.isFinite(driverLat) && Number.isFinite(driverLng);

    return (
      <View style={[styles.container, styles.webFallback, style]}>
        <View style={styles.routeLine} />
        <View style={[styles.routeNode, styles.pickupNode]} />
        <View style={[styles.routeNode, styles.destinationNode]} />
        {hasDriver ? (
          <View style={styles.driverMarker}>
            <Text style={styles.driverMarkerText}>V</Text>
          </View>
        ) : null}
        <View style={styles.statusPanel}>
          <Text style={styles.eyebrow}>Course active</Text>
          <Text style={styles.title}>{hasRoute ? 'Trajet client en cours' : 'Trajet en attente'}</Text>
          <Text style={styles.meta} numberOfLines={2}>
            Suivi precis et navigation complete disponibles sur mobile natif.
          </Text>
        </View>
      </View>
    );
  }

  return (
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
          enqueueDriverMapError(
            new Error(event.nativeEvent?.description ?? 'Driver trip map WebView error'),
            {
              surface: 'driver-trip-map',
              code: event.nativeEvent?.code ?? null,
            },
          );
        }}
        onHttpError={(event: {
          nativeEvent?: { statusCode?: number; description?: string; url?: string };
        }) => {
          enqueueDriverMapError(
            new Error(event.nativeEvent?.description ?? 'Driver trip map HTTP error'),
            {
              surface: 'driver-trip-map',
              statusCode: event.nativeEvent?.statusCode ?? null,
              url: event.nativeEvent?.url ?? null,
            },
          );
        }}
        allowsInlineMediaPlayback
      />
    </View>
  );
}

const makeStyles = (theme: OrbiTheme) => StyleSheet.create({
  container: {
    overflow: 'hidden',
    borderRadius: 14,
  },
  webFallback: {
    minHeight: 180,
    backgroundColor: '#eaf2ef',
  },
  routeLine: {
    position: 'absolute',
    left: '22%',
    right: '22%',
    top: '44%',
    height: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(0,184,148,0.74)',
    transform: [{ rotate: '-18deg' }],
  },
  routeNode: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 3,
    borderColor: '#ffffff',
  },
  pickupNode: {
    left: '23%',
    top: '54%',
    backgroundColor: '#22c55e',
  },
  destinationNode: {
    right: '24%',
    top: '32%',
    backgroundColor: '#f59e0b',
  },
  driverMarker: {
    position: 'absolute',
    left: '44%',
    top: '41%',
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#071311',
    borderWidth: 2,
    borderColor: theme.colors.teal,
  },
  driverMarkerText: {
    color: '#b8fff0',
    fontSize: 12,
    fontWeight: '900',
  },
  statusPanel: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    gap: 3,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
  },
  eyebrow: {
    color: theme.colors.teal,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  title: {
    color: '#071311',
    fontSize: 15,
    fontWeight: '900',
  },
  meta: {
    color: theme.colors.textMuted,
    fontSize: 12,
    lineHeight: 16,
  },
  webview: {
    flex: 1,
    backgroundColor: '#eef3f1',
  },
});
