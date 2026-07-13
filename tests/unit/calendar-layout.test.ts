import { describe, expect, it } from 'vitest';
import type { ScheduleWithDetails } from '../../packages/shared/src';
import {
  CALENDAR_END_MINUTES,
  CALENDAR_START_MINUTES,
  layoutCalendarEvents,
} from '../../apps/web/src/components/office/calendarLayout';

function schedule(id: string, start: string, end: string): ScheduleWithDetails {
  return {
    id,
    project_id: `project-${id}`,
    scheduled_date: '2026-07-13',
    start_time: start,
    end_time: end,
    status: 'scheduled',
    notes: null,
    created_by: 'dispatcher',
    created_at: '',
    updated_at: '',
    project_name: `Job ${id}`,
    project_address: null,
    project_contact_name: null,
    project_contact_phone: null,
    technician_name: 'Technician',
    technician_ids: [`tech-${id}`],
    technician_names: ['Technician'],
    technician_workflow: [],
  };
}

describe('calendar event layout', () => {
  it('uses the start minute and actual duration', () => {
    const [event] = layoutCalendarEvents([schedule('a', '06:30', '07:45')], 60);

    expect(event.top).toBe(30);
    expect(event.height).toBe(75);
    expect(event.columnCount).toBe(1);
  });

  it('renders two and three simultaneous events side-by-side', () => {
    const two = layoutCalendarEvents(
      [schedule('a', '06:00', '07:00'), schedule('b', '06:15', '06:45')],
      60,
    );
    expect(two.map((event) => event.column)).toEqual([0, 1]);
    expect(two.every((event) => event.columnCount === 2)).toBe(true);

    const three = layoutCalendarEvents(
      [
        schedule('a', '06:00', '07:00'),
        schedule('b', '06:10', '06:50'),
        schedule('c', '06:20', '06:40'),
      ],
      60,
    );
    expect(three.map((event) => event.column)).toEqual([0, 1, 2]);
    expect(three.every((event) => event.columnCount === 3)).toBe(true);
  });

  it('does not treat back-to-back events as overlapping', () => {
    const events = layoutCalendarEvents(
      [schedule('a', '06:00', '07:00'), schedule('b', '07:00', '08:00')],
      60,
    );

    expect(events.map((event) => event.columnCount)).toEqual([1, 1]);
  });

  it('reuses a lane when concurrency drops within an overlap group', () => {
    const events = layoutCalendarEvents(
      [
        schedule('a', '06:00', '08:00'),
        schedule('b', '06:00', '07:00'),
        schedule('c', '07:00', '08:00'),
      ],
      60,
    );

    expect(events.map((event) => event.column)).toEqual([0, 1, 1]);
    expect(events.every((event) => event.columnCount === 2)).toBe(true);
  });

  it('clips events to the visible calendar instead of overflowing it', () => {
    const events = layoutCalendarEvents(
      [schedule('early', '05:30', '06:30'), schedule('late', '19:30', '20:30')],
      60,
    );
    const calendarHeight = ((CALENDAR_END_MINUTES - CALENDAR_START_MINUTES) / 60) * 60;

    expect(events[0]).toMatchObject({ top: 0, height: 30 });
    expect(events[1].top + events[1].height).toBe(calendarHeight);
  });

  it('keeps one multi-technician schedule as one event card', () => {
    const multiTech = schedule('crew', '09:00', '10:00');
    multiTech.technician_ids = ['tech-a', 'tech-b'];
    multiTech.technician_names = ['Goblin', 'Dodong'];
    multiTech.technician_name = 'Goblin, Dodong';

    const events = layoutCalendarEvents([multiTech], 60);
    expect(events).toHaveLength(1);
    expect(events[0].columnCount).toBe(1);
  });
});
