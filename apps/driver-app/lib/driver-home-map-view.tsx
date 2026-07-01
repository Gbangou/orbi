import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import type { DriverOffer } from '@orbi/api';
import {
  serializeHtmlScriptJson,
  shouldAllowLocalMapWebViewRequest,
} from '@orbi/ui';
import { enqueueDriverMapError } from './map-error-reporting';

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
html,body,#map{width:100%;height:100%;background:#f4f4f0}
.leaflet-control-attribution,.leaflet-control-zoom{display:none}
@keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.15)}}
@keyframes glowMoto{0%,100%{filter:drop-shadow(0 2px 4px rgba(0,0,0,0.28))}50%{filter:drop-shadow(0 2px 8px rgba(0,0,0,0.44))}}
@keyframes glowCar{0%,100%{filter:drop-shadow(0 2px 5px rgba(0,0,0,0.22))}50%{filter:drop-shadow(0 3px 10px rgba(0,0,0,0.36))}}
.driver-dot{animation:pulse 2s ease-in-out infinite}
.moto-svg{animation:glowMoto 2.2s ease-in-out infinite;display:block}
.car-svg{animation:glowCar 2.6s ease-in-out infinite;display:block}
.pin-wrap{display:flex;flex-direction:column;align-items:center;gap:3px}
.pin-lbl{font-family:-apple-system,sans-serif;font-size:10px;font-weight:700;padding:2px 7px;border-radius:5px;white-space:nowrap;letter-spacing:.2px;background:#111111;color:#FFFFFF;box-shadow:0 2px 6px rgba(0,0,0,0.18)}
</style>
</head>
<body>
<div id="map"></div>
<svg id="svgDefs" xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute;overflow:hidden"><defs>
  <linearGradient id="gMB" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#1a1a2e"/><stop offset="100%" stop-color="#111111"/></linearGradient>
  <linearGradient id="gMT" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#333344"/><stop offset="50%" stop-color="#4a4a5a"/><stop offset="100%" stop-color="#222233"/></linearGradient>
  <radialGradient id="gMW" cx="35%" cy="30%" r="65%"><stop offset="0%" stop-color="#555566"/><stop offset="100%" stop-color="#050508"/></radialGradient>
  <radialGradient id="gML" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="rgba(255,255,255,0.5)"/><stop offset="100%" stop-color="rgba(255,255,255,0)"/></radialGradient>
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
var driverMarker=null;

// Clean black dot for driver position (Uber style)
var DRIVER_SVG='<div class="driver-dot" style="width:24px;height:24px;border-radius:12px;background:#111111;border:3px solid #FFFFFF;box-shadow:0 2px 10px rgba(0,0,0,0.35)"></div>';

var MOTO_SVG='<svg class="moto-svg" xmlns="http://www.w3.org/2000/svg" width="24" height="52" viewBox="0 0 24 52"><ellipse cx="12" cy="8" rx="7.5" ry="6.5" fill="url(#gMW)"/><circle cx="12" cy="8" r="1.4" fill="#5a5a6a"/><ellipse cx="12" cy="44" rx="7.5" ry="6.5" fill="url(#gMW)"/><circle cx="12" cy="44" r="1.4" fill="#5a5a6a"/><path d="M8.5,14 Q6,17 6,22 L6.5,30 Q7.5,34 9,36 L15,36 Q16.5,34 17.5,30 L18,22 Q18,17 15.5,14Z" fill="url(#gMB)"/><ellipse cx="12" cy="22" rx="5" ry="6" fill="url(#gMT)"/><path d="M10,34 Q12,37 14,34 L14,42 Q12,43.5 10,42Z" fill="rgba(8,18,18,0.85)"/><ellipse cx="12" cy="12" rx="4" ry="2.5" fill="url(#gML)" filter="url(#fHG)"/><rect x="9.5" y="45.5" width="5" height="2" rx="1" fill="url(#gTL)"/></svg>';

var CAR_SVG='<svg class="car-svg" xmlns="http://www.w3.org/2000/svg" width="40" height="72" viewBox="0 0 40 72"><rect x="0" y="7" width="8" height="13" rx="4" fill="url(#gCW)"/><rect x="32" y="7" width="8" height="13" rx="4" fill="url(#gCW)"/><rect x="0" y="52" width="8" height="13" rx="4" fill="url(#gCW)"/><rect x="32" y="52" width="8" height="13" rx="4" fill="url(#gCW)"/><rect x="2" y="9" width="4" height="9" rx="2" fill="#9aa4b0" opacity="0.6"/><rect x="34" y="9" width="4" height="9" rx="2" fill="#9aa4b0" opacity="0.6"/><rect x="2" y="54" width="4" height="9" rx="2" fill="#9aa4b0" opacity="0.6"/><rect x="34" y="54" width="4" height="9" rx="2" fill="#9aa4b0" opacity="0.6"/><rect x="7" y="4" width="26" height="64" rx="11" fill="url(#gCB)"/><path d="M8,4 Q20,2 32,4 L32,17 Q20,15.5 8,17Z" fill="url(#gCH)"/><rect x="9.5" y="14" width="21" height="13" rx="4" fill="url(#gCG)"/><rect x="8" y="28" width="4" height="16" rx="2" fill="url(#gCG)" opacity="0.85"/><rect x="28" y="28" width="4" height="16" rx="2" fill="url(#gCG)" opacity="0.85"/><rect x="12" y="27" width="16" height="18" rx="3" fill="url(#gCR)"/><rect x="9.5" y="45" width="21" height="13" rx="4" fill="url(#gCG)"/><rect x="8.5" y="4.5" width="7" height="2.5" rx="1.2" fill="url(#gHL)" filter="url(#fHG)"/><rect x="24.5" y="4.5" width="7" height="2.5" rx="1.2" fill="url(#gHL)" filter="url(#fHG)"/><rect x="8.5" y="65" width="7" height="2.5" rx="1.2" fill="url(#gTL)"/><rect x="24.5" y="65" width="7" height="2.5" rx="1.2" fill="url(#gTL)"/></svg>';

function driverIcon(){return L.divIcon({html:DRIVER_SVG,iconSize:[24,24],iconAnchor:[12,12],className:''})}
function motoIcon(lbl){return L.divIcon({html:'<div class="pin-wrap">'+MOTO_SVG+'<span class="pin-lbl">'+lbl+'</span></div>',iconSize:[80,67],iconAnchor:[40,26],className:''})}
function carIcon(lbl){return L.divIcon({html:'<div class="pin-wrap">'+CAR_SVG+'<span class="pin-lbl">'+lbl+'</span></div>',iconSize:[80,87],iconAnchor:[40,36],className:''})}

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
    buildMapHtml({ driverLat: lat, driverLng: lng, offerMarkers: [] }),
  );

  useEffect(() => {
    if (driverLat && driverLng && webRef.current) {
      webRef.current.postMessage(
        JSON.stringify({ type: 'UPDATE_DRIVER', lat: driverLat, lng: driverLng }),
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
        onError={(event: { nativeEvent?: { description?: string; code?: number } }) => {
          enqueueDriverMapError(
            new Error(event.nativeEvent?.description ?? 'Driver home map WebView error'),
            {
              surface: 'driver-home-map',
              code: event.nativeEvent?.code ?? null,
            },
          );
        }}
        onHttpError={(event: {
          nativeEvent?: { statusCode?: number; description?: string; url?: string };
        }) => {
          enqueueDriverMapError(
            new Error(event.nativeEvent?.description ?? 'Driver home map HTTP error'),
            {
              surface: 'driver-home-map',
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

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
  webview: {
    flex: 1,
    backgroundColor: '#f4f4f0',
  },
});
