import { useCallback, useEffect, useRef, useState } from 'react';
import { useNetworkStatus } from './use-network-status';

type QueuedRequest<T = unknown> = {
  id: string;
  fn: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
  retries: number;
  label: string;
};

const MAX_RETRIES = 3;
const queue: QueuedRequest[] = [];
let isProcessing = false;

async function processQueue() {
  if (isProcessing || queue.length === 0) return;
  isProcessing = true;

  while (queue.length > 0) {
    const item = queue[0];
    if (!item) break;

    try {
      const result = await item.fn();
      item.resolve(result);
      queue.shift();
    } catch (error) {
      item.retries++;
      if (item.retries >= MAX_RETRIES) {
        item.reject(error);
        queue.shift();
      } else {
        // Exponential backoff before retry
        await new Promise((r) => setTimeout(r, Math.min(1000 * item.retries, 8000)));
      }
    }
  }

  isProcessing = false;
}

/**
 * Returns a wrapper that queues failed requests when offline and retries
 * automatically when the network comes back. Only use for idempotent operations
 * (GET, or POST with server-side deduplication).
 */
export function useOfflineQueue() {
  const status = useNetworkStatus();
  const prevStatus = useRef(status);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    if (prevStatus.current === 'offline' && status === 'online') {
      // Network recovered — flush the queue
      void processQueue().then(() => setPendingCount(queue.length));
    }
    prevStatus.current = status;
  }, [status]);

  const enqueue = useCallback(
    <T>(fn: () => Promise<T>, label = 'request'): Promise<T> => {
      if (status === 'online') {
        return fn();
      }

      return new Promise<T>((resolve, reject) => {
        queue.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          fn: fn as () => Promise<unknown>,
          resolve: resolve as (value: unknown) => void,
          reject,
          retries: 0,
          label,
        });
        setPendingCount(queue.length);
      });
    },
    [status],
  );

  return { enqueue, pendingCount, isOffline: status === 'offline' };
}
