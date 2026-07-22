import EventSource from 'react-native-sse';

// Polyfill EventSource for React Native so the SSE realtime stream works.
// Without this, globalThis.EventSource is undefined and the hook silently no-ops.
const globalWithEventSource = globalThis as unknown as Record<string, unknown>;

globalWithEventSource.EventSource = EventSource;
