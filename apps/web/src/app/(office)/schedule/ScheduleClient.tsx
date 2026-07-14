'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSocket } from '@/hooks/useSocket';
import { CalendarView } from '@/components/office/CalendarViewTimeline';
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
  const [creatingForSlot, setCreatingForSlot] = useState<{ date: string; time?: string } | null>(null);

  const fetchSchedules = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      const d = currentDate || new Date();
      if (viewMode === 'day') {
        const dateStr = d.toLocaleDateString('en-CA');
        const data = await getSchedules({ date: dateStr });
        setSchedules(data);
      } else {
        const startOfWeek = new Date(d);
        startOfWeek.setDate(d.getDate() - d.getDay());
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);

        const from = startOfWeek.toLocaleDateString('en-CA');
        const to = endOfWeek.toLocaleDateString('en-CA');
        const data = await getCalendarSchedules(from, to);
        setSchedules(data);
      }

      try {
        const unassignedData = await getUnassignedJobs();
        setUnassigned(unassignedData);
      } catch {
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
      throw err;
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
        const updates: UpdateScheduleInput = {
          technician_ids: [technicianId],
          scheduled_date: date,
        };
        if (startTime) updates.start_time = startTime;
        await updateSchedule(scheduleId, updates);
      } else {
        await createSchedule({
          project_id: '',
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
      <main className="mx-auto max-w-7xl px-3 py-4 sm:px-6 sm:py-6 lg:px-8">
        <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-end sm:justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Schedule</h1>
          <button
            onClick={handleCreateNew}
            className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 sm:w-auto"
          >
            + New Schedule
          </button>
        </div>

        <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex overflow-hidden rounded-lg border border-gray-200">
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

              <div className="flex items-center gap-2">
                <button
                  onClick={() => navigate('prev')}
                  className="rounded-lg p-1.5 text-gray-600 hover:bg-gray-100"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <button
                  onClick={goToToday}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Today
                </button>
                <button
                  onClick={() => navigate('next')}
                  className="rounded-lg p-1.5 text-gray-600 hover:bg-gray-100"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>

            <span className="text-sm font-medium text-gray-900 lg:text-right">
              {formatDateLabel()}
            </span>
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
            <button onClick={fetchSchedules} className="ml-2 underline">
              Retry
            </button>
          </div>
        )}

        {loading && (
          <div className="py-12 text-center">
            <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
            <p className="text-sm text-gray-500">Loading schedule...</p>
          </div>
        )}

        {!loading && (
          <div className="flex flex-col gap-6 lg:flex-row">
            <div className="min-w-0 flex-1">
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
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
                </div>
              )}
            </div>

            <div className="w-full lg:hidden">
              <UnassignedQueue items={unassigned} onAssign={(item) => handleEdit(item)} />
            </div>

            <div className="hidden w-72 flex-shrink-0 lg:block">
              <UnassignedQueue items={unassigned} onAssign={(item) => handleEdit(item)} />
            </div>
          </div>
        )}
      </main>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5 shadow-xl sm:p-6">
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