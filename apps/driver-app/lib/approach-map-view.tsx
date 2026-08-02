import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import {
  buildTripRouteScript,
  escapeHtmlText,
  formatTripRouteDistance,
  formatTripRouteDuration,
  localMapWebViewOriginWhitelist,
  serializeHtmlScriptJson,
  shouldAllowLocalMapWebViewRequest,
  type OrbiTheme,
  type RouteInfoMessage,
} from '@orbi/ui';
import { ErrorBoundary, useOrbiTheme } from '@orbi/ui/native';
import { enqueueDriverMapError } from './map-error-reporting';
import { hasMapCoordinatePair, normalizeMapCoordinatePair } from './map-coordinate';

const TypedWebView = WebView as any;
const APPROACH_ROUTE_SCRIPT = buildTripRouteScript({
  routeColor: '#00A884',
  altColor: '#767676',
});

export interface ApproachMapViewProps {
  driverLat: number | null | undefined;
  driverLng: number | null | undefined;
  pickupLat: number | null | undefined;
  pickupLng: number | null | undefined;
  pickupAddress?: string | null;
  style?: object;
}

function buildApproachHtml(cfg: {
  driverLat: number | null;
  driverLng: number | null;
  pickupLat: number | null;
  pickupLng: number | null;
  pickupAddress: string;
}): string {
  const config = serializeHtmlScriptJson({
    ...cfg,
    pickupAddress: escapeHtmlText(cfg.pickupAddress),
  });
  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body,#map{width:100%;height:100%;background:#F5F5F2}
.leaflet-tile-pane{filter:saturate(.88) contrast(1.02)}
.leaflet-control-attribution,.leaflet-control-zoom{display:none}
@keyframes glowDriver{0%,100%{filter:drop-shadow(0 2px 4px rgba(0,0,0,.20))}50%{filter:drop-shadow(0 4px 8px rgba(0,0,0,.26))}}
@keyframes glowRider{0%,100%{filter:drop-shadow(0 2px 4px rgba(0,0,0,.18))}50%{filter:drop-shadow(0 4px 8px rgba(0,0,0,.24))}}
.driver-svg{animation:glowDriver 1.5s ease-in-out infinite;display:block}
.rider-svg{animation:glowRider 2s ease-in-out infinite;display:block}
.driver-wrap{display:flex;flex-direction:column;align-items:center;gap:3px}
.driver-lbl{background:rgba(11,11,11,.92);color:#FFFFFF;font-family:-apple-system,sans-serif;font-size:9px;font-weight:700;padding:2px 6px;border-radius:3px;white-space:nowrap;letter-spacing:.2px;border:1px solid rgba(255,255,255,.42)}
.pickup-wrap{display:flex;flex-direction:column;align-items:center;gap:3px}
.pickup-lbl{background:rgba(11,11,11,.92);color:#FFFFFF;font-family:-apple-system,sans-serif;font-size:9px;font-weight:700;padding:2px 6px;border-radius:3px;white-space:nowrap;max-width:120px;overflow:hidden;text-overflow:ellipsis;border:1px solid rgba(255,255,255,.42)}
</style>
</head>
<body>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
var CFG=${config};
var map=L.map('map',{zoomControl:false,attributionControl:false});
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,subdomains:['a','b','c']}).addTo(map);
var driverMarker=null,pickupMarker=null;

var DRIVER_SVG='<svg class="driver-svg" xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 26 26"><circle cx="13" cy="13" r="11.5" fill="#0B0B0B" stroke="#FFFFFF" stroke-width="1.5"/><path d="M13 7 L16.5 16 L13 13.5 L9.5 16 Z" fill="white" opacity="0.95"/></svg>';
var RIDER_SVG='<svg class="rider-svg" xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28"><circle cx="14" cy="8" r="5" fill="#00A884" stroke="#FFFFFF" stroke-width="1.8"/><path d="M4 26 Q4 18 14 18 Q24 18 24 26" fill="#00A884" stroke="#FFFFFF" stroke-width="1.8" stroke-linecap="round"/><circle cx="14" cy="8" r="3" fill="#FFFFFF"/></svg>';

function driverIcon(){return L.divIcon({html:'<div class="driver-wrap">'+DRIVER_SVG+'<span class="driver-lbl">Vous</span></div>',iconSize:[60,46],iconAnchor:[13,13],className:''})}
function pickupIcon(addr){return L.divIcon({html:'<div class="pickup-wrap">'+RIDER_SVG+'<span class="pickup-lbl">'+addr+'</span></div>',iconSize:[140,50],iconAnchor:[14,14],className:''})}

${APPROACH_ROUTE_SCRIPT}

function initMap(cfg){
  var bounds=[];
  if(cfg.pickupLat!==null&&cfg.pickupLng!==null){
    pickupMarker=L.marker([cfg.pickupLat,cfg.pickupLng],{icon:pickupIcon(cfg.pickupAddress),zIndexOffset:100}).addTo(map);
    bounds.push([cfg.pickupLat,cfg.pickupLng]);
  }
  if(cfg.driverLat!==null&&cfg.driverLng!==null){
    driverMarker=L.marker([cfg.driverLat,cfg.driverLng],{icon:driverIcon(),zIndexOffset:500}).addTo(map);
    bounds.push([cfg.driverLat,cfg.driverLng]);
    if(cfg.pickupLat!==null&&cfg.pickupLng!==null){
      __orbiFetchTripRoute(cfg.driverLat,cfg.driverLng,cfg.pickupLat,cfg.pickupLng);
    }
  }
  if(bounds.length){map.fitBounds(bounds,{padding:[52,52],maxZoom:16})}
  else if(cfg.pickupLat!==null&&cfg.pickupLng!==null){map.setView([cfg.pickupLat,cfg.pickupLng],14)}
  else{map.setView([12.3647,-1.5332],13)}
}

function updateDriver(lat,lng){
  if(!driverMarker){driverMarker=L.marker([lat,lng],{icon:driverIcon(),zIndexOffset:500}).addTo(map)}
  else{driverMarker.setLatLng([lat,lng])}
  if(pickupMarker){
    var pll=pickupMarker.getLatLng();
    __orbiFetchTripRoute(lat,lng,pll.lat,pll.lng);
    map.fitBounds([[lat,lng],[pll.lat,pll.lng]],{padding:[58,58],maxZoom:16});
  }
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

export function ApproachMapView({
  driverLat,
  driverLng,
  pickupLat,
  pickupLng,
  pickupAddress,
  style,
}: ApproachMapViewProps) {
  const theme = useOrbiTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const webRef = useRef<WebView>(null);
  const driver = useMemo(
    () => normalizeMapCoordinatePair({ latitude: driverLat, longitude: driverLng }),
    [driverLat, driverLng],
  );
  const pickup = useMemo(
    () => normalizeMapCoordinatePair({ latitude: pickupLat, longitude: pickupLng }),
    [pickupLat, pickupLng],
  );
  const htmlRef = useRef<string>(
    buildApproachHtml({
      driverLat: driver?.latitude ?? null,
      driverLng: driver?.longitude ?? null,
      pickupLat: pickup?.latitude ?? null,
      pickupLng: pickup?.longitude ?? null,
      pickupAddress: pickupAddress ?? 'Prise en charge',
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
        setRouteUnavailableReason('Route vers passager indisponible');
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
    const hasPickup = hasMapCoordinatePair({ latitude: pickupLat, longitude: pickupLng });
    const hasDriver = hasMapCoordinatePair({ latitude: driverLat, longitude: driverLng });

    return (
      <View style={[styles.container, styles.webFallback, style]}>
        <View style={[styles.point, styles.driverPoint]} />
        <View style={[styles.point, styles.pickupPoint]} />
        <View style={styles.statusPanel}>
          <Text style={styles.eyebrow}>Approche</Text>
          <Text style={styles.title}>
            {hasDriver && hasPickup ? 'Positions disponibles' : 'Position en attente'}
          </Text>
          <Text style={styles.meta} numberOfLines={2}>
            {pickupAddress || 'Prise en charge'} - itineraire reel requis avant guidage.
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
            <Text style={styles.routeInfoEyebrow}>Vers le passager</Text>
            <Text style={styles.routeWarningTitle}>{routeUnavailableReason}</Text>
            <Text style={styles.routeWarningText}>
              Ouvrez la navigation. Aucun raccourci n est dessine.
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
        accessibilityLabel="driver-approach-route-info"
      >
        <View style={styles.routeInfoTextBlock}>
          <Text style={styles.routeInfoEyebrow}>Vers le passager</Text>
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
          enqueueDriverMapError(error, { surface: 'approach-map', action: 'render-crash' })
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
                new Error(event.nativeEvent?.description ?? 'Approach map WebView error'),
                {
                  surface: 'approach-map',
                  code: event.nativeEvent?.code ?? null,
                },
              );
            }}
            onHttpError={(event: {
              nativeEvent?: { statusCode?: number; description?: string; url?: string };
            }) => {
              enqueueDriverMapError(
                new Error(event.nativeEvent?.description ?? 'Approach map HTTP error'),
                {
                  surface: 'approach-map',
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
              <Text style={styles.fullscreenHintTitle}>Approche passager</Text>
              <Text style={styles.fullscreenHintText}>
                Gardez le point de depart, votre position et la route calculee bien visibles.
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
    backgroundColor: '#0a0c0e',
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
    borderColor: 'rgba(129,140,248,0.25)',
  },
  routeWarningPanel: {
    maxWidth: '86%',
    alignItems: 'flex-start',
    backgroundColor: '#F7F7F4',
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
    color: '#6366f1',
  },
  routeInfoAltBadge: {
    marginLeft: 2,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: theme.colors.surfaceMuted,
  },
  routeInfoAltBadgeActive: {
    backgroundColor: 'rgba(129,140,248,0.18)',
  },
  routeInfoAltText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#3730a3',
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
    backgroundColor: '#0a0c0e',
  },
  darkRoute: {
    position: 'absolute',
    left: '24%',
    right: '24%',
    top: '46%',
    height: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(129,140,248,0.72)',
    transform: [{ rotate: '-18deg' }],
  },
  point: {
    position: 'absolute',
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 3,
    borderColor: '#ffffff',
  },
  driverPoint: {
    left: '24%',
    top: '56%',
    backgroundColor: '#818cf8',
  },
  pickupPoint: {
    right: '24%',
    top: '34%',
    backgroundColor: '#22c55e',
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
  },
  eyebrow: {
    color: '#6366f1',
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
    backgroundColor: '#0a0c0e',
  },
});
