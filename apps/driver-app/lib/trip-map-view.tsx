import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import {
  ORBI_MAP_VEHICLE_CSS,
  ORBI_MAP_VEHICLE_SCRIPT,
  buildTripRouteScript,
  formatTripRouteDistance,
  formatTripRouteDuration,
  localMapWebViewOriginWhitelist,
  serializeHtmlScriptJson,
  shouldAllowLocalMapWebViewRequest,
  type OrbiTheme,
  type RouteInfoMessage,
} from '@orbi/ui';
import { ErrorBoundary, useOrbiTheme, VehicleIllustration } from '@orbi/ui/native';
import { enqueueDriverMapError } from './map-error-reporting';
import { hasMapCoordinatePair, normalizeMapCoordinatePair } from './map-coordinate';

const TypedWebView = WebView as any;
const TRIP_ROUTE_SCRIPT = buildTripRouteScript({ routeColor: '#00B894' });

export interface TripMapViewProps {
  pickupLat: number | null | undefined;
  pickupLng: number | null | undefined;
  destLat: number | null | undefined;
  destLng: number | null | undefined;
  driverLat: number | null | undefined;
  driverLng: number | null | undefined;
  vehicleTier?: string | null | undefined;
  phase?: 'approach' | 'trip';
  style?: object;
}

function resolveFallbackVehicleKind(vehicleTier?: string | null): 'moto' | 'car' {
  return (vehicleTier ?? '').toUpperCase().includes('MOTO') ? 'moto' : 'car';
}

function FallbackVehicleGlyph({ kind }: { kind: 'moto' | 'car' }) {
  return (
    <VehicleIllustration
      tier={kind === 'moto' ? 'moto-standard' : 'car-standard'}
      width={44}
      height={34}
    />
  );
}

function buildMapHtml(cfg: {
  pickupLat: number | null;
  pickupLng: number | null;
  destLat: number | null;
  destLng: number | null;
  driverLat: number | null;
  driverLng: number | null;
  vehicleTier: string | null;
  phase: 'approach' | 'trip';
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
${ORBI_MAP_VEHICLE_CSS}
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
var driverMarker=null,pickupMarker=null,destMarker=null;

${ORBI_MAP_VEHICLE_SCRIPT}
function getTier(){var t=(CFG.vehicleTier||'').toUpperCase().replace(/-/g,'_');if(t.indexOf('MOTO')>=0)return 'moto-standard';if(t==='CAR_XL')return 'car-xl';if(t==='CAR_COMFORT')return 'car-comfort';if(t==='CAR_STANDARD')return 'car-standard';return 'car-standard'}
function bearing(lat1,lng1,lat2,lng2){var y=Math.sin((lng2-lng1)*Math.PI/180)*Math.cos(lat2*Math.PI/180);var x=Math.cos(lat1*Math.PI/180)*Math.sin(lat2*Math.PI/180)-Math.sin(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.cos((lng2-lng1)*Math.PI/180);return((Math.atan2(y,x)*180/Math.PI)+360)%360}
function driverBearing(lat,lng){if(CFG.pickupLat!==null&&CFG.pickupLng!==null)return bearing(lat,lng,CFG.pickupLat,CFG.pickupLng);if(CFG.destLat!==null&&CFG.destLng!==null)return bearing(lat,lng,CFG.destLat,CFG.destLng);return 0}
function driverIcon(lat,lng){var tier=getTier();var angle=driverBearing(lat,lng).toFixed(0);return L.divIcon({html:'<div class="vehicle-wrap" style="--bearing:'+angle+'deg"><span class="vehicle-halo"></span><span class="vehicle-body">'+VEHICLE_ICONS[tier]+'</span><span class="you-label">Vous</span></div>',iconSize:VEHICLE_SIZES[tier],iconAnchor:VEHICLE_ANCHORS[tier],className:''})}
function pickupIcon(){return L.divIcon({html:'<div class="pickup-pin"><div class="pickup-pin-dot"></div><div class="pickup-pin-label">Prise en charge</div></div>',iconSize:[110,18],iconAnchor:[5,9],className:''})}
function destIcon(){return L.divIcon({html:'<div class="dest-pin"><div class="dest-pin-dot"></div><div class="dest-pin-label">Destination</div></div>',iconSize:[90,18],iconAnchor:[5,9],className:''})}

${TRIP_ROUTE_SCRIPT}

function initMap(cfg){
  var bounds=[];
  if(cfg.pickupLat!==null&&cfg.pickupLng!==null){pickupMarker=L.marker([cfg.pickupLat,cfg.pickupLng],{icon:pickupIcon()}).addTo(map);bounds.push([cfg.pickupLat,cfg.pickupLng])}
  if(cfg.destLat!==null&&cfg.destLng!==null){destMarker=L.marker([cfg.destLat,cfg.destLng],{icon:destIcon()}).addTo(map);bounds.push([cfg.destLat,cfg.destLng])}
  var routeStartLat=cfg.pickupLat;
  var routeStartLng=cfg.pickupLng;
  if(cfg.phase==='trip'&&cfg.driverLat!==null&&cfg.driverLng!==null){
    routeStartLat=cfg.driverLat;
    routeStartLng=cfg.driverLng;
  }
  if(routeStartLat!==null&&routeStartLng!==null&&cfg.destLat!==null&&cfg.destLng!==null){
    __orbiFetchTripRoute(routeStartLat,routeStartLng,cfg.destLat,cfg.destLng);
  }
  if(cfg.driverLat!==null&&cfg.driverLng!==null){driverMarker=L.marker([cfg.driverLat,cfg.driverLng],{icon:driverIcon(cfg.driverLat,cfg.driverLng)}).addTo(map);bounds.push([cfg.driverLat,cfg.driverLng])}
  if(bounds.length){map.fitBounds(bounds,{padding:[58,58],maxZoom:16})}else{map.setView([12.3647,-1.5332],13)}
}

function updateDriver(lat,lng){
  if(!driverMarker){driverMarker=L.marker([lat,lng],{icon:driverIcon(lat,lng)}).addTo(map)}
  else{driverMarker.setLatLng([lat,lng]);driverMarker.setIcon(driverIcon(lat,lng))}
  var bounds=[];
  bounds.push([lat,lng]);
  if(CFG.destLat!==null&&CFG.destLng!==null){bounds.push([CFG.destLat,CFG.destLng])}
  if(CFG.pickupLat!==null&&CFG.pickupLng!==null){bounds.push([CFG.pickupLat,CFG.pickupLng])}
  if(bounds.length>1){map.fitBounds(bounds,{padding:[58,58],maxZoom:16})}
  else{map.panTo([lat,lng],{animate:true,duration:.55})}
}

function isCoord(v){return typeof v==='number'&&isFinite(v)}
function onMsg(e){try{var m=JSON.parse(e.data);if(m.type==='UPDATE_DRIVER'&&isCoord(m.lat)&&isCoord(m.lng)){updateDriver(m.lat,m.lng)}}catch(x){}}
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
  phase = 'trip',
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
      vehicleTier: vehicleTier ?? null,
      phase,
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

  const handleWebViewMessage = useCallback((event: { nativeEvent?: { data?: string } }) => {
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
      }
    } catch {
      // Ignore malformed messages from the embedded map.
    }
  }, []);

  const cycleRoute = useCallback(() => {
    if (!routeInfo || routeInfo.routeCount <= 1) return;
    const nextIndex = (routeInfo.selectedIndex + 1) % routeInfo.routeCount;
    webRef.current?.postMessage(JSON.stringify({ type: 'SELECT_ROUTE', index: nextIndex }));
  }, [routeInfo]);

  function renderDegradedPanel() {
    const hasRoute =
      hasMapCoordinatePair({ latitude: pickupLat, longitude: pickupLng }) &&
      hasMapCoordinatePair({ latitude: destLat, longitude: destLng });
    const hasDriver = hasMapCoordinatePair({ latitude: driverLat, longitude: driverLng });
    const vehicleKind = resolveFallbackVehicleKind(vehicleTier);

    return (
      <View style={[styles.container, styles.webFallback, style]}>
        <View style={styles.routeLine} />
        <View style={[styles.routeNode, styles.pickupNode]} />
        <View style={[styles.routeNode, styles.destinationNode]} />
        {hasDriver ? (
          <View style={styles.driverMarker}>
            <FallbackVehicleGlyph kind={vehicleKind} />
          </View>
        ) : null}
        <View style={styles.statusPanel}>
          <Text style={styles.eyebrow}>Course active</Text>
          <Text style={styles.title}>{hasRoute ? 'Trajet client en cours' : 'Trajet en attente'}</Text>
          <Text style={styles.meta} numberOfLines={2}>
            Carte detaillee: position chauffeur, trajet restant et destination.
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
          <View style={styles.routeInfoTextBlock}>
            <Text style={styles.routeInfoEyebrow}>Navigation</Text>
            <Text style={styles.routeWarningTitle}>{routeUnavailableReason}</Text>
            <Text style={styles.routeWarningText}>
              Ouvrez une navigation GPS avant de partir. Orbi ne trace pas de ligne droite.
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
        accessibilityLabel="driver-trip-route-info"
      >
        <View style={styles.routeInfoTextBlock}>
          <Text style={styles.routeInfoEyebrow}>
            {phase === 'trip' ? 'Trajet restant' : 'Itineraire client'}
          </Text>
          <View style={styles.routeInfoMainRow}>
            <Text style={styles.routeInfoDistance}>
              {formatTripRouteDistance(routeInfo.distanceMeters)}
            </Text>
            <View style={styles.routeInfoDivider} />
            <Text style={styles.routeInfoDuration}>
              {formatTripRouteDuration(routeInfo.durationSeconds)}
            </Text>
          </View>
        </View>
        <View
          style={[
            styles.routeInfoAltBadge,
            routeInfo.routeCount > 1 ? styles.routeInfoAltBadgeActive : null,
          ]}
        >
          <Text style={styles.routeInfoAltText}>
            {routeInfo.routeCount > 1
              ? `Route ${routeInfo.selectedIndex + 1}/${routeInfo.routeCount}`
              : 'Route rapide'}
          </Text>
        </View>
      </Pressable>
    );
  }

  function renderMapSurface(fullscreen: boolean) {
    return (
      <ErrorBoundary
        fallback={renderDegradedPanel()}
        onError={(error) =>
          enqueueDriverMapError(error, { surface: 'driver-trip-map', action: 'render-crash' })
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
          {renderRouteInfoPanel()}
          <Pressable
            style={styles.expandButton}
            onPress={() => setIsExpanded(!fullscreen)}
            accessibilityLabel={fullscreen ? 'Réduire la carte' : 'Agrandir la carte'}
          >
            <Text style={styles.expandButtonLabel}>{fullscreen ? 'Réduire' : 'Agrandir'}</Text>
          </Pressable>
          {fullscreen ? (
            <View style={styles.fullscreenHint}>
              <Text style={styles.fullscreenHintTitle}>Carte mission</Text>
              <Text style={styles.fullscreenHintText}>
                Suivez uniquement l itineraire route calcule. S il est indisponible, ouvrez une
                navigation GPS.
              </Text>
            </View>
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
    gap: 10,
    maxWidth: '78%',
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
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '600',
    color: theme.colors.textSoft,
  },
  routeInfoTextBlock: {
    gap: 2,
    flexShrink: 1,
  },
  routeInfoEyebrow: {
    fontSize: 9,
    fontWeight: '900',
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  routeInfoMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: theme.colors.surfaceMuted,
  },
  routeInfoAltBadgeActive: {
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
  fullscreenHint: {
    position: 'absolute',
    left: 12,
    right: 12,
    top: 56,
    gap: 2,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: 'rgba(7,19,17,0.86)',
  },
  fullscreenHintTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  fullscreenHintText: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.78)',
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
