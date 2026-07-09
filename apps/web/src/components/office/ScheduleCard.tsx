'use client';

import type { ScheduleWithDetails, JobStatus } from '@fieldconnect/shared';

interface ScheduleCardProps {
  schedule: ScheduleWithDetails;
  compact?: boolean;
  onClick?: () => void;
  hasConflict?: boolean;
  conflictType?: 'overlap' | 'buffer' | null;
}

const STATUS_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  scheduled: { bg: 'bg-blue-50 border-blue-200', text: 'text-blue-700', dot: 'bg-blue-500' },
  traveling: { bg: 'bg-yellow-50 border-yellow-200', text: 'text-yellow-700', dot: 'bg-yellow-500' },
  on_site: { bg: 'bg-green-50 border-green-200', text: 'text-green-700', dot: 'bg-green-500' },
  completed: { bg: 'bg-gray-50 border-gray-200', text: 'text-gray-600', dot: 'bg-gray-400' },
  closed: { bg: 'bg-gray-100 border-gray-300', text: 'text-gray-500', dot: 'bg-gray-500' },
};

const STATUS_LABELS: Record<string, string> = {
  scheduled: 'Scheduled',
  traveling: 'Traveling',
  on_site: 'On Site',
  completed: 'Work Completed',
  closed: 'Closed',
};

const CONFLICT_STYLES: Record<string, string> = {
  overlap: 'border-red-400 !border-2 !border-red-400',
  buffer: 'border-yellow-400 !border-2 !border-yellow-400',
};

export function ScheduleCard({ schedule, compact = false, onClick, hasConflict, conflictType }: ScheduleCardProps) {
  // Derive per-technician status from technician_workflow when the schedule
  // has exactly one technician assigned — this is the authoritative status
  // for that technician, more accurate than the aggregate schedules.status.
  const effectiveStatus: JobStatus = (() => {
    if (schedule.technician_workflow?.length === 1) {
      return schedule.technician_workflow[0].status;
    }
    return schedule.status;
  })();

  const style = STATUS_STYLES[effectiveStatus] || STATUS_STYLES.scheduled;
  const conflictStyle = hasConflict && conflictType ? CONFLICT_STYLES[conflictType] || '' : '';

  function handleClick(e: React.MouseEvent) {
    e.stopPropagation();
    onClick?.();
  }

  if (compact) {
    return (
      <button
        onClick={handleClick}
        className={`w-full text-left border rounded-lg px-2 py-1.5 ${style.bg} ${style.text} hover:shadow-sm transition-shadow ${conflictStyle}`}
      >
        <div className="flex items-center gap-1">
          {hasConflict && (
            <span className={`text-[10px] ${conflictType === 'overlap' ? 'text-red-600' : 'text-yellow-600'}`}>
              {conflictType === 'overlap' ? '⚠' : '⏳'}
            </span>
          )}
          <p className="text-xs font-medium truncate">{schedule.project_name}</p>
        </div>
        <p className="text-[10px] opacity-75 truncate">{schedule.technician_name}</p>
      </button>
    );
  }

  return (
    <button
      onClick={handleClick}
      draggable
      className={`w-full text-left border rounded-lg px-3 py-2 ${style.bg} ${style.text} hover:shadow-sm transition-shadow cursor-pointer active:cursor-grabbing ${conflictStyle}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 min-w-0">
          {hasConflict && (
            <span
              className={`text-xs flex-shrink-0 ${conflictType === 'overlap' ? 'text-red-600' : 'text-yellow-600'}`}
              title={conflictType === 'overlap' ? 'Overlaps with another job' : 'Within 30-minute buffer of another job'}
            >
              {conflictType === 'overlap' ? '⚠' : '⏳'}
            </span>
          )}
          <p className="text-sm font-semibold truncate">{schedule.project_name}</p>
        </div>
        <span className={`inline-flex items-center gap-1 text-[10px] font-medium whitespace-nowrap`}>
          <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
          {STATUS_LABELS[effectiveStatus] || effectiveStatus}
        </span>
      </div>
      <div className="flex items-center gap-2 mt-0.5">
        <p className="text-xs opacity-75">{schedule.technician_name}</p>
        {schedule.start_time && (
          <>
            <span className="text-xs opacity-50">·</span>
            <p className="text-xs opacity-75">
              {schedule.start_time.slice(0, 5)}
              {schedule.end_time ? ` — ${schedule.end_time.slice(0, 5)}` : ''}
            </p>
          </>
        )}
      </div>
      {schedule.project_address && (
        <p className="text-[10px] opacity-60 mt-0.5 truncate">{schedule.project_address}</p>
      )}
    </button>
  );
}
