/**
 * Vehicle avatars - premium native illustrations.
 *
 * Drawn with React Native View/StyleSheet primitives: no photos, no SVG, no
 * native gradients. The style is intentionally marketplace-grade while staying
 * original to Orbi and stable in release APKs.
 */
import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';

type Tier = 'moto-standard' | 'moto-plus' | 'car-standard' | 'car-comfort' | 'car-xl';

const W = 180;
const H = 124;
const PLUS_BADGE_COLOR = '#0B0B0B';

const VEHICLE_COLORS: Record<Tier, {
  body: string;
  bodyMid: string;
  bodyDark: string;
  roof: string;
  glass: string;
  glow: string;
  accent: string;
}> = {
  'moto-standard': {
    body: '#0B0B0B',
    bodyMid: '#2F2F2F',
    bodyDark: '#050505',
    roof: '#3C3C3C',
    glass: '#D8D8D2',
    glow: 'rgba(11,11,11,0.10)',
    accent: '#00A884',
  },
  'moto-plus': {
    body: '#0B0B0B',
    bodyMid: '#2F2F2F',
    bodyDark: '#050505',
    roof: '#3C3C3C',
    glass: '#D8D8D2',
    glow: 'rgba(11,11,11,0.12)',
    accent: '#0B0B0B',
  },
  'car-standard': {
    body: '#F1F1ED',
    bodyMid: '#D8D8D2',
    bodyDark: '#9D9D96',
    roof: '#FFFFFF',
    glass: '#3C3C3C',
    glow: 'rgba(11,11,11,0.08)',
    accent: '#00A884',
  },
  'car-comfort': {
    body: '#0B0B0B',
    bodyMid: '#242424',
    bodyDark: '#050505',
    roof: '#3C3C3C',
    glass: '#D8D8D2',
    glow: 'rgba(11,11,11,0.12)',
    accent: '#00A884',
  },
  'car-xl': {
    body: '#F1F1ED',
    bodyMid: '#D8D8D2',
    bodyDark: '#9D9D96',
    roof: '#FFFFFF',
    glass: '#3C3C3C',
    glow: 'rgba(11,11,11,0.08)',
    accent: '#00A884',
  },
};

function PlusGlyph({ size }: { size: number }) {
  const bar = Math.max(2, Math.round(size * 0.11));
  const length = Math.round(size * 0.5);
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ position: 'absolute', width: length, height: bar, borderRadius: bar / 2, backgroundColor: '#FFFFFF' }} />
      <View style={{ position: 'absolute', width: bar, height: length, borderRadius: bar / 2, backgroundColor: '#FFFFFF' }} />
    </View>
  );
}

function PlusBadge({ size = 22 }: { size?: number }) {
  return (
    <View
      style={[
        styles.plusBadge,
        { width: size, height: size, borderRadius: size / 2, top: 2, right: 18 },
      ]}
    >
      <PlusGlyph size={size * 0.6} />
    </View>
  );
}

const SPOKE_ANGLES = [0, 60, 120] as const;

function Wheel({ style, large = false }: { style?: object; large?: boolean }) {
  return (
    <View style={[styles.wheel, large && styles.wheelLarge, style]}>
      <View style={[styles.wheelRim, large && styles.wheelRimLarge]}>
        {SPOKE_ANGLES.map((angle) => (
          <View
            key={angle}
            style={[styles.wheelSpoke, large && styles.wheelSpokeLarge, { transform: [{ rotate: `${angle}deg` }] }]}
          />
        ))}
      </View>
      <View style={[styles.wheelHub, large && styles.wheelHubLarge]} />
    </View>
  );
}

function MotoGlyph({ tier }: { tier: 'moto-standard' | 'moto-plus' }) {
  const colors = VEHICLE_COLORS[tier];
  return (
    <View style={styles.canvas}>
      <View style={[styles.groundGlow, styles.motoGlow, { backgroundColor: colors.glow }]} />
      <View style={[styles.shadow, styles.motoShadow]} />
      <Wheel large style={styles.motoRearWheel} />
      <Wheel large style={styles.motoFrontWheel} />
      <View style={[styles.motoFrameBar, { backgroundColor: colors.bodyDark }]} />
      <View style={[styles.motoLowerFairing, { backgroundColor: colors.bodyMid }]} />
      <View style={[styles.motoBody, { backgroundColor: colors.body, borderColor: colors.bodyDark }]} />
      <View style={[styles.motoFrontPanel, { backgroundColor: colors.bodyMid }]} />
      <View style={[styles.motoShine, { backgroundColor: colors.roof }]} />
      <View style={styles.motoWhiteGlint} />
      <View style={styles.motoSeat} />
      <View style={[styles.motoHandle, { backgroundColor: colors.bodyDark }]} />
      <View style={[styles.motoGlass, { backgroundColor: colors.glass }]} />
      <View style={styles.motoHeadlight} />
      <View style={[styles.motoTail, { backgroundColor: colors.accent }]} />
      {tier === 'moto-plus' ? <PlusBadge size={24} /> : null}
    </View>
  );
}

function CarGlyph({ tier }: { tier: Exclude<Tier, 'moto-standard' | 'moto-plus'> }) {
  const colors = VEHICLE_COLORS[tier];
  const isComfort = tier === 'car-comfort';
  const isXl = tier === 'car-xl';
  return (
    <View style={styles.canvas}>
      <View style={[styles.groundGlow, { backgroundColor: colors.glow }]} />
      <View style={[styles.shadow, isXl && styles.shadowXl]} />
      <Wheel style={[styles.carRearWheel, isXl && styles.carRearWheelXl]} />
      <Wheel style={[styles.carFrontWheel, isXl && styles.carFrontWheelXl]} />
      <View
        style={[
          styles.carBody,
          isXl && styles.carBodyXl,
          { backgroundColor: colors.body, borderColor: colors.bodyDark },
        ]}
      />
      <View style={[styles.carLowerBody, isXl && styles.carLowerBodyXl, { backgroundColor: colors.bodyMid }]} />
      <View style={[styles.carSideCut, isXl && styles.carSideCutXl, { backgroundColor: colors.bodyDark }]} />
      <View
        style={[
          styles.carRoof,
          isXl && styles.carRoofXl,
          { backgroundColor: colors.roof, borderColor: colors.bodyDark },
        ]}
      />
      <View style={[styles.carRoofHighlight, isXl && styles.carRoofHighlightXl]} />
      <View style={[styles.carWindshield, isXl && styles.carWindshieldXl, { backgroundColor: colors.glass }]} />
      <View style={[styles.carSideWindow, isXl && styles.carSideWindowXl, { backgroundColor: colors.glass }]} />
      <View style={styles.carGlassGlint} />
      <View style={[styles.carFrontNose, isXl && styles.carFrontNoseXl, { backgroundColor: colors.bodyMid }]} />
      <View style={styles.carHeadlight} />
      <View style={[styles.carTailLight, { backgroundColor: colors.accent }]} />
      <View style={[styles.carBadgeLine, { backgroundColor: isComfort ? colors.glass : colors.accent }]} />
    </View>
  );
}

const GLYPHS: Record<Tier, React.ComponentType> = {
  'moto-standard': memo(() => <MotoGlyph tier="moto-standard" />),
  'moto-plus': memo(() => <MotoGlyph tier="moto-plus" />),
  'car-standard': memo(() => <CarGlyph tier="car-standard" />),
  'car-comfort': memo(() => <CarGlyph tier="car-comfort" />),
  'car-xl': memo(() => <CarGlyph tier="car-xl" />),
};

function VehicleAvatar({ tier, width, height }: { tier: Tier; width: number; height: number }) {
  const Comp = GLYPHS[tier];
  const scale = Math.min(width / W, height / H);
  return (
    <View style={[styles.frame, { width, height }]}>
      <View style={[styles.scaler, { transform: [{ scale }] }]}>
        <Comp />
      </View>
    </View>
  );
}

export function normalizeVehicleTier(tier: string): Tier {
  if (tier === 'moto-plus') return 'moto-plus';
  if (tier.startsWith('moto-') || tier === 'motorcycle' || tier === 'moto') return 'moto-standard';
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
  return <VehicleAvatar tier={normalizeVehicleTier(tier)} width={width} height={height} />;
}

const styles = StyleSheet.create({
  frame: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  scaler: {
    width: W,
    height: H,
    alignItems: 'center',
    justifyContent: 'center',
  },
  canvas: {
    width: W,
    height: H,
  },
  groundGlow: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 8,
    height: 40,
    borderRadius: 40,
  },
  motoGlow: {
    left: 26,
    right: 26,
    bottom: 6,
  },
  shadow: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 12,
    height: 13,
    borderRadius: 16,
    backgroundColor: 'rgba(7,19,17,0.20)',
    transform: [{ scaleX: 1.05 }],
  },
  shadowXl: {
    left: 14,
    right: 14,
  },
  motoShadow: {
    left: 28,
    right: 28,
    bottom: 10,
  },
  plusBadge: {
    position: 'absolute',
    backgroundColor: PLUS_BADGE_COLOR,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  wheel: {
    position: 'absolute',
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#11151D',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#2D3442',
  },
  wheelLarge: {
    width: 43,
    height: 43,
    borderRadius: 22,
  },
  wheelRim: {
    width: 23,
    height: 23,
    borderRadius: 12,
    borderWidth: 4,
    borderColor: '#9BA6BB',
    backgroundColor: '#252B36',
    alignItems: 'center',
    justifyContent: 'center',
  },
  wheelRimLarge: {
    width: 26,
    height: 26,
    borderRadius: 13,
  },
  wheelSpoke: {
    position: 'absolute',
    width: 2,
    height: 13,
    borderRadius: 1,
    backgroundColor: 'rgba(238,242,247,0.36)',
  },
  wheelSpokeLarge: {
    height: 15,
  },
  wheelHub: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EEF2F7',
  },
  wheelHubLarge: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  motoRearWheel: {
    left: 24,
    top: 70,
  },
  motoFrontWheel: {
    right: 28,
    top: 70,
  },
  motoFrameBar: {
    position: 'absolute',
    left: 54,
    top: 76,
    width: 70,
    height: 7,
    borderRadius: 6,
    transform: [{ rotate: '-8deg' }],
  },
  motoLowerFairing: {
    position: 'absolute',
    left: 62,
    top: 58,
    width: 58,
    height: 17,
    borderRadius: 16,
    transform: [{ rotate: '-8deg' }],
  },
  motoBody: {
    position: 'absolute',
    left: 58,
    top: 35,
    width: 66,
    height: 34,
    borderRadius: 20,
    borderWidth: 2,
    transform: [{ rotate: '-8deg' }],
  },
  motoFrontPanel: {
    position: 'absolute',
    left: 102,
    top: 37,
    width: 25,
    height: 30,
    borderRadius: 14,
    transform: [{ rotate: '-13deg' }],
  },
  motoShine: {
    position: 'absolute',
    left: 66,
    top: 39,
    width: 40,
    height: 9,
    borderRadius: 8,
    opacity: 0.42,
    transform: [{ rotate: '-8deg' }],
  },
  motoWhiteGlint: {
    position: 'absolute',
    left: 75,
    top: 41,
    width: 16,
    height: 4,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
    opacity: 0.34,
    transform: [{ rotate: '-8deg' }],
  },
  motoSeat: {
    position: 'absolute',
    left: 50,
    top: 50,
    width: 38,
    height: 15,
    borderRadius: 10,
    backgroundColor: '#1D2430',
    transform: [{ rotate: '-14deg' }],
  },
  motoHandle: {
    position: 'absolute',
    right: 33,
    top: 32,
    width: 25,
    height: 5,
    borderRadius: 4,
    transform: [{ rotate: '-20deg' }],
  },
  motoGlass: {
    position: 'absolute',
    right: 39,
    top: 24,
    width: 23,
    height: 13,
    borderRadius: 10,
    opacity: 0.95,
    transform: [{ rotate: '-15deg' }],
  },
  motoHeadlight: {
    position: 'absolute',
    right: 28,
    top: 42,
    width: 13,
    height: 9,
    borderRadius: 7,
    backgroundColor: '#FFF6BF',
  },
  motoTail: {
    position: 'absolute',
    left: 39,
    top: 65,
    width: 12,
    height: 8,
    borderRadius: 5,
  },
  carRearWheel: {
    left: 33,
    top: 76,
  },
  carRearWheelXl: {
    left: 26,
  },
  carFrontWheel: {
    right: 33,
    top: 76,
  },
  carFrontWheelXl: {
    right: 26,
  },
  carBody: {
    position: 'absolute',
    left: 20,
    top: 48,
    width: 140,
    height: 45,
    borderRadius: 24,
    borderWidth: 2,
  },
  carBodyXl: {
    left: 14,
    top: 46,
    width: 152,
    height: 49,
    borderRadius: 22,
  },
  carLowerBody: {
    position: 'absolute',
    left: 27,
    top: 72,
    width: 126,
    height: 17,
    borderRadius: 13,
    opacity: 0.94,
  },
  carLowerBodyXl: {
    left: 21,
    width: 138,
    height: 18,
  },
  carSideCut: {
    position: 'absolute',
    left: 44,
    top: 74,
    width: 73,
    height: 6,
    borderRadius: 8,
    opacity: 0.18,
  },
  carSideCutXl: {
    left: 38,
    width: 84,
  },
  carRoof: {
    position: 'absolute',
    left: 47,
    top: 25,
    width: 80,
    height: 39,
    borderRadius: 19,
    borderWidth: 2,
  },
  carRoofXl: {
    left: 38,
    width: 100,
    height: 42,
    borderRadius: 17,
  },
  carRoofHighlight: {
    position: 'absolute',
    left: 55,
    top: 29,
    width: 58,
    height: 10,
    borderRadius: 9,
    opacity: 0.35,
    backgroundColor: '#FFFFFF',
  },
  carRoofHighlightXl: {
    left: 47,
    width: 78,
  },
  carWindshield: {
    position: 'absolute',
    left: 91,
    top: 32,
    width: 31,
    height: 27,
    borderRadius: 10,
    opacity: 0.94,
  },
  carWindshieldXl: {
    left: 103,
    height: 29,
  },
  carSideWindow: {
    position: 'absolute',
    left: 51,
    top: 36,
    width: 43,
    height: 22,
    borderRadius: 9,
    opacity: 0.9,
  },
  carSideWindowXl: {
    left: 43,
    width: 60,
    height: 24,
  },
  carGlassGlint: {
    position: 'absolute',
    left: 100,
    top: 35,
    width: 8,
    height: 18,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    opacity: 0.28,
    transform: [{ rotate: '-10deg' }],
  },
  carFrontNose: {
    position: 'absolute',
    right: 15,
    top: 58,
    width: 20,
    height: 28,
    borderRadius: 12,
  },
  carFrontNoseXl: {
    right: 10,
    height: 31,
  },
  carHeadlight: {
    position: 'absolute',
    right: 14,
    top: 58,
    width: 13,
    height: 5,
    borderRadius: 4,
    backgroundColor: '#FFF5B7',
  },
  carTailLight: {
    position: 'absolute',
    left: 20,
    top: 64,
    width: 8,
    height: 18,
    borderRadius: 5,
  },
  carBadgeLine: {
    position: 'absolute',
    left: 58,
    top: 85,
    width: 38,
    height: 4,
    borderRadius: 4,
    opacity: 0.7,
  },
});
