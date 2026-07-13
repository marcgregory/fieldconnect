'use client';

import type { ScheduleWithDetails } from '@fieldconnect/shared';
import { ScheduleCard } from './ScheduleCard';
import {
  CALENDAR_END_MINUTES,
  CALENDAR_START_MINUTES,
  layoutCalendarEvents,
} from './calendarLayout';

type Conflict = { hasConflict: boolean; conflictType: 'overlap' | 'buffer' | null };

interface CalendarTimelineProps {
  dates: string[];
  schedules: ScheduleWithDetails[];
  conflictMaps: Map<string, Map<string, Conflict>>;
  pixelsPerHour: number;
  compact?: boolean;
  onSlotClick: (date: string, time?: string) => void;
  onScheduleClick: (schedule: ScheduleWithDetails) => void;
}

const HOURS = Array.from(
  { length: (CALENDAR_END_MINUTES - CALENDAR_START_MINUTES) / 60 },
  (_, index) => CALENDAR_START_MINUTES / 60 + index,
);

function formatTime(hour: number): string {
  return `${hour.toString().padStart(2, '0')}:00`;
}

function formatHourLabel(hour: number): string {
  if (hour === 12) return '12pm';
  return hour > 12 ? `${hour - 12}pm` : `${hour}am`;
}

export function CalendarTimeline({
  dates,
  schedules,
  conflictMaps,
  pixelsPerHour,
  compact = false,
  onSlotClick,
  onScheduleClick,
}: CalendarTimelineProps) {
  const calendarHeight = HOURS.length * pixelsPerHour;

  return (
    <div
      className={`overflow-y-auto [scrollbar-gutter:stable] ${
        compact ? 'max-h-[calc(100vh-320px)]' : 'max-h-[calc(100vh-280px)]'
      }`}
    >
      <div className="flex" style={{ height: calendarHeight }}>
        <div className="relative w-16 flex-shrink-0 border-r border-gray-100" aria-hidden="true">
          {HOURS.map((hour, index) => (
            <span
              key={hour}
              className="absolute right-2 -translate-y-1/2 text-xs font-medium text-gray-400"
              style={{ top: index * pixelsPerHour + 10 }}
            >
              {formatHourLabel(hour)}
            </span>
          ))}
        </div>

        {dates.map((date) => {
          const dateSchedules = schedules.filter(
            (schedule) => schedule.scheduled_date === date && schedule.start_time,
          );
          const positioned = layoutCalendarEvents(dateSchedules, pixelsPerHour);
          const conflicts = conflictMaps.get(date) ?? new Map<string, Conflict>();

          return (
            <div
              key={date}
              className="relative min-w-0 flex-1 overflow-hidden border-r border-gray-100 last:border-r-0"
              data-calendar-date={date}
            >
              {HOURS.map((hour, index) => (
                <button
                  key={hour}
                  type="button"
                  aria-label={`Add job on ${date} at ${formatHourLabel(hour)}`}
                  className="absolute left-0 right-0 z-0 border-b border-gray-100 text-left transition-colors hover:bg-blue-50/50 focus-visible:z-20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
                  style={{ top: index * pixelsPerHour, height: pixelsPerHour }}
                  onClick={() => onSlotClick(date, formatTime(hour))}
                />
              ))}

              {positioned.map(({ schedule, top, height, column, columnCount }) => {
                const conflict = conflicts.get(schedule.id);
                const laneWidth = 100 / columnCount;
                return (
                  <div
                    key={schedule.id}
                    className="absolute z-10 min-w-0 overflow-hidden px-0.5 py-px"
                    style={{
                      top,
                      height,
                      left: `${column * laneWidth}%`,
                      width: `${laneWidth}%`,
                    }}
                  >
                    <ScheduleCard
                      schedule={schedule}
                      compact={compact}
                      timeline
                      onClick={() => onScheduleClick(schedule)}
                      hasConflict={conflict?.hasConflict}
                      conflictType={conflict?.conflictType}
                    />
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
