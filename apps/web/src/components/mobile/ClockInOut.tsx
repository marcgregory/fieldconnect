'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, Button, Spinner } from '@fieldconnect/ui';
import { clockIn, clockOut, getCurrentEntry, getMyAssignments } from '@/lib/api';
import type { ActiveTimeEntry, TechnicianAssignmentWithDetails } from '@fieldconnect/shared';

interface ClockInOutProps {
  userId: string;
  /** Called after a successful clock-in or clock-out so the parent can coordinate UI refreshes. */
  onStatusChange?: () => void;
}

export function ClockInOut({ userId, onStatusChange }: ClockInOutProps) {
  const [activeEntry, setActiveEntry] = useState<ActiveTimeEntry | null>(null);
  const [assignments, setAssignments] = useState<TechnicianAssignmentWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [showConfirmClockOut, setShowConfirmClockOut] = useState(false);
  const [elapsed, setElapsed] = useState(0); // elapsed seconds
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [clockInError, setClockInError] = useState('');
  const [clockedOutEntry, setClockedOutEntry] = useState<{
    duration: string;
    projectName: string;
  } | null>(null);
  // Optimistic rollback snapshot — keeps last known state so we can revert on failure
  const optimisticRollbackRef = useRef<{
    activeEntry: typeof activeEntry;
    assignments: typeof assignments;
  } | null>(null);

  // Fetch current state
  const fetchState = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      const [current, userAssignments] = await Promise.all([
        getCurrentEntry(),
        getMyAssignments(),
      ]);

      setActiveEntry(current);
      setAssignments(userAssignments);

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

  // Running timer effect
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

  async function handleClockIn() {
    if (!selectedProjectId) {
      setClockInError('Please select a project');
      return;
    }

    const selectedAssignment = assignments.find(
      (a) => a.project_id === selectedProjectId,
    );

    // Snapshot current state for rollback
    optimisticRollbackRef.current = {
      activeEntry,
      assignments,
    };

    // Optimistic entry
    const optimisticEntry: ActiveTimeEntry = {
      id: `optimistic-${Date.now()}`,
      user_id: userId,
      project_id: selectedProjectId,
      project_name: selectedAssignment?.project_name || '',
      project_address: null,
      clock_in: new Date().toISOString(),
      clock_out: null,
      break_minutes: 0,
      notes: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Apply optimistic state immediately
    setActiveEntry(optimisticEntry);
    setElapsed(0);
    setClockInError('');
    setError('');
    setActionLoading(true);

    try {
      await clockIn(selectedProjectId);
      // Success — refetch to get server-authoritative state
      await fetchState();
      onStatusChange?.();
    } catch (err) {
      // Rollback on failure
      if (optimisticRollbackRef.current) {
        setActiveEntry(optimisticRollbackRef.current.activeEntry);
      }
      setClockInError(err instanceof Error ? err.message : 'Failed to clock in');
    } finally {
      optimisticRollbackRef.current = null;
      setActionLoading(false);
    }
  }

  async function handleClockOut() {
    // Snapshot for rollback
    optimisticRollbackRef.current = {
      activeEntry,
      assignments,
    };

    const currentEntry = activeEntry;
    if (!currentEntry) return;

    // Optimistic — mark as clocked out immediately
    const clockOutTime = new Date().toISOString();
    const clockOutSeconds = elapsed;
    setActiveEntry(null);
    setShowConfirmClockOut(false);
    setActionLoading(true);
    setError('');

    try {
      await clockOut();
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
      setError(err instanceof Error ? err.message : 'Failed to clock out');
    } finally {
      optimisticRollbackRef.current = null;
      setActionLoading(false);
    }
  }

  // Format elapsed time as HH:MM:SS
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

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  // Error state
  if (error && !activeEntry) {
    return (
      <Card className="text-center">
        <p className="text-red-600 text-sm mb-3">{error}</p>
        <Button size="sm" onClick={fetchState}>
          Retry
        </Button>
      </Card>
    );
  }

  // Clocked out success state
  if (clockedOutEntry) {
    return (
      <Card className="text-center">
        <div className="text-green-600 text-3xl mb-2">✓</div>
        <h3 className="text-lg font-semibold text-gray-900 mb-1">Clocked Out</h3>
        <p className="text-sm text-gray-500 mb-1">{clockedOutEntry.projectName}</p>
        <p className="text-2xl font-bold text-gray-900 mb-4">{clockedOutEntry.duration}</p>
        <Button
          onClick={() => {
            setClockedOutEntry(null);
            fetchState();
          }}
        >
          Done
        </Button>
      </Card>
    );
  }

  // Active entry — show running timer
  if (activeEntry) {
    return (
      <Card className="text-center">
        {/* Timer Display */}
        <div className="mb-2">
          <p className="text-sm text-gray-500 mb-1">Clocked in at</p>
          <p className="text-xl font-bold text-gray-900 mb-2">{activeEntry.project_name}</p>
          {activeEntry.project_address && (
            <p className="text-xs text-gray-400 mb-4">{activeEntry.project_address}</p>
          )}
          <div className="text-5xl font-mono font-bold text-blue-600 my-4">
            {formatElapsed(elapsed)}
          </div>
          <p className="text-sm text-gray-500">
            Since {new Date(activeEntry.clock_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>

        {/* Clock Out Button */}
        {!showConfirmClockOut ? (
          <button
            onClick={() => setShowConfirmClockOut(true)}
            className="w-full mt-6 bg-red-600 text-white rounded-xl py-5 text-lg font-bold shadow-lg active:bg-red-700 transition-colors"
          >
            Clock Out
          </button>
        ) : (
          <div className="mt-6 space-y-3">
            <p className="text-sm font-medium text-gray-700">Confirm clock out?</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirmClockOut(false)}
                className="flex-1 bg-gray-200 text-gray-800 rounded-xl py-3 font-medium active:bg-gray-300 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleClockOut}
                disabled={actionLoading}
                className="flex-1 bg-red-600 text-white rounded-xl py-3 font-bold shadow-lg active:bg-red-700 transition-colors disabled:opacity-50"
              >
                {actionLoading ? 'Clocking out...' : 'Confirm'}
              </button>
            </div>
          </div>
        )}
      </Card>
    );
  }

  // No active entry — show clock in UI
  return (
    <div className="space-y-4">
      <Card className="text-center">
        <p className="text-gray-500 text-sm mb-4">Select a project to clock in</p>

        {clockInError && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm mb-3">
            {clockInError}
          </div>
        )}

        {/* Project Selection */}
        {assignments.length === 0 ? (
          <div className="py-6">
            <p className="text-gray-400 text-sm mb-3">
              No active projects assigned yet.
            </p>
            <p className="text-gray-400 text-xs">
              Contact your office manager to get assigned to a project.
            </p>
          </div>
        ) : (
          <div className="space-y-2 mb-4">
            {assignments.map((assignment) => (
              <button
                key={assignment.id}
                onClick={() => setSelectedProjectId(assignment.project_id)}
                className={`w-full text-left px-4 py-4 rounded-xl border-2 transition-all ${
                  selectedProjectId === assignment.project_id
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 bg-white active:bg-gray-50'
                }`}
              >
                <p className="font-semibold text-gray-900">{assignment.project_name}</p>
                {assignment.project_name && (
                  <p className="text-xs text-gray-500 mt-1">
                    {assignment.technician_name}
                  </p>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Clock In Button */}
        <button
          onClick={handleClockIn}
          disabled={actionLoading || assignments.length === 0 || !selectedProjectId}
          className="w-full bg-blue-600 text-white rounded-xl py-5 text-xl font-bold shadow-lg active:bg-blue-700 transition-colors disabled:opacity-50 disabled:active:bg-blue-600"
        >
          {actionLoading ? (
            <span className="flex items-center justify-center gap-2">
              <Spinner size="sm" />
              Clocking in...
            </span>
          ) : (
            'Clock In'
          )}
        </button>
      </Card>
    </div>
  );
}
