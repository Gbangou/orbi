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
@keyframes pulse{0%{box-shadow:0 0 0 0 rgba(0,199,199,.65)}70%{box-shadow:0 0 0 12px rgba(0,199,199,0)}100%{box-shadow:0 0 0 0 rgba(0,199,199,0)}}
@keyframes pulseCar{0%{box-shadow:0 0 0 0 rgba(251,191,36,.55)}70%{box-shadow:0 0 0 10px rgba(251,191,36,0)}100%{box-shadow:0 0 0 0 rgba(251,191,36,0)}}
@keyframes pulseRider{0%{box-shadow:0 0 0 0 rgba(99,102,241,.7)}70%{box-shadow:0 0 0 16px rgba(99,102,241,0)}100%{box-shadow:0 0 0 0 rgba(99,102,241,0)}}
.moto-dot{width:12px;height:12px;background:#00C7C7;border-radius:50%;border:2px solid rgba(0,199,199,.4);animation:pulse 1.8s ease-in-out infinite}
.car-dot{width:13px;height:13px;background:#fbbf24;border-radius:3px;border:2px solid rgba(251,191,36,.4);animation:pulseCar 2s ease-in-out infinite}
.rider-outer{width:18px;height:18px;background:rgba(99,102,241,.2);border-radius:50%;display:flex;align-items:center;justify-content:center;animation:pulseRider 2.5s ease-in-out infinite}
.rider-dot{width:10px;height:10px;background:#818cf8;border-radius:50%;border:2px solid #6366f1}
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

function motoIcon(){return L.divIcon({html:'<div class="moto-dot"></div>',iconSize:[12,12],iconAnchor:[6,6],className:''})}
function carIcon(){return L.divIcon({html:'<div class="car-dot"></div>',iconSize:[13,13],iconAnchor:[6,6],className:''})}
function riderIcon(){return L.divIcon({html:'<div class="rider-outer"><div class="rider-dot"></div></div>',iconSize:[18,18],iconAnchor:[9,9],className:''})}

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
