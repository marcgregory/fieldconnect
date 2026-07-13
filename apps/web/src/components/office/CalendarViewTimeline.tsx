'use client';

import type { ScheduleWithDetails } from '@fieldconnect/shared';
import { useHasMounted } from '@/hooks/useHasMounted';
import { ScheduleCard } from './ScheduleCard';
import { CalendarTimeline } from './CalendarTimeline';
import { timeToMinutes } from './calendarLayout';

interface CalendarViewProps {
  viewMode: 'day' | 'week';
  currentDate: Date;
  schedules: ScheduleWithDetails[];
  onSlotClick: (date: string, time?: string) => void;
  onScheduleClick: (schedule: ScheduleWithDetails) => void;
  onDrop: (scheduleId: string | null, technicianId: string, date: string, startTime?: string) => void;
}

type Conflict = { hasConflict: boolean; conflictType: 'overlap' | 'buffer' | null };
const BUFFER_MINUTES = 30;

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function detectConflicts(schedules: ScheduleWithDetails[], date: string): Map<string, Conflict> {
  const conflicts = new Map<string, Conflict>();
  const byTechnician = new Map<string, ScheduleWithDetails[]>();
  const timedSchedules = schedules.filter(
    (schedule) => schedule.scheduled_date === date && schedule.start_time && schedule.end_time,
  );

  for (const schedule of timedSchedules) {
    const technicianIds = schedule.technician_ids?.length
      ? schedule.technician_ids
      : [schedule.technician_id ?? ''];
    for (const technicianId of technicianIds) {
      if (!technicianId) continue;
      const technicianSchedules = byTechnician.get(technicianId) ?? [];
      technicianSchedules.push(schedule);
      byTechnician.set(technicianId, technicianSchedules);
    }
  }

  for (const technicianSchedules of byTechnician.values()) {
    for (const schedule of technicianSchedules) {
      const start = timeToMinutes(schedule.start_time!);
      const end = timeToMinutes(schedule.end_time!);
      for (const other of technicianSchedules) {
        if (other.id === schedule.id) continue;
        const otherStart = timeToMinutes(other.start_time!);
        const otherEnd = timeToMinutes(other.end_time!);
        if (otherStart < end + BUFFER_MINUTES && otherEnd + BUFFER_MINUTES > start) {
          const overlaps = otherStart < end && otherEnd > start;
          const current = conflicts.get(schedule.id);
          if (!current || (current.conflictType === 'buffer' && overlaps)) {
            conflicts.set(schedule.id, {
              hasConflict: true,
              conflictType: overlaps ? 'overlap' : 'buffer',
            });
          }
        }
      }
    }
  }

  return conflicts;
}

export function CalendarView({
  viewMode,
  currentDate,
  schedules,
  onSlotClick,
  onScheduleClick,
}: CalendarViewProps) {
  if (viewMode === 'day') {
    return (
      <DayView
        currentDate={currentDate}
        schedules={schedules}
        onSlotClick={onSlotClick}
        onScheduleClick={onScheduleClick}
      />
    );
  }

  return (
    <WeekView
      currentDate={currentDate}
      schedules={schedules}
      onSlotClick={onSlotClick}
      onScheduleClick={onScheduleClick}
    />
  );
}

interface ViewProps {
  currentDate: Date;
  schedules: ScheduleWithDetails[];
  onSlotClick: (date: string, time?: string) => void;
  onScheduleClick: (schedule: ScheduleWithDetails) => void;
}

function DayView({ currentDate, schedules, onSlotClick, onScheduleClick }: ViewProps) {
  const date = formatDate(currentDate);
  const daySchedules = schedules.filter((schedule) => schedule.scheduled_date === date);
  const noTimeSchedules = daySchedules.filter((schedule) => !schedule.start_time);
  const conflictMaps = new Map([[date, detectConflicts(daySchedules, date)]]);

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      {noTimeSchedules.length > 0 && (
        <div className="border-b border-blue-100 bg-blue-50 px-4 py-3">
          <p className="mb-2 text-xs font-medium text-blue-800">
            {noTimeSchedules.length} job{noTimeSchedules.length === 1 ? '' : 's'} without time slot
          </p>
          <div className="flex flex-wrap gap-2">
            {noTimeSchedules.map((schedule) => (
              <ScheduleCard
                key={schedule.id}
                schedule={schedule}
                compact
                onClick={() => onScheduleClick(schedule)}
              />
            ))}
          </div>
        </div>
      )}

      <CalendarTimeline
        dates={[date]}
        schedules={daySchedules}
        conflictMaps={conflictMaps}
        pixelsPerHour={60}
        onSlotClick={onSlotClick}
        onScheduleClick={onScheduleClick}
      />

      {daySchedules.length === 0 && (
        <div className="border-t border-gray-100 px-4 py-8 text-center">
          <p className="text-sm text-gray-400">No jobs scheduled for this day</p>
          <p className="mt-1 text-xs text-gray-400">Click a time slot to add a job.</p>
        </div>
      )}
    </div>
  );
}

function WeekView({ currentDate, schedules, onSlotClick, onScheduleClick }: ViewProps) {
  const mounted = useHasMounted();
  const startOfWeek = new Date(currentDate);
  startOfWeek.setDate(currentDate.getDate() - currentDate.getDay());
  const days = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(startOfWeek);
    day.setDate(startOfWeek.getDate() + index);
    return day;
  });
  const dates = days.map(formatDate);
  const conflictMaps = new Map<string, Map<string, Conflict>>();
  for (const date of dates) conflictMaps.set(date, detectConflicts(schedules, date));

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <div className="min-w-[840px]">
        <div className="flex border-b border-gray-200">
          <div className="w-16 flex-shrink-0" />
          {days.map((day) => {
            const date = formatDate(day);
            const count = schedules.filter((schedule) => schedule.scheduled_date === date).length;
            const isToday = mounted && formatDate(new Date()) === date;
            return (
              <div
                key={date}
                className={`min-w-0 flex-1 border-r border-gray-100 px-2 py-3 text-center last:border-r-0 ${
                  isToday ? 'bg-blue-50' : ''
                }`}
              >
                <p className="text-xs font-medium text-gray-500">
                  {day.toLocaleDateString('en-US', { weekday: 'short' })}
                </p>
                <p className={`text-lg font-semibold ${isToday ? 'text-blue-600' : 'text-gray-900'}`}>
                  {day.getDate()}
                </p>
                <p className="text-xs text-gray-400">{count} jobs</p>
              </div>
            );
          })}
        </div>

        <CalendarTimeline
          dates={dates}
          schedules={schedules}
          conflictMaps={conflictMaps}
          pixelsPerHour={50}
          compact
          onSlotClick={onSlotClick}
          onScheduleClick={onScheduleClick}
        />
      </div>
    </div>
  );
}
