import { StyleSheet, Text, View } from 'react-native';

export type OrbiLogoSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

/**
 * Geometry per size:
 *   ring  = outer diameter of the orbit circle
 *   dot   = diameter of the vehicle dot
 *   border = stroke width of the orbit ring
 *   word  = wordmark font size
 *   gap   = space between mark and wordmark
 *   track = wordmark letter spacing
 *
 * Dot placement: center of dot is on the ring circumference at 45° from top
 * (1:30 clock position), mathematically verified:
 *   left = ring × sin²(45°) × (1 + √2/2)  ≈ ring × 0.854
 *   top  = ring × (1 − √2/2) / 2           ≈ ring × 0.146
 */
const LOGO_CONFIG = {
  xs: { ring: 20, dot: 6,  border: 1.5, word: 12, gap: 6,  track: 1.5 },
  sm: { ring: 28, dot: 8,  border: 2,   word: 16, gap: 8,  track: 2   },
  md: { ring: 38, dot: 10, border: 2.5, word: 22, gap: 10, track: 3   },
  lg: { ring: 54, dot: 14, border: 3,   word: 30, gap: 12, track: 4   },
  xl: { ring: 74, dot: 20, border: 4,   word: 42, gap: 16, track: 6   },
} as const;

const ORBI_TEAL = '#2dd4bf';

interface OrbiLogoProps {
  size?: OrbiLogoSize;
  tint?: string;
  wordmarkColor?: string;
  orientation?: 'horizontal' | 'vertical';
  showWordmark?: boolean;
}

export function OrbiLogo({
  size = 'md',
  tint = ORBI_TEAL,
  wordmarkColor = '#f8fafc',
  orientation = 'horizontal',
  showWordmark = true,
}: OrbiLogoProps) {
  const c = LOGO_CONFIG[size];
  const markSide = c.ring + c.dot;

  return (
    <View
      style={[
        orientation === 'vertical' ? logoStyles.vertical : logoStyles.horizontal,
        { gap: c.gap },
      ]}
    >
      <View style={{ width: markSide, height: markSide }}>
        {/* Orbit ring */}
        <View
          style={{
            position: 'absolute',
            left: c.dot / 2,
            top: c.dot / 2,
            width: c.ring,
            height: c.ring,
            borderRadius: c.ring / 2,
            borderWidth: c.border,
            borderColor: tint,
          }}
        />
        {/* Vehicle dot — 1:30 position on the ring */}
        <View
          style={{
            position: 'absolute',
            left: c.ring * 0.854,
            top: c.ring * 0.146,
            width: c.dot,
            height: c.dot,
            borderRadius: c.dot / 2,
            backgroundColor: tint,
            shadowColor: tint,
            shadowOpacity: 0.85,
            shadowRadius: c.dot * 0.65,
            shadowOffset: { width: 0, height: 0 },
            elevation: 8,
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

const logoStyles = StyleSheet.create({
  horizontal: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  vertical: {
    flexDirection: 'column',
    alignItems: 'center',
  },
});
