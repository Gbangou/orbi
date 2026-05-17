import { useEffect, useState } from "react";
import * as Location from "expo-location";
import {
  extractApiErrorMessage,
  recordTripRoutePositionWithApi,
} from "@orbi/api";
import { restoreRiderSession } from "./auth";
import { buildRiderPositionSyncedNote } from "./rider-position-signal";

type RiderPositionStatus =
  | "idle"
  | "requesting-permission"
  | "syncing"
  | "live"
  | "permission-denied"
  | "unavailable"
  | "error";

export type RiderLivePosition = {
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  speedKph?: number;
};

const RIDER_DISTANCE_INTERVAL_METERS = 80;
const RIDER_TIME_INTERVAL_MS = 20000;
const RIDER_ACTIVE_TRIP_DISTANCE_INTERVAL_METERS = 60;
const RIDER_ACTIVE_TRIP_TIME_INTERVAL_MS = 15000;

export function useRiderPosition(input: {
  enabled: boolean;
  activeTripId?: string | null;
}) {
  const [positionStatus, setPositionStatus] =
    useState<RiderPositionStatus>("idle");
  const [positionNote, setPositionNote] = useState(
    "Position passager en attente.",
  );
  const [latestPosition, setLatestPosition] =
    useState<RiderLivePosition | null>(null);

  useEffect(() => {
    if (!input.enabled) {
      setPositionStatus("idle");
      setPositionNote("Position passager en pause.");
      return;
    }

    let isDisposed = false;
    let subscription: Location.LocationSubscription | null = null;

    async function startRiderPositionSync() {
      setPositionStatus("requesting-permission");
      setPositionNote("Verification de la permission GPS passager...");

      try {
        const permission = await Location.requestForegroundPermissionsAsync();

        if (isDisposed) {
          return;
        }

        if (!permission.granted) {
          setPositionStatus("permission-denied");
          setPositionNote(
            "Localisation refusee. Orbi garde les lieux saisis et le suivi degrade.",
          );
          return;
        }

        const locationServicesEnabled =
          await Location.hasServicesEnabledAsync();

        if (isDisposed) {
          return;
        }

        if (!locationServicesEnabled) {
          setPositionStatus("unavailable");
          setPositionNote(
            "Le GPS du telephone est desactive. Les lieux saisis restent utilisables.",
          );
          return;
        }

        setPositionStatus("syncing");
        setPositionNote("Synchronisation de votre position...");

        const syncRiderPosition = async (position: Location.LocationObject) => {
          if (isDisposed) {
            return;
          }

          const speedKph =
            typeof position.coords.speed === "number" &&
            Number.isFinite(position.coords.speed)
              ? Math.max(0, position.coords.speed * 3.6)
              : undefined;
          const nextPosition: RiderLivePosition = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracyMeters: position.coords.accuracy ?? null,
            speedKph,
          };

          setLatestPosition(nextPosition);

          try {
            let routePosition = null;
            if (input.activeTripId) {
              const { authClient } = await restoreRiderSession();
              routePosition = await recordTripRoutePositionWithApi(
                authClient,
                input.activeTripId,
                {
                  latitude: nextPosition.latitude,
                  longitude: nextPosition.longitude,
                  accuracyMeters: nextPosition.accuracyMeters ?? undefined,
                  speedKph,
                },
              );
            }

            if (isDisposed) {
              return;
            }

            setPositionStatus("live");
            setPositionNote(
              buildRiderPositionSyncedNote({
                accuracyMeters: nextPosition.accuracyMeters,
                activeTripId: input.activeTripId,
                latestPosition:
                  routePosition?.routeMonitoring.latestPosition ?? null,
              }),
            );
          } catch (error) {
            if (isDisposed) {
              return;
            }

            setPositionStatus("error");
            setPositionNote(
              extractApiErrorMessage(
                error,
                "Synchronisation position passager impossible pour le moment.",
              ),
            );
          }
        };

        const currentPosition = await Location.getCurrentPositionAsync({
          accuracy: input.activeTripId
            ? Location.Accuracy.High
            : Location.Accuracy.Balanced,
        });

        await syncRiderPosition(currentPosition);

        subscription = await Location.watchPositionAsync(
          {
            accuracy: input.activeTripId
              ? Location.Accuracy.High
              : Location.Accuracy.Balanced,
            distanceInterval: input.activeTripId
              ? RIDER_ACTIVE_TRIP_DISTANCE_INTERVAL_METERS
              : RIDER_DISTANCE_INTERVAL_METERS,
            timeInterval: input.activeTripId
              ? RIDER_ACTIVE_TRIP_TIME_INTERVAL_MS
              : RIDER_TIME_INTERVAL_MS,
          },
          syncRiderPosition,
        );
      } catch (error) {
        if (isDisposed) {
          return;
        }

        setPositionStatus("error");
        setPositionNote(
          extractApiErrorMessage(
            error,
            "La localisation passager ne peut pas etre demarree.",
          ),
        );
      }
    }

    void startRiderPositionSync();

    return () => {
      isDisposed = true;
      subscription?.remove();
    };
  }, [input.activeTripId, input.enabled]);

  return {
    latestPosition,
    positionNote,
    positionStatus,
  };
}
