import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'expo-router';
import { fetchDriverOffers } from '@orbi/api';
import { restoreDriverSession } from './auth';

const offerAutoOpenIntervalMs = 2500;

export function useDriverOfferAutoOpen() {
  const router = useRouter();
  const pathname = usePathname();
  const inFlightRef = useRef(false);
  const lastOpenedOfferIdRef = useRef<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function checkForIncomingOffer() {
      if (inFlightRef.current || pathname.includes('/offres')) {
        return;
      }

      inFlightRef.current = true;

      try {
        const { authClient } = await restoreDriverSession();
        const offers = await fetchDriverOffers(authClient);
        const incomingOffer = offers[0] ?? null;

        if (
          isMounted &&
          incomingOffer &&
          incomingOffer.id !== lastOpenedOfferIdRef.current
        ) {
          lastOpenedOfferIdRef.current = incomingOffer.id;
          router.push('/offres');
        }
      } catch {
        // Screen-level refresh already owns visible network/session feedback.
      } finally {
        inFlightRef.current = false;
      }
    }

    void checkForIncomingOffer();

    const interval = setInterval(() => {
      void checkForIncomingOffer();
    }, offerAutoOpenIntervalMs);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [pathname, router]);
}
