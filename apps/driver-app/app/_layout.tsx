import '../lib/polyfills';
import '../lib/background-location-task';
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
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import * as Notifications from 'expo-notifications';
import { orbiTheme } from '@orbi/ui';
import { ErrorBoundary, OrbiThemeProvider } from '@orbi/ui/native';
import { initDriverI18n } from '../lib/i18n';
import { resolveDriverNavigationSession } from '../lib/driver-navigation';
import { reportDriverRenderCrash } from '../lib/mobile-error-reporting';

const TypedStack = Stack as any;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export default function RootLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const rootNavigationState = useRootNavigationState();
  const theme = orbiTheme;
  const appBackground = theme.colors.driverBackground as string;
  const [isNavigationMounted, setIsNavigationMounted] = useState(false);
  const [isResolved, setIsResolved] = useState(false);
  const [fontsLoaded, fontError] = useFonts({
    Raleway_800ExtraBold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    initDriverI18n();
  }, []);

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
          void resolveDriverNavigationSession('/offres')
            .then((decision) => {
              if (decision.targetPath) {
                router.replace(decision.targetPath);
                return;
              }

              router.push('/offres');
            })
            .catch(() => undefined);
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
      try {
        const decision = await resolveDriverNavigationSession(pathname);

        if (!isMounted) return;

        setIsResolved(true);

        const targetPath = decision.targetPath;

        if (targetPath) {
          setTimeout(() => {
            if (isMounted) {
              router.replace(targetPath);
            }
          }, 0);
        }
      } catch {
        // Échec de lecture de session — rediriger vers auth par défaut
        if (isMounted) {
          setIsResolved(true);
          if (pathname !== '/auth') {
            router.replace('/auth');
          }
        }
      }
    }

    void resolveSession();

    return () => {
      isMounted = false;
    };
  }, [isNavigationMounted, pathname, rootNavigationState?.key, router]);

  const canRenderApp = fontsLoaded || Boolean(fontError);

  return (
    <OrbiThemeProvider>
      <ErrorBoundary
        fallbackLabel="Orbi chauffeur a rencontré un problème inattendu"
        onError={(error) => reportDriverRenderCrash(error, { pathname })}
        showDebugDetails={process.env.EXPO_PUBLIC_DEBUG_CRASH_DETAILS === 'true'}
      >
        <>
          <StatusBar style="dark" />
          {canRenderApp ? (
            <TypedStack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: appBackground },
              }}
            />
          ) : null}
          {!isResolved || !canRenderApp ? (
            <View style={[styles.loadingScreen, { backgroundColor: appBackground }]}>
              <Text
                style={[
                  canRenderApp ? styles.loadingWordmark : styles.loadingWordmarkSystem,
                  { color: theme.colors.text as string },
                ]}
              >
                orbi
              </Text>
              <ActivityIndicator size="small" color={orbiTheme.colors.teal} />
            </View>
          ) : null}
        </>
      </ErrorBoundary>
    </OrbiThemeProvider>
  );
}

const styles = StyleSheet.create({
  loadingScreen: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: orbiTheme.colors.driverBackground,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 32,
  },
  loadingWordmark: {
    fontSize: 42,
    fontWeight: '800',
    fontFamily: 'Raleway_800ExtraBold',
    color: orbiTheme.colors.text,
    letterSpacing: 0,
  },
  loadingWordmarkSystem: {
    fontSize: 30,
    fontWeight: '800',
    color: orbiTheme.colors.text,
    letterSpacing: 0,
  },
});
