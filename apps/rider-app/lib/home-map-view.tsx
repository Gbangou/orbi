import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { createOrbiApiClient, fetchNearbyDrivers, type NearbyDriverMarker } from '@orbi/api';
import { resolveOrbiApiBaseUrlForRuntime, orbiRuntimeConfig } from '@orbi/config';

const OUAGA_LAT = 12.3647;
const OUAGA_LNG = -1.5332;
const REFRESH_INTERVAL_MS = 15_000;

const DEMO_DRIVERS: NearbyDriverMarker[] = [
  { id: 'demo-1', latitude: 12.372, longitude: -1.528, vehicleType: 'MOTORCYCLE', status: 'ONLINE' },
  { id: 'demo-2', latitude: 12.361, longitude: -1.519, vehicleType: 'MOTORCYCLE', status: 'ONLINE' },
  { id: 'demo-3', latitude: 12.368, longitude: -1.545, vehicleType: 'CAR', status: 'ONLINE' },
  { id: 'demo-4', latitude: 12.355, longitude: -1.531, vehicleType: 'MOTORCYCLE', status: 'ONLINE' },
  { id: 'demo-5', latitude: 12.378, longitude: -1.542, vehicleType: 'CAR', status: 'ONLINE' },
  { id: 'demo-6', latitude: 12.348, longitude: -1.521, vehicleType: 'MOTORCYCLE', status: 'ONLINE' },
];

export interface HomeMapViewProps {
  riderLat?: number | null;
  riderLng?: number | null;
  style?: object;
}

function buildHomeMapHtml(cfg: {
  riderLat: number | null;
  riderLng: number | null;
  drivers: NearbyDriverMarker[];
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
@keyframes glowMoto{0%,100%{filter:drop-shadow(0 0 2px rgba(0,199,199,.5))}50%{filter:drop-shadow(0 0 6px rgba(0,199,199,.95))}}
@keyframes glowCar{0%,100%{filter:drop-shadow(0 0 2px rgba(251,191,36,.5))}50%{filter:drop-shadow(0 0 6px rgba(251,191,36,.95))}}
@keyframes glowRider{0%,100%{filter:drop-shadow(0 0 3px rgba(99,102,241,.55))}50%{filter:drop-shadow(0 0 8px rgba(99,102,241,1))}}
.moto-svg{animation:glowMoto 1.8s ease-in-out infinite;display:block}
.car-svg{animation:glowCar 2.1s ease-in-out infinite;display:block}
.rider-svg{animation:glowRider 2.4s ease-in-out infinite;display:block}
</style>
</head>
<body>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
var CFG=${config};
var map=L.map('map',{zoomControl:false,attributionControl:false});
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,subdomains:['a','b','c']}).addTo(map);
var riderMarker=null;
var driverMarkers={};

var MOTO_SVG='<svg class="moto-svg" xmlns="http://www.w3.org/2000/svg" width="34" height="22" viewBox="0 0 34 22"><circle cx="6.5" cy="15" r="5.5" fill="none" stroke="#00C7C7" stroke-width="2"/><circle cx="6.5" cy="15" r="2" fill="#00C7C7"/><circle cx="27.5" cy="15" r="5.5" fill="none" stroke="#00C7C7" stroke-width="2"/><circle cx="27.5" cy="15" r="2" fill="#00C7C7"/><path d="M6.5,15 L14,7.5 L23,7.5 L27.5,15" fill="none" stroke="#00C7C7" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M14,7.5 L17,3 L21,3 L23,7.5 Z" fill="rgba(0,199,199,0.38)" stroke="#00C7C7" stroke-width="1.3" stroke-linejoin="round"/><path d="M23,8.5 L30,5.5 M23,8.5 L29,11" stroke="#00C7C7" stroke-width="2" stroke-linecap="round"/></svg>';
var CAR_SVG='<svg class="car-svg" xmlns="http://www.w3.org/2000/svg" width="22" height="36" viewBox="0 0 22 36"><rect x="0" y="6" width="5" height="10" rx="2" fill="#0a0c14" opacity="0.9"/><rect x="17" y="6" width="5" height="10" rx="2" fill="#0a0c14" opacity="0.9"/><rect x="0" y="20" width="5" height="10" rx="2" fill="#0a0c14" opacity="0.9"/><rect x="17" y="20" width="5" height="10" rx="2" fill="#0a0c14" opacity="0.9"/><rect x="4" y="2" width="14" height="32" rx="5" fill="rgba(251,191,36,0.18)" stroke="#fbbf24" stroke-width="1.6"/><rect x="5.5" y="2" width="11" height="9.5" rx="3.5" fill="rgba(56,189,248,0.28)"/><rect x="5.5" y="24.5" width="11" height="9.5" rx="3.5" fill="rgba(56,189,248,0.22)"/><rect x="5.5" y="12.5" width="11" height="11" rx="2" fill="rgba(251,191,36,0.38)"/><path d="M3.5,11 L4,9 L4,14.5 L3.5,13 Z" fill="#fbbf24" opacity="0.85"/><path d="M18.5,11 L18,9 L18,14.5 L18.5,13 Z" fill="#fbbf24" opacity="0.85"/><rect x="5" y="1" width="4.5" height="3" rx="1.2" fill="rgba(255,253,176,0.9)"/><rect x="12.5" y="1" width="4.5" height="3" rx="1.2" fill="rgba(255,253,176,0.9)"/><rect x="5" y="32" width="4.5" height="3" rx="1.2" fill="rgba(248,113,113,0.9)"/><rect x="12.5" y="32" width="4.5" height="3" rx="1.2" fill="rgba(248,113,113,0.9)"/></svg>';
var RIDER_SVG='<svg class="rider-svg" xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22"><circle cx="11" cy="11" r="10" fill="rgba(99,102,241,0.15)" stroke="rgba(129,140,248,0.5)" stroke-width="1.5"/><circle cx="11" cy="11" r="5.5" fill="rgba(99,102,241,0.35)" stroke="#818cf8" stroke-width="1.5"/><circle cx="11" cy="11" r="2.5" fill="#818cf8"/></svg>';

function motoIcon(){return L.divIcon({html:MOTO_SVG,iconSize:[34,22],iconAnchor:[17,11],className:''})}
function carIcon(){return L.divIcon({html:CAR_SVG,iconSize:[22,36],iconAnchor:[11,18],className:''})}
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

export function HomeMapView({ riderLat, riderLng, style }: HomeMapViewProps) {
  const webRef = useRef<WebView>(null);
  const [drivers, setDrivers] = useState<NearbyDriverMarker[]>(DEMO_DRIVERS);
  const htmlRef = useRef<string>(
    buildHomeMapHtml({
      riderLat: riderLat ?? null,
      riderLng: riderLng ?? null,
      drivers: DEMO_DRIVERS,
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
      const list = response.drivers.length > 0 ? response.drivers : DEMO_DRIVERS;
      setDrivers(list);
      if (webRef.current) {
        webRef.current.injectJavaScript(
          `updateDrivers(${JSON.stringify(list)});true;`,
        );
      }
    } catch {
      if (webRef.current) {
        webRef.current.injectJavaScript(
          `updateDrivers(${JSON.stringify(DEMO_DRIVERS)});true;`,
        );
      }
    }
  }, [riderLat, riderLng]);

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
    borderRadius: 16,
  },
  webview: {
    flex: 1,
    backgroundColor: '#0a0c0e',
  },
});
