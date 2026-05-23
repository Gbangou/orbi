import { useEffect } from 'react';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { registerPushTokenWithApi } from '@orbi/api';
import { restoreDriverSession } from './auth';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function isGranted(result: unknown): boolean {
  if (result && typeof result === 'object') {
    const r = result as Record<string, unknown>;
    if (typeof r['granted'] === 'boolean') return r['granted'];
    if (r['status'] === 'granted') return true;
  }
  return false;
}

async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) {
    return null;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#00C7C7',
    });
  }

  let granted = isGranted(await Notifications.getPermissionsAsync());

  if (!granted) {
    granted = isGranted(await Notifications.requestPermissionsAsync());
  }

  if (!granted) {
    return null;
  }

  const tokenData = await Notifications.getExpoPushTokenAsync();
  return tokenData.data;
}

export function usePushRegistration() {
  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        const token = await registerForPushNotifications();
        if (!token || cancelled) return;

        const session = await restoreDriverSession();
        if (!session || cancelled) return;

        await registerPushTokenWithApi(session.authClient, token);
      } catch {
        // Push registration is best-effort — never block the UI
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, []);
}
