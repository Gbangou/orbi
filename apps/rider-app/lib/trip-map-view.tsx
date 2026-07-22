import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import {
  buildTripRouteScript,
  formatTripRouteDistance,
  formatTripRouteDuration,
  localMapWebViewOriginWhitelist,
  serializeHtmlScriptJson,
  shouldAllowLocalMapWebViewRequest,
  type OrbiTheme,
  type RouteInfoMessage,
} from '@orbi/ui';
import { ErrorBoundary, useOrbiTheme } from '@orbi/ui/native';
import { enqueueRiderMapError } from './map-error-reporting';
import {
  hasMapCoordinatePair,
  normalizeMapCoordinatePair,
  parseMapCoordinateSelectionMessage,
} from './map-coordinate';

const TypedWebView = WebView as any;
const TRIP_ROUTE_SCRIPT = buildTripRouteScript({ routeColor: '#00B894' });

export interface TripMapViewProps {
  pickupLat: number | null | undefined;
  pickupLng: number | null | undefined;
  destLat: number | null | undefined;
  destLng: number | null | undefined;
  driverLat: number | null | undefined;
  driverLng: number | null | undefined;
  driverVehicleType?: string | null | undefined;
  driverVehicleTier?: string | null | undefined;
  selectable?: boolean;
  onSelectCoordinate?: (coordinates: { latitude: number; longitude: number }) => void;
  style?: object;
}

function resolveFallbackVehicleKind(
  vehicleType?: string | null,
  vehicleTier?: string | null,
): 'moto' | 'car' {
  const type = (vehicleType ?? '').toUpperCase();
  const tier = (vehicleTier ?? '').toUpperCase();
  return type.includes('MOTO') || tier.includes('MOTO') ? 'moto' : 'car';
}

function FallbackVehicleGlyph({ kind }: { kind: 'moto' | 'car' }) {
  if (kind === 'moto') {
    return (
      <View style={fallbackVehicleStyles.moto}>
        <View style={[fallbackVehicleStyles.motoWheel, fallbackVehicleStyles.motoWheelFront]} />
        <View style={fallbackVehicleStyles.motoBody} />
        <View style={[fallbackVehicleStyles.motoWheel, fallbackVehicleStyles.motoWheelRear]} />
      </View>
    );
  }

  return (
    <View style={fallbackVehicleStyles.car}>
      <View style={fallbackVehicleStyles.carBody} />
      <View style={fallbackVehicleStyles.carCabin} />
      <View style={[fallbackVehicleStyles.carWheel, fallbackVehicleStyles.carWheelLeft]} />
      <View style={[fallbackVehicleStyles.carWheel, fallbackVehicleStyles.carWheelRight]} />
    </View>
  );
}

function buildMapHtml(cfg: {
  pickupLat: number | null;
  pickupLng: number | null;
  destLat: number | null;
  destLng: number | null;
  driverLat: number | null;
  driverLng: number | null;
  driverVehicleType: string | null;
  driverVehicleTier: string | null;
  selectable: boolean;
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
.vehicle-body{position:relative;display:block;transform:rotate(var(--bearing,0deg));transform-origin:center center}
.vehicle-svg{position:relative;display:block;filter:drop-shadow(0 8px 10px rgba(0,0,0,.38))}
.driver-label{position:relative;background:rgba(7,19,17,.94);color:#b8fff0;font-family:-apple-system,sans-serif;font-size:10px;font-weight:800;padding:3px 7px;border-radius:7px;letter-spacing:.2px;white-space:nowrap;border:1px solid rgba(0,184,148,.24);box-shadow:0 4px 10px rgba(0,0,0,.24)}
.pickup-pin{display:flex;align-items:center;gap:4px}
.pickup-pin-dot{width:10px;height:10px;background:#22c55e;border-radius:50%;border:2px solid #16a34a;flex-shrink:0}
.pickup-pin-label{background:rgba(7,19,17,.92);color:#b8fff0;font-family:-apple-system,sans-serif;font-size:10px;font-weight:800;padding:3px 7px;border-radius:6px;letter-spacing:.2px;white-space:nowrap}
.dest-pin{display:flex;align-items:center;gap:4px}
.dest-pin-dot{width:10px;height:10px;background:#f59e0b;border-radius:50%;border:2px solid #d97706;flex-shrink:0}
.dest-pin-label{background:rgba(7,19,17,.92);color:#ffe39a;font-family:-apple-system,sans-serif;font-size:10px;font-weight:800;padding:3px 7px;border-radius:6px;letter-spacing:.2px;white-space:nowrap}
</style>
</head>
<body>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
var CFG=${config};
var map=L.map('map',{zoomControl:false,attributionControl:false});
L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',{maxZoom:19,subdomains:['a','b','c','d']}).addTo(map);
var driverMarker=null,pickupMarker=null,destMarker=null;

var VEHICLE_ICONS={'moto-standard':'<svg class="vehicle-svg" xmlns="http://www.w3.org/2000/svg" width="26" height="58" viewBox="0 0 26 58"><defs><linearGradient id="msB" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#0f172a"/><stop offset="52%" stop-color="#00B894"/><stop offset="100%" stop-color="#111827"/></linearGradient><radialGradient id="msW" cx="35%" cy="30%" r="70%"><stop offset="0%" stop-color="#56606d"/><stop offset="100%" stop-color="#05070a"/></radialGradient></defs><ellipse cx="13" cy="54" rx="10" ry="3.5" fill="#000" opacity=".24"/><ellipse cx="13" cy="8" rx="7.5" ry="6.5" fill="url(#msW)"/><ellipse cx="13" cy="49" rx="7.5" ry="6.5" fill="url(#msW)"/><path d="M9 15q-2 4-2 10l1 8q1 4 3 5h4q3-1 3-5l1-8q0-6-2-10z" fill="url(#msB)"/><ellipse cx="13" cy="21" rx="5" ry="6.5" fill="#172033"/><path d="M11 37q2 2.5 4 0v8q-2 2-4 0z" fill="#070b12"/><rect x="5" y="16" width="16" height="4" rx="2" fill="#00B894"/><ellipse cx="13" cy="12" rx="3.5" ry="2" fill="#fff7c2"/><rect x="10" y="51" width="6" height="2" rx="1" fill="#ff3b30"/></svg>','car-standard':'<svg class="vehicle-svg" xmlns="http://www.w3.org/2000/svg" width="42" height="74" viewBox="0 0 42 74"><defs><linearGradient id="csB" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#F2F5F8"/><stop offset="45%" stop-color="#E0E4EC"/><stop offset="100%" stop-color="#C8CDD8"/></linearGradient><linearGradient id="csG" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#405a74"/><stop offset="100%" stop-color="#0b1622"/></linearGradient><radialGradient id="csW" cx="35%" cy="30%" r="70%"><stop offset="0%" stop-color="#6c7480"/><stop offset="100%" stop-color="#07090d"/></radialGradient></defs><ellipse cx="21" cy="68" rx="18" ry="5" fill="#000" opacity=".26"/><rect x="1" y="7" width="8" height="14" rx="4" fill="url(#csW)"/><rect x="33" y="7" width="8" height="14" rx="4" fill="url(#csW)"/><rect x="1" y="52" width="8" height="14" rx="4" fill="url(#csW)"/><rect x="33" y="52" width="8" height="14" rx="4" fill="url(#csW)"/><path d="M8 7Q21 2 34 7v55Q21 70 8 62z" fill="url(#csB)"/><path d="M10 7Q21 3 32 7v12Q21 9 10 11z" fill="#FFFFFF" opacity=".7"/><rect x="11" y="14" width="20" height="13" rx="4" fill="url(#csG)"/><rect x="9" y="29" width="5" height="14" rx="2.5" fill="#9098A8" opacity=".8"/><rect x="28" y="29" width="5" height="14" rx="2.5" fill="#9098A8" opacity=".8"/><rect x="13" y="28" width="16" height="18" rx="4" fill="#C8CDD8"/><rect x="11" y="46" width="20" height="12" rx="4" fill="url(#csG)"/><rect x="10" y="4" width="7" height="3" rx="1.5" fill="#FFFDE7"/><rect x="25" y="4" width="7" height="3" rx="1.5" fill="#FFFDE7"/><rect x="10" y="64" width="7" height="3" rx="1.5" fill="#ff3b30"/><rect x="25" y="64" width="7" height="3" rx="1.5" fill="#ff3b30"/></svg>','car-comfort':'<svg class="vehicle-svg" xmlns="http://www.w3.org/2000/svg" width="42" height="74" viewBox="0 0 42 74"><defs><linearGradient id="ccB" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#4A5068"/><stop offset="45%" stop-color="#22242E"/><stop offset="100%" stop-color="#0C0E18"/></linearGradient><linearGradient id="ccG" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#405a74"/><stop offset="100%" stop-color="#0b1622"/></linearGradient><radialGradient id="ccW" cx="35%" cy="30%" r="70%"><stop offset="0%" stop-color="#6c7480"/><stop offset="100%" stop-color="#07090d"/></radialGradient></defs><ellipse cx="21" cy="68" rx="18" ry="5" fill="#000" opacity=".26"/><rect x="1" y="7" width="8" height="14" rx="4" fill="url(#ccW)"/><rect x="33" y="7" width="8" height="14" rx="4" fill="url(#ccW)"/><rect x="1" y="52" width="8" height="14" rx="4" fill="url(#ccW)"/><rect x="33" y="52" width="8" height="14" rx="4" fill="url(#ccW)"/><path d="M8 7Q21 2 34 7v55Q21 70 8 62z" fill="url(#ccB)"/><path d="M10 7Q21 3 32 7v12Q21 9 10 11z" fill="#7080C8" opacity=".4"/><rect x="11" y="14" width="20" height="13" rx="4" fill="url(#ccG)"/><rect x="9" y="29" width="5" height="14" rx="2.5" fill="#141620" opacity=".9"/><rect x="28" y="29" width="5" height="14" rx="2.5" fill="#141620" opacity=".9"/><rect x="13" y="28" width="16" height="18" rx="4" fill="#1A1E2C"/><rect x="11" y="46" width="20" height="12" rx="4" fill="url(#ccG)"/><rect x="10" y="4" width="7" height="3" rx="1.5" fill="#FFFDE7"/><rect x="25" y="4" width="7" height="3" rx="1.5" fill="#FFFDE7"/><rect x="10" y="64" width="7" height="3" rx="1.5" fill="#ff3b30"/><rect x="25" y="64" width="7" height="3" rx="1.5" fill="#ff3b30"/></svg>','car-xl':'<svg class="vehicle-svg" xmlns="http://www.w3.org/2000/svg" width="46" height="74" viewBox="0 0 46 74"><defs><linearGradient id="xlB" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#F8F7F4"/><stop offset="45%" stop-color="#E6E4DE"/><stop offset="100%" stop-color="#CCCAC4"/></linearGradient><linearGradient id="xlG" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#405a74"/><stop offset="100%" stop-color="#0b1622"/></linearGradient><radialGradient id="xlW" cx="35%" cy="30%" r="70%"><stop offset="0%" stop-color="#6c7480"/><stop offset="100%" stop-color="#07090d"/></radialGradient></defs><ellipse cx="23" cy="68" rx="20" ry="5" fill="#000" opacity=".28"/><rect x="0" y="7" width="8" height="14" rx="4" fill="url(#xlW)"/><rect x="38" y="7" width="8" height="14" rx="4" fill="url(#xlW)"/><rect x="0" y="52" width="8" height="14" rx="4" fill="url(#xlW)"/><rect x="38" y="52" width="8" height="14" rx="4" fill="url(#xlW)"/><path d="M8 7Q23 2 38 7v55Q23 70 8 62z" fill="url(#xlB)"/><path d="M10 7Q23 3 36 7v12Q23 9 10 11z" fill="#F0C860" opacity=".55"/><rect x="11" y="14" width="24" height="13" rx="4" fill="url(#xlG)"/><rect x="9" y="29" width="5" height="14" rx="2.5" fill="#9A9890" opacity=".85"/><rect x="32" y="29" width="5" height="14" rx="2.5" fill="#9A9890" opacity=".85"/><rect x="13" y="28" width="20" height="18" rx="4" fill="#C8C6C0"/><rect x="11" y="46" width="24" height="12" rx="4" fill="url(#xlG)"/><rect x="8" y="16" width="2" height="38" rx="1" fill="#94A3B8" opacity=".7"/><rect x="36" y="16" width="2" height="38" rx="1" fill="#94A3B8" opacity=".7"/><rect x="11" y="4" width="7" height="3" rx="1.5" fill="#FFFDE7"/><rect x="28" y="4" width="7" height="3" rx="1.5" fill="#FFFDE7"/><rect x="11" y="64" width="7" height="3" rx="1.5" fill="#ff3b30"/><rect x="28" y="64" width="7" height="3" rx="1.5" fill="#ff3b30"/></svg>'};
var VEHICLE_SIZES={'moto-standard':[78,88],'car-standard':[86,92],'car-comfort':[86,92],'car-xl':[92,88]};
var VEHICLE_ANCHORS={'moto-standard':[39,38],'car-standard':[43,42],'car-comfort':[43,42],'car-xl':[46,38]};
function getTier(){var t=(CFG.driverVehicleTier||'').toUpperCase().replace(/-/g,'_');if(t.indexOf('MOTO')>=0)return 'moto-standard';if(t==='CAR_XL')return 'car-xl';if(t==='CAR_COMFORT')return 'car-comfort';if(t==='CAR_STANDARD')return 'car-standard';var v=(CFG.driverVehicleType||'').toUpperCase();return v.indexOf('MOTO')>=0?'moto-standard':'car-standard'}
function bearing(lat1,lng1,lat2,lng2){var y=Math.sin((lng2-lng1)*Math.PI/180)*Math.cos(lat2*Math.PI/180);var x=Math.cos(lat1*Math.PI/180)*Math.sin(lat2*Math.PI/180)-Math.sin(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.cos((lng2-lng1)*Math.PI/180);return((Math.atan2(y,x)*180/Math.PI)+360)%360}
function driverBearing(lat,lng){if(CFG.pickupLat!==null&&CFG.pickupLng!==null)return bearing(lat,lng,CFG.pickupLat,CFG.pickupLng);if(CFG.destLat!==null&&CFG.destLng!==null)return bearing(lat,lng,CFG.destLat,CFG.destLng);return 0}
function driverIcon(lat,lng){var tier=getTier();var angle=driverBearing(lat,lng).toFixed(0);return L.divIcon({html:'<div class="vehicle-wrap" style="--bearing:'+angle+'deg"><span class="vehicle-halo"></span><span class="vehicle-body">'+VEHICLE_ICONS[tier]+'</span><span class="driver-label">Chauffeur</span></div>',iconSize:VEHICLE_SIZES[tier],iconAnchor:VEHICLE_ANCHORS[tier],className:''})}
function pickupIcon(){return L.divIcon({html:'<div class="pickup-pin"><div class="pickup-pin-dot"></div><div class="pickup-pin-label">Depart</div></div>',iconSize:[72,18],iconAnchor:[5,9],className:''})}
function destIcon(){return L.divIcon({html:'<div class="dest-pin"><div class="dest-pin-dot"></div><div class="dest-pin-label">Arrivee</div></div>',iconSize:[72,18],iconAnchor:[5,9],className:''})}

${TRIP_ROUTE_SCRIPT}

function initMap(cfg){
  var bounds=[];
  if(cfg.pickupLat!==null&&cfg.pickupLng!==null){pickupMarker=L.marker([cfg.pickupLat,cfg.pickupLng],{icon:pickupIcon()}).addTo(map);bounds.push([cfg.pickupLat,cfg.pickupLng])}
  if(cfg.destLat!==null&&cfg.destLng!==null){destMarker=L.marker([cfg.destLat,cfg.destLng],{icon:destIcon()}).addTo(map);bounds.push([cfg.destLat,cfg.destLng])}
  if(cfg.pickupLat!==null&&cfg.pickupLng!==null&&cfg.destLat!==null&&cfg.destLng!==null){
    __orbiFetchTripRoute(cfg.pickupLat,cfg.pickupLng,cfg.destLat,cfg.destLng);
  }
  if(cfg.driverLat!==null&&cfg.driverLng!==null){driverMarker=L.marker([cfg.driverLat,cfg.driverLng],{icon:driverIcon(cfg.driverLat,cfg.driverLng)}).addTo(map);bounds.push([cfg.driverLat,cfg.driverLng])}
  if(bounds.length){map.fitBounds(bounds,{padding:[44,44]})}else{map.setView([12.3647,-1.5332],13)}
}

function updateDriver(lat,lng){
  if(!driverMarker){driverMarker=L.marker([lat,lng],{icon:driverIcon(lat,lng)}).addTo(map)}
  else{driverMarker.setLatLng([lat,lng]);driverMarker.setIcon(driverIcon(lat,lng))}
  map.panTo([lat,lng],{animate:true,duration:.55});
}

function isCoord(v){return typeof v==='number'&&isFinite(v)}
function onMsg(e){try{var m=JSON.parse(e.data);if(m.type==='UPDATE_DRIVER'&&isCoord(m.lat)&&isCoord(m.lng)){updateDriver(m.lat,m.lng)}}catch(x){}}
document.addEventListener('message',onMsg);
window.addEventListener('message',onMsg);

if(CFG.selectable&&window.ReactNativeWebView){
  map.on('click',function(e){
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type:'MAP_COORDINATE_SELECTED',
      lat:e.latlng.lat,
      lng:e.latlng.lng
    }));
  });
}

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
  driverVehicleType,
  driverVehicleTier,
  selectable = false,
  onSelectCoordinate,
  style,
}: TripMapViewProps) {
  const theme = useOrbiTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const webRef = useRef<WebView>(null);
  const pickup = useMemo(
    () => normalizeMapCoordinatePair({ latitude: pickupLat, longitude: pickupLng }),
    [pickupLat, pickupLng],
  );
  const destination = useMemo(
    () => normalizeMapCoordinatePair({ latitude: destLat, longitude: destLng }),
    [destLat, destLng],
  );
  const driver = useMemo(
    () => normalizeMapCoordinatePair({ latitude: driverLat, longitude: driverLng }),
    [driverLat, driverLng],
  );
  const htmlRef = useRef<string>(
    buildMapHtml({
      pickupLat: pickup?.latitude ?? null,
      pickupLng: pickup?.longitude ?? null,
      destLat: destination?.latitude ?? null,
      destLng: destination?.longitude ?? null,
      driverLat: driver?.latitude ?? null,
      driverLng: driver?.longitude ?? null,
      driverVehicleType: driverVehicleType ?? null,
      driverVehicleTier: driverVehicleTier ?? null,
      selectable,
    }),
  );

  const [routeInfo, setRouteInfo] = useState<Omit<RouteInfoMessage, 'type'> | null>(null);
  const [routeUnavailableReason, setRouteUnavailableReason] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    if (driver && webRef.current) {
      webRef.current.postMessage(
        JSON.stringify({ type: 'UPDATE_DRIVER', lat: driver.latitude, lng: driver.longitude }),
      );
    }
  }, [driver]);

  const handleWebViewMessage = useCallback(
    (event: { nativeEvent?: { data?: string } }) => {
      if (!event.nativeEvent?.data) return;

      try {
        const message = JSON.parse(event.nativeEvent.data) as {
          type?: string;
          distanceMeters?: number;
          durationSeconds?: number;
          routeCount?: number;
          selectedIndex?: number;
        };

        if (message.type === 'ROUTE_INFO' && typeof message.distanceMeters === 'number') {
          setRouteUnavailableReason(null);
          setRouteInfo({
            distanceMeters: message.distanceMeters,
            durationSeconds: message.durationSeconds ?? 0,
            routeCount: message.routeCount ?? 1,
            selectedIndex: message.selectedIndex ?? 0,
          });
          return;
        }

        if (message.type === 'ROUTE_UNAVAILABLE') {
          setRouteInfo(null);
          setRouteUnavailableReason('Itineraire route non calcule');
          return;
        }

        if (onSelectCoordinate) {
          const coordinates = parseMapCoordinateSelectionMessage(event.nativeEvent.data);
          if (coordinates) {
            onSelectCoordinate(coordinates);
          }
        }
      } catch {
        // Ignore malformed messages from the embedded map.
      }
    },
    [onSelectCoordinate],
  );

  const cycleRoute = useCallback(() => {
    if (!routeInfo || routeInfo.routeCount <= 1) return;
    const nextIndex = (routeInfo.selectedIndex + 1) % routeInfo.routeCount;
    webRef.current?.postMessage(JSON.stringify({ type: 'SELECT_ROUTE', index: nextIndex }));
  }, [routeInfo]);

  function renderDegradedPanel() {
    const hasPickup = hasMapCoordinatePair({ latitude: pickupLat, longitude: pickupLng });
    const hasDestination = hasMapCoordinatePair({ latitude: destLat, longitude: destLng });
    const hasDriver = hasMapCoordinatePair({ latitude: driverLat, longitude: driverLng });
    const vehicleKind = resolveFallbackVehicleKind(driverVehicleType, driverVehicleTier);

    return (
      <View style={[styles.container, styles.webFallback, style]}>
        <View style={styles.mapGrid} />
        <View style={styles.routeLayer}>
          <View style={[styles.routeNode, styles.pickupNode]} />
          <View style={styles.routeLine} />
          <View style={[styles.routeNode, styles.destinationNode]} />
          {hasDriver ? (
            <View style={styles.driverMarker}>
              <FallbackVehicleGlyph kind={vehicleKind} />
            </View>
          ) : null}
        </View>
        <View style={styles.fallbackPanel}>
          <Text style={styles.fallbackEyebrow}>Carte web</Text>
          <Text style={styles.fallbackTitle}>
            {hasPickup && hasDestination ? 'Trajet pret' : 'Position en attente'}
          </Text>
          <Text style={styles.fallbackMeta} numberOfLines={2}>
            {hasDriver
              ? 'Chauffeur localise. Suivi precis disponible sur mobile.'
              : selectable
                ? 'Touchez la carte native mobile pour ajuster le point.'
                : 'Suivi carte complet disponible dans l app mobile.'}
          </Text>
        </View>
      </View>
    );
  }

  if (Platform.OS === 'web') {
    return renderDegradedPanel();
  }

  function renderRouteInfoPanel() {
    if (routeUnavailableReason) {
      return (
        <View style={[styles.routeInfoPanel, styles.routeWarningPanel]}>
          <View>
            <Text style={styles.routeWarningTitle}>{routeUnavailableReason}</Text>
            <Text style={styles.routeWarningText}>
              Orbi ne trace pas de raccourci imaginaire.
            </Text>
          </View>
        </View>
      );
    }

    if (!routeInfo) return null;
    return (
      <Pressable
        style={styles.routeInfoPanel}
        onPress={cycleRoute}
        disabled={routeInfo.routeCount <= 1}
        accessibilityLabel="rider-trip-route-info"
      >
        <Text style={styles.routeInfoDistance}>{formatTripRouteDistance(routeInfo.distanceMeters)}</Text>
        <View style={styles.routeInfoDivider} />
        <Text style={styles.routeInfoDuration}>{formatTripRouteDuration(routeInfo.durationSeconds)}</Text>
        {routeInfo.routeCount > 1 ? (
          <View style={styles.routeInfoAltBadge}>
            <Text style={styles.routeInfoAltText}>
              {routeInfo.selectedIndex + 1}/{routeInfo.routeCount}
            </Text>
          </View>
        ) : null}
      </Pressable>
    );
  }

  function renderMapSurface(fullscreen: boolean) {
    return (
      <ErrorBoundary
        fallback={renderDegradedPanel()}
        onError={(error) =>
          enqueueRiderMapError(error, { surface: 'trip-map', action: 'render-crash' })
        }
      >
        <View style={[styles.container, fullscreen ? styles.containerFullscreen : style]}>
          <TypedWebView
            ref={webRef}
            source={{ html: htmlRef.current }}
            scrollEnabled={false}
            style={styles.webview}
            javaScriptEnabled
            originWhitelist={localMapWebViewOriginWhitelist}
            onShouldStartLoadWithRequest={(request: { url: string }) =>
              shouldAllowLocalMapWebViewRequest(request.url)
            }
            onMessage={handleWebViewMessage}
            onError={(event: { nativeEvent?: { description?: string; code?: number } }) => {
              enqueueRiderMapError(
                new Error(event.nativeEvent?.description ?? 'Trip map WebView error'),
                {
                  surface: 'trip-map',
                  code: event.nativeEvent?.code ?? null,
                },
              );
            }}
            onHttpError={(event: { nativeEvent?: { statusCode?: number; description?: string; url?: string } }) => {
              enqueueRiderMapError(
                new Error(event.nativeEvent?.description ?? 'Trip map HTTP error'),
                {
                  surface: 'trip-map',
                  statusCode: event.nativeEvent?.statusCode ?? null,
                  url: event.nativeEvent?.url ?? null,
                },
              );
            }}
            allowsInlineMediaPlayback
          />
          {renderRouteInfoPanel()}
          {!selectable ? (
            <Pressable
              style={styles.expandButton}
              onPress={() => setIsExpanded(!fullscreen)}
              accessibilityLabel={fullscreen ? 'Réduire la carte' : 'Agrandir la carte'}
            >
              <Text style={styles.expandButtonLabel}>{fullscreen ? 'Réduire' : 'Agrandir'}</Text>
            </Pressable>
          ) : null}
        </View>
      </ErrorBoundary>
    );
  }

  return (
    <>
      {renderMapSurface(false)}
      <Modal visible={isExpanded} animationType="slide" onRequestClose={() => setIsExpanded(false)}>
        <View style={styles.fullscreenRoot}>{renderMapSurface(true)}</View>
      </Modal>
    </>
  );
}

const makeStyles = (theme: OrbiTheme) => StyleSheet.create({
  container: {
    overflow: 'hidden',
    borderRadius: 14,
  },
  containerFullscreen: {
    flex: 1,
    borderRadius: 0,
  },
  fullscreenRoot: {
    flex: 1,
    backgroundColor: '#eaf2ef',
  },
  routeInfoPanel: {
    position: 'absolute',
    left: 12,
    bottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    ...theme.shadows.card,
  },
  routeWarningPanel: {
    maxWidth: '86%',
    alignItems: 'flex-start',
    backgroundColor: '#fff7ed',
    borderColor: 'rgba(245,158,11,0.35)',
  },
  routeWarningTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: theme.colors.text,
  },
  routeWarningText: {
    marginTop: 2,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '600',
    color: theme.colors.textSoft,
  },
  routeInfoDistance: {
    fontSize: 13,
    fontWeight: '800',
    color: theme.colors.text,
  },
  routeInfoDivider: {
    width: 1,
    height: 12,
    backgroundColor: theme.colors.border,
  },
  routeInfoDuration: {
    fontSize: 13,
    fontWeight: '800',
    color: theme.colors.teal,
  },
  routeInfoAltBadge: {
    marginLeft: 2,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: theme.colors.accentLight,
  },
  routeInfoAltText: {
    fontSize: 10,
    fontWeight: '800',
    color: theme.colors.accentDark,
  },
  expandButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: 'rgba(7,19,17,0.82)',
  },
  expandButtonLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  webFallback: {
    minHeight: 180,
    backgroundColor: '#eaf2ef',
    borderWidth: 1,
    borderColor: 'rgba(13, 42, 37, 0.08)',
  },
  mapGrid: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#eaf2ef',
    opacity: 0.94,
  },
  routeLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeNode: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 3,
    borderColor: '#ffffff',
    shadowColor: '#071311',
    shadowOpacity: 0.14,
    shadowRadius: 8,
  },
  pickupNode: {
    left: '24%',
    top: '58%',
    backgroundColor: theme.colors.teal,
  },
  destinationNode: {
    right: '24%',
    top: '32%',
    backgroundColor: '#f59e0b',
  },
  routeLine: {
    width: '44%',
    height: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(0, 184, 148, 0.74)',
    transform: [{ rotate: '-22deg' }],
  },
  driverMarker: {
    position: 'absolute',
    right: '38%',
    top: '43%',
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#071311',
    borderWidth: 2,
    borderColor: theme.colors.teal,
  },
  fallbackPanel: {
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
    backgroundColor: '#eef3f1',
  },
});

const fallbackVehicleStyles = StyleSheet.create({
  moto: {
    width: 16,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  motoWheel: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#94a3b8',
  },
  motoWheelFront: {
    top: 0,
  },
  motoWheelRear: {
    bottom: 0,
  },
  motoBody: {
    width: 10,
    height: 15,
    borderRadius: 6,
    backgroundColor: '#00B894',
    borderWidth: 1,
    borderColor: '#071311',
  },
  car: {
    width: 18,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  carCabin: {
    width: 12,
    height: 8,
    borderRadius: 3,
    backgroundColor: '#405a74',
  },
  carBody: {
    width: 16,
    height: 20,
    borderRadius: 6,
    backgroundColor: '#e8eef6',
    borderWidth: 1,
    borderColor: '#94a3b8',
    position: 'absolute',
  },
  carWheel: {
    position: 'absolute',
    width: 4,
    height: 16,
    borderRadius: 2,
    backgroundColor: '#111827',
  },
  carWheelLeft: {
    left: 0,
  },
  carWheelRight: {
    right: 0,
  },
});
