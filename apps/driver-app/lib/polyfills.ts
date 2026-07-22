// Polyfill EventSource for React Native so the SSE realtime stream works.
// Without this, globalThis.EventSource is undefined and the hook silently no-ops.
// Wrapped in try/catch: if react-native-sse fails to load, the app must not crash.
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const EventSource = require('react-native-sse').default;
  if (EventSource) {
    const globalWithEventSource = globalThis as unknown as Record<string, unknown>;

    globalWithEventSource.EventSource = EventSource;
  }
} catch {
  // EventSource non disponible — les connexions SSE seront ignorées.
  // Le WebSocket reste fonctionnel pour le temps réel.
}
