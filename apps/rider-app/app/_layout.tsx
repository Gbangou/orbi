import {
  Stack,
  usePathname,
  useRootNavigationState,
  useRouter,
} from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { mobilisTheme } from '@mobilis/ui';
import { hasPersistedRiderSession } from '../lib/auth';

export default function RootLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const rootNavigationState = useRootNavigationState();
  const [isNavigationMounted, setIsNavigationMounted] = useState(false);
  const [isResolved, setIsResolved] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsNavigationMounted(true);
    }, 0);

    return () => {
      clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (!isNavigationMounted || !rootNavigationState?.key) {
      return;
    }

    let isMounted = true;

    async function resolveSession() {
      const hasSession = await hasPersistedRiderSession();

      if (!isMounted) {
        return;
      }

      let targetPath: '/auth' | '/home' | null = null;

      if (!hasSession && pathname !== '/auth') {
        targetPath = '/auth';
      }

      if (hasSession && pathname === '/auth') {
        targetPath = '/home';
      }

      setIsResolved(true);

      if (targetPath) {
        setTimeout(() => {
          if (isMounted) {
            router.replace(targetPath);
          }
        }, 0);
      }
    }

    void resolveSession();

    return () => {
      isMounted = false;
    };
  }, [isNavigationMounted, pathname, rootNavigationState?.key, router]);

  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#07111d' },
        }}
      />
      {!isResolved ? (
        <View style={styles.loadingScreen}>
          <View style={styles.loadingCard}>
            <Text style={styles.loadingEyebrow}>Mobilis Passager</Text>
            <Text style={styles.loadingTitle}>Preparation de votre trajet</Text>
            <Text style={styles.loadingText}>
              Verification de la session, des acces et de la reprise de vos
              reservations et suivis en direct.
            </Text>
          </View>
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  loadingScreen: {
    ...StyleSheet.absoluteFillObject,
    flex: 1,
    backgroundColor: mobilisTheme.colors.background,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  loadingCard: {
    backgroundColor: mobilisTheme.colors.panel,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: mobilisTheme.colors.border,
    padding: 24,
    gap: 10,
  },
  loadingEyebrow: {
    color: mobilisTheme.colors.teal,
    textTransform: 'uppercase',
    letterSpacing: 1.8,
  },
  loadingTitle: {
    color: mobilisTheme.colors.text,
    fontSize: 28,
    fontWeight: '800',
  },
  loadingText: {
    color: mobilisTheme.colors.muted,
    lineHeight: 21,
  },
});
