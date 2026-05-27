/**
 * OrbiLogoCap — concept "Cap"
 *
 * Un anneau circulaire (le cadran) avec une capsule verticale (l'indicateur de
 * cap/nord) qui chevauche legerement le sommet de l'anneau.
 *
 * Metaphore : boussole, cap magnetique, destination, precision.
 * La capsule est le "nord" d'Orbi — sa direction, sa promesse.
 */
import { StyleSheet, Text, View } from 'react-native';

export type OrbiLogoCapSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

const CAP_CONFIG = {
  xs: { ring: 20, cap_w: 5,  cap_h: 7,  overlap: 1, border: 1.5, word: 12, gap: 6,  track: 1.5 },
  sm: { ring: 28, cap_w: 6,  cap_h: 9,  overlap: 1, border: 2,   word: 16, gap: 8,  track: 2   },
  md: { ring: 38, cap_w: 8,  cap_h: 12, overlap: 1, border: 2.5, word: 22, gap: 10, track: 3   },
  lg: { ring: 54, cap_w: 11, cap_h: 16, overlap: 2, border: 3,   word: 30, gap: 12, track: 4   },
  xl: { ring: 74, cap_w: 15, cap_h: 22, overlap: 2, border: 4,   word: 42, gap: 16, track: 6   },
} as const;

const ORBI_TEAL = '#2dd4bf';

interface OrbiLogoCapProps {
  size?: OrbiLogoCapSize;
  tint?: string;
  wordmarkColor?: string;
  orientation?: 'horizontal' | 'vertical';
  showWordmark?: boolean;
}

export function OrbiLogoCap({
  size = 'md',
  tint = ORBI_TEAL,
  wordmarkColor = '#f8fafc',
  orientation = 'horizontal',
  showWordmark = true,
}: OrbiLogoCapProps) {
  const c = CAP_CONFIG[size];
  const markHeight = c.cap_h + c.ring - c.overlap;

  return (
    <View
      style={[
        orientation === 'vertical' ? capStyles.vertical : capStyles.horizontal,
        { gap: c.gap },
      ]}
    >
      <View style={{ width: c.ring, height: markHeight }}>
        <View
          style={{
            position: 'absolute',
            left: (c.ring - c.cap_w) / 2,
            top: 0,
            width: c.cap_w,
            height: c.cap_h,
            borderRadius: c.cap_w / 2,
            backgroundColor: tint,
            shadowColor: tint,
            shadowOpacity: 0.85,
            shadowRadius: c.cap_w * 0.8,
            shadowOffset: { width: 0, height: 0 },
            elevation: 8,
          }}
        />
        <View
          style={{
            position: 'absolute',
            left: 0,
            top: c.cap_h - c.overlap,
            width: c.ring,
            height: c.ring,
            borderRadius: c.ring / 2,
            borderWidth: c.border,
            borderColor: tint,
          }}
        />
      </View>

      {showWordmark ? (
        <Text
          style={{
            color: wordmarkColor,
            fontSize: c.word,
            fontWeight: '800',
            letterSpacing: c.track,
            includeFontPadding: false,
          }}
        >
          orbi
        </Text>
      ) : null}
    </View>
  );
}

const capStyles = StyleSheet.create({
  horizontal: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  vertical: {
    flexDirection: 'column',
    alignItems: 'center',
  },
});
