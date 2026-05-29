import EventSource from 'react-native-sse';

// Polyfill EventSource for React Native so the SSE realtime stream works.
// Without this, globalThis.EventSource is undefined and the hook silently no-ops.
// @ts-ignore
global.EventSource = EventSource;
