/**
 * Native-safe vehicle avatars.
 *
 * This component intentionally avoids native SVG. Some field APKs crashed while
 * loading optional native SVG managers, even when gradients were not rendered
 * directly. These compact avatars are built with plain React Native views so
 * auth/home screens cannot be taken down by optional native drawing modules.
 */
import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';

type Tier = 'moto-standard' | 'car-standard' | 'car-comfort' | 'car-xl';

const W = 160;
const H = 120;

const VEHICLE_COLORS: Record<Tier, {
  body: string;
  bodyDark: string;
  top: string;
  glass: string;
  accent: string;
}> = {
  'moto-standard': {
    body: '#00B894',
    bodyDark: '#007558',
    top: '#12D8AD',
    glass: '#9EDDF0',
    accent: '#FF3B30',
  },
  'car-standard': {
    body: '#E3E8F0',
    bodyDark: '#B8C0D0',
    top: '#F7FAFC',
    glass: '#86B6DC',
    accent: '#FF3B30',
  },
  'car-comfort': {
    body: '#1D2130',
    bodyDark: '#111827',
    top: '#30364A',
    glass: '#425C9A',
    accent: '#FF3B30',
  },
  'car-xl': {
    body: '#E8E5DE',
    bodyDark: '#B9B5AC',
    top: '#F7F5F0',
    glass: '#7FAED2',
    accent: '#D8AC44',
  },
};

function Wheel({ style }: { style?: object }) {
  return (
    <View style={[styles.wheel, style]}>
      <View style={styles.wheelRim} />
      <View style={styles.wheelHub} />
    </View>
  );
}

const MotoStandardIllustration = memo(function MotoStandardIllustration() {
  const colors = VEHICLE_COLORS['moto-standard'];
  return (
    <View style={styles.canvas}>
      <View style={[styles.shadow, styles.motoShadow]} />
      <Wheel style={styles.motoRearWheel} />
      <Wheel style={styles.motoFrontWheel} />
      <View style={[styles.motoSwingArm, { backgroundColor: colors.bodyDark }]} />
      <View style={[styles.motoFork, { backgroundColor: '#3A4050' }]} />
      <View style={[styles.motoBody, { backgroundColor: colors.body }]} />
      <View style={[styles.motoBodyHighlight, { backgroundColor: colors.top }]} />
      <View style={[styles.motoSeat, { backgroundColor: '#202432' }]} />
      <View style={[styles.motoGlass, { backgroundColor: colors.glass }]} />
      <View style={[styles.motoHeadlight, { backgroundColor: '#FFF3B0' }]} />
      <View style={[styles.motoTail, { backgroundColor: colors.accent }]} />
    </View>
  );
});

function CarIllustration({ tier }: { tier: Exclude<Tier, 'moto-standard'> }) {
  const colors = VEHICLE_COLORS[tier];
  const isXl = tier === 'car-xl';
  return (
    <View style={styles.canvas}>
      <View style={styles.shadow} />
      <Wheel style={styles.carRearWheel} />
      <Wheel style={styles.carFrontWheel} />
      <View
        style={[
          styles.carBody,
          isXl && styles.carBodyXl,
          { backgroundColor: colors.body, borderColor: colors.bodyDark },
        ]}
      />
      <View
        style={[
          styles.carRoof,
          isXl && styles.carRoofXl,
          { backgroundColor: colors.top, borderColor: colors.bodyDark },
        ]}
      />
      <View style={[styles.carWindshield, isXl && styles.carWindshieldXl, { backgroundColor: colors.glass }]} />
      <View style={[styles.carWindow, isXl && styles.carWindowXl, { backgroundColor: colors.glass }]} />
      <View style={[styles.carFront, isXl && styles.carFrontXl, { backgroundColor: colors.bodyDark }]} />
      <View style={[styles.carHeadlight, { backgroundColor: '#FFFDE7' }]} />
      <View style={[styles.carTailLight, { backgroundColor: '#FF3B30' }]} />
      {isXl ? <View style={[styles.carAccent, { backgroundColor: colors.accent }]} /> : null}
    </View>
  );
}

const CarStandardIllustration = memo(function CarStandardIllustration() {
  return <CarIllustration tier="car-standard" />;
});

const CarComfortIllustration = memo(function CarComfortIllustration() {
  return <CarIllustration tier="car-comfort" />;
});

const CarXLIllustration = memo(function CarXLIllustration() {
  return <CarIllustration tier="car-xl" />;
});

const ILLUSTRATIONS: Record<Tier, React.ComponentType> = {
  'moto-standard': MotoStandardIllustration,
  'car-standard': CarStandardIllustration,
  'car-comfort': CarComfortIllustration,
  'car-xl': CarXLIllustration,
};

export function normalizeVehicleTier(tier: string): Tier {
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
  const Comp = ILLUSTRATIONS[normalizeVehicleTier(tier)];
  const scale = Math.min(width / W, height / H);
  return (
    <View style={[styles.frame, { width, height }]}>
      <View style={[styles.scaler, { transform: [{ scale }] }]}>
        <Comp />
      </View>
    </View>
  );
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
  shadow: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 8,
    height: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(7,19,17,0.22)',
  },
  motoShadow: {
    left: 22,
    right: 22,
  },
  wheel: {
    position: 'absolute',
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#1A1B20',
    alignItems: 'center',
    justifyContent: 'center',
  },
  wheelRim: {
    width: 25,
    height: 25,
    borderRadius: 13,
    borderWidth: 4,
    borderColor: '#8C96B0',
    backgroundColor: '#242630',
  },
  wheelHub: {
    position: 'absolute',
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: '#D4D8E4',
  },
  motoRearWheel: {
    left: 15,
    top: 72,
  },
  motoFrontWheel: {
    right: 18,
    top: 72,
  },
  motoSwingArm: {
    position: 'absolute',
    left: 42,
    top: 72,
    width: 72,
    height: 8,
    borderRadius: 5,
    transform: [{ rotate: '-10deg' }],
  },
  motoFork: {
    position: 'absolute',
    right: 33,
    top: 54,
    width: 6,
    height: 42,
    borderRadius: 3,
    transform: [{ rotate: '-14deg' }],
  },
  motoBody: {
    position: 'absolute',
    left: 54,
    top: 30,
    width: 60,
    height: 34,
    borderRadius: 18,
    transform: [{ rotate: '-8deg' }],
  },
  motoBodyHighlight: {
    position: 'absolute',
    left: 70,
    top: 35,
    width: 34,
    height: 8,
    borderRadius: 8,
    opacity: 0.5,
    transform: [{ rotate: '-8deg' }],
  },
  motoSeat: {
    position: 'absolute',
    left: 48,
    top: 45,
    width: 34,
    height: 15,
    borderRadius: 10,
    transform: [{ rotate: '-16deg' }],
  },
  motoGlass: {
    position: 'absolute',
    right: 33,
    top: 22,
    width: 24,
    height: 14,
    borderRadius: 10,
    transform: [{ rotate: '-16deg' }],
  },
  motoHeadlight: {
    position: 'absolute',
    right: 21,
    top: 34,
    width: 13,
    height: 10,
    borderRadius: 7,
  },
  motoTail: {
    position: 'absolute',
    left: 31,
    top: 64,
    width: 12,
    height: 9,
    borderRadius: 5,
  },
  carRearWheel: {
    left: 26,
    top: 76,
  },
  carFrontWheel: {
    right: 26,
    top: 76,
  },
  carBody: {
    position: 'absolute',
    left: 14,
    top: 42,
    width: 132,
    height: 52,
    borderRadius: 24,
    borderWidth: 2,
  },
  carBodyXl: {
    left: 10,
    width: 140,
    height: 56,
    borderRadius: 20,
  },
  carRoof: {
    position: 'absolute',
    left: 39,
    top: 18,
    width: 82,
    height: 38,
    borderRadius: 18,
    borderWidth: 2,
  },
  carRoofXl: {
    left: 28,
    width: 104,
    height: 42,
    borderRadius: 16,
  },
  carWindshield: {
    position: 'absolute',
    left: 85,
    top: 24,
    width: 34,
    height: 28,
    borderRadius: 10,
    opacity: 0.92,
  },
  carWindshieldXl: {
    left: 97,
    height: 32,
  },
  carWindow: {
    position: 'absolute',
    left: 42,
    top: 29,
    width: 48,
    height: 24,
    borderRadius: 9,
    opacity: 0.9,
  },
  carWindowXl: {
    left: 31,
    width: 66,
    height: 28,
  },
  carFront: {
    position: 'absolute',
    right: 10,
    top: 60,
    width: 14,
    height: 27,
    borderRadius: 8,
  },
  carFrontXl: {
    height: 31,
  },
  carHeadlight: {
    position: 'absolute',
    right: 9,
    top: 58,
    width: 14,
    height: 5,
    borderRadius: 4,
  },
  carTailLight: {
    position: 'absolute',
    left: 10,
    top: 66,
    width: 8,
    height: 20,
    borderRadius: 5,
  },
  carAccent: {
    position: 'absolute',
    left: 12,
    right: 12,
    top: 75,
    height: 5,
    borderRadius: 5,
  },
});
