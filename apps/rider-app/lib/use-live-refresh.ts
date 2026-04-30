import { useEffect, useRef } from 'react';

export function useLiveRefresh(refresh: () => void | Promise<void>, intervalMs = 25000) {
  const refreshRef = useRef(refresh);
  const inFlightRef = useRef(false);

  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    let isMounted = true;

    async function runRefresh() {
      if (inFlightRef.current || !isMounted) {
        return;
      }

      inFlightRef.current = true;

      try {
        await refreshRef.current();
      } finally {
        inFlightRef.current = false;
      }
    }

    void runRefresh();

    const interval = setInterval(() => {
      void runRefresh();
    }, intervalMs);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [intervalMs]);
}
