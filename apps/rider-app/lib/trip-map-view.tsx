import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import {
  serializeHtmlScriptJson,
  shouldAllowLocalMapWebViewRequest,
} from '@orbi/ui';

const TypedWebView = WebView as any;

export interface TripMapViewProps {
  pickupLat: number | null | undefined;
  pickupLng: number | null | undefined;
  destLat: number | null | undefined;
  destLng: number | null | undefined;
  driverLat: number | null | undefined;
  driverLng: number | null | undefined;
  driverVehicleType?: string | null | undefined;
  style?: object;
}

function buildMapHtml(cfg: {
  pickupLat: number | null;
  pickupLng: number | null;
  destLat: number | null;
  destLng: number | null;
  driverLat: number | null;
  driverLng: number | null;
  driverVehicleType: string | null;
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
@keyframes pulse{0%{box-shadow:0 0 0 0 rgba(0,199,199,.7)}70%{box-shadow:0 0 0 14px rgba(0,199,199,0)}100%{box-shadow:0 0 0 0 rgba(0,199,199,0)}}
.vehicle-wrap{position:relative;display:flex;flex-direction:column;align-items:center;gap:2px;transform:translateZ(0)}
.vehicle-halo{position:absolute;left:50%;top:50%;width:28px;height:28px;margin:-14px 0 0 -14px;border-radius:999px;background:rgba(0,184,148,.18);animation:pulse 1.7s ease-in-out infinite}
.vehicle-svg{position:relative;display:block;filter:drop-shadow(0 8px 10px rgba(0,0,0,.38))}
.driver-label{position:relative;background:rgba(7,19,17,.94);color:#b8fff0;font-family:-apple-system,sans-serif;font-size:10px;font-weight:800;padding:3px 7px;border-radius:7px;letter-spacing:.2px;white-space:nowrap;border:1px solid rgba(0,184,148,.24);box-shadow:0 4px 10px rgba(0,0,0,.24)}
.pickup-pin{display:flex;align-items:center;gap:4px}
.pickup-pin-dot{width:10px;height:10px;background:#22c55e;border-radius:50%;border:2px solid #16a34a;flex-shrink:0}
.pickup-pin-label{background:rgba(7,19,17,.92);color:#b8fff0;font-family:-apple-system,sans-serif;font-size:10px;font-weight:800;padding:3px 7px;border-radius:6px;letter-spacing:.2px;white-space:nowrap}
.dest-pin{display:flex;align-items:center;gap:4px}
.dest-pin-dot{width:10px;height:10px;background:#f59e0b;border-radius:50%;border:2px solid #d97706;flex-shrink:0}
.dest-pin-label{background:rgba(7,19,17,.92);color:#ffe39a;font-family:-apple-system,sans-serif;font-size:10px;font-weight:800;padding:3px 7px;border-radius:6px;letter-spacing:.2px;white-space:nowrap}
</style>
</head>
<body>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
var CFG=${config};
var map=L.map('map',{zoomControl:false,attributionControl:false});
L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',{maxZoom:19,subdomains:['a','b','c','d']}).addTo(map);
var driverMarker=null,pickupMarker=null,destMarker=null,routeLine=null;

var DRIVER_CAR_SVG='<svg class="vehicle-svg" xmlns="http://www.w3.org/2000/svg" width="42" height="74" viewBox="0 0 42 74"><defs><linearGradient id="rcBody" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#f8fbff"/><stop offset="45%" stop-color="#cdd8e4"/><stop offset="100%" stop-color="#7d8b9a"/></linearGradient><linearGradient id="rcGlass" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#405a74"/><stop offset="100%" stop-color="#0b1622"/></linearGradient><radialGradient id="rcWheel" cx="35%" cy="30%" r="70%"><stop offset="0%" stop-color="#6c7480"/><stop offset="100%" stop-color="#07090d"/></radialGradient></defs><ellipse cx="21" cy="68" rx="18" ry="5" fill="#000" opacity=".26"/><rect x="1" y="8" width="8" height="14" rx="4" fill="url(#rcWheel)"/><rect x="33" y="8" width="8" height="14" rx="4" fill="url(#rcWheel)"/><rect x="1" y="51" width="8" height="15" rx="4" fill="url(#rcWheel)"/><rect x="33" y="51" width="8" height="15" rx="4" fill="url(#rcWheel)"/><path d="M8 8Q21 2 34 8v55Q21 70 8 63z" fill="url(#rcBody)"/><path d="M10 8q11-4 22 0v12q-11-2-22 0z" fill="#eef6ff" opacity=".9"/><rect x="11" y="15" width="20" height="13" rx="4" fill="url(#rcGlass)"/><rect x="9" y="29" width="5" height="15" rx="2.5" fill="#122235" opacity=".82"/><rect x="28" y="29" width="5" height="15" rx="2.5" fill="#122235" opacity=".82"/><rect x="13" y="28" width="16" height="18" rx="4" fill="#b4c2d0"/><rect x="11" y="45" width="20" height="12" rx="4" fill="url(#rcGlass)"/><rect x="10" y="5" width="7" height="3" rx="1.5" fill="#fff6c9"/><rect x="25" y="5" width="7" height="3" rx="1.5" fill="#fff6c9"/><rect x="10" y="64" width="7" height="3" rx="1.5" fill="#ff3b30"/><rect x="25" y="64" width="7" height="3" rx="1.5" fill="#ff3b30"/></svg>';
var DRIVER_MOTO_SVG='<svg class="vehicle-svg" xmlns="http://www.w3.org/2000/svg" width="30" height="58" viewBox="0 0 30 58"><defs><linearGradient id="rmBody" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#0f172a"/><stop offset="52%" stop-color="#00c7c7"/><stop offset="100%" stop-color="#111827"/></linearGradient><radialGradient id="rmWheel" cx="35%" cy="30%" r="70%"><stop offset="0%" stop-color="#56606d"/><stop offset="100%" stop-color="#05070a"/></radialGradient></defs><ellipse cx="15" cy="54" rx="12" ry="3.6" fill="#000" opacity=".25"/><ellipse cx="15" cy="8" rx="8.8" ry="7" fill="url(#rmWheel)"/><ellipse cx="15" cy="49" rx="8.8" ry="7" fill="url(#rmWheel)"/><path d="M10 15q-2.5 4-2 11l1 9q1 4 4 5h4q3-1 4-5l1-9q.5-7-2-11z" fill="url(#rmBody)"/><ellipse cx="15" cy="22" rx="5.8" ry="7" fill="#172033"/><path d="M12 38q3 2.8 6 0v9q-3 2.4-6 0z" fill="#070b12"/><rect x="5" y="17" width="20" height="4" rx="2" fill="#00c7c7"/><ellipse cx="15" cy="11.5" rx="4.2" ry="2.4" fill="#fff7c2"/><rect x="12" y="50.5" width="6" height="2.5" rx="1.2" fill="#ff3b30"/></svg>';

function isMoto(){var t=(CFG.driverVehicleType||'').toUpperCase();return t.indexOf('MOTO')>=0||t.indexOf('MOTORCYCLE')>=0}
function driverIcon(){
  var svg=isMoto()?DRIVER_MOTO_SVG:DRIVER_CAR_SVG;
  var size=isMoto()?[86,86]:[92,98];
  var anchor=isMoto()?[43,38]:[46,44];
  return L.divIcon({html:'<div class="vehicle-wrap"><span class="vehicle-halo"></span>'+svg+'<span class="driver-label">Chauffeur</span></div>',iconSize:size,iconAnchor:anchor,className:''})
}
function pickupIcon(){return L.divIcon({html:'<div class="pickup-pin"><div class="pickup-pin-dot"></div><div class="pickup-pin-label">Depart</div></div>',iconSize:[72,18],iconAnchor:[5,9],className:''})}
function destIcon(){return L.divIcon({html:'<div class="dest-pin"><div class="dest-pin-dot"></div><div class="dest-pin-label">Arrivee</div></div>',iconSize:[72,18],iconAnchor:[5,9],className:''})}

function drawFallbackLine(lat1,lng1,lat2,lng2){
  if(routeLine){map.removeLayer(routeLine)}
  routeLine=L.polyline([[lat1,lng1],[lat2,lng2]],{color:'#00B894',weight:3,opacity:.55,dashArray:'8 6'}).addTo(map);
}

function fetchOsrmRoute(lat1,lng1,lat2,lng2){
  var url='https://router.project-osrm.org/route/v1/driving/'+lng1+','+lat1+';'+lng2+','+lat2+'?geometries=geojson&overview=full';
  fetch(url,{signal:AbortSignal.timeout(6000)})
    .then(function(r){return r.json()})
    .then(function(data){
      if(data.routes&&data.routes[0]&&data.routes[0].geometry&&data.routes[0].geometry.coordinates){
        var coords=data.routes[0].geometry.coordinates.map(function(c){return[c[1],c[0]]});
        if(routeLine){map.removeLayer(routeLine)}
        routeLine=L.polyline(coords,{color:'#00B894',weight:4,opacity:.88}).addTo(map);
      }else{drawFallbackLine(lat1,lng1,lat2,lng2)}
    })
    .catch(function(){drawFallbackLine(lat1,lng1,lat2,lng2)});
}

function initMap(cfg){
  var bounds=[];
  if(cfg.pickupLat&&cfg.pickupLng){pickupMarker=L.marker([cfg.pickupLat,cfg.pickupLng],{icon:pickupIcon()}).addTo(map);bounds.push([cfg.pickupLat,cfg.pickupLng])}
  if(cfg.destLat&&cfg.destLng){destMarker=L.marker([cfg.destLat,cfg.destLng],{icon:destIcon()}).addTo(map);bounds.push([cfg.destLat,cfg.destLng])}
  if(cfg.pickupLat&&cfg.pickupLng&&cfg.destLat&&cfg.destLng){
    fetchOsrmRoute(cfg.pickupLat,cfg.pickupLng,cfg.destLat,cfg.destLng);
  }
  if(cfg.driverLat&&cfg.driverLng){driverMarker=L.marker([cfg.driverLat,cfg.driverLng],{icon:driverIcon()}).addTo(map);bounds.push([cfg.driverLat,cfg.driverLng])}
  if(bounds.length){map.fitBounds(bounds,{padding:[44,44]})}else{map.setView([12.3647,-1.5332],13)}
}

function updateDriver(lat,lng){
  if(!driverMarker){driverMarker=L.marker([lat,lng],{icon:driverIcon()}).addTo(map)}
  else{driverMarker.setLatLng([lat,lng])}
  map.panTo([lat,lng],{animate:true,duration:.55});
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
  driverVehicleType,
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
      driverVehicleType: driverVehicleType ?? null,
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
    borderRadius: 14,
  },
  webview: {
    flex: 1,
    backgroundColor: '#eef3f1',
  },
});
