import { useEffect, useRef } from 'react';

export type RealtimeStatusCallbacks = {
  onHeartbeat?: () => void;
  onOpen?: () => void;
  onError?: () => void;
};

type RealtimeEvent = {
  type: string;
  [key: string]: unknown;
};

/**
 * WebSocket realtime stream — remplace SSE pour les réseaux mobiles africains.
 *
 * Avantages sur le terrain:
 * - Reconnexion automatique avec backoff exponentiel (30s max)
 * - Heartbeat bidirectionnel toutes les 25s — détecte coupures réseau
 * - Beaucoup moins de proxies qui bloquent les connexions longues vs SSE
 *
 * Protocole:
 *   → { type: "subscribe", role, actorId, riderId?, driverId? }
 *   ← { type: "subscribed" }
 *   ← { type: "event", eventType, ... }
 *   → { type: "ping" } (toutes les 25s)
 *   ← { type: "pong" }
 */
export function useWebSocketRealtimeStream(
  wsBaseUrl: string | null,
  sessionToken: string | null,
  subscribePayload: {
    role: 'rider' | 'driver' | 'RIDER' | 'DRIVER';
    actorId?: string | null;
    riderId?: string | null;
    driverId?: string | null;
  },
  options: {
    eventTypes: readonly string[];
    onRealtimeUpdate: (eventType: string) => void;
    callbacks?: RealtimeStatusCallbacks;
    coalesceWindowMs?: number;
  },
) {
  const onUpdateRef = useRef(options.onRealtimeUpdate);
  const callbacksRef = useRef(options.callbacks);
  const eventTypesRef = useRef(options.eventTypes);
  const coalesceWindowMs = options.coalesceWindowMs ?? 350;
  const subscribeRole = subscribePayload.role.toUpperCase();
  const subscribeActorId = subscribePayload.actorId ?? null;
  const subscribeRiderId = subscribePayload.riderId ?? null;
  const subscribeDriverId = subscribePayload.driverId ?? null;

  const latestEventRef = useRef<string | null>(null);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttempts = useRef(0);
  const isCleaningUp = useRef(false);

  useEffect(() => {
    onUpdateRef.current = options.onRealtimeUpdate;
    callbacksRef.current = options.callbacks;
    eventTypesRef.current = options.eventTypes;
  });

  useEffect(() => {
    if (!wsBaseUrl || !sessionToken) return;

    isCleaningUp.current = false;

    function scheduleUpdate(eventType: string) {
      latestEventRef.current = eventType;
      if (flushTimerRef.current) return;
      flushTimerRef.current = setTimeout(() => {
        flushTimerRef.current = null;
        const next = latestEventRef.current;
        latestEventRef.current = null;
        if (next) onUpdateRef.current(next);
      }, coalesceWindowMs);
    }

    function clearTimers() {
      if (flushTimerRef.current) { clearTimeout(flushTimerRef.current); flushTimerRef.current = null; }
      if (heartbeatTimerRef.current) { clearInterval(heartbeatTimerRef.current); heartbeatTimerRef.current = null; }
      if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }
    }

    function connect() {
      if (isCleaningUp.current) return;

      if (!wsBaseUrl) { scheduleReconnect(); return; }
      let ws: WebSocket;
      try {
        ws = new WebSocket(wsBaseUrl);
      } catch {
        scheduleReconnect();
        return;
      }

      ws.onopen = () => {
        reconnectAttempts.current = 0;
        callbacksRef.current?.onOpen?.();

        // Envoi de la souscription
        ws.send(JSON.stringify({
          type: 'subscribe',
          role: subscribeRole,
          actorId: subscribeActorId,
          riderId: subscribeRiderId,
          driverId: subscribeDriverId,
        }));

        // Heartbeat toutes les 25s pour garder la connexion vivante
        heartbeatTimerRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, 25_000);
      };

      ws.onmessage = (event) => {
        let data: RealtimeEvent;
        try {
          data = JSON.parse(String(event.data)) as RealtimeEvent;
        } catch {
          return;
        }

        if (data.type === 'pong') {
          callbacksRef.current?.onHeartbeat?.();
          return;
        }

        if (data.type === 'event') {
          const eventType = String(data['eventType'] ?? '');
          if (eventType && eventTypesRef.current.includes(eventType)) {
            scheduleUpdate(eventType);
          }
          return;
        }

        if (data.type === 'subscribed') {
          return; // OK
        }

        const directEventType = String(data.type ?? '');
        if (eventTypesRef.current.includes(directEventType)) {
          scheduleUpdate(directEventType);
        }
      };

      ws.onerror = () => {
        callbacksRef.current?.onError?.();
      };

      ws.onclose = (event) => {
        if (heartbeatTimerRef.current) {
          clearInterval(heartbeatTimerRef.current);
          heartbeatTimerRef.current = null;
        }

        if (!isCleaningUp.current) {
          scheduleReconnect();
        }
      };

      // Expose ws for cleanup
      (activeWsRef as { current: WebSocket | null }).current = ws;
    }

    const activeWsRef: { current: WebSocket | null } = { current: null };

    function scheduleReconnect() {
      if (isCleaningUp.current) return;
      // Backoff exponentiel: 1s, 2s, 4s, 8s, 16s, max 30s
      const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30_000);
      reconnectAttempts.current++;
      reconnectTimerRef.current = setTimeout(() => {
        if (!isCleaningUp.current) connect();
      }, delay);
    }

    connect();

    return () => {
      isCleaningUp.current = true;
      clearTimers();
      latestEventRef.current = null;
      if (activeWsRef.current) {
        activeWsRef.current.close();
        activeWsRef.current = null;
      }
    };
  }, [
    wsBaseUrl,
    sessionToken,
    coalesceWindowMs,
    subscribeRole,
    subscribeActorId,
    subscribeRiderId,
    subscribeDriverId,
  ]);
}
