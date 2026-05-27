import { StyleSheet, Text, View } from 'react-native';

export type OrbiLogoSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

// Font family loaded by _layout.tsx — keep this name in sync.
export const ORBI_FONT_FAMILY = 'Raleway_800ExtraBold';

const LOGO_CONFIG = {
  xs: { ring: 20, dot: 6,  border: 1.5, word: 12, gap: 6,  track: 0.5 },
  sm: { ring: 28, dot: 8,  border: 2,   word: 16, gap: 8,  track: 0.8 },
  md: { ring: 38, dot: 10, border: 2.5, word: 22, gap: 10, track: 1   },
  lg: { ring: 54, dot: 14, border: 3,   word: 30, gap: 12, track: 1.2 },
  xl: { ring: 74, dot: 20, border: 4,   word: 42, gap: 16, track: 1.5 },
} as const;

const ORBI_TEAL = '#2dd4bf';

// Dot sits on the ring at 1:30 clock position (45° from top):
//   left = ring × 0.854   top = ring × 0.146

export interface OrbiLogoProps {
  size?: OrbiLogoSize;
  /**
   * Color of the orbit ring and vehicle dot.
   * Default: '#2dd4bf' (Orbi teal)
   * Examples:
   *   tint="#f59e0b"          amber — for driver screens
   *   tint="#38bdf8"          sky blue
   *   tint="#ffffff"          white — on dark photos or overlays
   *   tint="#0a0c0e"          near-black — on light backgrounds
   */
  tint?: string;
  /**
   * Color of the "Orbi" wordmark text.
   * Default: '#f8fafc' (light, for dark backgrounds)
   * Use '#0a0c0e' on white/light backgrounds.
   */
  wordmarkColor?: string;
  /**
   * Optional semi-transparent backdrop disc behind the vehicle dot.
   * Creates the dark halo effect visible in the app icon.
   * Example: 'rgba(7,17,29,0.75)' for dark backgrounds.
   * Leave undefined for a clean mark on transparent or light backgrounds.
   */
  dotBackdropColor?: string;
  /**
   * Whether to render the teal glow/shadow on the vehicle dot.
   * Set to false on transparent or light backgrounds to avoid shadow artifacts.
   * Default: true
   */
  showGlow?: boolean;
  /** 'horizontal' (default) or 'vertical' — controls wordmark placement */
  orientation?: 'horizontal' | 'vertical';
  /** Set to false to render the icon mark only, without the wordmark */
  showWordmark?: boolean;
}

export function OrbiLogo({
  size = 'md',
  tint = ORBI_TEAL,
  wordmarkColor = '#f8fafc',
  dotBackdropColor,
  showGlow = true,
  orientation = 'horizontal',
  showWordmark = true,
}: OrbiLogoProps) {
  const c = LOGO_CONFIG[size];
  const markSide = c.ring + c.dot;
  const backdropPad = c.dot * 0.55;

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

        {/* Optional dark halo behind the vehicle dot */}
        {dotBackdropColor ? (
          <View
            style={{
              position: 'absolute',
              left: c.ring * 0.854 - backdropPad,
              top: c.ring * 0.146 - backdropPad,
              width: c.dot + backdropPad * 2,
              height: c.dot + backdropPad * 2,
              borderRadius: (c.dot + backdropPad * 2) / 2,
              backgroundColor: dotBackdropColor,
            }}
          />
        ) : null}

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
            ...(showGlow
              ? {
                  shadowColor: tint,
                  shadowOpacity: 0.85,
                  shadowRadius: c.dot * 0.65,
                  shadowOffset: { width: 0, height: 0 },
                  elevation: 8,
                }
              : {}),
          }}
        />
      </View>

      {showWordmark ? (
        <Text
          style={{
            color: wordmarkColor,
            fontSize: c.word,
            fontFamily: ORBI_FONT_FAMILY,
            letterSpacing: c.track,
            includeFontPadding: false,
          }}
        >
          Orbi
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
