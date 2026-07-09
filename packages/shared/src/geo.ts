import type { GeofenceStatus, GeofenceResult } from './types';

/**
 * Haversine distance in meters between two lat/lng points.
 * Returns null if any coordinate is null or undefined.
 */
export function calculateDistance(
  lat1: number | null | undefined,
  lng1: number | null | undefined,
  lat2: number | null | undefined,
  lng2: number | null | undefined,
): number | null {
  if (
    lat1 == null || lng1 == null ||
    lat2 == null || lng2 == null
  ) {
    return null;
  }

  const R = 6371000; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Evaluate whether a point is inside or outside a geofence.
 * Returns `unavailable` when distance cannot be determined.
 */
export function evaluateGeofence(
  distanceMeters: number | null,
  geofenceRadius: number,
): GeofenceStatus {
  if (distanceMeters === null) return 'unavailable';
  return distanceMeters <= geofenceRadius ? 'inside' : 'outside';
}

/**
 * One-shot convenience: compute distance then evaluate.
 */
export function checkGeofence(
  lat: number | null | undefined,
  lng: number | null | undefined,
  siteLat: number | null | undefined,
  siteLng: number | null | undefined,
  geofenceRadius: number,
): GeofenceResult {
  const distance_meters = calculateDistance(lat, lng, siteLat, siteLng);
  return {
    distance_meters,
    inside_geofence: evaluateGeofence(distance_meters, geofenceRadius),
  };
}

/** Format distance in human-readable form */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}
