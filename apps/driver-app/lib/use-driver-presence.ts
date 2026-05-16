import { useEffect, useState } from 'react';
import * as Location from 'expo-location';
import {
  extractApiErrorMessage,
  updateDriverPresenceWithApi,
} from '@orbi/api';
import { restoreDriverSession } from './auth';

type DriverPresenceStatus =
  | 'idle'
  | 'requesting-permission'
  | 'syncing'
  | 'live'
  | 'permission-denied'
  | 'unavailable'
  | 'error';

const PRESENCE_DISTANCE_INTERVAL_METERS = 120;
const PRESENCE_TIME_INTERVAL_MS = 30000;

export function useDriverPresence(enabled: boolean) {
  const [presenceStatus, setPresenceStatus] =
    useState<DriverPresenceStatus>('idle');
  const [presenceNote, setPresenceNote] = useState(
    'Presence GPS en attente.',
  );

  useEffect(() => {
    if (!enabled) {
      setPresenceStatus('idle');
      setPresenceNote('Presence GPS en pause tant que le chauffeur est hors ligne.');
      return;
    }

    let isDisposed = false;
    let subscription: Location.LocationSubscription | null = null;

    async function startPresenceSync() {
      setPresenceStatus('requesting-permission');
      setPresenceNote('Verification de la permission de localisation...');

      try {
        const permission =
          await Location.requestForegroundPermissionsAsync();

        if (isDisposed) {
          return;
        }

        if (!permission.granted) {
          setPresenceStatus('permission-denied');
          setPresenceNote(
            'Localisation refusee. Le dispatch reste actif mais sans priorisation GPS.',
          );
          return;
        }

        const locationServicesEnabled =
          await Location.hasServicesEnabledAsync();

        if (isDisposed) {
          return;
        }

        if (!locationServicesEnabled) {
          setPresenceStatus('unavailable');
          setPresenceNote(
            'Le GPS du telephone est desactive. Le dispatch utilisera le mode degrade.',
          );
          return;
        }

        setPresenceStatus('syncing');
        setPresenceNote('Synchronisation de votre position avec le dispatch...');

        subscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            distanceInterval: PRESENCE_DISTANCE_INTERVAL_METERS,
            timeInterval: PRESENCE_TIME_INTERVAL_MS,
          },
          async (position) => {
            if (isDisposed) {
              return;
            }

            try {
              const { authClient } = await restoreDriverSession();
              await updateDriverPresenceWithApi(authClient, {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
              });

              if (isDisposed) {
                return;
              }

              setPresenceStatus('live');
              setPresenceNote(
                `Presence GPS synchronisee. Precision ${Math.round(
                  position.coords.accuracy ?? 0,
                )} m.`,
              );
            } catch (error) {
              if (isDisposed) {
                return;
              }

              setPresenceStatus('error');
              setPresenceNote(
                extractApiErrorMessage(
                  error,
                  'Synchronisation GPS impossible pour le moment.',
                ),
              );
            }
          },
        );
      } catch (error) {
        if (isDisposed) {
          return;
        }

        setPresenceStatus('error');
        setPresenceNote(
          extractApiErrorMessage(
            error,
            'La localisation chauffeur ne peut pas etre demarree.',
          ),
        );
      }
    }

    void startPresenceSync();

    return () => {
      isDisposed = true;
      subscription?.remove();
    };
  }, [enabled]);

  return {
    presenceStatus,
    presenceNote,
  };
}
