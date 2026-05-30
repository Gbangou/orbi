import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { createOrbiApiClient, fetchNearbyDrivers, type NearbyDriverMarker } from '@orbi/api';
import { resolveOrbiApiBaseUrlForRuntime, orbiRuntimeConfig } from '@orbi/config';
import {
  serializeHtmlScriptJson,
  shouldAllowLocalMapWebViewRequest,
} from '@orbi/ui';

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
html,body,#map{width:100%;height:100%;background:#0a0c0e}
.leaflet-tile-pane{filter:brightness(.62) invert(1) contrast(3) hue-rotate(200deg) saturate(.28) brightness(.72)}
.leaflet-control-attribution,.leaflet-control-zoom{display:none}
@keyframes glowMoto{0%,100%{filter:drop-shadow(0 0 3px rgba(0,215,215,.55)) drop-shadow(0 2px 3px rgba(0,0,0,.55))}50%{filter:drop-shadow(0 0 9px rgba(0,240,240,1)) drop-shadow(0 2px 3px rgba(0,0,0,.55))}}
@keyframes glowCar{0%,100%{filter:drop-shadow(0 0 3px rgba(160,210,255,.5)) drop-shadow(0 2px 4px rgba(0,0,0,.6))}50%{filter:drop-shadow(0 0 9px rgba(180,220,255,.95)) drop-shadow(0 2px 4px rgba(0,0,0,.6))}}
@keyframes glowRider{0%,100%{filter:drop-shadow(0 0 3px rgba(99,102,241,.55))}50%{filter:drop-shadow(0 0 8px rgba(99,102,241,1))}}
.moto-svg{animation:glowMoto 1.8s ease-in-out infinite;display:block}
.car-svg{animation:glowCar 2.1s ease-in-out infinite;display:block}
.rider-svg{animation:glowRider 2.4s ease-in-out infinite;display:block}
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
var riderMarker=null;
var driverMarkers={};

var MOTO_SVG='<svg class="moto-svg" xmlns="http://www.w3.org/2000/svg" width="24" height="52" viewBox="0 0 24 52"><ellipse cx="12" cy="8" rx="7.5" ry="6.5" fill="url(#gMW)"/><ellipse cx="12" cy="8" rx="4" ry="3.5" fill="none" stroke="rgba(120,135,145,0.55)" stroke-width="1.2"/><circle cx="12" cy="8" r="1.4" fill="#5a5a6a"/><ellipse cx="12" cy="44" rx="7.5" ry="6.5" fill="url(#gMW)"/><ellipse cx="12" cy="44" rx="4" ry="3.5" fill="none" stroke="rgba(120,135,145,0.55)" stroke-width="1.2"/><circle cx="12" cy="44" r="1.4" fill="#5a5a6a"/><path d="M8.5,14 Q6,17 6,22 L6.5,30 Q7.5,34 9,36 L15,36 Q16.5,34 17.5,30 L18,22 Q18,17 15.5,14Z" fill="url(#gMB)"/><ellipse cx="12" cy="22" rx="5" ry="6" fill="url(#gMT)"/><path d="M10,34 Q12,37 14,34 L14,42 Q12,43.5 10,42Z" fill="rgba(8,18,18,0.85)"/><path d="M4,13.5 Q7.5,11.5 12,11.5 Q16.5,11.5 20,13.5" stroke="rgba(0,210,210,0.9)" stroke-width="2.5" stroke-linecap="round" fill="none"/><circle cx="4" cy="13.5" r="1.8" fill="#00d8d8"/><circle cx="20" cy="13.5" r="1.8" fill="#00d8d8"/><ellipse cx="12" cy="12" rx="4" ry="2.5" fill="url(#gML)" filter="url(#fHG)"/><path d="M9,13.5 L9.5,14.2 M15,13.5 L14.5,14.2" stroke="rgba(0,200,200,0.7)" stroke-width="1.2" stroke-linecap="round"/><rect x="9.5" y="45.5" width="5" height="2" rx="1" fill="url(#gTL)"/><path d="M16.5,34 Q18,38 18,42" stroke="rgba(70,75,80,0.55)" stroke-width="1.5" stroke-linecap="round" fill="none"/></svg>';
var CAR_SVG='<svg class="car-svg" xmlns="http://www.w3.org/2000/svg" width="40" height="72" viewBox="0 0 40 72"><rect x="0" y="7" width="8" height="13" rx="4" fill="url(#gCW)"/><rect x="32" y="7" width="8" height="13" rx="4" fill="url(#gCW)"/><rect x="0" y="52" width="8" height="13" rx="4" fill="url(#gCW)"/><rect x="32" y="52" width="8" height="13" rx="4" fill="url(#gCW)"/><rect x="2" y="9" width="4" height="9" rx="2" fill="#9aa4b0" opacity="0.6"/><rect x="34" y="9" width="4" height="9" rx="2" fill="#9aa4b0" opacity="0.6"/><rect x="2" y="54" width="4" height="9" rx="2" fill="#9aa4b0" opacity="0.6"/><rect x="34" y="54" width="4" height="9" rx="2" fill="#9aa4b0" opacity="0.6"/><rect x="7" y="4" width="26" height="64" rx="11" fill="url(#gCB)"/><path d="M8,4 Q20,2 32,4 L32,17 Q20,15.5 8,17Z" fill="url(#gCH)"/><rect x="9.5" y="14" width="21" height="13" rx="4" fill="url(#gCG)"/><path d="M12,15.5 Q20,14 28,15.5" stroke="rgba(255,255,255,0.28)" stroke-width="1.5" fill="none"/><rect x="8" y="28" width="4" height="16" rx="2" fill="url(#gCG)" opacity="0.85"/><rect x="28" y="28" width="4" height="16" rx="2" fill="url(#gCG)" opacity="0.85"/><rect x="12" y="27" width="16" height="18" rx="3" fill="url(#gCR)"/><path d="M14,29.5 Q20,28 26,29.5" stroke="rgba(255,255,255,0.4)" stroke-width="1.2" fill="none"/><rect x="9.5" y="45" width="21" height="13" rx="4" fill="url(#gCG)"/><path d="M8,58 Q20,60.5 32,58 L32,68 Q20,70.5 8,68Z" fill="rgba(155,175,192,0.6)"/><rect x="8.5" y="4.5" width="7" height="2.5" rx="1.2" fill="url(#gHL)" filter="url(#fHG)"/><rect x="24.5" y="4.5" width="7" height="2.5" rx="1.2" fill="url(#gHL)" filter="url(#fHG)"/><path d="M10,8.5 L17,8.5 M23,8.5 L30,8.5" stroke="rgba(180,215,255,0.65)" stroke-width="0.9" stroke-linecap="round"/><rect x="8.5" y="65" width="7" height="2.5" rx="1.2" fill="url(#gTL)"/><rect x="24.5" y="65" width="7" height="2.5" rx="1.2" fill="url(#gTL)"/><line x1="9" y1="28" x2="31" y2="28" stroke="rgba(90,108,124,0.3)" stroke-width="0.6"/><line x1="9" y1="44" x2="31" y2="44" stroke="rgba(90,108,124,0.3)" stroke-width="0.6"/><path d="M8,17 L8,52" stroke="rgba(255,255,255,0.45)" stroke-width="0.7" stroke-linecap="round"/><path d="M32,17 L32,52" stroke="rgba(40,55,70,0.35)" stroke-width="0.7" stroke-linecap="round"/></svg>';
var RIDER_SVG='<svg class="rider-svg" xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22"><circle cx="11" cy="11" r="10" fill="rgba(99,102,241,0.15)" stroke="rgba(129,140,248,0.5)" stroke-width="1.5"/><circle cx="11" cy="11" r="5.5" fill="rgba(99,102,241,0.35)" stroke="#818cf8" stroke-width="1.5"/><circle cx="11" cy="11" r="2.5" fill="#818cf8"/></svg>';

function motoIcon(){return L.divIcon({html:MOTO_SVG,iconSize:[24,52],iconAnchor:[12,26],className:''})}
function carIcon(){return L.divIcon({html:CAR_SVG,iconSize:[40,72],iconAnchor:[20,36],className:''})}
function riderIcon(){return L.divIcon({html:RIDER_SVG,iconSize:[22,22],iconAnchor:[11,11],className:''})}

function initMap(cfg){
  var centerLat=cfg.riderLat||12.3647;
  var centerLng=cfg.riderLng||-1.5332;
  var zoom=cfg.riderLat?14:13;
  map.setView([centerLat,centerLng],zoom);
  if(cfg.riderLat&&cfg.riderLng){
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
  map.panTo([lat,lng],{animate:true,duration:0.5});
}

function updateDrivers(drivers){
  var seen={};
  drivers.forEach(function(d){
    seen[d.id]=true;
    if(driverMarkers[d.id]){
      driverMarkers[d.id].setLatLng([d.latitude,d.longitude]);
    }else{
      var icon=d.vehicleType==='MOTORCYCLE'||d.vehicleType==='MOTO'?motoIcon():carIcon();
      driverMarkers[d.id]=L.marker([d.latitude,d.longitude],{icon:icon}).addTo(map);
    }
  });
  Object.keys(driverMarkers).forEach(function(id){
    if(!seen[id]){map.removeLayer(driverMarkers[id]);delete driverMarkers[id];}
  });
}

function onMsg(e){
  try{
    var m=JSON.parse(e.data);
    if(m.type==='UPDATE_RIDER'&&m.lat&&m.lng){updateRider(m.lat,m.lng)}
    if(m.type==='UPDATE_DRIVERS'&&m.drivers){updateDrivers(m.drivers)}
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
  const webRef = useRef<WebView>(null);
  const [drivers, setDrivers] = useState<NearbyDriverMarker[]>([]);
  const htmlRef = useRef<string>(
    buildHomeMapHtml({
      riderLat: riderLat ?? null,
      riderLng: riderLng ?? null,
      drivers: [],
    }),
  );

  const refreshDrivers = useCallback(async () => {
    try {
      const client = createOrbiApiClient(resolveOrbiApiBaseUrlForRuntime(), {
        version: orbiRuntimeConfig.apiVersion,
      });
      const lat = riderLat ?? OUAGA_LAT;
      const lng = riderLng ?? OUAGA_LNG;
      const response = await fetchNearbyDrivers(client, { lat, lng, radiusKm: 5 });
      const list = response.drivers;
      setDrivers(list);
      onDriversUpdate?.(list.length);
      if (webRef.current) {
        webRef.current.injectJavaScript(
          `updateDrivers(${serializeHtmlScriptJson(list)});true;`,
        );
      }
    } catch {
      // keep current state on error
    }
  }, [riderLat, riderLng, onDriversUpdate]);

  useEffect(() => {
    void refreshDrivers();
    const interval = setInterval(() => void refreshDrivers(), REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refreshDrivers]);

  useEffect(() => {
    if (riderLat && riderLng && webRef.current) {
      webRef.current.injectJavaScript(
        `updateRider(${riderLat},${riderLng});true;`,
      );
    }
  }, [riderLat, riderLng]);

  void drivers;

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
    borderRadius: 16,
  },
  webview: {
    flex: 1,
    backgroundColor: '#0a0c0e',
  },
});
