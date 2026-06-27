import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';

export type NetworkStatus = 'online' | 'offline' | 'unknown';

let lastKnownStatus: NetworkStatus = 'unknown';
const listeners = new Set<(status: NetworkStatus) => void>();

function broadcastStatus(status: NetworkStatus) {
  lastKnownStatus = status;
  for (const listener of listeners) {
    listener(status);
  }
}

async function checkConnectivity(): Promise<NetworkStatus> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const response = await fetch('https://clients3.google.com/generate_204', {
      method: 'HEAD',
      signal: controller.signal,
      cache: 'no-store',
    });
    clearTimeout(timeout);
    return response.status === 204 ? 'online' : 'offline';
  } catch {
    return 'offline';
  }
}

if (Platform.OS !== 'web') {
  void (async () => {
    const status = await checkConnectivity();
    broadcastStatus(status);
  })();
}

export function useNetworkStatus(): NetworkStatus {
  const [status, setStatus] = useState<NetworkStatus>(lastKnownStatus);

  useEffect(() => {
    let cancelled = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    const listener = (next: NetworkStatus) => {
      if (!cancelled) setStatus(next);
    };
    listeners.add(listener);

    // Initial check
    void checkConnectivity().then((next) => {
      if (!cancelled) {
        broadcastStatus(next);
      }
    });

    // Poll every 15s when app is active
    const appStateSubscription = AppState.addEventListener(
      'change',
      (state) => {
        if (state === 'active') {
          void checkConnectivity().then(broadcastStatus);
        }
      },
    );

    pollTimer = setInterval(async () => {
      if (AppState.currentState === 'active') {
        const next = await checkConnectivity();
        broadcastStatus(next);
      }
    }, 15_000);

    return () => {
      cancelled = true;
      listeners.delete(listener);
      appStateSubscription.remove();
      if (pollTimer) clearInterval(pollTimer);
    };
  }, []);

  return status;
}
