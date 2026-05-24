import { useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { orbiTheme } from '@orbi/ui';

const OUAGA_LAT = 12.3647;
const OUAGA_LNG = -1.5332;

export interface SavedPlacePin {
  id: string;
  label: string;
  latitude: number | null;
  longitude: number | null;
}

export interface SavedPlacesMapProps {
  places: SavedPlacePin[];
  onPlaceSelect?: (placeId: string) => void;
  height?: number;
}

function buildSavedPlacesMapHtml(pins: SavedPlacePin[]): string {
  const validPins = pins.filter(
    (p) => p.latitude !== null && p.longitude !== null,
  );
  const payload = JSON.stringify(validPins);

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
.place-pin{display:flex;flex-direction:column;align-items:center;gap:2px;cursor:pointer}
.place-dot{width:13px;height:13px;border-radius:50%;background:#6366f1;border:2.5px solid #818cf8;box-shadow:0 0 7px rgba(99,102,241,0.7)}
.place-label{background:rgba(10,12,20,0.88);color:#e2e8f0;font-size:10px;font-family:sans-serif;font-weight:700;padding:2px 6px;border-radius:5px;white-space:nowrap;max-width:90px;overflow:hidden;text-overflow:ellipsis;border:1px solid rgba(129,140,248,0.35)}
</style>
</head>
<body>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
var PINS=${payload};
var map=L.map('map',{zoomControl:false,attributionControl:false,dragging:true,touchZoom:true});
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,subdomains:['a','b','c']}).addTo(map);

function pinIcon(label){
  var safe=label.replace(/</g,'&lt;').replace(/>/g,'&gt;');
  var html='<div class="place-pin"><div class="place-dot"></div><div class="place-label">'+safe+'</div></div>';
  return L.divIcon({html:html,iconSize:[90,36],iconAnchor:[45,13],className:''});
}

if(PINS.length===0){
  map.setView([${OUAGA_LAT},${OUAGA_LNG}],13);
} else if(PINS.length===1){
  map.setView([PINS[0].latitude,PINS[0].longitude],15);
} else {
  var bounds=L.latLngBounds(PINS.map(function(p){return[p.latitude,p.longitude]}));
  map.fitBounds(bounds,{padding:[24,24]});
}

PINS.forEach(function(p){
  var m=L.marker([p.latitude,p.longitude],{icon:pinIcon(p.label)}).addTo(map);
  m.on('click',function(){
    try{window.ReactNativeWebView.postMessage(JSON.stringify({placeId:p.id}))}catch(e){}
  });
});
</script>
</body>
</html>`;
}

export function SavedPlacesMap({
  places,
  onPlaceSelect,
  height = 200,
}: SavedPlacesMapProps) {
  const webViewRef = useRef<WebView>(null);

  const validPlaces = places.filter(
    (p) => p.latitude !== null && p.longitude !== null,
  );

  if (validPlaces.length === 0) {
    return null;
  }

  const html = buildSavedPlacesMapHtml(validPlaces);

  function handleMessage(event: WebViewMessageEvent) {
    try {
      const data = JSON.parse(event.nativeEvent.data) as { placeId?: string };
      if (data.placeId && onPlaceSelect) {
        onPlaceSelect(data.placeId);
      }
    } catch {
      // message malformé — ignoré silencieusement
    }
  }

  return (
    <View style={[styles.container, { height }]}>
      <WebView
        ref={webViewRef}
        source={{ html }}
        style={styles.webView}
        scrollEnabled={false}
        onMessage={handleMessage}
        javaScriptEnabled
        originWhitelist={['*']}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: orbiTheme.colors.border,
  },
  webView: {
    flex: 1,
    backgroundColor: '#0a0c0e',
  },
});
