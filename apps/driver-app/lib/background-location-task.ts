/**
 * Tâche de géolocalisation en arrière-plan — Orbi Chauffeur
 *
 * Définie au chargement du module (import effet-de-bord dans _layout.tsx),
 * comme l'exige expo-task-manager. Démarrée/arrêtée par
 * startBackgroundLocationTracking / stopBackgroundLocationTracking lorsque
 * le chauffeur passe en ligne/hors ligne (voir use-driver-presence.ts).
 * Transmet la position GPS au backend même si le téléphone est verrouillé.
 */
import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import * as SecureStore from 'expo-secure-store';
import {
  recordTripRoutePositionWithApi,
  updateDriverPresenceWithApi,
} from '@orbi/api';
import { restoreDriverSession } from './auth';

export const BACKGROUND_LOCATION_TASK = 'orbi-driver-background-location';

// Persisté (pas une simple variable module) car le process JS peut être tué
// puis relancé par l'OS entre deux positions en arrière-plan : une variable
// en mémoire perdrait le rattachement course active à chaque relance.
const ACTIVE_TRIP_STORAGE_KEY = 'orbi.driver.background-active-trip-id';

type BackgroundLocationData = {
  locations: Location.LocationObject[];
};

TaskManager.defineTask(
  BACKGROUND_LOCATION_TASK,
  async ({ data, error }: TaskManager.TaskManagerTaskBody<BackgroundLocationData>) => {
    if (error) {
      console.warn('[BG-GPS] Erreur tâche background:', error.message);
      return;
    }

    const locations = data?.locations;
    if (!locations?.length) return;

    const latest = locations[locations.length - 1];
    if (!latest) return;

    const { latitude, longitude, accuracy } = latest.coords;

    try {
      const { authClient } = await restoreDriverSession();

      await updateDriverPresenceWithApi(authClient, {
        latitude,
        longitude,
      });

      const activeTripId = await getStoredActiveTripId();
      if (activeTripId) {
        await recordTripRoutePositionWithApi(authClient, activeTripId, {
          latitude,
          longitude,
          accuracyMeters: accuracy ?? undefined,
        });
      }
    } catch {
      // Erreur réseau silencieuse — la tâche sera retentée automatiquement
    }
  },
);

export async function setBackgroundActiveTripId(tripId: string | null) {
  try {
    if (tripId) {
      await SecureStore.setItemAsync(ACTIVE_TRIP_STORAGE_KEY, tripId);
    } else {
      await SecureStore.deleteItemAsync(ACTIVE_TRIP_STORAGE_KEY);
    }
  } catch {
    // Non-bloquant : au pire une position ne sera pas rattachée à la course.
  }
}

async function getStoredActiveTripId(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(ACTIVE_TRIP_STORAGE_KEY);
  } catch {
    return null;
  }
}

// Sur Android, isTaskRegisteredAsync ne veut pas dire que les mises à jour
// sont en cours : il faut vérifier hasStartedLocationUpdatesAsync en plus.
async function isBackgroundTrackingActive() {
  const isRegistered = await TaskManager.isTaskRegisteredAsync(
    BACKGROUND_LOCATION_TASK,
  );
  if (!isRegistered) return false;

  return Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
}

export async function startBackgroundLocationTracking(): Promise<boolean> {
  try {
    const foregroundPermission = await Location.getForegroundPermissionsAsync();
    if (!foregroundPermission.granted) return false;

    const backgroundPermission =
      await Location.requestBackgroundPermissionsAsync();
    if (!backgroundPermission.granted) return false;

    if (await isBackgroundTrackingActive()) return true;

    await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
      accuracy: Location.Accuracy.High,
      timeInterval: 15_000,
      distanceInterval: 30,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: 'Orbi Chauffeur en ligne',
        notificationBody: 'Votre position est partagée avec le dispatch.',
        notificationColor: '#00B894',
      },
    });

    return true;
  } catch {
    return false;
  }
}

export async function stopBackgroundLocationTracking() {
  try {
    if (await isBackgroundTrackingActive()) {
      await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
    }
  } catch {
    // Non-bloquant — le pire cas est un envoi de position résiduel.
  }

  await setBackgroundActiveTripId(null);
}
