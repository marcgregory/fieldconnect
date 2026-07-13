'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Card, Spinner } from '@fieldconnect/ui';
import {
  clockIn,
  clockOut,
  getCurrentEntry,
  getMyAssignments,
} from '@/lib/api';
import {
  calculateDistance,
  evaluateGeofence,
  formatDistance,
  clockInFormSchema,
  type GeofenceStatus,
} from '@fieldconnect/shared';
import type { ActiveTimeEntry, TechnicianAssignmentWithDetails } from '@fieldconnect/shared';
import { z } from 'zod';

type ClockInFormValues = z.infer<typeof clockInFormSchema>;

interface ClockInOutProps {
  userId: string;
  /** Called after a successful clock-in or clock-out so the parent can coordinate UI refreshes. */
  onStatusChange?: () => void;
}

// ─── GPS types ────────────────────────────────────────────────────────────────

type GpsStatus = 'captured' | 'permission_denied' | 'timeout' | 'position_unavailable' | 'unsupported' | 'omitted';

/** Build a Google Maps URL from lat/lng */
function googleMapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

/** Map a GeolocationPositionError code to our status string. */
function gpsErrorToStatus(error: GeolocationPositionError): GpsStatus {
  switch (error.code) {
    case error.PERMISSION_DENIED: return 'permission_denied';
    case error.TIMEOUT: return 'timeout';
    case error.POSITION_UNAVAILABLE: return 'position_unavailable';
    default: return 'position_unavailable';
  }
}

/**
 * Attempt one geolocation call with the given timeout — preserves the error reason.
 * Returns { position, status, error } on failure so the caller knows why.
 */
function getPositionOnceWithStatus(
  timeout: number,
): Promise<{ position: GeolocationPosition | null; status: GpsStatus; error?: string }> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({ position: null, status: 'unsupported' });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ position, status: 'captured' }),
      (err) => resolve({
        position: null,
        status: gpsErrorToStatus(err),
        error: err.message || undefined,
      }),
      { enableHighAccuracy: true, timeout, maximumAge: 60_000 },
    );
  });
}

/**
 * Get current position via browser Geolocation API with retry support.
 *
 * iOS cold-starts GPS slowly (chip init + permission prompt can take >10s).
 * We use a two-phase strategy:
 *   1. Try a quick 5s attempt (catches already-warm GPS).
 *   2. If that fails, try again with a longer 20s timeout (handles cold-start).
 * This avoids blocking the UI for the full 20s when GPS is already ready.
 *
 * Always returns an object — even on failure — so the caller knows exactly why
 * GPS is unavailable and can report the reason to the backend.
 */
async function getCurrentPosition(): Promise<{
  lat?: number;
  lng?: number;
  accuracy?: number;
  gpsStatus: GpsStatus;
  gpsError?: string;
  gpsDebug: string;
}> {
  if (!navigator.geolocation) {
    console.warn('[ClockInOut] Geolocation API unavailable in this browser');
    return { gpsStatus: 'unsupported', gpsDebug: 'Geolocation API unavailable in this browser' };
  }

  // Phase 1 — fast attempt (for already-warm GPS)
  let result = await getPositionOnceWithStatus(5_000);

  // Phase 2 — cold-start retry with long timeout (only retry on timeout or position unavailable)
  if (!result.position && (result.status === 'timeout' || result.status === 'position_unavailable')) {
    result = await getPositionOnceWithStatus(20_000);
  }

  if (!result.position) {
    const status = result.status;
    const errMsg = result.error
      ? `GPS ${status.replace(/_/g, ' ')} — ${result.error}`
      : `GPS ${status.replace(/_/g, ' ')} — could not determine location`;
    console.warn('[ClockInOut]', errMsg);
    return { gpsStatus: status, gpsError: result.error, gpsDebug: errMsg };
  }

  return {
    lat: result.position.coords.latitude,
    lng: result.position.coords.longitude,
    accuracy: Math.round(result.position.coords.accuracy),
    gpsStatus: 'captured',
    gpsDebug: `GPS captured (accuracy ±${Math.round(result.position.coords.accuracy)} m)`,
  };
}

/** Geofence badge UI helper */
function GeofenceBadge({ status }: { status: GeofenceStatus }) {
  if (status === 'inside') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
        <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
        Inside Geofence
      </span>
    );
  }
  if (status === 'outside') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
        <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
        Outside Geofence
      </span>
    );
  }
  return null;
}

// ══════════════════════════════════════════════════════════════════════════════
// Component
// ══════════════════════════════════════════════════════════════════════════════

export function ClockInOut({ userId, onStatusChange }: ClockInOutProps) {
  // ─── React Hook Form (clock-in only) ───────────────────────────────────────
  const form = useForm<ClockInFormValues>({
    resolver: zodResolver(clockInFormSchema),
    defaultValues: {
      project_id: '',
    },
    mode: 'onSubmit',
  });

  const selectedProjectId = form.watch('project_id');
  const formErrors = form.formState.errors;

  // ─── Server state ────────────────────────────────────────────────────────────
  const [activeEntry, setActiveEntry] = useState<ActiveTimeEntry | null>(null);
  const [assignments, setAssignments] = useState<TechnicianAssignmentWithDetails[]>([]);
  // Backend now filters by schedule_technicians.status so only actionable
  // assignments (scheduled/traveling/on_site/rework_required) are returned.
  // The frontend still guards against project-level cancellation as a safety net.
  const clockableAssignments = assignments.filter(
    (a) => a.project_status !== 'cancelled',
  );

  // ─── Scoped loading states ────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Scoped: acquiring GPS position
  const [locationLoading, setLocationLoading] = useState(false);

  // Scoped: submitting clock-in (includes GPS + API)
  const [clockInSubmitting, setClockInSubmitting] = useState(false);

  // Scoped: submitting clock-out (includes GPS + API)
  const [clockOutSubmitting, setClockOutSubmitting] = useState(false);

  // ─── Error state (form-level) ────────────────────────────────────────────────
  const [serverError, setServerError] = useState('');

  // ─── Timer state (outside RHF — must survive re-renders) ─────────────────────
  const [elapsed, setElapsed] = useState(0);

  // ─── UI state ────────────────────────────────────────────────────────────────
  const [showConfirmClockOut, setShowConfirmClockOut] = useState(false);
  const [clockedOutEntry, setClockedOutEntry] = useState<{
    duration: string;
    projectName: string;
  } | null>(null);
  const [distanceFromSite, setDistanceFromSite] = useState<number | null>(null);
  const [geofenceStatus, setGeofenceStatus] = useState<GeofenceStatus>('unavailable');
  const [gpsDebugMessage, setGpsDebugMessage] = useState<string | null>(null);

  // Optimistic rollback snapshot — keeps last known state so we can revert on failure
  const optimisticRollbackRef = useRef<{
    activeEntry: typeof activeEntry;
    assignments: typeof assignments;
  } | null>(null);

  // ─── Data fetching ───────────────────────────────────────────────────────────

  const fetchState = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      setGpsDebugMessage(null);

      const [current, userAssignments] = await Promise.all([
        getCurrentEntry(),
        getMyAssignments(),
      ]);

      setActiveEntry(current);
      setAssignments(userAssignments);
      setDistanceFromSite(null);
      setGeofenceStatus('unavailable');

      if (current) {
        // Calculate elapsed seconds
        const clockInTime = new Date(current.clock_in).getTime();
        setElapsed(Math.floor((Date.now() - clockInTime) / 1000));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchState();
  }, [fetchState]);

  // ─── Running timer effect (outside RHF) ─────────────────────────────────────

  useEffect(() => {
    if (!activeEntry) {
      setElapsed(0);
      return;
    }

    const interval = setInterval(() => {
      const clockInTime = new Date(activeEntry.clock_in).getTime();
      setElapsed(Math.floor((Date.now() - clockInTime) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [activeEntry]);

  // ─── Clock In ────────────────────────────────────────────────────────────────

  async function handleClockIn(values: ClockInFormValues) {
    // Clear stale errors
    setServerError('');
    setGpsDebugMessage(null);

    const selectedAssignment = assignments.find(
      (a) => a.project_id === values.project_id,
    );

    if (!selectedAssignment) {
      setServerError('Selected assignment not found. Please try again.');
      return;
    }

    // Snapshot current state for rollback
    optimisticRollbackRef.current = {
      activeEntry,
      assignments,
    };

    // Optimistic entry
    const optimisticEntry: ActiveTimeEntry = {
      id: `optimistic-${Date.now()}`,
      user_id: userId,
      project_id: values.project_id,
      project_name: selectedAssignment?.project_name || '',
      project_address: null,
      clock_in: new Date().toISOString(),
      clock_out: null,
      break_minutes: 0,
      notes: null,
      clock_in_lat: null,
      clock_in_lng: null,
      clock_in_accuracy: null,
      clock_in_gps_status: null,
      clock_in_gps_error: null,
      clock_out_lat: null,
      clock_out_lng: null,
      clock_out_accuracy: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Apply optimistic state immediately
    setActiveEntry(optimisticEntry);
    setElapsed(0);
    setClockInSubmitting(true);
    setLocationLoading(true);

    try {
      // Capture GPS position (best-effort)
      const pos = await getCurrentPosition();

      // Determine GPS status and error for the API
      const gpsStatus = pos?.gpsStatus;
      const gpsError = pos?.gpsError;
      const gpsDebugMsg = pos?.gpsDebug;

      // Set GPS debug message for feedback
      if (gpsDebugMsg) {
        setGpsDebugMessage(gpsDebugMsg);
      } else if (gpsStatus) {
        setGpsDebugMessage(`⚠ GPS ${gpsStatus.replace(/_/g, ' ')} — clock-in proceeds without location`);
      } else {
        setGpsDebugMessage('⚠ GPS unavailable — clock-in proceeds without location');
      }

      await clockIn(
        values.project_id,
        undefined,
        pos?.lat,
        pos?.lng,
        pos?.accuracy,
        gpsStatus,
        gpsError,
      );

      // Calculate distance from project site if we have both GPS and project coords
      if (pos && selectedAssignment?.project_latitude && selectedAssignment?.project_longitude) {
        const dist = calculateDistance(
          pos.lat,
          pos.lng,
          selectedAssignment.project_latitude,
          selectedAssignment.project_longitude,
        );
        setDistanceFromSite(dist);
        setGeofenceStatus(
          evaluateGeofence(dist, selectedAssignment.project_geofence_radius ?? 50),
        );
      }

      // On success — reset form and refetch
      form.reset({ project_id: '' });
      await fetchState();
      onStatusChange?.();
    } catch (err) {
      // Rollback on failure
      if (optimisticRollbackRef.current) {
        setActiveEntry(optimisticRollbackRef.current.activeEntry);
      }
      setServerError(err instanceof Error ? err.message : 'Failed to clock in');
    } finally {
      optimisticRollbackRef.current = null;
      setClockInSubmitting(false);
      setLocationLoading(false);
    }
  }

  // ─── Clock Out ───────────────────────────────────────────────────────────────

  async function handleClockOut() {
    // Snapshot for rollback
    optimisticRollbackRef.current = {
      activeEntry,
      assignments,
    };

    const currentEntry = activeEntry;
    if (!currentEntry) return;

    // Clear stale errors
    setServerError('');

    // Optimistic — mark as clocked out immediately
    const clockOutSeconds = elapsed;
    setActiveEntry(null);
    setShowConfirmClockOut(false);
    setClockOutSubmitting(true);
    setLocationLoading(true);

    try {
      // Capture GPS position (best-effort)
      const pos = await getCurrentPosition();

      await clockOut(undefined, pos?.lat, pos?.lng);

      // Refetch to get server-authoritative state
      await fetchState();
      // Show clocked-out summary using elapsed time
      const durationMinutes = clockOutSeconds / 60;
      const hours = Math.floor(durationMinutes / 60);
      const mins = Math.round(durationMinutes % 60);
      const durationStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
      setClockedOutEntry({
        duration: durationStr,
        projectName: currentEntry.project_name || '',
      });
      onStatusChange?.();
    } catch (err) {
      // Rollback on failure
      if (optimisticRollbackRef.current) {
        setActiveEntry(optimisticRollbackRef.current.activeEntry);
      }
      setServerError(err instanceof Error ? err.message : 'Failed to clock out');
    } finally {
      optimisticRollbackRef.current = null;
      setClockOutSubmitting(false);
      setLocationLoading(false);
    }
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  /** Format elapsed time as HH:MM:SS */
  function formatElapsed(totalSeconds: number): string {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return [
      hours.toString().padStart(2, '0'),
      minutes.toString().padStart(2, '0'),
      seconds.toString().padStart(2, '0'),
    ].join(':');
  }

  const isSubmitting = clockInSubmitting || clockOutSubmitting;

  // ════════════════════════════════════════════════════════════════════════════
  // Render: Loading
  // ════════════════════════════════════════════════════════════════════════════

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Render: Error (no active entry — initial fetch failed)
  // ════════════════════════════════════════════════════════════════════════════

  if (error && !activeEntry) {
    return (
      <Card className="text-center">
        <p className="text-red-600 text-sm mb-3">{error}</p>
        <button
          onClick={fetchState}
          className="px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors"
        >
          Retry
        </button>
      </Card>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Render: Clocked out success summary
  // ════════════════════════════════════════════════════════════════════════════

  if (clockedOutEntry) {
    return (
      <Card className="text-center">
        <div role="status" aria-live="polite">
          <div className="text-green-600 text-3xl mb-2">✓</div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">Clocked Out</h3>
          <p className="text-sm text-gray-500 mb-1">{clockedOutEntry.projectName}</p>
          <p className="text-2xl font-bold text-gray-900 mb-4">{clockedOutEntry.duration}</p>
          <button
            onClick={() => {
              setClockedOutEntry(null);
              fetchState();
            }}
            className="px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors"
          >
            Done
          </button>
        </div>
      </Card>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Render: Active entry — running timer
  // ════════════════════════════════════════════════════════════════════════════

  if (activeEntry) {
    const hasClockInCoords = activeEntry.clock_in_lat && activeEntry.clock_in_lng;
    const selectedAssignment = assignments
      .find((a) => a.project_id === activeEntry.project_id);

    const activeDist = hasClockInCoords && selectedAssignment?.project_latitude && selectedAssignment?.project_longitude
      ? calculateDistance(
          activeEntry.clock_in_lat!,
          activeEntry.clock_in_lng!,
          selectedAssignment.project_latitude,
          selectedAssignment.project_longitude,
        )
      : null;

    return (
      <Card className="text-center">
        {/* Timer Display */}
        <div className="mb-2">
          <p className="text-sm text-gray-500 mb-1">Clocked in at</p>
          <p className="text-xl font-bold text-gray-900 mb-2">{activeEntry.project_name}</p>
          {activeEntry.project_address && (
            <p className="text-xs text-gray-400 mb-4">{activeEntry.project_address}</p>
          )}

          {/* Distance from site + geofence indicator */}
          {hasClockInCoords && (
            <div className="mb-3 space-y-1">
              {activeDist !== null ? (
                <p className="text-sm text-gray-600 font-medium">
                  📍 {formatDistance(activeDist)} from customer site
                </p>
              ) : (
                <p className="text-sm text-gray-400">
                  📍 GPS captured — customer site coordinates not configured
                </p>
              )}
              <GeofenceBadge status={activeDist !== null ? evaluateGeofence(activeDist, selectedAssignment?.project_geofence_radius ?? 50) : 'unavailable'} />
            </div>
          )}

          {/* GPS indicator for clock-in location */}
          {hasClockInCoords && (
            <a
              href={googleMapsUrl(activeEntry.clock_in_lat!, activeEntry.clock_in_lng!)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-500 underline block mb-2"
            >
              View clock-in location on Google Maps
            </a>
          )}

          <div
            className="text-5xl font-mono font-bold text-brand-700 my-4"
            aria-live="polite"
            aria-atomic="true"
          >
            {formatElapsed(elapsed)}
          </div>
          <p className="text-sm text-gray-500">
            Since {new Date(activeEntry.clock_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>

        {/* GPS debug information */}
        {gpsDebugMessage && !locationLoading && (
          <div className="text-xs text-gray-500 mt-2">
            {gpsDebugMessage}
          </div>
        )}

        {/* Location loading indicator */}
        {locationLoading && (
          <div className="flex items-center justify-center gap-2 text-xs text-gray-400 mt-2">
            <Spinner size="sm" />
            Capturing location...
          </div>
        )}

        {/* Server error banner */}
        {serverError && (
          <div role="alert" className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm mt-3">
            {serverError}
          </div>
        )}

        {/* Clock Out Button */}
        {!showConfirmClockOut ? (
          <button
            onClick={() => setShowConfirmClockOut(true)}
            disabled={clockOutSubmitting}
            className="w-full mt-6 bg-red-600 text-white rounded-xl py-5 text-lg font-bold shadow-lg active:bg-red-700 transition-colors disabled:opacity-50"
          >
            Clock Out
          </button>
        ) : (
          <div className="mt-6 space-y-3">
            <p className="text-sm font-medium text-gray-700">Confirm clock out?</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirmClockOut(false)}
                disabled={clockOutSubmitting}
                className="flex-1 bg-gray-200 text-gray-800 rounded-xl py-3 font-medium active:bg-gray-300 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleClockOut}
                disabled={clockOutSubmitting}
                className="flex-1 bg-red-600 text-white rounded-xl py-3 font-bold shadow-lg active:bg-red-700 transition-colors disabled:opacity-50"
              >
                {clockOutSubmitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <Spinner size="sm" />
                    Clocking out...
                  </span>
                ) : 'Confirm'}
              </button>
            </div>
          </div>
        )}
      </Card>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Render: Clock-in form
  // ════════════════════════════════════════════════════════════════════════════

  return (
    <form onSubmit={form.handleSubmit(handleClockIn)} noValidate>
      <Card className="text-center">
        <p className="text-gray-500 text-sm mb-4">Select a project to clock in</p>

        {/* Server/API-level error banner */}
        {serverError && (
          <div role="alert" className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm mb-3">
            {serverError}
          </div>
        )}

        {/* Field-level error from RHF */}
        {formErrors.project_id?.message && (
          <div role="alert" className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm mb-3">
            {formErrors.project_id.message}
          </div>
        )}

        {/* Project Selection */}
        {clockableAssignments.length === 0 ? (
          <div className="py-6">
            <p className="text-gray-400 text-sm mb-3">
              No active projects assigned yet.
            </p>
            <p className="text-gray-400 text-xs">
              Contact your office manager to get assigned to a project.
            </p>
          </div>
        ) : (
          <div
            className="space-y-2 mb-4"
            role="radiogroup"
            aria-label="Select project"
            aria-invalid={!!formErrors.project_id}
            aria-describedby={formErrors.project_id ? 'project-error' : undefined}
          >
            {clockableAssignments.map((assignment) => {
              const hasProjectCoords = assignment.project_latitude && assignment.project_longitude;
              const isSelected = selectedProjectId === assignment.project_id;
              return (
                <button
                  key={assignment.id}
                  type="button"
                  onClick={() => {
                    form.setValue('project_id', assignment.project_id, {
                      shouldValidate: false,
                      shouldDirty: true,
                    });
                  }}
                  role="radio"
                  aria-checked={isSelected}
                  aria-label={`Select project ${assignment.project_name}`}
                  className={`w-full text-left px-4 py-4 rounded-xl border-2 transition-all ${
                    isSelected
                      ? 'border-brand-500 bg-brand-50'
                      : 'border-slate-200 bg-white active:bg-stone-50'
                  }`}
                >
                  <p className="font-semibold text-gray-900">{assignment.project_name}</p>
                  {assignment.project_name && (
                    <p className="text-xs text-gray-500 mt-1">
                      {assignment.technician_name}
                    </p>
                  )}
                  {hasProjectCoords && (
                    <p className="text-xs text-blue-400 mt-1">
                      📍 Site coordinates set
                    </p>
                  )}
                </button>
              );
            })}
            {/* Hidden error anchor for aria-describedby */}
            {formErrors.project_id?.message && (
              <p id="project-error" className="text-sm font-medium text-red-600 text-left">
                {formErrors.project_id.message}
              </p>
            )}
          </div>
        )}

        {/* GPS debug information */}
        {gpsDebugMessage && !locationLoading && (
          <div className="text-xs text-gray-500 mb-2">
            {gpsDebugMessage}
          </div>
        )}

        {/* Location loading indicator */}
        {locationLoading && (
          <div className="flex items-center justify-center gap-2 text-xs text-gray-400 mb-3">
            <Spinner size="sm" />
            Getting GPS position...
          </div>
        )}

        {/* Clock In Button */}
        <button
          type="submit"
          disabled={clockInSubmitting || clockableAssignments.length === 0}
          aria-busy={clockInSubmitting}
          className="w-full rounded-xl bg-gradient-to-r from-brand-600 to-brand-500 py-5 text-xl font-bold text-white shadow-lg shadow-brand-700/20 transition-colors active:bg-brand-700 disabled:opacity-50 disabled:active:bg-brand-600"
        >
          {clockInSubmitting ? (
            <span className="flex items-center justify-center gap-2">
              <Spinner size="sm" />
              Clocking in...
            </span>
          ) : (
            'Clock In'
          )}
        </button>
      </Card>
    </form>
  );
}
