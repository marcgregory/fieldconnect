'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSocket } from '@/hooks/useSocket';
import { CalendarView } from '@/components/office/CalendarView';
import { ScheduleForm } from '@/components/office/ScheduleForm';
import { UnassignedQueue } from '@/components/office/UnassignedQueue';
import {
  getSchedules,
  getCalendarSchedules,
  getUnassignedJobs,
  createSchedule,
  updateSchedule,
  deleteSchedule,
} from '@/lib/api';
import type {
  ScheduleWithDetails,
  CreateScheduleInput,
  UpdateScheduleInput,
} from '@fieldconnect/shared';
import { useHasMounted } from '@/hooks/useHasMounted';

type ViewMode = 'day' | 'week';

export function ScheduleClient() {
  const [viewMode, setViewMode] = useState<ViewMode>('day');
  // Lazy initialize with null; set the real date after mount via useEffect
  // to avoid hydration mismatch (server and client render different dates).
  const [currentDate, setCurrentDate] = useState<Date | null>(null);
  const mounted = useHasMounted();
  useEffect(() => {
    if (!currentDate) setCurrentDate(new Date());
  }, [currentDate]);
  const [schedules, setSchedules] = useState<ScheduleWithDetails[]>([]);
  const [unassigned, setUnassigned] = useState<ScheduleWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<ScheduleWithDetails | null>(null);
  const [creatingForSlot, setCreatingForSlot] = useState<{
    date: string;
    time?: string;
  } | null>(null);

  const fetchSchedules = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      const d = currentDate || new Date();
      if (viewMode === 'day') {
        const dateStr = d.toLocaleDateString('en-CA'); // YYYY-MM-DD in local timezone
        const data = await getSchedules({ date: dateStr });
        setSchedules(data);
      } else {
        // Week view: get Monday to Sunday
        const startOfWeek = new Date(d);
        startOfWeek.setDate(d.getDate() - d.getDay());
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);

        const from = startOfWeek.toLocaleDateString('en-CA'); // YYYY-MM-DD
        const to = endOfWeek.toLocaleDateString('en-CA');
        const data = await getCalendarSchedules(from, to);
        setSchedules(data);
      }

      // Also fetch unassigned jobs
      try {
        const unassignedData = await getUnassignedJobs();
        setUnassigned(unassignedData);
      } catch {
        // Unassigned may return error if not authorized
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load schedules');
    } finally {
      setLoading(false);
    }
  }, [viewMode, currentDate]);

  useEffect(() => {
    fetchSchedules();
  }, [fetchSchedules]);

  // ─── Socket: refetch on any job update ─────────────────────────────────
  const { onJobUpdate } = useSocket();
  useEffect(() => {
    const unsub = onJobUpdate(() => {
      fetchSchedules();
    });
    return unsub;
  }, [onJobUpdate, fetchSchedules]);

  function navigate(direction: 'prev' | 'next') {
    const base = currentDate || new Date();
    const newDate = new Date(base);
    if (viewMode === 'day') {
      newDate.setDate(newDate.getDate() + (direction === 'next' ? 1 : -1));
    } else {
      newDate.setDate(newDate.getDate() + (direction === 'next' ? 7 : -7));
    }
    setCurrentDate(newDate);
  }

  function goToToday() {
    setCurrentDate(new Date());
  }

  function handleCreateNew() {
    setCreatingForSlot(null);
    setEditingSchedule(null);
    setShowForm(true);
  }

  function handleSlotClick(date: string, time?: string) {
    setCreatingForSlot({ date, time });
    setEditingSchedule(null);
    setShowForm(true);
  }

  function handleEdit(schedule: ScheduleWithDetails) {
    setEditingSchedule(schedule);
    setCreatingForSlot(null);
    setShowForm(true);
  }

  async function handleSave(data: CreateScheduleInput | (UpdateScheduleInput & { id: string })) {
    try {
      if ('id' in data) {
        const { id, ...rest } = data;
        await updateSchedule(id, rest);
      } else {
        await createSchedule(data);
      }
      setShowForm(false);
      setEditingSchedule(null);
      setCreatingForSlot(null);
      fetchSchedules();
    } catch (err) {
      throw err; // Let the form handle errors
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this schedule entry?')) return;
    try {
      await deleteSchedule(id);
      fetchSchedules();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete');
    }
  }

  async function handleDrop(
    scheduleId: string | null,
    technicianId: string,
    date: string,
    startTime?: string,
  ) {
    try {
      if (scheduleId) {
        // Update existing schedule
        const updates: UpdateScheduleInput = {
          technician_ids: [technicianId],
          scheduled_date: date,
        };
        if (startTime) updates.start_time = startTime;
        await updateSchedule(scheduleId, updates);
      } else {
        // Create new from unassigned
        await createSchedule({
          project_id: '', // Will be set by the drop data
          technician_ids: [technicianId],
          scheduled_date: date,
          start_time: startTime,
        });
      }
      fetchSchedules();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update schedule');
    }
  }

  function formatDateLabel(): string {
    const d = currentDate || new Date();
    if (viewMode === 'day') {
      return d.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });
    }
    const startOfWeek = new Date(d);
    startOfWeek.setDate(d.getDate() - d.getDay());
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    return `${startOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} — ${endOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold text-gray-900">Schedule</h1>
          <button
            onClick={handleCreateNew}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            + New Schedule
          </button>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between mb-6 bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            {/* View toggle */}
            <div className="flex rounded-lg border border-gray-200 overflow-hidden">
              <button
                onClick={() => setViewMode('day')}
                className={`px-3 py-1.5 text-sm font-medium ${
                  viewMode === 'day'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                Day
              </button>
              <button
                onClick={() => setViewMode('week')}
                className={`px-3 py-1.5 text-sm font-medium ${
                  viewMode === 'week'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                Week
              </button>
            </div>

            {/* Navigation */}
            <button
              onClick={() => navigate('prev')}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              onClick={goToToday}
              className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Today
            </button>
            <button
              onClick={() => navigate('next')}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
            <span className="text-sm font-medium text-gray-900 ml-2">
              {formatDateLabel()}
            </span>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mb-6">
            {error}
            <button onClick={fetchSchedules} className="ml-2 underline">
              Retry
            </button>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="text-center py-12">
            <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-3" />
            <p className="text-sm text-gray-500">Loading schedule...</p>
          </div>
        )}

        {/* Main Layout: Calendar + Unassigned Sidebar */}
        {!loading && (
          <div className="flex gap-6">
            {/* Calendar */}
            <div className="flex-1 min-w-0">
              {currentDate !== null ? (
                <CalendarView
                  viewMode={viewMode}
                  currentDate={currentDate}
                  schedules={schedules}
                  onSlotClick={handleSlotClick}
                  onScheduleClick={handleEdit}
                  onDrop={handleDrop}
                />
              ) : (
                <div className="flex items-center justify-center py-20">
                  <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full" />
                </div>
              )}
            </div>

            {/* Unassigned Queue Sidebar */}
            <div className="w-72 flex-shrink-0 hidden lg:block">
              <UnassignedQueue
                items={unassigned}
                onAssign={(item) => handleEdit(item)}
              />
            </div>
          </div>
        )}
      </main>

      {/* Schedule Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <ScheduleForm
              schedule={editingSchedule}
              defaultDate={creatingForSlot?.date}
              defaultTime={creatingForSlot?.time}
              onClose={() => {
                setShowForm(false);
                setEditingSchedule(null);
                setCreatingForSlot(null);
              }}
              onSaved={handleSave}
              onDelete={editingSchedule ? handleDelete : undefined}
            />
          </div>
        </div>
      )}
    </div>
  );
}
