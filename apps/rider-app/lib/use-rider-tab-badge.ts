import { useEffect, useRef, useState } from 'react';
import { fetchMyTrips, createOrbiApiClient } from '@orbi/api';
import { orbiRuntimeConfig, resolveOrbiApiBaseUrlForRuntime } from '@orbi/config';
import { resolveRiderActiveFlow } from './rider-active-flow';
import { restoreRiderSession } from './auth';

/**
 * Polls the active flow state to drive tab bar badges.
 * Returns the count to display on the "Activité" tab icon.
 * - 1 when there is an active trip or pending request
 * - 0 otherwise
 */
export function useRiderTabBadge() {
  const [activityBadge, setActivityBadge] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function checkBadge() {
    try {
      const { authClient } = await restoreRiderSession();
      const history = await fetchMyTrips(authClient);
      const flow = resolveRiderActiveFlow(history);
      setActivityBadge(flow.hasOpenFlow ? 1 : 0);
    } catch {
      // Badge check is best-effort — never block the UI
    }
  }

  useEffect(() => {
    void checkBadge();

    // Refresh every 30s — same cadence as home screen polling
    intervalRef.current = setInterval(() => void checkBadge(), 30_000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return { activityBadge };
}
