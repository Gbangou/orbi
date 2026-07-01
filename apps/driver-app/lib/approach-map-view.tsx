import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import {
  escapeHtmlText,
  serializeHtmlScriptJson,
  shouldAllowLocalMapWebViewRequest,
} from '@orbi/ui';
import { enqueueDriverMapError } from './map-error-reporting';

const TypedWebView = WebView as any;

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
html,body,#map{width:100%;height:100%;background:#0a0c0e}
.leaflet-tile-pane{filter:brightness(.62) invert(1) contrast(3) hue-rotate(200deg) saturate(.28) brightness(.72)}
.leaflet-control-attribution,.leaflet-control-zoom{display:none}
@keyframes glowDriver{0%,100%{filter:drop-shadow(0 0 3px rgba(129,140,248,.6))}50%{filter:drop-shadow(0 0 9px rgba(129,140,248,1))}}
@keyframes glowRider{0%,100%{filter:drop-shadow(0 0 3px rgba(34,197,94,.6))}50%{filter:drop-shadow(0 0 8px rgba(34,197,94,1))}}
.driver-svg{animation:glowDriver 1.5s ease-in-out infinite;display:block}
.rider-svg{animation:glowRider 2s ease-in-out infinite;display:block}
.driver-wrap{display:flex;flex-direction:column;align-items:center;gap:3px}
.driver-lbl{background:rgba(10,12,14,.92);color:#a5b4fc;font-family:-apple-system,sans-serif;font-size:9px;font-weight:700;padding:2px 6px;border-radius:3px;white-space:nowrap;letter-spacing:.2px;border:1px solid rgba(129,140,248,.25)}
.pickup-wrap{display:flex;flex-direction:column;align-items:center;gap:3px}
.pickup-lbl{background:rgba(10,12,14,.92);color:#86efac;font-family:-apple-system,sans-serif;font-size:9px;font-weight:700;padding:2px 6px;border-radius:3px;white-space:nowrap;max-width:120px;overflow:hidden;text-overflow:ellipsis;border:1px solid rgba(34,197,94,.25)}
</style>
</head>
<body>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
var CFG=${config};
var map=L.map('map',{zoomControl:false,attributionControl:false});
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,subdomains:['a','b','c']}).addTo(map);
var driverMarker=null,pickupMarker=null,routeLine=null;

var DRIVER_SVG='<svg class="driver-svg" xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 26 26"><circle cx="13" cy="13" r="11.5" fill="rgba(99,102,241,0.18)" stroke="rgba(129,140,248,0.45)" stroke-width="1.5"/><circle cx="13" cy="13" r="6.5" fill="rgba(99,102,241,0.5)" stroke="#818cf8" stroke-width="1.8"/><path d="M13 7 L16.5 16 L13 13.5 L9.5 16 Z" fill="white" opacity="0.95"/></svg>';
var RIDER_SVG='<svg class="rider-svg" xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28"><circle cx="14" cy="8" r="5" fill="rgba(34,197,94,0.25)" stroke="#22c55e" stroke-width="1.8"/><path d="M4 26 Q4 18 14 18 Q24 18 24 26" fill="rgba(34,197,94,0.25)" stroke="#22c55e" stroke-width="1.8" stroke-linecap="round"/><circle cx="14" cy="8" r="3" fill="#22c55e"/></svg>';

function driverIcon(){return L.divIcon({html:'<div class="driver-wrap">'+DRIVER_SVG+'<span class="driver-lbl">Vous</span></div>',iconSize:[60,46],iconAnchor:[13,13],className:''})}
function pickupIcon(addr){return L.divIcon({html:'<div class="pickup-wrap">'+RIDER_SVG+'<span class="pickup-lbl">'+addr+'</span></div>',iconSize:[140,50],iconAnchor:[14,14],className:''})}

function drawFallbackLine(lat1,lng1,lat2,lng2){
  if(routeLine){map.removeLayer(routeLine)}
  routeLine=L.polyline([[lat1,lng1],[lat2,lng2]],{color:'#818cf8',weight:2.5,opacity:.45,dashArray:'9 6'}).addTo(map);
}

function fetchApproachRoute(dLat,dLng,pLat,pLng){
  var url='https://router.project-osrm.org/route/v1/driving/'+dLng+','+dLat+';'+pLng+','+pLat+'?geometries=geojson&overview=full';
  fetch(url,{signal:AbortSignal.timeout(6000)})
    .then(function(r){return r.json()})
    .then(function(data){
      if(data.routes&&data.routes[0]&&data.routes[0].geometry&&data.routes[0].geometry.coordinates){
        var coords=data.routes[0].geometry.coordinates.map(function(c){return[c[1],c[0]]});
        if(routeLine){map.removeLayer(routeLine)}
        routeLine=L.polyline(coords,{color:'#818cf8',weight:3.5,opacity:.85}).addTo(map);
      }else{drawFallbackLine(dLat,dLng,pLat,pLng)}
    })
    .catch(function(){drawFallbackLine(dLat,dLng,pLat,pLng)});
}

function initMap(cfg){
  var bounds=[];
  if(cfg.pickupLat&&cfg.pickupLng){
    pickupMarker=L.marker([cfg.pickupLat,cfg.pickupLng],{icon:pickupIcon(cfg.pickupAddress),zIndexOffset:100}).addTo(map);
    bounds.push([cfg.pickupLat,cfg.pickupLng]);
  }
  if(cfg.driverLat&&cfg.driverLng){
    driverMarker=L.marker([cfg.driverLat,cfg.driverLng],{icon:driverIcon(),zIndexOffset:500}).addTo(map);
    bounds.push([cfg.driverLat,cfg.driverLng]);
    if(cfg.pickupLat&&cfg.pickupLng){
      fetchApproachRoute(cfg.driverLat,cfg.driverLng,cfg.pickupLat,cfg.pickupLng);
    }
  }
  if(bounds.length){map.fitBounds(bounds,{padding:[52,52],maxZoom:16})}
  else if(cfg.pickupLat&&cfg.pickupLng){map.setView([cfg.pickupLat,cfg.pickupLng],14)}
  else{map.setView([12.3647,-1.5332],13)}
}

function updateDriver(lat,lng){
  if(!driverMarker){driverMarker=L.marker([lat,lng],{icon:driverIcon(),zIndexOffset:500}).addTo(map)}
  else{driverMarker.setLatLng([lat,lng])}
  if(pickupMarker){
    var pll=pickupMarker.getLatLng();
    fetchApproachRoute(lat,lng,pll.lat,pll.lng);
  }
}

function onMsg(e){try{var m=JSON.parse(e.data);if(m.type==='UPDATE_DRIVER'&&m.lat&&m.lng){updateDriver(m.lat,m.lng)}}catch(x){}}
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
  const webRef = useRef<WebView>(null);
  const htmlRef = useRef<string>(
    buildApproachHtml({
      driverLat: driverLat ?? null,
      driverLng: driverLng ?? null,
      pickupLat: pickupLat ?? null,
      pickupLng: pickupLng ?? null,
      pickupAddress: pickupAddress ?? 'Prise en charge',
    }),
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
