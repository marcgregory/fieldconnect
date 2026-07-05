'use client';

import { useEffect, useRef } from 'react';
import { Card } from '@fieldconnect/ui';
import { useSocket } from '@/hooks/useSocket';
import type { ClockEvent } from '@fieldconnect/shared';

const STATUS_COLORS: Record<string, string> = {
  clock_in: 'text-green-600 bg-green-50 border-green-200',
  clock_out: 'text-gray-600 bg-gray-50 border-gray-200',
};

const STATUS_LABELS: Record<string, string> = {
  clock_in: 'Clocked In',
  clock_out: 'Clocked Out',
};

export function LiveStatusFeed() {
  const { isConnected, lastEvent, events } = useSocket();
  const listRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to newest event
  useEffect(() => {
    if (listRef.current && events.length > 0) {
      listRef.current.scrollTop = 0;
    }
  }, [events.length]);

  return (
    <Card title="Live Feed">
      {/* Connection Status */}
      <div className="flex items-center gap-2 mb-4">
        <span
          className={`h-2 w-2 rounded-full ${
            isConnected ? 'bg-green-500' : 'bg-yellow-500'
          }`}
        />
        <span className="text-xs text-gray-500">
          {isConnected ? 'Connected' : 'Connecting...'}
        </span>
      </div>

      {/* Events List */}
      <div
        ref={listRef}
        className="space-y-2 max-h-80 overflow-y-auto"
      >
        {events.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-8">
            No clock events yet. Events will appear here when technicians clock in or out.
          </p>
        )}

        {events.map((event, index) => (
          <div
            key={`${event.entry_id}-${index}`}
            className={`flex items-start gap-3 p-3 rounded-lg border text-sm ${
              STATUS_COLORS[event.type] || 'border-gray-200'
            }`}
          >
            {/* Icon */}
            <div className="mt-0.5">
              {event.type === 'clock_in' ? (
                <svg className="h-4 w-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z" />
                </svg>
              ) : (
                <svg className="h-4 w-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="font-medium text-gray-900">
                {event.user_name}
              </div>
              <div className="text-gray-500 truncate">
                {STATUS_LABELS[event.type]} &mdash; {event.project_name}
              </div>
              <div className="text-xs text-gray-400 mt-0.5">
                {new Date(event.timestamp).toLocaleTimeString()}
                {event.duration_hours !== undefined && (
                  <span className="ml-2">
                    {event.duration_hours.toFixed(1)}h worked
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
