import type { ScheduleWithDetails } from '@fieldconnect/shared';

export const CALENDAR_START_MINUTES = 6 * 60;
export const CALENDAR_END_MINUTES = 20 * 60;

export interface PositionedSchedule {
  schedule: ScheduleWithDetails;
  /** Pixel offset from the beginning of the visible calendar. */
  top: number;
  /** Visible duration in pixels, clipped to the calendar bounds. */
  height: number;
  /** Zero-based lane within a group of simultaneous events. */
  column: number;
  /** Number of lanes needed by this event's overlap group. */
  columnCount: number;
}

interface CalendarEvent {
  schedule: ScheduleWithDetails;
  start: number;
  end: number;
}

export function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * Position a day's schedules on a continuous timeline.
 *
 * Events that overlap are assigned separate horizontal lanes. Adjacent events
 * (where one starts exactly when another ends) may reuse the same lane.
 */
export function layoutCalendarEvents(
  schedules: ScheduleWithDetails[],
  pixelsPerHour: number,
): PositionedSchedule[] {
  const events: CalendarEvent[] = schedules
    .filter((schedule) => schedule.start_time)
    .map((schedule) => {
      const start = timeToMinutes(schedule.start_time!);
      // A missing/invalid end time gets a predictable one-hour visual block.
      const parsedEnd = schedule.end_time ? timeToMinutes(schedule.end_time) : start + 60;
      const end = parsedEnd > start ? parsedEnd : start + 60;
      return { schedule, start, end };
    })
    .filter(({ start, end }) => start < CALENDAR_END_MINUTES && end > CALENDAR_START_MINUTES)
    .sort((a, b) => a.start - b.start || b.end - a.end || a.schedule.id.localeCompare(b.schedule.id));

  const positioned: PositionedSchedule[] = [];
  let group: CalendarEvent[] = [];
  let groupEnd = -Infinity;

  const placeGroup = () => {
    if (group.length === 0) return;

    const columnEnds: number[] = [];
    const placements = group.map((event) => {
      const reusableColumn = columnEnds.findIndex((end) => end <= event.start);
      const column = reusableColumn === -1 ? columnEnds.length : reusableColumn;
      columnEnds[column] = event.end;
      return { event, column };
    });

    const columnCount = columnEnds.length;
    for (const { event, column } of placements) {
      const visibleStart = Math.max(event.start, CALENDAR_START_MINUTES);
      const visibleEnd = Math.min(event.end, CALENDAR_END_MINUTES);
      positioned.push({
        schedule: event.schedule,
        top: ((visibleStart - CALENDAR_START_MINUTES) / 60) * pixelsPerHour,
        height: ((visibleEnd - visibleStart) / 60) * pixelsPerHour,
        column,
        columnCount,
      });
    }
  };

  for (const event of events) {
    // Strict comparison is intentional: back-to-back events do not overlap.
    if (group.length > 0 && event.start >= groupEnd) {
      placeGroup();
      group = [];
      groupEnd = -Infinity;
    }
    group.push(event);
    groupEnd = Math.max(groupEnd, event.end);
  }
  placeGroup();

  return positioned;
}
