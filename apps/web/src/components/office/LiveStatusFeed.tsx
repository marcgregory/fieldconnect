'use client';

import { useEffect, useRef, useState } from 'react';
import { Card } from '@fieldconnect/ui';
import { useSocket } from '@/hooks/useSocket';

type FeedItem = {
  id: string;
  type: string;
  message: string;
  subtext: string;
  timestamp: Date;
  color: string;
  icon: React.ReactNode;
};

type ApiActivityEvent = {
  id: string;
  event_type: string;
  schedule_id: string | null;
  project_id: string | null;
  technician_id: string | null;
  actor_id: string | null;
  message: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  technician_name: string | null;
  actor_name: string | null;
  project_name: string | null;
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
  // Activity feed event types
  technician_started_traveling: 'text-blue-600 bg-blue-50 border-blue-200',
  arrived_on_site: 'text-green-600 bg-green-50 border-green-200',
  work_completed: 'text-emerald-600 bg-emerald-50 border-emerald-200',
  job_closed: 'text-gray-700 bg-gray-100 border-gray-300',
  schedule_created: 'text-purple-600 bg-purple-50 border-purple-200',
  schedule_reassigned: 'text-amber-600 bg-amber-50 border-amber-200',
  rework_requested: 'text-red-600 bg-red-50 border-red-200',
  rework_resumed: 'text-orange-600 bg-orange-50 border-orange-200',
  rework_completed: 'text-green-600 bg-green-50 border-green-200',
  photo_uploaded: 'text-emerald-600 bg-emerald-50 border-emerald-200',
  photo_deleted: 'text-gray-500 bg-gray-50 border-gray-200',
};

function getIconForEventType(eventType: string): React.ReactNode {
  switch (eventType) {
    case 'clock_in':
      return (
        <svg className="h-4 w-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z" />
        </svg>
      );
    case 'clock_out':
      return (
        <svg className="h-4 w-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case 'technician_started_traveling':
    case 'arrived_on_site':
    case 'work_completed':
    case 'job_closed':
    case 'status_change':
      return (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
      );
    case 'note_added':
      return (
        <svg className="h-4 w-4 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
      );
    case 'photo_uploaded':
    case 'attachment_uploaded':
      return (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      );
    case 'photo_deleted':
    case 'attachment_deleted':
      return (
        <svg className="h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      );
    case 'signature_captured':
      return (
        <svg className="h-4 w-4 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
        </svg>
      );
    case 'schedule_created':
    case 'schedule_reassigned':
      return (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      );
    case 'rework_requested':
    case 'rework_resumed':
    case 'rework_completed':
      return (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      );
    default:
      return (
        <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
  }
}

export function LiveStatusFeed() {
  const {
    isConnected,
    events,
    jobEvents,
    lastJobEvent,
    lastNoteEvent,
    lastAttachmentEvent,
    lastSignatureEvent,
  } = useSocket();
  const listRef = useRef<HTMLDivElement>(null);
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [historicalItems, setHistoricalItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch historical activity on mount
  useEffect(() => {
    let cancelled = false;

    async function fetchHistory() {
      try {
        const res = await fetch('/api/proxy/api/v1/activity?limit=50');
        if (!res.ok) return;

        const json = await res.json();
        if (!json.success || !json.data || cancelled) return;

        const items: FeedItem[] = json.data.map((evt: ApiActivityEvent) => ({
          id: `hist-${evt.id}`, // stable DB UUID prefix for dedup
          type: evt.event_type,
          message: evt.message,
          subtext: evt.actor_name
            ? `${evt.actor_name} · ${new Date(evt.created_at).toLocaleTimeString()}`
            : new Date(evt.created_at).toLocaleTimeString(),
          timestamp: new Date(evt.created_at),
          color: STATUS_COLORS[evt.event_type] || 'border-gray-200',
          icon: getIconForEventType(evt.event_type),
        }));

        setHistoricalItems(items);
      } catch (err) {
        console.error('Failed to fetch activity feed:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchHistory();
    return () => { cancelled = true; };
  }, []);

  // Merge historical + socket events into unified feed, dedup by id
  useEffect(() => {
    const seen = new Set<string>();
    const items: FeedItem[] = [];

    // 1. Historical items from DB (stable ids)
    for (const item of historicalItems) {
      seen.add(item.id);
      items.push(item);
    }

    // 2. Socket-based clock events
    events.forEach((evt, i) => {
      const id = `clock-${evt.entry_id}-${i}`;
      if (seen.has(id)) return;
      seen.add(id);

      items.push({
        id,
        type: evt.type,
        message: `${evt.user_name} ${evt.type === 'clock_in' ? 'clocked in' : 'clocked out'}`,
        subtext: `${evt.project_name}${evt.duration_hours !== undefined ? ` · ${evt.duration_hours.toFixed(1)}h worked` : ''}`,
        timestamp: new Date(evt.timestamp),
        color: STATUS_COLORS[evt.type] || 'border-gray-200',
        icon: getIconForEventType(evt.type),
      });
    });

    // 3. Socket-based job events (all)
    jobEvents.forEach((evt, i) => {
      const id = `job-${evt.schedule_id}-${evt.timestamp}-${i}`;
      if (seen.has(id)) return;
      seen.add(id);

      const statusLabel = (evt.new_status || '').replace(/_/g, ' ');
      let msg = '';
      let sub = '';

      if (evt.type === 'status_change') {
        if (evt.technician_name) {
          msg = `${evt.technician_name} started ${statusLabel}`;
          sub = evt.project_name;
        } else {
          msg = `${evt.project_name}: ${evt.old_status || 'scheduled'} → ${evt.new_status}`;
          sub = `by ${evt.changed_by}`;
        }
      } else if (evt.type === 'assignment') {
        msg = `Assigned: ${evt.project_name} → ${evt.technician_name}`;
        sub = `by ${evt.changed_by}`;
      } else if (evt.type === 'reassigned') {
        msg = `Reassigned: ${evt.project_name} → ${evt.technician_name}`;
        sub = `by ${evt.changed_by}`;
      } else {
        msg = `${evt.project_name}: ${evt.old_status || 'scheduled'} → ${evt.new_status}`;
        sub = `by ${evt.changed_by}`;
      }

      items.push({
        id,
        type: evt.type,
        message: msg,
        subtext: sub,
        timestamp: new Date(evt.timestamp),
        color: STATUS_COLORS[evt.type] || 'border-blue-200',
        icon: getIconForEventType(evt.type),
      });
    });

    // 4. Latest job event (if not already in array)
    if (lastJobEvent) {
      const lastId = `job-last-${lastJobEvent.schedule_id}-${lastJobEvent.timestamp}`;
      if (!seen.has(lastId)) {
        const evt = lastJobEvent;
        let message = '';
        let subtext = '';
        const statusLabel = (evt.new_status || '').replace(/_/g, ' ');

        if (evt.type === 'status_change') {
          if (evt.technician_name) {
            message = `${evt.technician_name} started ${statusLabel}`;
            subtext = evt.project_name;
          } else {
            message = `${evt.project_name}: ${evt.old_status || 'scheduled'} → ${evt.new_status}`;
            subtext = `by ${evt.changed_by}`;
          }
        } else if (evt.type === 'assignment') {
          message = `Assigned: ${evt.project_name} → ${evt.technician_name}`;
          subtext = `by ${evt.changed_by}`;
        } else if (evt.type === 'reassigned') {
          message = `Reassigned: ${evt.project_name} → ${evt.technician_name}`;
          subtext = `by ${evt.changed_by}`;
        }

        items.push({
          id: lastId,
          type: evt.type,
          message,
          subtext,
          timestamp: new Date(evt.timestamp),
          color: STATUS_COLORS[evt.type] || 'border-blue-200',
          icon: getIconForEventType(evt.type),
        });
      }
    }

    // 5. Latest note event
    if (lastNoteEvent) {
      const noteId = `note-${lastNoteEvent.schedule_id}-${lastNoteEvent.timestamp}`;
      if (!seen.has(noteId)) {
        items.push({
          id: noteId,
          type: 'note_added',
          message: `Note added to ${lastNoteEvent.project_name}`,
          subtext: `by ${lastNoteEvent.user_name}`,
          timestamp: new Date(lastNoteEvent.timestamp),
          color: STATUS_COLORS.note_added,
          icon: getIconForEventType('note_added'),
        });
      }
    }

    // 6. Latest attachment event
    if (lastAttachmentEvent) {
      const attId = `att-${lastAttachmentEvent.attachment_id}-${lastAttachmentEvent.timestamp}`;
      if (!seen.has(attId)) {
        items.push({
          id: attId,
          type: lastAttachmentEvent.type,
          message: lastAttachmentEvent.type === 'attachment_uploaded'
            ? `Photo added to ${lastAttachmentEvent.project_name}`
            : `Photo removed from ${lastAttachmentEvent.project_name}`,
          subtext: `by ${lastAttachmentEvent.user_name} · ${lastAttachmentEvent.attachment_type}`,
          timestamp: new Date(lastAttachmentEvent.timestamp),
          color: STATUS_COLORS[lastAttachmentEvent.type] || STATUS_COLORS.attachment_uploaded,
          icon: getIconForEventType(lastAttachmentEvent.type),
        });
      }
    }

    // 7. Latest signature event
    if (lastSignatureEvent) {
      const sigId = `sig-${lastSignatureEvent.schedule_id}-${lastSignatureEvent.timestamp}`;
      if (!seen.has(sigId)) {
        items.push({
          id: sigId,
          type: 'signature_captured',
          message: `Signature captured on ${lastSignatureEvent.project_name}`,
          subtext: `by ${lastSignatureEvent.user_name} · ${lastSignatureEvent.label}`,
          timestamp: new Date(lastSignatureEvent.timestamp),
          color: STATUS_COLORS.signature_captured,
          icon: getIconForEventType('signature_captured'),
        });
      }
    }

    // Sort by timestamp descending, limit to 50
    items.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    setFeedItems(items.slice(0, 50));
  }, [
    historicalItems,
    events,
    jobEvents,
    lastJobEvent,
    lastNoteEvent,
    lastAttachmentEvent,
    lastSignatureEvent,
  ]);

  // Auto-scroll to newest event
  useEffect(() => {
    if (listRef.current && feedItems.length > 0) {
      listRef.current.scrollTop = 0;
    }
  }, [feedItems.length]);

  return (
    <Card title="Live Feed">
      {/* Connection Status & Loading */}
      <div className="flex items-center gap-2 mb-4">
        <span
          className={`h-2 w-2 rounded-full ${
            isConnected ? 'bg-green-500' : 'bg-yellow-500'
          }`}
        />
        <span className="text-xs text-gray-500">
          {loading ? 'Loading...' : isConnected ? 'Connected' : 'Connecting...'}
        </span>
        <span className="text-xs text-gray-400 ml-auto">
          {feedItems.length} event{feedItems.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Events List */}
      <div
        ref={listRef}
        className="space-y-2 max-h-80 overflow-y-auto"
      >
        {!loading && feedItems.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-8">
            No events yet. Events will appear here in real-time.
          </p>
        )}

        {loading && feedItems.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-8">
            Loading activity feed...
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
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
