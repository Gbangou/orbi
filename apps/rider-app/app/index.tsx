import { router } from 'expo-router';
import { useEffect, useMemo, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import type { OrbiTheme } from '@orbi/ui';
import { useOrbiTheme } from '@orbi/ui/native';
import { hasPersistedRiderSession } from '../lib/auth';
import { OrbiLogo } from '../lib/orbi-logo';

/**
 * Splash screen propre — redirige vers /home ou /auth selon la session.
 * Visible ~400ms maximum. Logo animé, aucun widget développeur.
 */
export default function IndexScreen() {
  const theme = useOrbiTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const fadeIn = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.88)).current;

  useEffect(() => {
    // Animation d'entrée du logo
    Animated.parallel([
      Animated.timing(fadeIn, { toValue: 1, duration: 350, useNativeDriver: false }),
      Animated.spring(scale, { toValue: 1, tension: 60, friction: 8, useNativeDriver: false }),
    ]).start();

    let isMounted = true;

    async function handoff() {
      let hasSession = false;

      try {
        hasSession = await hasPersistedRiderSession();
      } catch {
        hasSession = false;
      }

      if (!isMounted) return;
      // Transition fluide — laisse l'animation se terminer
      setTimeout(() => {
        router.replace(hasSession ? '/home' : '/auth');
      }, 380);
    }

    void handoff();

    return () => { isMounted = false; };
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
