import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import type { DriverOffer } from '@orbi/api';

const OUAGA_LAT = 12.3647;
const OUAGA_LNG = -1.5332;

interface OfferMarker {
  id: string;
  lat: number;
  lng: number;
  label: string;
  isMoto: boolean;
}

function buildDemoOfferMarkers(
  driverLat: number,
  driverLng: number,
): OfferMarker[] {
  const offsets = [
    { dlat: 0.018, dlng: 0.012, label: 'Patte d Oie', isMoto: true },
    { dlat: -0.011, dlng: 0.021, label: 'Zone du Bois', isMoto: false },
    { dlat: 0.025, dlng: -0.015, label: 'Gounghin', isMoto: true },
    { dlat: -0.019, dlng: -0.018, label: 'Ouaga 2000', isMoto: false },
    { dlat: 0.008, dlng: 0.033, label: 'Tampouy', isMoto: true },
  ];
  return offsets.map((o, i) => ({
    id: `demo-offer-${i}`,
    lat: driverLat + o.dlat,
    lng: driverLng + o.dlng,
    label: o.label,
    isMoto: o.isMoto,
  }));
}

function buildMapHtml(cfg: {
  driverLat: number;
  driverLng: number;
  offerMarkers: OfferMarker[];
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
@keyframes pulseDriver{0%{box-shadow:0 0 0 0 rgba(129,140,248,.8)}70%{box-shadow:0 0 0 18px rgba(129,140,248,0)}100%{box-shadow:0 0 0 0 rgba(129,140,248,0)}}
@keyframes pulseMoto{0%{box-shadow:0 0 0 0 rgba(0,199,199,.6)}70%{box-shadow:0 0 0 10px rgba(0,199,199,0)}100%{box-shadow:0 0 0 0 rgba(0,199,199,0)}}
@keyframes pulseCar{0%{box-shadow:0 0 0 0 rgba(251,191,36,.55)}70%{box-shadow:0 0 0 10px rgba(251,191,36,0)}100%{box-shadow:0 0 0 0 rgba(251,191,36,0)}}
.driver-outer{width:20px;height:20px;background:rgba(129,140,248,.18);border-radius:50%;display:flex;align-items:center;justify-content:center;animation:pulseDriver 2s ease-in-out infinite}
.driver-inner{width:11px;height:11px;background:#818cf8;border-radius:50%;border:2px solid #6366f1}
.moto-pin{display:flex;align-items:center;gap:3px}
.moto-dot{width:10px;height:10px;background:#00C7C7;border-radius:50%;border:1.5px solid rgba(0,199,199,.4);animation:pulseMoto 2s ease-in-out infinite;flex-shrink:0}
.moto-lbl{background:rgba(10,12,14,.88);color:#67e8f9;font-family:-apple-system,sans-serif;font-size:9px;font-weight:700;padding:1px 5px;border-radius:3px;white-space:nowrap}
.car-pin{display:flex;align-items:center;gap:3px}
.car-dot{width:11px;height:11px;background:#fbbf24;border-radius:2px;border:1.5px solid rgba(251,191,36,.4);animation:pulseCar 2.2s ease-in-out infinite;flex-shrink:0}
.car-lbl{background:rgba(10,12,14,.88);color:#fde68a;font-family:-apple-system,sans-serif;font-size:9px;font-weight:700;padding:1px 5px;border-radius:3px;white-space:nowrap}
</style>
</head>
<body>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
var CFG=${config};
var map=L.map('map',{zoomControl:false,attributionControl:false});
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,subdomains:['a','b','c']}).addTo(map);
var driverMarker=null;

function driverIcon(){return L.divIcon({html:'<div class="driver-outer"><div class="driver-inner"></div></div>',iconSize:[20,20],iconAnchor:[10,10],className:''})}
function motoIcon(lbl){return L.divIcon({html:'<div class="moto-pin"><div class="moto-dot"></div><div class="moto-lbl">'+lbl+'</div></div>',iconSize:[80,14],iconAnchor:[5,7],className:''})}
function carIcon(lbl){return L.divIcon({html:'<div class="car-pin"><div class="car-dot"></div><div class="car-lbl">'+lbl+'</div></div>',iconSize:[80,14],iconAnchor:[5,7],className:''})}

function initMap(cfg){
  map.setView([cfg.driverLat,cfg.driverLng],14);
  driverMarker=L.marker([cfg.driverLat,cfg.driverLng],{icon:driverIcon(),zIndexOffset:1000}).addTo(map);
  cfg.offerMarkers.forEach(function(o){
    var icon=o.isMoto?motoIcon(o.label):carIcon(o.label);
    L.marker([o.lat,o.lng],{icon:icon}).addTo(map);
  });
}

function updateDriver(lat,lng){
  if(!driverMarker){
    driverMarker=L.marker([lat,lng],{icon:driverIcon(),zIndexOffset:1000}).addTo(map);
  }else{
    driverMarker.setLatLng([lat,lng]);
  }
  map.panTo([lat,lng],{animate:true,duration:0.6});
}

function onMsg(e){
  try{
    var m=JSON.parse(e.data);
    if(m.type==='UPDATE_DRIVER'&&m.lat&&m.lng){updateDriver(m.lat,m.lng)}
  }catch(x){}
}
document.addEventListener('message',onMsg);
window.addEventListener('message',onMsg);
initMap(CFG);
</script>
</body>
</html>`;
}

export interface DriverHomeMapViewProps {
  driverLat?: number | null;
  driverLng?: number | null;
  offers?: DriverOffer[];
  style?: object;
}

export function DriverHomeMapView({
  driverLat,
  driverLng,
  offers: _offers,
  style,
}: DriverHomeMapViewProps) {
  const lat = driverLat ?? OUAGA_LAT;
  const lng = driverLng ?? OUAGA_LNG;

  const webRef = useRef<WebView>(null);
  const htmlRef = useRef<string>(
    buildMapHtml({
      driverLat: lat,
      driverLng: lng,
      offerMarkers: buildDemoOfferMarkers(lat, lng),
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
    borderRadius: 0,
  },
  webview: {
    flex: 1,
    backgroundColor: '#0a0c0e',
  },
});
