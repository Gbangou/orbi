/**
 * OrbiLogoSignal — concept "Signal"
 *
 * Trois arcs concentriques en quart de cercle rayonnant depuis un point-vehicule
 * (bas-gauche) vers le haut-droit. Metaphore du reseau Orbi couvrant la ville.
 *
 * TECHNIQUE DES ARCS (pure React Native, sans SVG) :
 *   Pour chaque arc de rayon r centre sur l'origine (ox, oy) :
 *   1. Un conteneur r×r positionne a (ox, oy-r) avec overflow:'hidden'
 *      masque le quart superieur-droit du cercle complet.
 *   2. Un cercle complet 2r×2r positionne a left=-r, top=0 dans ce conteneur
 *      a son centre a (ox, oy), ce que verifie : ox + (-r) + r = ox  ✓
 *   3. Le quart visible est exactement l'arc de 15h a 12h (0° a 90°).
 *
 *   Necessite React Native ≥ 0.73 (new architecture) pour un clipping correct
 *   sur Android. RN 0.76 utilise la new arch par defaut. ✓
 */
import { StyleSheet, Text, View } from 'react-native';

export type OrbiLogoSignalSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

const SIGNAL_CONFIG = {
  xs: { s: 26, pad: 4, r1: 7,  r2: 13, r3: 18, dot: 3.5, stroke: 1.5, word: 12, gap: 6,  track: 1.5 },
  sm: { s: 34, pad: 5, r1: 9,  r2: 16, r3: 23, dot: 4.5, stroke: 2,   word: 16, gap: 8,  track: 2   },
  md: { s: 46, pad: 6, r1: 12, r2: 21, r3: 31, dot: 5.5, stroke: 2.5, word: 22, gap: 10, track: 3   },
  lg: { s: 62, pad: 8, r1: 16, r2: 28, r3: 42, dot: 7,   stroke: 3,   word: 30, gap: 12, track: 4   },
  xl: { s: 84, pad: 10,r1: 22, r2: 38, r3: 57, dot: 9,   stroke: 4,   word: 42, gap: 16, track: 6   },
} as const;

const ORBI_TEAL = '#2dd4bf';

interface OrbiLogoSignalProps {
  size?: OrbiLogoSignalSize;
  tint?: string;
  wordmarkColor?: string;
  orientation?: 'horizontal' | 'vertical';
  showWordmark?: boolean;
}

export function OrbiLogoSignal({
  size = 'md',
  tint = ORBI_TEAL,
  wordmarkColor = '#f8fafc',
  orientation = 'horizontal',
  showWordmark = true,
}: OrbiLogoSignalProps) {
  const c = SIGNAL_CONFIG[size];
  const ox = c.pad;
  const oy = c.s - c.pad;

  return (
    <View
      style={[
        orientation === 'vertical' ? signalStyles.vertical : signalStyles.horizontal,
        { gap: c.gap },
      ]}
    >
      <View style={{ width: c.s, height: c.s }}>
        <Arc r={c.r3} ox={ox} oy={oy} stroke={c.stroke} tint={tint} />
        <Arc r={c.r2} ox={ox} oy={oy} stroke={c.stroke} tint={tint} />
        <Arc r={c.r1} ox={ox} oy={oy} stroke={c.stroke} tint={tint} />
        <View
          style={{
            position: 'absolute',
            left: ox - c.dot / 2,
            top: oy - c.dot / 2,
            width: c.dot,
            height: c.dot,
            borderRadius: c.dot / 2,
            backgroundColor: tint,
            shadowColor: tint,
            shadowOpacity: 0.85,
            shadowRadius: c.dot * 0.7,
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

function Arc({
  r,
  ox,
  oy,
  stroke,
  tint,
}: {
  r: number;
  ox: number;
  oy: number;
  stroke: number;
  tint: string;
}) {
  return (
    <View
      style={{
        position: 'absolute',
        left: ox,
        top: oy - r,
        width: r,
        height: r,
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          position: 'absolute',
          left: -r,
          top: 0,
          width: r * 2,
          height: r * 2,
          borderRadius: r,
          borderWidth: stroke,
          borderColor: tint,
          backgroundColor: 'transparent',
        }}
      />
    </View>
  );
}

const signalStyles = StyleSheet.create({
  horizontal: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  vertical: {
    flexDirection: 'column',
    alignItems: 'center',
  },
});
