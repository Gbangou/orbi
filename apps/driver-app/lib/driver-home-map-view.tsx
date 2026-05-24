import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import type { DriverOffer } from '@orbi/api';
import {
  escapeHtmlText,
  serializeHtmlScriptJson,
  shouldAllowLocalMapWebViewRequest,
} from '@orbi/ui';

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
    label: escapeHtmlText(o.label),
    isMoto: o.isMoto,
  }));
}

function buildMapHtml(cfg: {
  driverLat: number;
  driverLng: number;
  offerMarkers: OfferMarker[];
}): string {
  const config = serializeHtmlScriptJson(cfg);
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
@keyframes glowDriver{0%,100%{filter:drop-shadow(0 0 3px rgba(129,140,248,.6))}50%{filter:drop-shadow(0 0 9px rgba(129,140,248,1))}}
@keyframes glowMoto{0%,100%{filter:drop-shadow(0 0 2px rgba(0,199,199,.5))}50%{filter:drop-shadow(0 0 6px rgba(0,199,199,.95))}}
@keyframes glowCar{0%,100%{filter:drop-shadow(0 0 2px rgba(251,191,36,.5))}50%{filter:drop-shadow(0 0 6px rgba(251,191,36,.95))}}
.driver-svg{animation:glowDriver 1.8s ease-in-out infinite;display:block}
.moto-svg{animation:glowMoto 2s ease-in-out infinite;display:block}
.car-svg{animation:glowCar 2.2s ease-in-out infinite;display:block}
.pin-wrap{display:flex;flex-direction:column;align-items:center;gap:3px}
.pin-lbl{font-family:-apple-system,sans-serif;font-size:9px;font-weight:700;padding:1px 6px;border-radius:3px;white-space:nowrap;letter-spacing:.2px}
.pin-lbl-moto{background:rgba(10,12,14,.9);color:#67e8f9;border:1px solid rgba(0,199,199,.3)}
.pin-lbl-car{background:rgba(10,12,14,.9);color:#fde68a;border:1px solid rgba(251,191,36,.3)}
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

var DRIVER_SVG='<svg class="driver-svg" xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 26 26"><circle cx="13" cy="13" r="12" fill="rgba(99,102,241,0.18)" stroke="rgba(129,140,248,0.45)" stroke-width="1.5"/><circle cx="13" cy="13" r="7" fill="rgba(99,102,241,0.45)" stroke="#818cf8" stroke-width="1.8"/><path d="M13 7 L16.5 15.5 L13 13.5 L9.5 15.5 Z" fill="white" opacity="0.92"/></svg>';
var MOTO_SVG='<svg class="moto-svg" xmlns="http://www.w3.org/2000/svg" width="34" height="22" viewBox="0 0 34 22"><circle cx="6.5" cy="15" r="5.5" fill="none" stroke="#00C7C7" stroke-width="2"/><circle cx="6.5" cy="15" r="2" fill="#00C7C7"/><circle cx="27.5" cy="15" r="5.5" fill="none" stroke="#00C7C7" stroke-width="2"/><circle cx="27.5" cy="15" r="2" fill="#00C7C7"/><path d="M6.5,15 L14,7.5 L23,7.5 L27.5,15" fill="none" stroke="#00C7C7" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M14,7.5 L17,3 L21,3 L23,7.5 Z" fill="rgba(0,199,199,0.38)" stroke="#00C7C7" stroke-width="1.3" stroke-linejoin="round"/><path d="M23,8.5 L30,5.5 M23,8.5 L29,11" stroke="#00C7C7" stroke-width="2" stroke-linecap="round"/></svg>';
var CAR_SVG='<svg class="car-svg" xmlns="http://www.w3.org/2000/svg" width="22" height="36" viewBox="0 0 22 36"><rect x="0" y="6" width="5" height="10" rx="2" fill="#0a0c14" opacity="0.9"/><rect x="17" y="6" width="5" height="10" rx="2" fill="#0a0c14" opacity="0.9"/><rect x="0" y="20" width="5" height="10" rx="2" fill="#0a0c14" opacity="0.9"/><rect x="17" y="20" width="5" height="10" rx="2" fill="#0a0c14" opacity="0.9"/><rect x="4" y="2" width="14" height="32" rx="5" fill="rgba(251,191,36,0.18)" stroke="#fbbf24" stroke-width="1.6"/><rect x="5.5" y="2" width="11" height="9.5" rx="3.5" fill="rgba(56,189,248,0.28)"/><rect x="5.5" y="24.5" width="11" height="9.5" rx="3.5" fill="rgba(56,189,248,0.22)"/><rect x="5.5" y="12.5" width="11" height="11" rx="2" fill="rgba(251,191,36,0.38)"/><path d="M3.5,11 L4,9 L4,14.5 L3.5,13 Z" fill="#fbbf24" opacity="0.85"/><path d="M18.5,11 L18,9 L18,14.5 L18.5,13 Z" fill="#fbbf24" opacity="0.85"/><rect x="5" y="1" width="4.5" height="3" rx="1.2" fill="rgba(255,253,176,0.9)"/><rect x="12.5" y="1" width="4.5" height="3" rx="1.2" fill="rgba(255,253,176,0.9)"/><rect x="5" y="32" width="4.5" height="3" rx="1.2" fill="rgba(248,113,113,0.9)"/><rect x="12.5" y="32" width="4.5" height="3" rx="1.2" fill="rgba(248,113,113,0.9)"/></svg>';

function driverIcon(){return L.divIcon({html:DRIVER_SVG,iconSize:[26,26],iconAnchor:[13,13],className:''})}
function motoIcon(lbl){return L.divIcon({html:'<div class="pin-wrap">'+MOTO_SVG+'<span class="pin-lbl pin-lbl-moto">'+lbl+'</span></div>',iconSize:[80,38],iconAnchor:[17,11],className:''})}
function carIcon(lbl){return L.divIcon({html:'<div class="pin-wrap">'+CAR_SVG+'<span class="pin-lbl pin-lbl-car">'+lbl+'</span></div>',iconSize:[80,50],iconAnchor:[11,18],className:''})}

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
        originWhitelist={['about:blank', 'https://*']}
        onShouldStartLoadWithRequest={(request) =>
          shouldAllowLocalMapWebViewRequest(request.url)
        }
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
