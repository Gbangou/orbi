export const ORBI_MAP_VEHICLE_CSS = `
@keyframes vehiclePulse{0%{box-shadow:0 0 0 0 rgba(0,0,0,.20)}70%{box-shadow:0 0 0 16px rgba(0,0,0,0)}100%{box-shadow:0 0 0 0 rgba(0,0,0,0)}}
.vehicle-wrap{position:relative;display:flex;flex-direction:column;align-items:center;gap:2px;transform:translateZ(0)}
.vehicle-halo{position:absolute;left:50%;top:46%;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:999px;background:rgba(0,0,0,.08);animation:vehiclePulse 1.8s ease-in-out infinite}
.vehicle-body{position:relative;display:block;transform:rotate(var(--bearing,0deg));transform-origin:center center}
.vehicle-svg{position:relative;display:block;filter:drop-shadow(0 8px 8px rgba(0,0,0,.22))}
`;

const MOTO_SVG =
  '<svg class="vehicle-svg" xmlns="http://www.w3.org/2000/svg" width="38" height="66" viewBox="0 0 38 66"><ellipse cx="19" cy="60" rx="12" ry="4" fill="#000000" opacity=".18"/><circle cx="19" cy="9" r="7" fill="#111111"/><circle cx="19" cy="56" r="7" fill="#111111"/><path d="M13 17q-3 8-2 18l2 12q2 6 6 6t6-6l2-12q1-10-2-18q-6-4-12 0z" fill="#FFFFFF" stroke="#111111" stroke-width="2"/><path d="M15 20q4-3 8 0l-2 8h-4z" fill="#D9D9D9"/><rect x="9" y="21" width="20" height="4" rx="2" fill="#111111"/></svg>';

const CAR_SVG =
  '<svg class="vehicle-svg" xmlns="http://www.w3.org/2000/svg" width="54" height="82" viewBox="0 0 54 82"><ellipse cx="27" cy="74" rx="21" ry="6" fill="#000000" opacity=".18"/><rect x="2" y="13" width="9" height="18" rx="4.5" fill="#111111"/><rect x="43" y="13" width="9" height="18" rx="4.5" fill="#111111"/><rect x="2" y="53" width="9" height="18" rx="4.5" fill="#111111"/><rect x="43" y="53" width="9" height="18" rx="4.5" fill="#111111"/><path d="M11 11Q27 4 43 11l4 15v32l-4 13q-16 8-32 0L7 58V26z" fill="#FFFFFF" stroke="#111111" stroke-width="2"/><rect x="15" y="19" width="24" height="15" rx="5" fill="#D9D9D9"/><rect x="14" y="38" width="7" height="15" rx="3.5" fill="#C7C7C7"/><rect x="33" y="38" width="7" height="15" rx="3.5" fill="#C7C7C7"/><rect x="15" y="55" width="24" height="12" rx="5" fill="#D9D9D9"/></svg>';

const BLACK_CAR_SVG =
  '<svg class="vehicle-svg" xmlns="http://www.w3.org/2000/svg" width="54" height="82" viewBox="0 0 54 82"><ellipse cx="27" cy="74" rx="21" ry="6" fill="#000000" opacity=".20"/><rect x="2" y="13" width="9" height="18" rx="4.5" fill="#111111"/><rect x="43" y="13" width="9" height="18" rx="4.5" fill="#111111"/><rect x="2" y="53" width="9" height="18" rx="4.5" fill="#111111"/><rect x="43" y="53" width="9" height="18" rx="4.5" fill="#111111"/><path d="M11 11Q27 4 43 11l4 15v32l-4 13q-16 8-32 0L7 58V26z" fill="#111111" stroke="#000000" stroke-width="2"/><rect x="15" y="19" width="24" height="15" rx="5" fill="#5F5F5F"/><rect x="14" y="38" width="7" height="15" rx="3.5" fill="#2E2E2E"/><rect x="33" y="38" width="7" height="15" rx="3.5" fill="#2E2E2E"/><rect x="15" y="55" width="24" height="12" rx="5" fill="#5F5F5F"/></svg>';

export const ORBI_MAP_VEHICLE_SCRIPT = `
var VEHICLE_ICONS={
'moto-standard':'${MOTO_SVG}',
'car-standard':'${CAR_SVG}',
'car-comfort':'${BLACK_CAR_SVG}',
'car-xl':'${CAR_SVG}'
};
var VEHICLE_SIZES={'moto-standard':[82,94],'car-standard':[94,102],'car-comfort':[94,102],'car-xl':[98,104]};
var VEHICLE_ANCHORS={'moto-standard':[41,42],'car-standard':[47,47],'car-comfort':[47,47],'car-xl':[49,48]};
`;
