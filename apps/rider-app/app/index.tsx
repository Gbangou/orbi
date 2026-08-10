import { useEffect, useMemo, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import type { OrbiTheme } from '@orbi/ui';
import { useOrbiTheme } from '@orbi/ui/native';
import { OrbiLogo } from '../lib/orbi-logo';

/**
 * Splash screen propre. La redirection est centralisee dans le root layout
 * pour eviter deux decisions de navigation concurrentes.
 */
export default function IndexScreen() {
  const theme = useOrbiTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const fadeIn = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.88)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeIn, { toValue: 1, duration: 350, useNativeDriver: false }),
      Animated.spring(scale, { toValue: 1, tension: 60, friction: 8, useNativeDriver: false }),
    ]).start();
  }, []);

  return (
    <View style={styles.root}>
      <Animated.View style={[styles.content, { opacity: fadeIn, transform: [{ scale }] }]}>
        <OrbiLogo size="xl" />
        <Text style={styles.tagline}>Votre course en quelques secondes</Text>
      </Animated.View>
      <Text style={styles.market}>Ouagadougou · Burkina Faso</Text>
    </View>
  );
}

const makeStyles = (theme: OrbiTheme) => StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.colors.riderBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { alignItems: 'center', gap: 16 },
  tagline: {
    fontSize: 16,
    color: theme.colors.textMuted,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
  },
  market: {
    position: 'absolute',
    bottom: 40,
    fontSize: 12,
    color: theme.colors.textMuted,
    fontFamily: 'Inter_400Regular',
    letterSpacing: 0,
  },
});
