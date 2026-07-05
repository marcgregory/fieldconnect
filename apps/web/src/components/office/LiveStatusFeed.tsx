'use client';

import { useEffect, useRef, useState } from 'react';
import { Card } from '@fieldconnect/ui';
import { useSocket } from '@/hooks/useSocket';
import type { ClockEvent, FieldEvent, NoteEvent, AttachmentEvent, SignatureEvent } from '@fieldconnect/shared';

type FeedItem = {
  id: string;
  type: string;
  message: string;
  subtext: string;
  timestamp: Date;
  color: string;
  icon: React.ReactNode;
};

const STATUS_COLORS: Record<string, string> = {
  clock_in: 'text-green-600 bg-green-50 border-green-200',
  clock_out: 'text-gray-600 bg-gray-50 border-gray-200',
  status_change: 'text-blue-600 bg-blue-50 border-blue-200',
  assignment: 'text-purple-600 bg-purple-50 border-purple-200',
  reassigned: 'text-amber-600 bg-amber-50 border-amber-200',
  note_added: 'text-teal-600 bg-teal-50 border-teal-200',
  attachment_uploaded: 'text-emerald-600 bg-emerald-50 border-emerald-200',
  attachment_deleted: 'text-gray-500 bg-gray-50 border-gray-200',
  signature_captured: 'text-indigo-600 bg-indigo-50 border-indigo-200',
};

export function LiveStatusFeed() {
  const { isConnected, lastEvent, events, lastJobEvent, lastNoteEvent, lastAttachmentEvent, lastSignatureEvent } = useSocket();
  const listRef = useRef<HTMLDivElement>(null);
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);

  // Merge all event types into a unified feed, newest first
  useEffect(() => {
    const items: FeedItem[] = [];

    events.forEach((evt, i) => {
      items.push({
        id: `clock-${evt.entry_id}-${i}`,
        type: evt.type,
        message: `${evt.user_name} ${evt.type === 'clock_in' ? 'clocked in' : 'clocked out'}`,
        subtext: `${evt.project_name}${evt.duration_hours !== undefined ? ` · ${evt.duration_hours.toFixed(1)}h worked` : ''}`,
        timestamp: new Date(evt.timestamp),
        color: STATUS_COLORS[evt.type] || 'border-gray-200',
        icon: evt.type === 'clock_in' ? (
          <svg className="h-4 w-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z" />
          </svg>
        ) : (
          <svg className="h-4 w-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        ),
      });
    });

    // Show the latest job event
    if (lastJobEvent) {
      const evt = lastJobEvent;
      let message = '';
      let type = evt.type;
      if (evt.type === 'status_change') {
        message = `${evt.project_name}: ${evt.old_status || 'scheduled'} → ${evt.new_status}`;
      } else if (evt.type === 'assignment') {
        message = `Assigned: ${evt.project_name} → ${evt.technician_name}`;
      } else if (evt.type === 'reassigned') {
        message = `Reassigned: ${evt.project_name} → ${evt.technician_name}`;
      }
      items.push({
        id: `job-${evt.schedule_id}-${evt.timestamp}`,
        type,
        message,
        subtext: `by ${evt.changed_by}`,
        timestamp: new Date(evt.timestamp),
        color: STATUS_COLORS[type] || 'border-blue-200',
        icon: (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
        ),
      });
    }

    if (lastNoteEvent) {
      const evt = lastNoteEvent;
      items.push({
        id: `note-${evt.schedule_id}-${evt.timestamp}`,
        type: 'note_added',
        message: `Note added to ${evt.project_name}`,
        subtext: `by ${evt.user_name}`,
        timestamp: new Date(evt.timestamp),
        color: STATUS_COLORS.note_added,
        icon: (
          <svg className="h-4 w-4 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        ),
      });
    }

    if (lastAttachmentEvent) {
      const evt = lastAttachmentEvent;
      items.push({
        id: `att-${evt.attachment_id}-${evt.timestamp}`,
        type: evt.type,
        message: evt.type === 'attachment_uploaded'
          ? `Photo added to ${evt.project_name}`
          : `Photo removed from ${evt.project_name}`,
        subtext: `by ${evt.user_name} · ${evt.attachment_type}`,
        timestamp: new Date(evt.timestamp),
        color: STATUS_COLORS[evt.type] || STATUS_COLORS.attachment_uploaded,
        icon: (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        ),
      });
    }

    if (lastSignatureEvent) {
      const evt = lastSignatureEvent;
      items.push({
        id: `sig-${evt.schedule_id}-${evt.timestamp}`,
        type: 'signature_captured',
        message: `Signature captured on ${evt.project_name}`,
        subtext: `by ${evt.user_name} · ${evt.label}`,
        timestamp: new Date(evt.timestamp),
        color: STATUS_COLORS.signature_captured,
        icon: (
          <svg className="h-4 w-4 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
        ),
      });
    }

    // Sort by timestamp descending (newest first), limit to 50 items
    items.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    setFeedItems(items.slice(0, 50));
  }, [events, lastJobEvent, lastNoteEvent, lastAttachmentEvent, lastSignatureEvent]);

  // Auto-scroll to newest event
  useEffect(() => {
    if (listRef.current && feedItems.length > 0) {
      listRef.current.scrollTop = 0;
    }
  }, [feedItems.length]);

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
        {feedItems.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-8">
            No events yet. Events will appear here in real-time.
          </p>
        )}

        {feedItems.map((item) => (
          <div
            key={item.id}
            className={`flex items-start gap-3 p-3 rounded-lg border text-sm ${
              item.color || 'border-gray-200'
            }`}
          >
            {/* Icon */}
            <div className="mt-0.5 flex-shrink-0">
              {item.icon}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="font-medium text-gray-900">
                {item.message}
              </div>
              <div className="text-gray-500 truncate text-xs">
                {item.subtext}
              </div>
              <div className="text-xs text-gray-400 mt-0.5">
                {item.timestamp.toLocaleTimeString()}
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
