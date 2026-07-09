import { useMemo, useRef } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import {
  escapeHtmlText,
  serializeHtmlScriptJson,
  shouldAllowLocalMapWebViewRequest,
  type OrbiTheme,
} from '@orbi/ui';
import { useOrbiTheme } from '@orbi/ui/native';

const TypedWebView = WebView as any;

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
  ).map((p) => ({
    ...p,
    label: escapeHtmlText(p.label),
  }));
  const payload = serializeHtmlScriptJson(validPins);

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
  const theme = useOrbiTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const webViewRef = useRef<WebView>(null);

  const validPlaces = places.filter(
    (p) => p.latitude !== null && p.longitude !== null,
  );

  if (validPlaces.length === 0) {
    return null;
  }

  const html = buildSavedPlacesMapHtml(validPlaces);

  if (Platform.OS === 'web') {
    return (
      <View style={[styles.container, styles.webFallback, { height }]}>
        <View style={styles.webMapSurface}>
          <View style={styles.webRoute} />
          {validPlaces.slice(0, 4).map((place, index) => (
            <Pressable
              key={place.id}
              accessibilityRole="button"
              accessibilityLabel={`Modifier le lieu ${place.label}`}
              onPress={() => onPlaceSelect?.(place.id)}
              style={[
                styles.webPin,
                {
                  left: `${18 + ((index * 21) % 58)}%`,
                  top: `${20 + ((index * 29) % 52)}%`,
                },
              ]}
            >
              <View style={styles.webPinDot} />
              <Text style={styles.webPinLabel} numberOfLines={1}>
                {place.label}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.webSummary}>
          <Text style={styles.webEyebrow}>Lieux favoris</Text>
          <Text style={styles.webTitle} numberOfLines={1}>
            {validPlaces.length} point{validPlaces.length > 1 ? 's' : ''} verifie{validPlaces.length > 1 ? 's' : ''}
          </Text>
          <Text style={styles.webMeta} numberOfLines={2}>
            Touchez un favori pour le modifier. Carte interactive complete sur mobile.
          </Text>
        </View>
      </View>
    );
  }

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
      <TypedWebView
        ref={webViewRef}
        source={{ html }}
        style={styles.webView}
        scrollEnabled={false}
        onMessage={handleMessage}
        javaScriptEnabled
        originWhitelist={['about:blank', 'https://*']}
        onShouldStartLoadWithRequest={(request: { url: string }) =>
          shouldAllowLocalMapWebViewRequest(request.url)
        }
      />
    </View>
  );
}

const makeStyles = (theme: OrbiTheme) => StyleSheet.create({
  container: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  webView: {
    flex: 1,
    backgroundColor: '#0a0c0e',
  },
  webFallback: {
    backgroundColor: '#0b1215',
  },
  webMapSurface: {
    flex: 1,
    backgroundColor: '#0b1215',
  },
  webRoute: {
    position: 'absolute',
    left: '16%',
    right: '18%',
    top: '49%',
    height: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(129, 140, 248, 0.44)',
    transform: [{ rotate: '-14deg' }],
  },
  webPin: {
    position: 'absolute',
    maxWidth: 116,
    minWidth: 72,
    alignItems: 'center',
    gap: 4,
  },
  webPinDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#818cf8',
    borderWidth: 3,
    borderColor: '#c7d2fe',
    shadowColor: '#818cf8',
    shadowOpacity: 0.45,
    shadowRadius: 8,
  },
  webPinLabel: {
    maxWidth: 116,
    borderRadius: 7,
    paddingHorizontal: 7,
    paddingVertical: 3,
    overflow: 'hidden',
    backgroundColor: 'rgba(10, 12, 20, 0.86)',
    borderWidth: 1,
    borderColor: 'rgba(129, 140, 248, 0.35)',
    color: '#e2e8f0',
    fontSize: 10,
    fontWeight: '800',
  },
  webSummary: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    gap: 3,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
  },
  webEyebrow: {
    color: '#6366f1',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  webTitle: {
    color: '#071311',
    fontSize: 15,
    fontWeight: '900',
  },
  webMeta: {
    color: theme.colors.textMuted,
    fontSize: 12,
    lineHeight: 16,
  },
});
