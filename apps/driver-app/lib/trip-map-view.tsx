import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

export interface TripMapViewProps {
  pickupLat: number | null | undefined;
  pickupLng: number | null | undefined;
  destLat: number | null | undefined;
  destLng: number | null | undefined;
  driverLat: number | null | undefined;
  driverLng: number | null | undefined;
  style?: object;
}

function buildMapHtml(cfg: {
  pickupLat: number | null;
  pickupLng: number | null;
  destLat: number | null;
  destLng: number | null;
  driverLat: number | null;
  driverLng: number | null;
}): string {
  const config = JSON.stringify(cfg);
  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body,#map{width:100%;height:100%;background:#0a0c0e}
.leaflet-tile-pane{filter:brightness(.62) invert(1) contrast(3) hue-rotate(200deg) saturate(.28) brightness(.72)}
.leaflet-control-attribution,.leaflet-control-zoom{display:none}
@keyframes pulse{0%{box-shadow:0 0 0 0 rgba(0,199,199,.7)}70%{box-shadow:0 0 0 14px rgba(0,199,199,0)}100%{box-shadow:0 0 0 0 rgba(0,199,199,0)}}
.driver-dot{width:14px;height:14px;background:#00C7C7;border-radius:50%;border:2px solid rgba(0,199,199,.35);animation:pulse 1.5s ease-in-out infinite}
.pickup-pin{display:flex;align-items:center;gap:4px}
.pickup-pin-dot{width:10px;height:10px;background:#22c55e;border-radius:50%;border:2px solid #16a34a;flex-shrink:0}
.pickup-pin-label{background:rgba(10,12,14,.9);color:#86efac;font-family:-apple-system,sans-serif;font-size:10px;font-weight:700;padding:2px 6px;border-radius:4px;letter-spacing:.3px;white-space:nowrap}
.dest-pin{display:flex;align-items:center;gap:4px}
.dest-pin-dot{width:10px;height:10px;background:#f59e0b;border-radius:50%;border:2px solid #d97706;flex-shrink:0}
.dest-pin-label{background:rgba(10,12,14,.9);color:#fcd34d;font-family:-apple-system,sans-serif;font-size:10px;font-weight:700;padding:2px 6px;border-radius:4px;letter-spacing:.3px;white-space:nowrap}
.you-dot{width:10px;height:10px;background:#818cf8;border-radius:50%;border:2px solid #6366f1}
.you-label{background:rgba(10,12,14,.9);color:#a5b4fc;font-family:-apple-system,sans-serif;font-size:9px;font-weight:700;padding:2px 5px;border-radius:4px;white-space:nowrap}
</style>
</head>
<body>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
var CFG=${config};
var map=L.map('map',{zoomControl:false,attributionControl:false});
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,subdomains:['a','b','c']}).addTo(map);
var driverMarker=null,pickupMarker=null,destMarker=null;

function driverIcon(){return L.divIcon({html:'<div class="driver-dot"></div>',iconSize:[14,14],iconAnchor:[7,7],className:''})}
function pickupIcon(){return L.divIcon({html:'<div class="pickup-pin"><div class="pickup-pin-dot"></div><div class="pickup-pin-label">Prise en charge</div></div>',iconSize:[110,18],iconAnchor:[5,9],className:''})}
function destIcon(){return L.divIcon({html:'<div class="dest-pin"><div class="dest-pin-dot"></div><div class="dest-pin-label">Destination</div></div>',iconSize:[90,18],iconAnchor:[5,9],className:''})}
function youIcon(){return L.divIcon({html:'<div class="pickup-pin"><div class="you-dot"></div><div class="you-label">Vous</div></div>',iconSize:[56,18],iconAnchor:[5,9],className:''})}

function initMap(cfg){
  var bounds=[];
  if(cfg.pickupLat&&cfg.pickupLng){pickupMarker=L.marker([cfg.pickupLat,cfg.pickupLng],{icon:pickupIcon()}).addTo(map);bounds.push([cfg.pickupLat,cfg.pickupLng])}
  if(cfg.destLat&&cfg.destLng){destMarker=L.marker([cfg.destLat,cfg.destLng],{icon:destIcon()}).addTo(map);bounds.push([cfg.destLat,cfg.destLng])}
  if(cfg.pickupLat&&cfg.pickupLng&&cfg.destLat&&cfg.destLng){L.polyline([[cfg.pickupLat,cfg.pickupLng],[cfg.destLat,cfg.destLng]],{color:'#00C7C7',weight:2.5,opacity:.45,dashArray:'9 6'}).addTo(map)}
  if(cfg.driverLat&&cfg.driverLng){driverMarker=L.marker([cfg.driverLat,cfg.driverLng],{icon:youIcon()}).addTo(map);bounds.push([cfg.driverLat,cfg.driverLng])}
  if(bounds.length){map.fitBounds(bounds,{padding:[44,44]})}else{map.setView([12.3647,-1.5332],13)}
}

function updateDriver(lat,lng){
  if(!driverMarker){driverMarker=L.marker([lat,lng],{icon:youIcon()}).addTo(map)}
  else{driverMarker.setLatLng([lat,lng])}
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
  style,
}: TripMapViewProps) {
  const webRef = useRef<WebView>(null);
  const htmlRef = useRef<string>(
    buildMapHtml({
      pickupLat: pickupLat ?? null,
      pickupLng: pickupLng ?? null,
      destLat: destLat ?? null,
      destLng: destLng ?? null,
      driverLat: driverLat ?? null,
      driverLng: driverLng ?? null,
    }),
  );

  useEffect(() => {
    if (driverLat && driverLng && webRef.current) {
      webRef.current.injectJavaScript(
        `updateDriver(${driverLat},${driverLng});true;`,
      );
    }
  }, [driverLat, driverLng]);

  return (
    <View style={[styles.container, style]}>
      <WebView
        ref={webRef}
        source={{ html: htmlRef.current }}
        scrollEnabled={false}
        style={styles.webview}
        javaScriptEnabled
        originWhitelist={['*']}
        onError={() => {}}
        onHttpError={() => {}}
        allowsInlineMediaPlayback
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    borderRadius: 14,
  },
  webview: {
    flex: 1,
    backgroundColor: '#0a0c0e',
  },
});
