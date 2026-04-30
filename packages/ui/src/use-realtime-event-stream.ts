'use client';

import { useEffect, useRef } from 'react';

export type RealtimeStatusCallbacks = {
  onHeartbeat?: () => void;
  onOpen?: () => void;
  onError?: () => void;
};

type EventSourceLike = {
  addEventListener(type: string, listener: () => void): void;
  close(): void;
  onopen: null | (() => void);
  onerror: null | (() => void);
};

export function useRealtimeEventStream(
  sessionToken: string | null,
  options: {
    eventTypes: readonly string[];
    buildStreamUrl: (sessionToken: string) => string;
    onRealtimeUpdate: (eventType: string) => void;
    callbacks?: RealtimeStatusCallbacks;
    coalesceWindowMs?: number;
  },
) {
  const realtimeUpdateRef = useRef(options.onRealtimeUpdate);
  const callbacksRef = useRef(options.callbacks);
  const latestEventTypeRef = useRef<string | null>(null);
  const flushTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    realtimeUpdateRef.current = options.onRealtimeUpdate;
    callbacksRef.current = options.callbacks;
  }, [options.callbacks, options.onRealtimeUpdate]);

  useEffect(() => {
    if (!sessionToken) {
      return;
    }

    const EventSourceCtor = (
      globalThis as {
        EventSource?: new (url: string) => EventSourceLike;
      }
    ).EventSource;

    if (!EventSourceCtor) {
      return;
    }

    const coalesceWindowMs = options.coalesceWindowMs ?? 350;
    const stream = new EventSourceCtor(options.buildStreamUrl(sessionToken));

    function scheduleRealtimeUpdate(eventType: string) {
      latestEventTypeRef.current = eventType;

      if (flushTimeoutRef.current) {
        return;
      }

      flushTimeoutRef.current = setTimeout(() => {
        flushTimeoutRef.current = null;

        if (!latestEventTypeRef.current) {
          return;
        }

        const nextEventType = latestEventTypeRef.current;
        latestEventTypeRef.current = null;
        realtimeUpdateRef.current(nextEventType);
      }, coalesceWindowMs);
    }

    for (const eventType of options.eventTypes) {
      stream.addEventListener(eventType, () => {
        scheduleRealtimeUpdate(eventType);
      });
    }

    stream.addEventListener('heartbeat', () => {
      callbacksRef.current?.onHeartbeat?.();
    });

    stream.onopen = () => {
      callbacksRef.current?.onOpen?.();
    };

    stream.onerror = () => {
      callbacksRef.current?.onError?.();
    };

    return () => {
      if (flushTimeoutRef.current) {
        clearTimeout(flushTimeoutRef.current);
        flushTimeoutRef.current = null;
      }

      latestEventTypeRef.current = null;
      stream.close();
    };
  }, [
    options.buildStreamUrl,
    options.coalesceWindowMs,
    options.eventTypes,
    sessionToken,
  ]);
}
