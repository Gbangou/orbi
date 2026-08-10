import { router } from 'expo-router';
import { useEffect, useMemo, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import type { OrbiTheme } from '@orbi/ui';
import { useOrbiTheme } from '@orbi/ui/native';
import { resolveDriverNavigationSession } from '../lib/driver-navigation';
import { OrbiLogo } from '../lib/orbi-logo';

export default function IndexScreen() {
  const theme = useOrbiTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const fadeIn = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.92)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeIn, {
        toValue: 1,
        duration: 320,
        useNativeDriver: false,
      }),
      Animated.spring(scale, {
        toValue: 1,
        tension: 70,
        friction: 9,
        useNativeDriver: false,
      }),
    ]).start();

    let isMounted = true;

    async function handoff() {
      let targetPath = '/auth';

      try {
        const decision = await resolveDriverNavigationSession('/');
        targetPath = decision.targetPath ?? '/accueil';
      } catch {
        targetPath = '/auth';
      }

      if (!isMounted) {
        return;
      }

      setTimeout(() => {
        router.replace(targetPath);
      }, 340);
    }

    void handoff();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <View style={styles.screen}>
      <Animated.View style={[styles.content, { opacity: fadeIn, transform: [{ scale }] }]}>
        <OrbiLogo size="xl" />
        <Text style={styles.title}>Accueil chauffeur</Text>
      </Animated.View>
      <Text style={styles.market}>Orbi Driver</Text>
    </View>
  );
}

const makeStyles = (_theme: OrbiTheme) => StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 48,
    backgroundColor: '#FFFFFF',
    gap: 16,
  },
  content: {
    alignItems: 'center',
    gap: 14,
  },
  title: {
    color: '#111111',
    fontSize: 18,
    fontWeight: '800',
    fontFamily: 'Inter_700Bold',
  },
  market: {
    position: 'absolute',
    bottom: 40,
    fontSize: 12,
    color: '#6B6B6B',
    fontFamily: 'Inter_400Regular',
  },
});
