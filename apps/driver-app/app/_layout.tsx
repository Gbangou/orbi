import '../lib/polyfills';
import {
  Stack,
  usePathname,
  useRootNavigationState,
  useRouter,
} from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useFonts, Raleway_800ExtraBold } from '@expo-google-fonts/raleway';
import * as Notifications from 'expo-notifications';
import { orbiTheme } from '@orbi/ui';
import { hasPersistedDriverSession } from '../lib/auth';

const TypedStack = Stack as any;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export default function RootLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const rootNavigationState = useRootNavigationState();
  const [isNavigationMounted, setIsNavigationMounted] = useState(false);
  const [isResolved, setIsResolved] = useState(false);
  useFonts({ Raleway_800ExtraBold });

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsNavigationMounted(true);
    }, 0);

    return () => {
      clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data as
          | Record<string, string>
          | undefined;
        const type = data?.type;

        if (type === 'new_offer') {
          router.push('/(tabs)/offres');
        }
      },
    );

    return () => subscription.remove();
  }, [router]);

  useEffect(() => {
    if (!isNavigationMounted || !rootNavigationState?.key) {
      return;
    }

    let isMounted = true;

    async function resolveSession() {
      const hasSession = await hasPersistedDriverSession();

      if (!isMounted) {
        return;
      }

      let targetPath: '/auth' | '/accueil' | null = null;

      if (!hasSession && pathname !== '/auth') {
        targetPath = '/auth';
      }

      if (hasSession && pathname === '/auth') {
        targetPath = '/accueil';
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
      <StatusBar style="dark" />
      <TypedStack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: orbiTheme.colors.background },
        }}
      />
      {!isResolved ? (
        <View style={styles.loadingScreen}>
          <Text style={styles.loadingWordmark}>orbi</Text>
          <ActivityIndicator size="small" color={orbiTheme.colors.teal} />
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  loadingScreen: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: orbiTheme.colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 32,
  },
  loadingWordmark: {
    fontSize: 42,
    fontWeight: '800',
    color: orbiTheme.colors.text,
    letterSpacing: -1,
  },
});
