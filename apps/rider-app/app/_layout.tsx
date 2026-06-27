import '../lib/polyfills';
import {
  Stack,
  usePathname,
  useRootNavigationState,
  useRouter,
} from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View, ActivityIndicator, useColorScheme } from 'react-native';
import {
  useFonts,
  Raleway_700Bold,
  Raleway_800ExtraBold,
} from '@expo-google-fonts/raleway';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import * as Notifications from 'expo-notifications';
import { orbiTheme, resolveTheme, ErrorBoundary } from '@orbi/ui';
import { hasPersistedRiderSession } from '../lib/auth';

const TypedStack = Stack as any;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export default function RootLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const rootNavigationState = useRootNavigationState();
  const colorScheme = useColorScheme();
  const theme = resolveTheme(colorScheme);
  const isDark = colorScheme === 'dark';

  const [isNavigationMounted, setIsNavigationMounted] = useState(false);
  const [isResolved, setIsResolved] = useState(false);

  const [fontsLoaded] = useFonts({
    Raleway_700Bold,
    Raleway_800ExtraBold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    const timer = setTimeout(() => setIsNavigationMounted(true), 0);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data as
          | Record<string, string>
          | undefined;
        const type = data?.type;
        const tripId = data?.tripId;

        if (type === 'trip_matched' || type === 'driver_arriving') {
          router.push('/(tabs)/activity');
        } else if (type === 'trip_completed' && tripId) {
          router.push(`/receipt?tripId=${tripId}`);
        }
      },
    );
    return () => subscription.remove();
  }, [router]);

  useEffect(() => {
    if (!isNavigationMounted || !rootNavigationState?.key) return;

    let isMounted = true;

    async function resolveSession() {
      const hasSession = await hasPersistedRiderSession();
      if (!isMounted) return;

      let targetPath: '/auth' | '/home' | null = null;
      if (!hasSession && pathname !== '/auth') targetPath = '/auth';
      if (hasSession && pathname === '/auth') targetPath = '/home';

      setIsResolved(true);

      if (targetPath) {
        setTimeout(() => {
          if (isMounted) router.replace(targetPath);
        }, 0);
      }
    }

    void resolveSession();
    return () => { isMounted = false; };
  }, [isNavigationMounted, pathname, rootNavigationState?.key, router]);

  const showSplash = !isResolved || !fontsLoaded;

  return (
    <ErrorBoundary fallbackLabel="Orbi a rencontré un problème inattendu">
      <>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <TypedStack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: theme.colors.background as string },
          }}
        />
        {showSplash ? (
          <View style={styles.splash}>
            <View style={styles.splashLogo}>
              <Text style={styles.splashWordmark}>orbi</Text>
            </View>
            <ActivityIndicator
              size="small"
              color={orbiTheme.colors.teal}
              style={styles.splashSpinner}
            />
          </View>
        ) : null}
      </>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  splash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: orbiTheme.colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 32,
  },
  splashLogo: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  splashWordmark: {
    fontSize: 42,
    fontWeight: '800',
    fontFamily: 'Raleway_800ExtraBold',
    color: orbiTheme.colors.text,
    letterSpacing: -1,
  },
  splashSpinner: {
    marginTop: 8,
  },
});
