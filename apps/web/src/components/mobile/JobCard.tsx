'use client';

import type { ScheduleWithDetails } from '@fieldconnect/shared';

interface JobCardProps {
  schedule: ScheduleWithDetails;
  myStatus?: string;
  onClick?: () => void;
}

const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  scheduled: { bg: 'bg-brand-100', text: 'text-brand-800', label: 'Scheduled' },
  traveling: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'Traveling' },
  on_site: { bg: 'bg-green-100', text: 'text-green-800', label: 'On Site' },
  completed: { bg: 'bg-gray-100', text: 'text-gray-700', label: 'Work Completed' },
  rework_required: { bg: 'bg-red-100', text: 'text-red-800', label: 'Rework Required' },
  closed: { bg: 'bg-gray-200', text: 'text-gray-600', label: 'Closed' },
};

function formatTime(time: string | null): string {
  if (!time) return '';
  const [h, m] = time.split(':');
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;
  return `${hour12}:${m} ${ampm}`;
}

export function JobCard({ schedule, myStatus, onClick }: JobCardProps) {
  // Use per-technician status if available, fall back to derived schedule status
  const displayStatus = myStatus || schedule.status;
  const statusStyle = STATUS_COLORS[displayStatus] || STATUS_COLORS.scheduled;

  return (
    <button
      onClick={onClick}
      className="w-full rounded-2xl border border-slate-200 bg-white/90 p-4 text-left shadow-sm transition-all active:bg-stone-50"
    >
      {/* Header row: time range + status badge */}
      <div className="flex items-start justify-between mb-2">
        <div className="text-sm text-slate-500">
          {schedule.start_time ? (
            <span>
              {formatTime(schedule.start_time)}
              {schedule.end_time ? ` — ${formatTime(schedule.end_time)}` : ''}
            </span>
          ) : (
            <span className="italic">No time set</span>
          )}
        </div>
        <span
          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusStyle.bg} ${statusStyle.text}`}
        >
          {statusStyle.label}
        </span>
      </div>

      {/* Project name */}
      <h3 className="mb-1 text-base font-semibold text-slate-950">
        {schedule.project_name}
      </h3>

      {/* Address */}
      {schedule.project_address && (
        <p className="text-sm text-slate-500 flex items-center gap-1">
          <svg className="h-3.5 w-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          {schedule.project_address}
        </p>
      )}

      {/* Notes preview */}
      {schedule.notes && (
        <p className="mt-2 line-clamp-1 text-xs text-slate-400">{schedule.notes}</p>
      )}
    </button>
  );
}


