import '../lib/polyfills';
import {
  Stack,
  useLocalSearchParams,
  usePathname,
  useRootNavigationState,
  useRouter,
} from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View, ActivityIndicator } from 'react-native';
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
import { orbiTheme } from '@orbi/ui';
import { ErrorBoundary, OrbiThemeProvider } from '@orbi/ui/native';
import { fetchMyTrips } from '@orbi/api';
import { hasPersistedRiderSession, restoreRiderSession } from '../lib/auth';
import { reportRiderRenderCrash } from '../lib/mobile-error-reporting';
import { resolveRiderAppError } from '../lib/session-feedback';
import {
  resolveRiderBackendNavigationState,
  resolveRiderNavigationDecision,
  resolveRiderNotificationTarget,
  type RiderNavigationBackendState,
} from '../lib/rider-navigation';

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
  const params = useLocalSearchParams();
  const normalizedParams = useMemo(
    () => normalizeRootSearchParams(params),
    [params],
  );
  const normalizedParamsKey = useMemo(
    () => JSON.stringify(normalizedParams),
    [normalizedParams],
  );
  const rootNavigationState = useRootNavigationState();
  const theme = orbiTheme;
  const appBackground = theme.colors.riderBackground as string;

  const [isNavigationMounted, setIsNavigationMounted] = useState(false);
  const [isResolved, setIsResolved] = useState(false);
  const [hasResolvedSession, setHasResolvedSession] = useState(false);

  const [fontsLoaded, fontError] = useFonts({
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
        const target = resolveRiderNotificationTarget({
          type,
          tripId,
          hasSession: hasResolvedSession,
        });

        router.push(target);
      },
    );
    return () => subscription.remove();
  }, [hasResolvedSession, router]);

  useEffect(() => {
    if (!isNavigationMounted || !rootNavigationState?.key) return;

    let isMounted = true;

    async function resolveSession() {
      let hasSession = false;
      let backendState: RiderNavigationBackendState = { status: 'unknown' };

      try {
        hasSession = await hasPersistedRiderSession();
      } catch {
        hasSession = false;
      }

      if (hasSession) {
        try {
          const { authClient } = await restoreRiderSession();
          const history = await fetchMyTrips(authClient);
          backendState = resolveRiderBackendNavigationState(history);
        } catch (error) {
          const feedback = await resolveRiderAppError(error, { surface: 'auth' });
          hasSession = !feedback.shouldClearSessionToken;
          backendState = { status: 'unavailable' };
        }
      }

      if (!isMounted) return;

      const decision = resolveRiderNavigationDecision({
        pathname,
        hasSession,
        backendState,
        params: normalizedParams,
      });

      setHasResolvedSession(hasSession);
      setIsResolved(true);

      if (decision.action === 'replace' && decision.targetPath) {
        setTimeout(() => {
          if (isMounted) router.replace(decision.targetPath!);
        }, 0);
      }
    }

    void resolveSession();
    return () => { isMounted = false; };
  }, [
    isNavigationMounted,
    normalizedParamsKey,
    pathname,
    rootNavigationState?.key,
    router,
  ]);

  const canRenderApp = fontsLoaded || Boolean(fontError);
  const showSplash = !isResolved || !canRenderApp;

  return (
    <OrbiThemeProvider>
      <ErrorBoundary
        fallbackLabel="Orbi a rencontré un problème inattendu"
        onError={(error) => reportRiderRenderCrash(error, { pathname })}
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
            >
              <TypedStack.Screen name="index" options={{ gestureEnabled: false }} />
              <TypedStack.Screen name="auth" options={{ gestureEnabled: false }} />
              <TypedStack.Screen name="(tabs)" options={{ gestureEnabled: false }} />
              <TypedStack.Screen name="book" options={{ gestureEnabled: true }} />
              <TypedStack.Screen
                name="receipt"
                options={{ presentation: 'modal', gestureEnabled: false }}
              />
              <TypedStack.Screen
                name="rating"
                options={{ presentation: 'modal', gestureEnabled: false }}
              />
              <TypedStack.Screen name="+not-found" options={{ gestureEnabled: false }} />
            </TypedStack>
          ) : null}
          {showSplash ? (
            <View style={styles.splash}>
              <View style={styles.splashLogo}>
                <Text
                  style={[
                    canRenderApp ? styles.splashWordmark : styles.splashWordmarkSystem,
                  ]}
                >
                  orbi
                </Text>
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
    </OrbiThemeProvider>
  );
}

const styles = StyleSheet.create({
  splash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: orbiTheme.colors.riderBackground,
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
    letterSpacing: 0,
  },
  splashWordmarkSystem: {
    fontSize: 32,
    fontWeight: '800',
    color: orbiTheme.colors.text,
    letterSpacing: 0,
  },
  splashSpinner: {
    marginTop: 8,
  },
});

function normalizeRootSearchParams(
  params: Record<string, string | string[] | undefined>,
) {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => {
      if (Array.isArray(value)) {
        return value.every((entry) => typeof entry === 'string');
      }

      return typeof value === 'string' || value === undefined;
    }),
  ) as Record<string, string | string[] | undefined>;
}
