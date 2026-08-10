'use client';

import { useEffect, useRef } from 'react';
import type { AdminLiveOpsResponse } from '@orbi/api';

type TripMarker = {
  id: string;
  lat: number;
  lng: number;
  status: string;
  route: string;
  hasIncident: boolean;
  monitorState: string;
};

function buildTripMarkers(
  trips: AdminLiveOpsResponse['trips'],
): TripMarker[] {
  return trips.flatMap((trip) => {
    const pos = trip.routeMonitoring.latestPosition;
    if (!pos) return [];
    return [
      {
        id: trip.id,
        lat: pos.latitude,
        lng: pos.longitude,
        status: trip.status,
        route: trip.route,
        hasIncident: trip.hasIncident,
        monitorState: trip.routeMonitoring.state,
      },
    ];
  });
}

function buildMapHtml(markers: TripMarker[]): string {
  const data = JSON.stringify(markers);
  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body,#map{width:100%;height:100%;background:#07111d}
.leaflet-tile-pane{filter:brightness(.62) invert(1) contrast(3) hue-rotate(200deg) saturate(.28) brightness(.72)}
.leaflet-control-attribution{display:none}
@keyframes pulse{0%{box-shadow:0 0 0 0 rgba(0,199,199,.7)}70%{box-shadow:0 0 0 10px rgba(0,199,199,0)}100%{box-shadow:0 0 0 0 rgba(0,199,199,0)}}
@keyframes pulseWarn{0%{box-shadow:0 0 0 0 rgba(251,191,36,.7)}70%{box-shadow:0 0 0 10px rgba(251,191,36,0)}100%{box-shadow:0 0 0 0 rgba(251,191,36,0)}}
@keyframes pulseAlert{0%{box-shadow:0 0 0 0 rgba(248,113,113,.8)}70%{box-shadow:0 0 0 12px rgba(248,113,113,0)}100%{box-shadow:0 0 0 0 rgba(248,113,113,0)}}
.dot-ok{width:12px;height:12px;background:#00C7C7;border-radius:50%;border:2px solid rgba(0,199,199,.35);animation:pulse 2s ease-in-out infinite}
.dot-warn{width:12px;height:12px;background:#fbbf24;border-radius:50%;border:2px solid rgba(251,191,36,.35);animation:pulseWarn 1.8s ease-in-out infinite}
.dot-alert{width:14px;height:14px;background:#f87171;border-radius:50%;border:2px solid rgba(248,113,113,.4);animation:pulseAlert 1.5s ease-in-out infinite}
.trip-popup{font-family:-apple-system,sans-serif;font-size:11px;min-width:160px}
.trip-popup strong{display:block;margin-bottom:3px;font-size:12px}
.trip-popup .badge{display:inline-block;padding:1px 6px;border-radius:4px;font-size:10px;font-weight:700;margin-top:3px}
</style>
</head>
<body>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
var MARKERS=${data};
var map=L.map('map',{attributionControl:false});
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,subdomains:['a','b','c']}).addTo(map);

var tripLayers={};

function dotHtml(state,hasIncident){
  if(hasIncident||state==='critical')return '<div class="dot-alert"></div>';
  if(state==='warning')return '<div class="dot-warn"></div>';
  return '<div class="dot-ok"></div>';
}

function statusColor(status){
  if(status==='IN_PROGRESS')return '#00C7C7';
  if(status==='DRIVER_ARRIVING')return '#38bdf8';
  if(status==='MATCHED')return '#818cf8';
  return '#6b7280';
}

function badgeStyle(state){
  if(state==='critical')return 'background:rgba(248,113,113,.18);color:#fca5a5';
  if(state==='warning')return 'background:rgba(251,191,36,.15);color:#fde68a';
  return 'background:rgba(0,199,199,.12);color:#67e8f9';
}

function initMarkers(markers){
  var bounds=[];
  markers.forEach(function(m){
    var icon=L.divIcon({html:dotHtml(m.monitorState,m.hasIncident),iconSize:[14,14],iconAnchor:[7,7],className:''});
    var popup='<div class="trip-popup"><strong>'+m.route+'</strong>'
      +'<span class="badge" style="'+badgeStyle(m.monitorState)+'">'+m.status+'</span>'
      +(m.hasIncident?'<span class="badge" style="background:rgba(248,113,113,.18);color:#fca5a5;margin-left:4px">Incident</span>':'')
      +'</div>';
    var marker=L.marker([m.lat,m.lng],{icon:icon}).bindPopup(popup);
    marker.addTo(map);
    tripLayers[m.id]=marker;
    bounds.push([m.lat,m.lng]);
  });
  if(bounds.length){map.fitBounds(bounds,{padding:[40,40],maxZoom:15})}
  else{map.setView([12.3647,-1.5332],13)}
}

function updateMarkers(markers){
  var seen={};
  markers.forEach(function(m){
    seen[m.id]=true;
    var icon=L.divIcon({html:dotHtml(m.monitorState,m.hasIncident),iconSize:[14,14],iconAnchor:[7,7],className:''});
    if(tripLayers[m.id]){
      tripLayers[m.id].setLatLng([m.lat,m.lng]);
      tripLayers[m.id].setIcon(icon);
    }else{
      var popup='<div class="trip-popup"><strong>'+m.route+'</strong>'
        +'<span class="badge" style="'+badgeStyle(m.monitorState)+'">'+m.status+'</span>'
        +'</div>';
      tripLayers[m.id]=L.marker([m.lat,m.lng],{icon:icon}).bindPopup(popup).addTo(map);
    }
  });
  Object.keys(tripLayers).forEach(function(id){
    if(!seen[id]){map.removeLayer(tripLayers[id]);delete tripLayers[id];}
  });
}

function onMsg(e){
  if(!e||typeof e.data!=='string')return;
  var m=null;
  try{m=JSON.parse(e.data)}catch(x){return}
  if(m.type==='UPDATE'&&m.markers)updateMarkers(m.markers);
}
window.addEventListener('message',onMsg);
initMarkers(MARKERS);
</script>
</body>
</html>`;
}

interface LiveOpsMapProps {
  trips: AdminLiveOpsResponse['trips'];
}

export function LiveOpsMap({ trips }: LiveOpsMapProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const initialHtmlRef = useRef<string>(
    buildMapHtml(buildTripMarkers(trips)),
  );

  useEffect(() => {
    const markers = buildTripMarkers(trips);
    iframeRef.current?.contentWindow?.postMessage(
      JSON.stringify({ type: 'UPDATE', markers }),
      '*',
    );
  }, [trips]);

  return (
    <div
      style={{
        width: '100%',
        height: 340,
        borderRadius: 12,
        overflow: 'hidden',
        border: '1px solid #1e3448',
        background: '#07111d',
        position: 'relative',
      }}
    >
      <iframe
        ref={iframeRef}
        srcDoc={initialHtmlRef.current}
        style={{ width: '100%', height: '100%', border: 'none' }}
        sandbox="allow-scripts allow-same-origin"
        title="Carte LiveOps — courses actives"
      />
      <div
        style={{
          position: 'absolute',
          top: 10,
          left: 12,
          background: 'rgba(7,17,29,0.84)',
          border: '1px solid #1e3448',
          borderRadius: 20,
          padding: '4px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          pointerEvents: 'none',
        }}
      >
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: '#00C7C7',
            display: 'inline-block',
          }}
        />
        <span
          style={{
            color: '#e2e8f0',
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: 0.3,
            fontFamily: '-apple-system, sans-serif',
          }}
        >
          {trips.filter((t) => t.routeMonitoring.latestPosition).length} cours
          avec GPS ·{' '}
          <span style={{ color: '#f87171' }}>
            {
              trips.filter(
                (t) =>
                  t.routeMonitoring.state === 'critical' || t.hasIncident,
              ).length
            }{' '}
            alerte(s)
          </span>
        </span>
      </div>
    </div>
  );
}
