import { Image, StyleSheet, Text, View } from 'react-native';

export type OrbiLogoSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

// Font family loaded by _layout.tsx — keep this name in sync.
export const ORBI_FONT_FAMILY = 'Raleway_800ExtraBold';

const LOGO_FULL = require('../assets/orbi-logo.png');  // icon + wordmark, vertical
const LOGO_ICON = require('../assets/orbi-icon.png');  // orbit mark only

// orbi-logo.png is 512×480  → aspect ≈ 1.067
const LOGO_ASPECT = 512 / 480;

const SIZES = {
  xs: { logoH: 40,  iconH: 24, wordPx: 12, gap: 6,  track: 0.5 },
  sm: { logoH: 56,  iconH: 32, wordPx: 16, gap: 8,  track: 0.8 },
  md: { logoH: 76,  iconH: 44, wordPx: 22, gap: 10, track: 1   },
  lg: { logoH: 108, iconH: 62, wordPx: 30, gap: 12, track: 1.2 },
  xl: { logoH: 148, iconH: 86, wordPx: 42, gap: 16, track: 1.5 },
} as const;

export interface OrbiLogoProps {
  size?: OrbiLogoSize;
  /**
   * Optional tintColor applied to the logo image.
   * Leave undefined to show the authentic brand blue.
   * Pass '#ffffff' for white on dark photo overlays,
   * '#f59e0b' for amber (driver screens), etc.
   */
  tint?: string;
  /**
   * Color of the 'Orbi' text rendered in horizontal orientation.
   * Defaults to tint when set, otherwise brand blue '#1a7fe8'.
   */
  wordmarkColor?: string;
  /** 'horizontal' (default) or 'vertical' */
  orientation?: 'horizontal' | 'vertical';
  /** Set false to show the orbit mark only, without wordmark */
  showWordmark?: boolean;
  // Legacy props kept for backward compatibility — no longer rendered
  dotBackdropColor?: string;
  showGlow?: boolean;
}

export function OrbiLogo({
  size = 'md',
  tint,
  wordmarkColor,
  orientation = 'horizontal',
  showWordmark = true,
}: OrbiLogoProps) {
  const s = SIZES[size];
  const tintStyle = tint ? ({ tintColor: tint } as const) : {};
  const textColor = wordmarkColor ?? tint ?? '#1a7fe8';

  if (orientation === 'vertical') {
    if (showWordmark) {
      const logoW = Math.round(s.logoH * LOGO_ASPECT);
      return (
        <Image
          source={LOGO_FULL}
          style={[{ width: logoW, height: s.logoH }, tintStyle]}
          resizeMode="contain"
        />
      );
    }
    return (
      <Image
        source={LOGO_ICON}
        style={[{ width: s.iconH, height: s.iconH }, tintStyle]}
        resizeMode="contain"
      />
    );
  }

  // Horizontal: orbit mark + 'Orbi' text side by side
  return (
    <View style={[styles.row, { gap: s.gap }]}>
      <Image
        source={LOGO_ICON}
        style={[{ width: s.iconH, height: s.iconH }, tintStyle]}
        resizeMode="contain"
      />
      {showWordmark && (
        <Text
          style={{
            color: textColor,
            fontSize: s.wordPx,
            fontFamily: ORBI_FONT_FAMILY,
            letterSpacing: 0,
            includeFontPadding: false,
          }}
        >
          Orbi
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
});
