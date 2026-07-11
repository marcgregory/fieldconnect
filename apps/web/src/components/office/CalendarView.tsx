'use client';

import { ScheduleCard } from './ScheduleCard';
import type { ScheduleWithDetails } from '@fieldconnect/shared';

interface CalendarViewProps {
  viewMode: 'day' | 'week';
  currentDate: Date;
  schedules: ScheduleWithDetails[];
  onSlotClick: (date: string, time?: string) => void;
  onScheduleClick: (schedule: ScheduleWithDetails) => void;
  onDrop: (scheduleId: string | null, technicianId: string, date: string, startTime?: string) => void;
}

const HOURS = Array.from({ length: 14 }, (_, i) => i + 6); // 6 AM to 8 PM
const BUFFER_MINUTES = 30; // must match backend

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatTime(hour: number): string {
  return `${hour.toString().padStart(2, '0')}:00`;
}

function getSchedulesForDateAndHour(
  schedules: ScheduleWithDetails[],
  date: string,
  hour: number,
): ScheduleWithDetails[] {
  return schedules.filter((s) => {
    if (s.scheduled_date !== date) return false;
    if (!s.start_time) return false;
    const entryHour = parseInt(s.start_time.split(':')[0], 10);
    return entryHour === hour;
  });
}

/**
 * Detect conflicts among schedules for the same technician on the same date.
 * Returns a map of schedule_id -> { hasConflict, conflictType }
 */
function detectConflicts(
  schedules: ScheduleWithDetails[],
  date: string,
): Map<string, { hasConflict: boolean; conflictType: 'overlap' | 'buffer' | null }> {
  const conflictMap = new Map<string, { hasConflict: boolean; conflictType: 'overlap' | 'buffer' | null }>();

  // Group schedules by technician on this date (multi-tech support)
  const dateSchedules = schedules.filter((s) => s.scheduled_date === date && s.start_time && s.end_time);
  const byTechnician = new Map<string, ScheduleWithDetails[]>();
  for (const s of dateSchedules) {
    const techIds = s.technician_ids?.length ? s.technician_ids : [s.technician_id || ''];
    for (const techId of techIds) {
      if (!techId) continue;
      const techSchedules = byTechnician.get(techId) || [];
      techSchedules.push(s);
      byTechnician.set(techId, techSchedules);
    }
  }

  for (const [, techSchedules] of byTechnician) {
    for (const s of techSchedules) {
      const sStart = timeToMinutes(s.start_time!);
      const sEnd = timeToMinutes(s.end_time!);

      for (const other of techSchedules) {
        if (other.id === s.id) continue;
        const oStart = timeToMinutes(other.start_time!);
        const oEnd = timeToMinutes(other.end_time!);

        // Conflict rule: existing.start_time < requested.end_time + buffer
        //               AND existing.end_time + buffer > requested.start_time
        if (oStart < sEnd + BUFFER_MINUTES && oEnd + BUFFER_MINUTES > sStart) {
          const isOverlap = oStart < sEnd && oEnd > sStart;
          const existing = conflictMap.get(s.id);
          if (!existing || (existing.conflictType === 'buffer' && isOverlap)) {
            conflictMap.set(s.id, {
              hasConflict: true,
              conflictType: isOverlap ? 'overlap' : 'buffer',
            });
          }
        }
      }
    }
  }

  return conflictMap;
}

function timeToMinutes(time: string): number {
  const parts = time.split(':').map(Number);
  return parts[0] * 60 + parts[1];
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

function DayView({
  currentDate,
  schedules,
  onSlotClick,
  onScheduleClick,
}: {
  currentDate: Date;
  schedules: ScheduleWithDetails[];
  onSlotClick: (date: string, time?: string) => void;
  onScheduleClick: (schedule: ScheduleWithDetails) => void;
}) {
  const dateStr = formatDate(currentDate);
  const conflictMap = detectConflicts(schedules, dateStr);

  // Schedules without a time slot go in a "no time" section
  const noTimeSchedules = schedules.filter((s) => !s.start_time);
  const hasSchedules = schedules.length > 0;

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* No-time schedules banner */}
      {noTimeSchedules.length > 0 && (
        <div className="px-4 py-3 bg-blue-50 border-b border-blue-100">
          <p className="text-xs font-medium text-blue-800 mb-2">
            {noTimeSchedules.length} job{noTimeSchedules.length > 1 ? 's' : ''} without time slot
          </p>
          <div className="flex flex-wrap gap-2">
            {noTimeSchedules.map((s) => (
              <button
                key={s.id}
                onClick={() => onScheduleClick(s)}
                className="text-xs bg-white border border-blue-200 rounded-lg px-2 py-1 hover:bg-blue-50"
              >
                {s.project_name} — {s.technician_name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Time slots */}
      <div className="overflow-y-auto max-h-[calc(100vh-280px)]">
        {HOURS.map((hour) => {
          const timeStr = formatTime(hour);
          const slotSchedules = getSchedulesForDateAndHour(schedules, dateStr, hour);

          return (
            <div
              key={hour}
              className="flex border-b border-gray-100 last:border-b-0 min-h-[60px] group"
            >
              {/* Time label */}
              <div className="w-16 flex-shrink-0 border-r border-gray-100 px-2 py-2">
                <span className="text-xs text-gray-400 font-medium">
                  {hour > 12 ? `${hour - 12}pm` : hour === 12 ? '12pm' : `${hour}am`}
                </span>
              </div>

              {/* Slot content */}
              <div
                className="flex-1 px-2 py-1 relative cursor-pointer hover:bg-blue-50/50 transition-colors"
                onClick={() => onSlotClick(dateStr, timeStr)}
              >
                {slotSchedules.length > 0 ? (
                  <div className="space-y-1">
                    {slotSchedules.map((s) => {
                      const conflict = conflictMap.get(s.id);
                      return (
                        <ScheduleCard
                          key={s.id}
                          schedule={s}
                          onClick={() => onScheduleClick(s)}
                          hasConflict={conflict?.hasConflict}
                          conflictType={conflict?.conflictType}
                        />
                      );
                    })}
                  </div>
                ) : (
                  <div className="h-full min-h-[40px] flex items-center">
                    <span className="text-xs text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity">
                      + Add job
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Empty state */}
        {!hasSchedules && (
          <div className="text-center py-12">
            <p className="text-gray-400 text-sm mb-2">No jobs scheduled for this day</p>
            <p className="text-gray-400 text-xs">
              Click a time slot to add a job, or use the + New Schedule button
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function WeekView({
  currentDate,
  schedules,
  onSlotClick,
  onScheduleClick,
}: {
  currentDate: Date;
  schedules: ScheduleWithDetails[];
  onSlotClick: (date: string, time?: string) => void;
  onScheduleClick: (schedule: ScheduleWithDetails) => void;
}) {
  // Calculate Monday to Sunday
  const startOfWeek = new Date(currentDate);
  startOfWeek.setDate(currentDate.getDate() - currentDate.getDay());
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    return d;
  });

  // Pre-compute conflict maps per day
  const conflictMaps = new Map<string, Map<string, { hasConflict: boolean; conflictType: 'overlap' | 'buffer' | null }>>();
  for (const day of days) {
    const dateStr = formatDate(day);
    conflictMaps.set(dateStr, detectConflicts(schedules, dateStr));
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
      <div className="min-w-[700px]">
        {/* Day headers */}
        <div className="flex border-b border-gray-200">
          <div className="w-16 flex-shrink-0" />
          {days.map((day) => {
            const dateStr = formatDate(day);
            const daySchedules = schedules.filter((s) => s.scheduled_date === dateStr);
            const isToday =
              formatDate(new Date()) === dateStr;
            return (
              <div
                key={dateStr}
                className={`flex-1 px-2 py-3 text-center border-r border-gray-100 last:border-r-0 ${
                  isToday ? 'bg-blue-50' : ''
                }`}
              >
                <p className="text-xs text-gray-500 font-medium">
                  {day.toLocaleDateString('en-US', { weekday: 'short' })}
                </p>
                <p className={`text-lg font-semibold ${isToday ? 'text-blue-600' : 'text-gray-900'}`}>
                  {day.getDate()}
                </p>
                <p className="text-xs text-gray-400">{daySchedules.length} jobs</p>
              </div>
            );
          })}
        </div>

        {/* Hour rows */}
        <div className="overflow-y-auto max-h-[calc(100vh-320px)]">
          {HOURS.map((hour) => {
            const timeStr = formatTime(hour);

            return (
              <div key={hour} className="flex border-b border-gray-100 min-h-[50px] group">
                <div className="w-16 flex-shrink-0 border-r border-gray-100 px-2 py-2">
                  <span className="text-xs text-gray-400 font-medium">
                    {hour > 12 ? `${hour - 12}pm` : hour === 12 ? '12pm' : `${hour}am`}
                  </span>
                </div>

                {days.map((day) => {
                  const dateStr = formatDate(day);
                  const slotSchedules = getSchedulesForDateAndHour(schedules, dateStr, hour);
                  const conflictMap = conflictMaps.get(dateStr) || new Map();

                  return (
                    <div
                      key={dateStr}
                      className="flex-1 border-r border-gray-100 last:border-r-0 px-1 py-1 cursor-pointer hover:bg-blue-50/50 transition-colors"
                      onClick={() => onSlotClick(dateStr, timeStr)}
                    >
                      {slotSchedules.length > 0 ? (
                        <div className="space-y-0.5">
                          {slotSchedules.map((s) => {
                            const conflict = conflictMap.get(s.id);
                            return (
                              <ScheduleCard
                                key={s.id}
                                schedule={s}
                                compact
                                onClick={() => onScheduleClick(s)}
                                hasConflict={conflict?.hasConflict}
                                conflictType={conflict?.conflictType}
                              />
                            );
                          })}
                        </div>
                      ) : (
                        <div className="h-full min-h-[30px]" />
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

