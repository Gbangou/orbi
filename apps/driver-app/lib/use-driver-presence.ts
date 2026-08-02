import { useEffect, useState } from 'react';
import * as Location from 'expo-location';
import {
  resolveDisplayableApiErrorMessage,
  recordTripRoutePositionWithApi,
  updateDriverPresenceWithApi,
} from '@orbi/api';
import { restoreDriverSession } from './auth';
import {
  setBackgroundActiveTripId,
  startBackgroundLocationTracking,
  stopBackgroundLocationTracking,
} from './background-location-task';
import {
  buildDriverPresenceSyncedNote,
  buildDriverRoutePositionPayload,
  resolveDriverPresenceTrackingOptions,
  type DriverPresencePosition,
} from './driver-presence-signal';

type DriverPresenceStatus =
  | 'idle'
  | 'requesting-permission'
  | 'syncing'
  | 'live'
  | 'permission-denied'
  | 'unavailable'
  | 'error';

export type DriverLivePosition = {
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
};

export function useDriverPresence(enabled: boolean, activeTripId?: string | null) {
  const [presenceStatus, setPresenceStatus] =
    useState<DriverPresenceStatus>('idle');
  const [presenceNote, setPresenceNote] = useState(
    'Position en attente.',
  );
  const [latestPosition, setLatestPosition] =
    useState<DriverLivePosition | null>(null);

  // Suivi arrière-plan: actif tant que le chauffeur est en ligne ou en course.
  useEffect(() => {
    if (!enabled) {
      void stopBackgroundLocationTracking();
      return;
    }

    void startBackgroundLocationTracking();

    return () => {
      void stopBackgroundLocationTracking();
    };
  }, [enabled]);

  useEffect(() => {
    void setBackgroundActiveTripId(activeTripId ?? null);
  }, [activeTripId]);

  useEffect(() => {
    if (!enabled) {
      setPresenceStatus('idle');
      setPresenceNote('Position en pause tant que le chauffeur est hors ligne.');
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
            'Localisation refusee. Les offres restent disponibles avec moins de precision.',
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
            'La localisation du telephone est desactivee. Activez-la pour plus de precision.',
          );
          return;
        }

        setPresenceStatus('syncing');
        setPresenceNote(
          activeTripId
            ? 'Mise a jour immediate de votre position mission...'
            : 'Mise a jour de votre position...',
        );

        const syncPosition = async (position: DriverPresencePosition) => {
          if (isDisposed) {
            return;
          }

          try {
            const payload = buildDriverRoutePositionPayload(position);
            setLatestPosition({
              latitude: payload.latitude,
              longitude: payload.longitude,
              accuracyMeters: payload.accuracyMeters ?? null,
            });
            const { authClient } = await restoreDriverSession();
            await updateDriverPresenceWithApi(authClient, {
              latitude: payload.latitude,
              longitude: payload.longitude,
            });
            const routePosition = activeTripId
              ? await recordTripRoutePositionWithApi(
                  authClient,
                  activeTripId,
                  payload,
                )
              : null;

            if (isDisposed) {
              return;
            }

            setPresenceStatus('live');
            setPresenceNote(
              buildDriverPresenceSyncedNote({
                accuracyMeters: payload.accuracyMeters,
                activeTripId,
                latestPosition:
                  routePosition?.routeMonitoring.latestPosition ?? null,
              }),
            );
          } catch (error) {
            if (isDisposed) {
              return;
            }

            setPresenceStatus('error');
            setPresenceNote(
              resolveDisplayableApiErrorMessage(
                error,
                'Position indisponible pour le moment.',
              ),
            );
          }
        };

        const currentPosition = await Location.getCurrentPositionAsync({
          accuracy: activeTripId
            ? Location.Accuracy.High
            : Location.Accuracy.Balanced,
        });

        await syncPosition(currentPosition);

        subscription = await Location.watchPositionAsync(
          {
            accuracy: activeTripId
              ? Location.Accuracy.High
              : Location.Accuracy.Balanced,
            ...resolveDriverPresenceTrackingOptions(activeTripId),
          },
          syncPosition,
        );
      } catch (error) {
        if (isDisposed) {
          return;
        }

        setPresenceStatus('error');
        setPresenceNote(
          resolveDisplayableApiErrorMessage(
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
  }, [activeTripId, enabled]);

  return {
    presenceStatus,
    presenceNote,
    latestPosition,
  };
}
