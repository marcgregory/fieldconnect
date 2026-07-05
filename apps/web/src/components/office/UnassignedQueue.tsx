'use client';

import type { ScheduleWithDetails } from '@fieldconnect/shared';

interface UnassignedQueueProps {
  items: ScheduleWithDetails[];
  onAssign: (item: ScheduleWithDetails) => void;
}

export function UnassignedQueue({ items, onAssign }: UnassignedQueueProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200">
      <div className="px-4 py-3 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-900">Unassigned Jobs</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          {items.length} job{items.length !== 1 ? 's' : ''} without time slots
        </p>
      </div>

      <div className="p-3 space-y-2 max-h-[calc(100vh-200px)] overflow-y-auto">
        {items.length === 0 ? (
          <div className="text-center py-8">
            <svg
              className="h-8 w-8 text-gray-300 mx-auto mb-2"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <p className="text-xs text-gray-400">All jobs are assigned</p>
          </div>
        ) : (
          items.map((item) => (
            <button
              key={item.id}
              onClick={() => onAssign(item)}
              className="w-full text-left border border-gray-200 rounded-lg px-3 py-2.5 hover:border-blue-300 hover:bg-blue-50/50 transition-all group"
            >
              <p className="text-sm font-medium text-gray-900 truncate group-hover:text-blue-700">
                {item.project_name}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                {item.technician_name}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] text-gray-400">
                  {new Date(item.scheduled_date).toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>
                {item.start_time && (
                  <span className="text-[10px] text-gray-400">
                    {item.start_time.slice(0, 5)}
                  </span>
                )}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
