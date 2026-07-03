/**
 * Vehicle illustrations — SVG avatars styled after Uber / Bolt / Yango.
 * 3/4 front-left-above isometric view for cars; side view for motos.
 * ViewBox: 0 0 160 120 for all — rendered inside a 108×84 avatar container.
 */
import React, { memo } from 'react';
import { View } from 'react-native';
import Svg, {
  Defs,
  LinearGradient,
  RadialGradient,
  Stop,
  Path,
  Circle,
  Ellipse,
  G,
  Rect,
  Line,
} from 'react-native-svg';

const W = 160;
const H = 120;
const V = `0 0 ${W} ${H}`;

// ── Shared primitives ──────────────────────────────────────────────────────────

function Shadow({ cx = 80, rx = 70, ry = 6 }: { cx?: number; rx?: number; ry?: number }) {
  return <Ellipse cx={cx} cy={114} rx={rx} ry={ry} fill="rgba(7,19,17,0.22)" />;
}

function AlloyWheel({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  const r1 = r * 0.85;   // tyre inner
  const r2 = r * 0.64;   // rim inner
  const r3 = r * 0.22;   // hub
  const spokeW = r * 0.10;
  const spokeAngles = [0, 72, 144, 216, 288]; // 5-spoke
  return (
    <G>
      {/* Tyre */}
      <Circle cx={cx} cy={cy} r={r} fill="#1A1B20" />
      <Circle cx={cx} cy={cy} r={r1} fill="#242630" />
      {/* Spokes */}
      {spokeAngles.map((deg) => {
        const rad = (deg * Math.PI) / 180;
        const x1 = cx + Math.cos(rad) * r3;
        const y1 = cy + Math.sin(rad) * r3;
        const x2 = cx + Math.cos(rad) * r2;
        const y2 = cy + Math.sin(rad) * r2;
        return (
          <Line
            key={deg}
            x1={x1} y1={y1} x2={x2} y2={y2}
            stroke="#8C96B0"
            strokeWidth={spokeW}
            strokeLinecap="round"
          />
        );
      })}
      {/* Brake disc glimpse */}
      <Circle cx={cx} cy={cy} r={r2} fill="none" stroke="#606880" strokeWidth={1} />
      {/* Hub */}
      <Circle cx={cx} cy={cy} r={r3} fill="#B0B8CC" />
      <Circle cx={cx} cy={cy} r={r3 * 0.45} fill="#D4D8E4" />
    </G>
  );
}

// ── Moto Standard — Orbi Emerald #00B894 ──────────────────────────────────────
export const MotoStandardIllustration = memo(function MotoStandardIllustration() {
  return (
    <Svg width={W} height={H} viewBox={V}>
      <Defs>
        <LinearGradient id="mst_body" x1="0" y1="0" x2="0.6" y2="1">
          <Stop offset="0" stopColor="#04EBBC" />
          <Stop offset="0.45" stopColor="#00C496" />
          <Stop offset="1" stopColor="#007558" />
        </LinearGradient>
        <LinearGradient id="mst_shade" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#00A880" />
          <Stop offset="1" stopColor="#005040" />
        </LinearGradient>
        <RadialGradient id="mst_spec" cx="38%" cy="28%" rx="40%" ry="36%">
          <Stop offset="0" stopColor="#AAFFF0" stopOpacity={0.60} />
          <Stop offset="1" stopColor="#00C496" stopOpacity={0} />
        </RadialGradient>
        <LinearGradient id="mst_glass" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#C8F0FF" stopOpacity={0.90} />
          <Stop offset="1" stopColor="#6ABCDC" stopOpacity={0.70} />
        </LinearGradient>
        <LinearGradient id="mst_seat" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#2C303C" />
          <Stop offset="1" stopColor="#14161C" />
        </LinearGradient>
        <LinearGradient id="mst_frame" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#28303E" />
          <Stop offset="1" stopColor="#0E1016" />
        </LinearGradient>
      </Defs>

      <Shadow cx={78} rx={60} />

      {/* Rear wheel */}
      <AlloyWheel cx={36} cy={92} r={22} />
      {/* Front wheel */}
      <AlloyWheel cx={120} cy={92} r={22} />

      {/* Fork (front suspension) */}
      <Path d="M 110,64 L 120,72 L 122,92 M 116,62 L 124,70 L 126,92"
        stroke="#3A4050" strokeWidth={3} fill="none" strokeLinecap="round" />

      {/* Swingarm */}
      <Path d="M 36,82 C 50,72 66,64 82,62 L 96,62 L 110,68"
        stroke="#1A1C22" strokeWidth={4} fill="none" strokeLinecap="round" />

      {/* Engine block */}
      <Path d="M 52,76 L 60,58 L 96,56 L 108,68 L 92,82 L 56,82 Z"
        fill="url(#mst_frame)" />
      {/* Engine rib detail */}
      <Line x1={68} y1={58} x2={66} y2={80} stroke="#323848" strokeWidth={1} />
      <Line x1={80} y1={57} x2={78} y2={80} stroke="#323848" strokeWidth={1} />

      {/* Main tank body */}
      <Path d="M 56,58 L 62,26 L 100,22 L 110,40 L 100,58 L 56,58 Z"
        fill="url(#mst_body)" />
      {/* Specular highlight on tank */}
      <Path d="M 56,58 L 62,26 L 100,22 L 110,40 L 100,58 L 56,58 Z"
        fill="url(#mst_spec)" />
      {/* Tank dark flank */}
      <Path d="M 64,26 L 68,42 L 86,46 L 98,42 L 100,22 Z"
        fill="url(#mst_shade)" fillOpacity={0.5} />

      {/* Upper front fairing */}
      <Path d="M 100,22 L 112,38 L 126,38 L 128,22 L 116,12 Z"
        fill="#00A880" />
      <Path d="M 100,22 L 112,38 L 126,38 L 128,22 L 116,12 Z"
        fill="url(#mst_spec)" />

      {/* Windscreen */}
      <Path d="M 102,20 L 114,14 L 122,18 L 110,26 Z"
        fill="url(#mst_glass)" />
      {/* Windscreen shine */}
      <Path d="M 104,18 L 112,14 L 114,16 L 106,20 Z"
        fill="#FFFFFF" fillOpacity={0.45} />

      {/* Headlight housing */}
      <Path d="M 122,28 L 130,22 L 136,30 L 128,38 Z"
        fill="#181A22" />
      {/* LED DRL strip */}
      <Rect x={122} y={28} width={14} height={2.5} rx={1.5}
        fill="#FFFFFF" fillOpacity={0.95} transform="rotate(-10,129,29)" />
      {/* Headlight beam */}
      <Ellipse cx={130} cy={34} rx={5} ry={4} fill="#FFE8A0" />

      {/* Seat */}
      <Path d="M 56,58 L 62,26 L 74,28 L 74,52 L 66,60 Z"
        fill="url(#mst_seat)" />
      {/* Seat highlight edge */}
      <Path d="M 62,26 L 74,28 L 74,30 L 62,28 Z"
        fill="#3A3E4E" />

      {/* Rear body / tail */}
      <Path d="M 34,72 L 56,58 L 68,60 L 66,74 L 42,80 Z"
        fill="#008868" />
      {/* Rear taillight */}
      <Path d="M 32,74 L 36,64 L 44,66 L 42,78 Z"
        fill="#FF2828" fillOpacity={0.95} />
      <Path d="M 34,72 L 36,66 L 40,67 L 38,73 Z"
        fill="#FF8888" fillOpacity={0.6} />

      {/* Handlebar */}
      <Path d="M 110,36 L 122,22 L 126,24 L 116,40 Z"
        fill="#2E3240" />
      {/* Mirror */}
      <Path d="M 122,22 L 128,16 L 132,18 L 126,24 Z"
        fill="#3A4050" />
      {/* Mirror glass */}
      <Path d="M 123,20 L 128,16 L 130,17 L 125,21 Z"
        fill="#8EC8E0" fillOpacity={0.7} />

      {/* Exhaust pipe */}
      <Path d="M 48,78 C 46,84 44,88 42,92"
        stroke="#4A4E60" strokeWidth={5} fill="none" strokeLinecap="round" />
      <Path d="M 48,78 C 46,84 44,88 42,92"
        stroke="#5E6278" strokeWidth={3} fill="none" strokeLinecap="round" />
    </Svg>
  );
});

// ── Car Standard — Pearl White sedan ──────────────────────────────────────────
export const CarStandardIllustration = memo(function CarStandardIllustration() {
  return (
    <Svg width={W} height={H} viewBox={V}>
      <Defs>
        {/* Side face gradients */}
        <LinearGradient id="cs_side" x1="0" y1="0" x2="0.8" y2="1">
          <Stop offset="0" stopColor="#F2F5F8" />
          <Stop offset="0.6" stopColor="#E0E4EC" />
          <Stop offset="1" stopColor="#C8CDD8" />
        </LinearGradient>
        {/* Specular reflection on door */}
        <RadialGradient id="cs_spec" cx="42%" cy="36%" rx="50%" ry="44%">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.72} />
          <Stop offset="1" stopColor="#F0F4F8" stopOpacity={0} />
        </RadialGradient>
        {/* Top face */}
        <LinearGradient id="cs_top" x1="0" y1="0" x2="0.7" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" />
          <Stop offset="1" stopColor="#D0D5E0" />
        </LinearGradient>
        {/* Front face (right strip) */}
        <LinearGradient id="cs_front" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#CDD2DE" />
          <Stop offset="1" stopColor="#A8B0C0" />
        </LinearGradient>
        {/* Windshield */}
        <LinearGradient id="cs_wind" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#B8D8F8" stopOpacity={0.90} />
          <Stop offset="1" stopColor="#70A8D8" stopOpacity={0.82} />
        </LinearGradient>
        {/* Side glass */}
        <LinearGradient id="cs_glass" x1="0" y1="0" x2="0.8" y2="1">
          <Stop offset="0" stopColor="#A8D0F0" stopOpacity={0.85} />
          <Stop offset="1" stopColor="#6090C0" stopOpacity={0.75} />
        </LinearGradient>
      </Defs>

      <Shadow rx={74} />

      {/* Wheels — drawn first (partially behind body) */}
      <AlloyWheel cx={42} cy={96} r={19} />
      <AlloyWheel cx={116} cy={96} r={19} />

      {/* ── Side face ── */}
      <Path
        d="M 10,90
           C 10,70 16,52 26,42
           C 36,28 50,20 62,18
           L 96,14
           L 122,20
           C 130,28 134,38 138,48
           C 140,56 144,66 146,74
           L 148,90 Z"
        fill="url(#cs_side)"
      />
      {/* Door reflection / specular */}
      <Path
        d="M 10,90
           C 10,70 16,52 26,42
           C 36,28 50,20 62,18
           L 96,14
           L 122,20
           C 130,28 134,38 138,48
           C 140,56 144,66 146,74
           L 148,90 Z"
        fill="url(#cs_spec)"
      />
      {/* Lower body shadow (wheel arch area) */}
      <Path d="M 10,72 L 148,72 L 148,90 L 10,90 Z"
        fill="#B8C0D0" fillOpacity={0.25} />
      {/* Body side line (beltline) */}
      <Path d="M 14,60 C 30,52 58,42 80,38 C 100,34 128,36 142,50"
        stroke="#DADFE8" strokeWidth={1.5} fill="none" />

      {/* ── Top face (roof + hood viewed from above) ── */}
      <Path
        d="M 26,42
           C 36,28 50,20 62,18
           L 96,14 L 122,20
           C 130,28 134,38 138,48
           L 148,40
           C 144,30 138,20 130,12
           L 106,6
           C 88,4 64,8 48,14
           L 34,34 Z"
        fill="url(#cs_top)"
      />
      {/* Roof specular highlight */}
      <Path
        d="M 50,18 C 70,12 90,10 110,14 L 106,6 C 86,2 64,6 46,12 Z"
        fill="#FFFFFF" fillOpacity={0.55} />

      {/* ── Front face ── */}
      <Path d="M 146,74 L 148,90 L 156,86 L 154,70 Z"
        fill="url(#cs_front)" />

      {/* ── Windshield (on top face, A-pillar area) ── */}
      <Path
        d="M 96,14 L 122,20 C 130,28 134,38 138,48
           L 148,40 C 144,30 138,20 130,12 L 106,6 Z"
        fill="url(#cs_wind)"
      />
      {/* Windshield reflection stripe */}
      <Path d="M 100,12 L 128,14 L 134,20 L 108,18 Z"
        fill="#FFFFFF" fillOpacity={0.38} />

      {/* ── Side glass (driver windows) ── */}
      <Path
        d="M 28,46 C 36,30 50,22 62,20
           L 96,16 L 118,22
           C 124,30 128,38 130,46
           L 108,50 L 76,50 L 50,54 Z"
        fill="url(#cs_glass)"
      />
      {/* Window shine */}
      <Path d="M 34,42 L 62,22 L 74,22 L 48,44 Z"
        fill="#FFFFFF" fillOpacity={0.28} />
      {/* B-pillar */}
      <Rect x={78} y={20} width={4} height={32} rx={2}
        fill="#D0D5E0" fillOpacity={0.9}
        transform="rotate(-6,80,36)" />

      {/* ── Headlight — LED bar ── */}
      <Path d="M 146,60 L 154,56 L 154,70 L 146,72 Z"
        fill="#EEF4FF" />
      <Rect x={146} y={60} width={8} height={3} rx={1.5}
        fill="#FFFFFF" fillOpacity={0.95} />
      {/* ── Tail light ── */}
      <Path d="M 10,64 L 10,80 L 14,80 L 14,64 Z"
        fill="#FF2C2C" fillOpacity={0.95} />
      <Path d="M 10,64 L 10,72 L 13,72 L 13,64 Z"
        fill="#FF9090" fillOpacity={0.6} />

      {/* ── Grille (front face) ── */}
      <Path d="M 148,72 L 154,68 L 156,80 L 150,84 Z"
        fill="#B8C0D0" />
      <Line x1={148} y1={75} x2={155} y2={72} stroke="#9098A8" strokeWidth={1} />
      <Line x1={148} y1={79} x2={155} y2={76} stroke="#9098A8" strokeWidth={1} />
    </Svg>
  );
});

// ── Car Comfort — Midnight Black premium sedan ─────────────────────────────────
export const CarComfortIllustration = memo(function CarComfortIllustration() {
  return (
    <Svg width={W} height={H} viewBox={V}>
      <Defs>
        <LinearGradient id="cc_side" x1="0" y1="0" x2="0.9" y2="1">
          <Stop offset="0" stopColor="#2E3240" />
          <Stop offset="0.5" stopColor="#1C1F2C" />
          <Stop offset="1" stopColor="#0C0E18" />
        </LinearGradient>
        {/* Specular reflection — bright strip on dark car */}
        <LinearGradient id="cc_ref" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#5060A0" stopOpacity={0.55} />
          <Stop offset="0.5" stopColor="#3848801" stopOpacity={0.25} />
          <Stop offset="1" stopColor="#1A2040" stopOpacity={0} />
        </LinearGradient>
        <RadialGradient id="cc_spec" cx="50%" cy="30%" rx="50%" ry="40%">
          <Stop offset="0" stopColor="#8090C8" stopOpacity={0.50} />
          <Stop offset="1" stopColor="#1C2030" stopOpacity={0} />
        </RadialGradient>
        <LinearGradient id="cc_top" x1="0" y1="0" x2="0.8" y2="1">
          <Stop offset="0" stopColor="#3C4258" />
          <Stop offset="1" stopColor="#1A1C28" />
        </LinearGradient>
        <LinearGradient id="cc_front" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#222638" />
          <Stop offset="1" stopColor="#0E1020" />
        </LinearGradient>
        <LinearGradient id="cc_wind" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#6888CC" stopOpacity={0.78} />
          <Stop offset="1" stopColor="#304890" stopOpacity={0.68} />
        </LinearGradient>
        <LinearGradient id="cc_glass" x1="0" y1="0" x2="0.8" y2="1">
          <Stop offset="0" stopColor="#6080B8" stopOpacity={0.80} />
          <Stop offset="1" stopColor="#2A3A60" stopOpacity={0.70} />
        </LinearGradient>
      </Defs>

      <Shadow rx={74} />

      <AlloyWheel cx={42} cy={96} r={19} />
      <AlloyWheel cx={116} cy={96} r={19} />

      {/* Side face */}
      <Path
        d="M 10,90
           C 10,70 16,52 26,42
           C 36,28 50,20 62,18
           L 96,14 L 122,20
           C 130,28 134,38 138,48
           C 140,56 144,66 146,74
           L 148,90 Z"
        fill="url(#cc_side)"
      />
      {/* Sweeping reflection across the door */}
      <Path
        d="M 14,50 C 28,38 50,28 72,24 L 80,30 C 60,38 36,52 16,66 Z"
        fill="url(#cc_ref)"
      />
      <Path
        d="M 10,90
           C 10,70 16,52 26,42
           C 36,28 50,20 62,18
           L 96,14 L 122,20
           C 130,28 134,38 138,48
           C 140,56 144,66 146,74
           L 148,90 Z"
        fill="url(#cc_spec)"
      />
      {/* Chrome beltline */}
      <Path d="M 14,60 C 30,52 58,42 80,38 C 100,34 128,36 142,50"
        stroke="#505870" strokeWidth={1.5} fill="none" />

      {/* Top face */}
      <Path
        d="M 26,42 C 36,28 50,20 62,18 L 96,14 L 122,20
           C 130,28 134,38 138,48 L 148,40
           C 144,30 138,20 130,12 L 106,6
           C 88,4 64,8 48,14 L 34,34 Z"
        fill="url(#cc_top)"
      />
      {/* Roof highlight */}
      <Path d="M 50,18 C 70,12 90,10 110,14 L 106,6 C 86,2 64,6 46,12 Z"
        fill="#7080C8" fillOpacity={0.35} />

      {/* Front face */}
      <Path d="M 146,74 L 148,90 L 156,86 L 154,70 Z"
        fill="url(#cc_front)" />

      {/* Windshield */}
      <Path
        d="M 96,14 L 122,20 C 130,28 134,38 138,48
           L 148,40 C 144,30 138,20 130,12 L 106,6 Z"
        fill="url(#cc_wind)"
      />
      <Path d="M 100,12 L 128,14 L 134,20 L 108,18 Z"
        fill="#A0B8E8" fillOpacity={0.30} />

      {/* Side glass */}
      <Path
        d="M 28,46 C 36,30 50,22 62,20 L 96,16 L 118,22
           C 124,30 128,38 130,46 L 108,50 L 76,50 L 50,54 Z"
        fill="url(#cc_glass)"
      />
      <Path d="M 34,42 L 62,22 L 74,22 L 48,44 Z"
        fill="#8AA0D8" fillOpacity={0.22} />
      <Rect x={78} y={20} width={4} height={32} rx={2}
        fill="#1A1E2C" fillOpacity={0.95}
        transform="rotate(-6,80,36)" />

      {/* Xenon/LED headlight */}
      <Path d="M 146,58 L 154,54 L 156,62 L 148,66 Z"
        fill="#D0E8FF" />
      <Rect x={146} y={58} width={10} height={2.5} rx={1.5}
        fill="#FFFFFF" fillOpacity={0.95} transform="rotate(-4,151,59)" />
      {/* DRL strip */}
      <Rect x={146} y={52} width={10} height={2} rx={1}
        fill="#CCDEFF" fillOpacity={0.80} transform="rotate(-4,151,53)" />

      {/* Tail light */}
      <Path d="M 10,64 L 10,80 L 14,80 L 14,64 Z"
        fill="#FF1818" fillOpacity={0.95} />
      <Path d="M 10,64 L 10,71 L 13,71 L 13,64 Z"
        fill="#FF8888" fillOpacity={0.55} />

      {/* Chrome grille with badge area */}
      <Path d="M 148,68 L 154,64 L 156,78 L 150,82 Z"
        fill="#303448" />
      <Line x1={148} y1={71} x2={155} y2={68} stroke="#5060A0" strokeWidth={1.5} />
      <Line x1={148} y1={75} x2={155} y2={72} stroke="#5060A0" strokeWidth={1.5} />
      <Line x1={148} y1={79} x2={155} y2={76} stroke="#5060A0" strokeWidth={1} />
    </Svg>
  );
});

// ── Car XL — Pearl White MPV / minivan ────────────────────────────────────────
export const CarXLIllustration = memo(function CarXLIllustration() {
  return (
    <Svg width={W} height={H} viewBox={V}>
      <Defs>
        <LinearGradient id="cx_side" x1="0" y1="0" x2="0.9" y2="1">
          <Stop offset="0" stopColor="#F8F7F4" />
          <Stop offset="0.6" stopColor="#E6E4DE" />
          <Stop offset="1" stopColor="#CCCAC4" />
        </LinearGradient>
        <RadialGradient id="cx_spec" cx="40%" cy="30%" rx="52%" ry="44%">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.68} />
          <Stop offset="1" stopColor="#F4F2EC" stopOpacity={0} />
        </RadialGradient>
        <LinearGradient id="cx_top" x1="0" y1="0" x2="0.8" y2="1">
          <Stop offset="0" stopColor="#FDFCFA" />
          <Stop offset="1" stopColor="#CCCAC4" />
        </LinearGradient>
        <LinearGradient id="cx_front" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#C8C6C0" />
          <Stop offset="1" stopColor="#A8A6A0" />
        </LinearGradient>
        <LinearGradient id="cx_wind" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#B0D0F0" stopOpacity={0.88} />
          <Stop offset="1" stopColor="#70A4CC" stopOpacity={0.80} />
        </LinearGradient>
        <LinearGradient id="cx_glass" x1="0" y1="0" x2="0.8" y2="1">
          <Stop offset="0" stopColor="#98C4EC" stopOpacity={0.86} />
          <Stop offset="1" stopColor="#5888B8" stopOpacity={0.76} />
        </LinearGradient>
        <LinearGradient id="cx_gold" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#D8AC44" />
          <Stop offset="0.5" stopColor="#F0C860" />
          <Stop offset="1" stopColor="#A87C28" />
        </LinearGradient>
      </Defs>

      <Shadow rx={76} />

      <AlloyWheel cx={40} cy={96} r={19} />
      <AlloyWheel cx={118} cy={96} r={19} />

      {/* Side face — MPV: tall upright pillars, large greenhouse */}
      <Path
        d="M 8,90 L 8,54 L 12,36 L 20,22 L 48,14 L 116,14 L 134,20
           C 140,30 144,42 146,56 L 148,90 Z"
        fill="url(#cx_side)"
      />
      <Path
        d="M 8,90 L 8,54 L 12,36 L 20,22 L 48,14 L 116,14 L 134,20
           C 140,30 144,42 146,56 L 148,90 Z"
        fill="url(#cx_spec)"
      />
      {/* Lower body shadow */}
      <Path d="M 8,72 L 148,72 L 148,90 L 8,90 Z"
        fill="#BBBAB4" fillOpacity={0.28} />
      {/* Beltline — distinctive MPV horizontal */}
      <Path d="M 10,60 L 148,60"
        stroke="#D8D6D0" strokeWidth={1.5} fill="none" />

      {/* Top face */}
      <Path
        d="M 20,22 L 48,14 L 116,14 L 134,20 C 140,30 144,42 146,56
           L 154,50 C 152,38 148,26 142,14 L 122,6 L 56,6 L 28,16 Z"
        fill="url(#cx_top)"
      />
      {/* Roof highlight */}
      <Path d="M 52,14 C 80,8 108,8 128,12 L 122,6 L 56,6 Z"
        fill="#FFFFFF" fillOpacity={0.55} />

      {/* Front face */}
      <Path d="M 146,56 L 148,90 L 156,86 L 154,52 Z"
        fill="url(#cx_front)" />

      {/* Windshield — MPV large panoramic */}
      <Path
        d="M 116,14 L 134,20 C 140,30 144,42 146,56
           L 154,50 C 152,38 148,26 142,14 L 122,6 Z"
        fill="url(#cx_wind)"
      />
      <Path d="M 120,12 L 138,16 L 142,22 L 124,18 Z"
        fill="#FFFFFF" fillOpacity={0.32} />

      {/* Passenger windows — 3-column layout */}
      <Path d="M 20,22 L 48,14 L 56,6 L 28,16 Z"
        fill="url(#cx_glass)" fillOpacity={0.65} />
      <Path d="M 44,18 L 68,14 L 68,58 L 42,60 Z"
        fill="url(#cx_glass)" />
      <Path d="M 70,14 L 96,14 L 94,58 L 70,58 Z"
        fill="url(#cx_glass)" />
      <Path d="M 98,14 L 116,14 L 114,56 L 96,58 Z"
        fill="url(#cx_glass)" />
      {/* Window shines */}
      <Path d="M 46,16 L 66,14 L 66,20 L 46,22 Z"
        fill="#FFFFFF" fillOpacity={0.25} />
      <Path d="M 72,14 L 94,14 L 94,20 L 72,20 Z"
        fill="#FFFFFF" fillOpacity={0.25} />
      {/* B/C pillars */}
      <Rect x={67} y={14} width={3} height={44} fill="#C8C6C0" fillOpacity={0.9} />
      <Rect x={95} y={14} width={3} height={44} fill="#C8C6C0" fillOpacity={0.9} />

      {/* Gold accent stripe — lower body */}
      <Path d="M 8,74 L 148,74 L 148,78 L 8,78 Z"
        fill="url(#cx_gold)" />
      {/* Gold roof rail */}
      <Path d="M 48,6 L 122,6" stroke="#D8AC44" strokeWidth={2.5} strokeLinecap="round" />

      {/* LED headlight bar */}
      <Path d="M 146,44 L 154,40 L 154,56 L 146,58 Z"
        fill="#EEF4FF" />
      <Rect x={146} y={44} width={8} height={2.5} rx={1.5}
        fill="#FFFFFF" fillOpacity={0.95} />

      {/* Tail light — MPV wraparound */}
      <Path d="M 8,56 L 8,74 L 12,74 L 12,56 Z"
        fill="#FF2828" fillOpacity={0.92} />

      {/* Roof rack */}
      <Path d="M 50,4 L 120,4" stroke="#BBBAB4" strokeWidth={2} strokeLinecap="round" />
      <Rect x={54} y={2} width={4} height={4} rx={1} fill="#C8C6C0" />
      <Rect x={100} y={2} width={4} height={4} rx={1} fill="#C8C6C0" />

      {/* Sliding door line */}
      <Path d="M 96,18 L 96,60" stroke="#C8C6C0" strokeWidth={1} />
    </Svg>
  );
});

// ── Unified accessor ───────────────────────────────────────────────────────────

type Tier = 'moto-standard' | 'car-standard' | 'car-comfort' | 'car-xl';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ILLUSTRATIONS: Record<Tier, React.ComponentType<any>> = {
  'moto-standard': MotoStandardIllustration,
  'car-standard': CarStandardIllustration,
  'car-comfort': CarComfortIllustration,
  'car-xl': CarXLIllustration,
};

function normalizeTier(tier: string): Tier {
  if (tier.startsWith('moto-')) return 'moto-standard';
  if (tier === 'car-comfort') return 'car-comfort';
  if (tier === 'car-xl') return 'car-xl';
  return 'car-standard';
}

export function VehicleIllustration({
  tier,
  width = 108,
  height = 82,
}: {
  tier: string;
  width?: number;
  height?: number;
}) {
  const Comp = ILLUSTRATIONS[normalizeTier(tier)];
  const scale = Math.min(width / W, height / H);
  return (
    <View style={{ width, height, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      <View style={{ transform: [{ scale }] }}>
        <Comp />
      </View>
    </View>
  );
}
