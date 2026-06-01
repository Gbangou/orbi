import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import type { DriverOffer } from '@orbi/api';
import {
  serializeHtmlScriptJson,
  shouldAllowLocalMapWebViewRequest,
} from '@orbi/ui';

const TypedWebView = WebView as any;

const OUAGA_LAT = 12.3647;
const OUAGA_LNG = -1.5332;

interface OfferMarker {
  id: string;
  lat: number;
  lng: number;
  label: string;
  isMoto: boolean;
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
@keyframes glowMoto{0%,100%{filter:drop-shadow(0 0 3px rgba(0,215,215,.55)) drop-shadow(0 2px 3px rgba(0,0,0,.55))}50%{filter:drop-shadow(0 0 9px rgba(0,240,240,1)) drop-shadow(0 2px 3px rgba(0,0,0,.55))}}
@keyframes glowCar{0%,100%{filter:drop-shadow(0 0 3px rgba(160,210,255,.5)) drop-shadow(0 2px 4px rgba(0,0,0,.6))}50%{filter:drop-shadow(0 0 9px rgba(180,220,255,.95)) drop-shadow(0 2px 4px rgba(0,0,0,.6))}}
.driver-svg{animation:glowDriver 1.8s ease-in-out infinite;display:block}
.moto-svg{animation:glowMoto 2s ease-in-out infinite;display:block}
.car-svg{animation:glowCar 2.2s ease-in-out infinite;display:block}
.pin-wrap{display:flex;flex-direction:column;align-items:center;gap:3px}
.pin-lbl{font-family:-apple-system,sans-serif;font-size:9px;font-weight:700;padding:1px 6px;border-radius:3px;white-space:nowrap;letter-spacing:.2px}
.pin-lbl-moto{background:rgba(10,12,14,.9);color:#67e8f9;border:1px solid rgba(0,199,199,.3)}
.pin-lbl-car{background:rgba(10,12,14,.9);color:#c8dff8;border:1px solid rgba(160,210,255,.35)}
</style>
</head>
<body>
<div id="map"></div>
<svg id="svgDefs" xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute;overflow:hidden"><defs><linearGradient id="gCB" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#e8eef6"/><stop offset="40%" stop-color="#c8d4e0"/><stop offset="100%" stop-color="#8898a8"/></linearGradient><linearGradient id="gCH" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#f0f5fa"/><stop offset="100%" stop-color="#aabbc8"/></linearGradient><linearGradient id="gCR" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#d0dae6"/><stop offset="100%" stop-color="#6a7e90"/></linearGradient><linearGradient id="gCG" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#3a5c80" stop-opacity="0.95"/><stop offset="100%" stop-color="#1a3050" stop-opacity="0.98"/></linearGradient><radialGradient id="gCW" cx="35%" cy="30%" r="65%"><stop offset="0%" stop-color="#555566"/><stop offset="100%" stop-color="#080810"/></radialGradient><radialGradient id="gHL" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#ffffff"/><stop offset="55%" stop-color="#cce0ff"/><stop offset="100%" stop-color="#60a0ff" stop-opacity="0"/></radialGradient><radialGradient id="gTL" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#ff9090"/><stop offset="55%" stop-color="#ff2020"/><stop offset="100%" stop-color="#990000" stop-opacity="0"/></radialGradient><filter id="fHG" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter><linearGradient id="gMB" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#00e4e4"/><stop offset="100%" stop-color="#006060"/></linearGradient><linearGradient id="gMT" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#00b8b8"/><stop offset="45%" stop-color="#00ffff"/><stop offset="100%" stop-color="#006868"/></linearGradient><radialGradient id="gMW" cx="35%" cy="30%" r="65%"><stop offset="0%" stop-color="#484858"/><stop offset="100%" stop-color="#050508"/></radialGradient><radialGradient id="gML" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#ffffff"/><stop offset="100%" stop-color="#00ffee" stop-opacity="0"/></radialGradient></defs></svg>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
var CFG=${config};
var map=L.map('map',{zoomControl:false,attributionControl:false});
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,subdomains:['a','b','c']}).addTo(map);
var driverMarker=null;

var DRIVER_SVG='<svg class="driver-svg" xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><circle cx="16" cy="16" r="15" fill="rgba(99,102,241,0.12)" stroke="rgba(129,140,248,0.3)" stroke-width="1.5"/><circle cx="16" cy="16" r="10" fill="rgba(79,82,221,0.4)" stroke="#818cf8" stroke-width="2"/><circle cx="16" cy="16" r="5.5" fill="rgba(99,102,241,0.85)" stroke="#a5b4fc" stroke-width="1.2"/><path d="M16 8.5 L19.5 18 L16 15.5 L12.5 18Z" fill="white" opacity="0.95"/></svg>';
var MOTO_SVG='<svg class="moto-svg" xmlns="http://www.w3.org/2000/svg" width="24" height="52" viewBox="0 0 24 52"><ellipse cx="12" cy="8" rx="7.5" ry="6.5" fill="url(#gMW)"/><ellipse cx="12" cy="8" rx="4" ry="3.5" fill="none" stroke="rgba(120,135,145,0.55)" stroke-width="1.2"/><circle cx="12" cy="8" r="1.4" fill="#5a5a6a"/><ellipse cx="12" cy="44" rx="7.5" ry="6.5" fill="url(#gMW)"/><ellipse cx="12" cy="44" rx="4" ry="3.5" fill="none" stroke="rgba(120,135,145,0.55)" stroke-width="1.2"/><circle cx="12" cy="44" r="1.4" fill="#5a5a6a"/><path d="M8.5,14 Q6,17 6,22 L6.5,30 Q7.5,34 9,36 L15,36 Q16.5,34 17.5,30 L18,22 Q18,17 15.5,14Z" fill="url(#gMB)"/><ellipse cx="12" cy="22" rx="5" ry="6" fill="url(#gMT)"/><path d="M10,34 Q12,37 14,34 L14,42 Q12,43.5 10,42Z" fill="rgba(8,18,18,0.85)"/><path d="M4,13.5 Q7.5,11.5 12,11.5 Q16.5,11.5 20,13.5" stroke="rgba(0,210,210,0.9)" stroke-width="2.5" stroke-linecap="round" fill="none"/><circle cx="4" cy="13.5" r="1.8" fill="#00d8d8"/><circle cx="20" cy="13.5" r="1.8" fill="#00d8d8"/><ellipse cx="12" cy="12" rx="4" ry="2.5" fill="url(#gML)" filter="url(#fHG)"/><path d="M9,13.5 L9.5,14.2 M15,13.5 L14.5,14.2" stroke="rgba(0,200,200,0.7)" stroke-width="1.2" stroke-linecap="round"/><rect x="9.5" y="45.5" width="5" height="2" rx="1" fill="url(#gTL)"/><path d="M16.5,34 Q18,38 18,42" stroke="rgba(70,75,80,0.55)" stroke-width="1.5" stroke-linecap="round" fill="none"/></svg>';
var CAR_SVG='<svg class="car-svg" xmlns="http://www.w3.org/2000/svg" width="40" height="72" viewBox="0 0 40 72"><rect x="0" y="7" width="8" height="13" rx="4" fill="url(#gCW)"/><rect x="32" y="7" width="8" height="13" rx="4" fill="url(#gCW)"/><rect x="0" y="52" width="8" height="13" rx="4" fill="url(#gCW)"/><rect x="32" y="52" width="8" height="13" rx="4" fill="url(#gCW)"/><rect x="2" y="9" width="4" height="9" rx="2" fill="#9aa4b0" opacity="0.6"/><rect x="34" y="9" width="4" height="9" rx="2" fill="#9aa4b0" opacity="0.6"/><rect x="2" y="54" width="4" height="9" rx="2" fill="#9aa4b0" opacity="0.6"/><rect x="34" y="54" width="4" height="9" rx="2" fill="#9aa4b0" opacity="0.6"/><rect x="7" y="4" width="26" height="64" rx="11" fill="url(#gCB)"/><path d="M8,4 Q20,2 32,4 L32,17 Q20,15.5 8,17Z" fill="url(#gCH)"/><rect x="9.5" y="14" width="21" height="13" rx="4" fill="url(#gCG)"/><path d="M12,15.5 Q20,14 28,15.5" stroke="rgba(255,255,255,0.28)" stroke-width="1.5" fill="none"/><rect x="8" y="28" width="4" height="16" rx="2" fill="url(#gCG)" opacity="0.85"/><rect x="28" y="28" width="4" height="16" rx="2" fill="url(#gCG)" opacity="0.85"/><rect x="12" y="27" width="16" height="18" rx="3" fill="url(#gCR)"/><path d="M14,29.5 Q20,28 26,29.5" stroke="rgba(255,255,255,0.4)" stroke-width="1.2" fill="none"/><rect x="9.5" y="45" width="21" height="13" rx="4" fill="url(#gCG)"/><path d="M8,58 Q20,60.5 32,58 L32,68 Q20,70.5 8,68Z" fill="rgba(155,175,192,0.6)"/><rect x="8.5" y="4.5" width="7" height="2.5" rx="1.2" fill="url(#gHL)" filter="url(#fHG)"/><rect x="24.5" y="4.5" width="7" height="2.5" rx="1.2" fill="url(#gHL)" filter="url(#fHG)"/><path d="M10,8.5 L17,8.5 M23,8.5 L30,8.5" stroke="rgba(180,215,255,0.65)" stroke-width="0.9" stroke-linecap="round"/><rect x="8.5" y="65" width="7" height="2.5" rx="1.2" fill="url(#gTL)"/><rect x="24.5" y="65" width="7" height="2.5" rx="1.2" fill="url(#gTL)"/><line x1="9" y1="28" x2="31" y2="28" stroke="rgba(90,108,124,0.3)" stroke-width="0.6"/><line x1="9" y1="44" x2="31" y2="44" stroke="rgba(90,108,124,0.3)" stroke-width="0.6"/><path d="M8,17 L8,52" stroke="rgba(255,255,255,0.45)" stroke-width="0.7" stroke-linecap="round"/><path d="M32,17 L32,52" stroke="rgba(40,55,70,0.35)" stroke-width="0.7" stroke-linecap="round"/></svg>';

function driverIcon(){return L.divIcon({html:DRIVER_SVG,iconSize:[32,32],iconAnchor:[16,16],className:''})}
function motoIcon(lbl){return L.divIcon({html:'<div class="pin-wrap">'+MOTO_SVG+'<span class="pin-lbl pin-lbl-moto">'+lbl+'</span></div>',iconSize:[80,67],iconAnchor:[40,26],className:''})}
function carIcon(lbl){return L.divIcon({html:'<div class="pin-wrap">'+CAR_SVG+'<span class="pin-lbl pin-lbl-car">'+lbl+'</span></div>',iconSize:[80,87],iconAnchor:[40,36],className:''})}

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
      offerMarkers: [],
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
