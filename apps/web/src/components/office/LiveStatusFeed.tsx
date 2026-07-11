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
  /** Normalized content key for cross-source dedup (historical vs socket). */
  contentKey: string;
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
  reassigned: 'text-blue-600 bg-blue-50 border-blue-200',
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
  schedule_reassigned: 'text-blue-600 bg-blue-50 border-blue-200',
  rework_requested: 'text-red-600 bg-red-50 border-red-200',
  rework_resumed: 'text-red-600 bg-red-50 border-red-200',
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
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-20 0 9 9 0 0120 0z" />
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

        const items: FeedItem[] = json.data.map((evt: ApiActivityEvent) => {
          const meta = evt.metadata || {};
          const subtext = buildSubtextFromMeta(evt.event_type, meta, evt);
          return {
            id: `hist-${evt.id}`,
            type: evt.event_type,
            message: evt.message,
            subtext,
            timestamp: new Date(evt.created_at),
            color: STATUS_COLORS[evt.event_type] || 'border-gray-200',
            icon: getIconForEventType(evt.event_type),
            contentKey: buildContentKey({
              type: evt.event_type,
              schedule_id: evt.schedule_id || '',
              technician_name: evt.technician_name || evt.actor_name || '',
              technician_id: evt.technician_id || '',
              timestamp: evt.created_at,
            }),
          };
        });

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

  // Merge historical + socket events into unified feed, dedup by contentKey.
  useEffect(() => {
    const seen = new Set<string>();
    const items: FeedItem[] = [];

    // 1. Historical items from DB (stable ids)
    for (const item of historicalItems) {
      items.push(item);
      seen.add(item.contentKey);
    }

    // 2. Socket-based clock events (no schedule_id — use empty string)
    for (const evt of events) {
      const ck = buildContentKey({
        type: evt.type,
        schedule_id: '',
        technician_name: evt.user_name,
        technician_id: evt.user_id,
        timestamp: evt.timestamp,
      });
      if (seen.has(ck)) continue;
      seen.add(ck);

      items.push({
        id: `clock-${evt.entry_id}-${evt.timestamp}`,
        type: evt.type,
        message: `${evt.user_name} ${evt.type === 'clock_in' ? 'clocked in' : 'clocked out'}`,
        subtext: `${evt.project_name}${evt.duration_hours !== undefined ? ` · ${evt.duration_hours.toFixed(1)}h worked` : ''}`,
        timestamp: new Date(evt.timestamp),
        color: STATUS_COLORS[evt.type] || 'border-gray-200',
        icon: getIconForEventType(evt.type),
        contentKey: ck,
      });
    }

    // 3. Socket-based job events
    for (const evt of jobEvents) {
      const normalizedType = evt.type === 'status_change'
        ? (evt.new_status || 'status_change')
        : evt.type;

      const ck = buildContentKey({
        type: normalizedType,
        schedule_id: evt.schedule_id,
        technician_name: evt.technician_name,
        technician_id: evt.technician_id || '',
        timestamp: evt.timestamp,
      });
      if (seen.has(ck)) continue;
      seen.add(ck);

      const isClosed = evt.type === 'status_change' && evt.new_status === 'closed';
      let msg: string;
      let sub: string;

      if (isClosed) {
        msg = `Assignment closed — ${evt.project_name}`;
        sub = `Technician: ${evt.technician_name || 'Unknown'} • Closed by: ${evt.changed_by}`;
      } else if (evt.type === 'status_change' && evt.technician_name) {
        const statusLabel = (evt.new_status || '').replace(/_/g, ' ');
        msg = `${evt.technician_name} ${statusLabel} — ${evt.project_name}`;
        sub = `Technician: ${evt.technician_name} • By: ${evt.changed_by}`;
      } else if (evt.type === 'assignment') {
        msg = `Assigned — ${evt.project_name}`;
        sub = `Technician: ${evt.technician_name} • By: ${evt.changed_by}`;
      } else if (evt.type === 'reassigned') {
        msg = `Reassigned — ${evt.project_name}`;
        sub = `Technician: ${evt.technician_name} • By: ${evt.changed_by}`;
      } else {
        msg = `${evt.project_name}: → ${evt.new_status}`;
        sub = `by ${evt.changed_by}`;
      }

      items.push({
        id: `job-${evt.schedule_id}-${evt.timestamp}`,
        type: evt.type,
        message: msg,
        subtext: sub,
        timestamp: new Date(evt.timestamp),
        color: STATUS_COLORS[evt.type] || 'border-blue-200',
        icon: getIconForEventType(evt.type),
        contentKey: ck,
      });
    }

    // 4. Latest job event from socket (only if not already covered by array)
    if (lastJobEvent) {
      const normalizedType = lastJobEvent.type === 'status_change'
        ? (lastJobEvent.new_status || 'status_change')
        : lastJobEvent.type;

      const ck = buildContentKey({
        type: normalizedType,
        schedule_id: lastJobEvent.schedule_id,
        technician_name: lastJobEvent.technician_name,
        technician_id: lastJobEvent.technician_id || '',
        timestamp: lastJobEvent.timestamp,
      });
      if (!seen.has(ck)) {
        seen.add(ck);

        const evt = lastJobEvent;
        const isClosed = evt.type === 'status_change' && evt.new_status === 'closed';
        let msg: string;
        let sub: string;

        if (isClosed) {
          msg = `Assignment closed — ${evt.project_name}`;
          sub = `Technician: ${evt.technician_name || 'Unknown'} • Closed by: ${evt.changed_by}`;
        } else if (evt.type === 'status_change' && evt.technician_name) {
          const statusLabel = (evt.new_status || '').replace(/_/g, ' ');
          msg = `${evt.technician_name} ${statusLabel} — ${evt.project_name}`;
          sub = `Technician: ${evt.technician_name} • By: ${evt.changed_by}`;
        } else if (evt.type === 'assignment') {
          msg = `Assigned — ${evt.project_name}`;
          sub = `Technician: ${evt.technician_name} • By: ${evt.changed_by}`;
        } else if (evt.type === 'reassigned') {
          msg = `Reassigned — ${evt.project_name}`;
          sub = `Technician: ${evt.technician_name} • By: ${evt.changed_by}`;
        } else {
          msg = `${evt.project_name}: → ${evt.new_status}`;
          sub = `by ${evt.changed_by}`;
        }

        items.push({
          id: `job-last-${evt.schedule_id}-${evt.timestamp}`,
          type: evt.type,
          message: msg,
          subtext: sub,
          timestamp: new Date(evt.timestamp),
          color: STATUS_COLORS[evt.type] || 'border-blue-200',
          icon: getIconForEventType(evt.type),
          contentKey: ck,
        });
      }
    }

    // 5. Latest note event
    if (lastNoteEvent) {
      const ck = buildContentKey({
        type: 'note_added',
        schedule_id: lastNoteEvent.schedule_id,
        technician_name: lastNoteEvent.technician_name || lastNoteEvent.user_name,
        technician_id: lastNoteEvent.technician_id,
        timestamp: lastNoteEvent.timestamp,
      });
      if (!seen.has(ck)) {
        seen.add(ck);

        const noteType = lastNoteEvent.note_type || 'technician';
        const techName = lastNoteEvent.technician_name || lastNoteEvent.user_name;
        const isInternal = noteType === 'internal';
        const msg = isInternal
          ? `Internal note added — ${lastNoteEvent.project_name}`
          : `Technician note added — ${lastNoteEvent.project_name}`;
        const sub = isInternal
          ? `For: ${techName} • By: ${lastNoteEvent.user_name}`
          : `Technician: ${techName} • By: ${lastNoteEvent.user_name}`;

        items.push({
          id: `note-${lastNoteEvent.schedule_id}-${lastNoteEvent.timestamp}`,
          type: 'note_added',
          message: msg,
          subtext: sub,
          timestamp: new Date(lastNoteEvent.timestamp),
          color: STATUS_COLORS.note_added,
          icon: getIconForEventType('note_added'),
          contentKey: ck,
        });
      }
    }

    // 6. Latest attachment event
    if (lastAttachmentEvent) {
      const attType = lastAttachmentEvent.attachment_type;
      const attLabel = getAttachmentLabel(attType);
      const ck = buildContentKey({
        type: lastAttachmentEvent.type,
        schedule_id: lastAttachmentEvent.schedule_id,
        technician_name: lastAttachmentEvent.user_name,
        technician_id: lastAttachmentEvent.technician_id,
        timestamp: lastAttachmentEvent.timestamp,
      });
      if (!seen.has(ck)) {
        seen.add(ck);

        const isUpload = lastAttachmentEvent.type === 'attachment_uploaded';
        const msg = isUpload
          ? `${attLabel} added — ${lastAttachmentEvent.project_name}`
          : `${attLabel} removed — ${lastAttachmentEvent.project_name}`;
        const sub = `Technician: ${lastAttachmentEvent.user_name} • By: ${lastAttachmentEvent.user_name}`;

        items.push({
          id: `att-${lastAttachmentEvent.attachment_id}-${lastAttachmentEvent.timestamp}`,
          type: lastAttachmentEvent.type,
          message: msg,
          subtext: sub,
          timestamp: new Date(lastAttachmentEvent.timestamp),
          color: STATUS_COLORS[lastAttachmentEvent.type] || STATUS_COLORS.attachment_uploaded,
          icon: getIconForEventType(lastAttachmentEvent.type),
          contentKey: ck,
        });
      }
    }

    // 7. Latest signature event
    if (lastSignatureEvent) {
      const ck = buildContentKey({
        type: 'signature_captured',
        schedule_id: lastSignatureEvent.schedule_id,
        technician_name: lastSignatureEvent.user_name,
        technician_id: lastSignatureEvent.technician_id,
        timestamp: lastSignatureEvent.timestamp,
      });
      if (!seen.has(ck)) {
        seen.add(ck);
        items.push({
          id: `sig-${lastSignatureEvent.schedule_id}-${lastSignatureEvent.timestamp}`,
          type: 'signature_captured',
          message: `Signature captured — ${lastSignatureEvent.project_name}`,
          subtext: `Technician: ${lastSignatureEvent.user_name} • By: ${lastSignatureEvent.user_name} • ${lastSignatureEvent.label}`,
          timestamp: new Date(lastSignatureEvent.timestamp),
          color: STATUS_COLORS.signature_captured,
          icon: getIconForEventType('signature_captured'),
          contentKey: ck,
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
            isConnected ? 'bg-green-500' : 'bg-blue-500'
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

/**
 * Build a subtext line from persisted metadata for historical feed items.
 */
function buildSubtextFromMeta(
  eventType: string,
  meta: Record<string, unknown>,
  evt: ApiActivityEvent,
): string {
  const techName = (meta.technician_name as string) || evt.technician_name || '';
  const actorName = (meta.actor_name as string) || evt.actor_name || '';
  const noteType = meta.note_type as string | undefined;
  const timeStr = ` · ${new Date(evt.created_at).toLocaleTimeString()}`;

  switch (eventType) {
    case 'note_added': {
      if (noteType === 'internal') {
        return `For: ${techName || 'Unknown'} • By: ${actorName}${timeStr}`;
      }
      return `Technician: ${techName || actorName} • By: ${actorName}${timeStr}`;
    }
    case 'photo_uploaded':
    case 'photo_deleted':
      return `Technician: ${techName} • By: ${actorName}${timeStr}`;
    case 'signature_captured':
      return `Technician: ${techName} • By: ${actorName}${timeStr}`;
    case 'job_closed':
    case 'work_completed':
    case 'technician_started_traveling':
    case 'arrived_on_site':
      return `Technician: ${techName} • By: ${actorName}${timeStr}`;
    case 'rework_requested':
    case 'rework_resumed':
    case 'rework_completed':
      return `Technician: ${techName} • By: ${actorName}${timeStr}`;
    case 'schedule_created':
    case 'schedule_reassigned':
      return `Technician: ${techName} • By: ${actorName}${timeStr}`;
    case 'clock_in':
    case 'clock_out':
      return `${actorName}${timeStr}`;
    default:
      return (evt.actor_name
        ? `${evt.actor_name}${timeStr}`
        : new Date(evt.created_at).toLocaleTimeString());
  }
}

/**
 * Build a normalized content-key for cross-source dedup.
 */
function buildContentKey(fields: {
  type: string;
  schedule_id: string;
  technician_name: string;
  technician_id: string;
  timestamp: string;
}): string {
  const NORMALIZE: Record<string, string> = {
    technician_started_traveling: 'traveling',
    arrived_on_site: 'on_site',
    work_completed: 'completed',
    job_closed: 'closed',
    photo_uploaded: 'attachment_uploaded',
    photo_deleted: 'attachment_deleted',
  };
  const type = NORMALIZE[fields.type] || fields.type;

  const scheduleId = fields.schedule_id || '';
  const techName = fields.technician_name || '';
  const techId = fields.technician_id || '';
  const ts = Math.floor(new Date(fields.timestamp).getTime() / 2000) * 2000;
  return `${type}|${scheduleId}|${techId}|${techName}|${ts}`;
}

/** Map attachment_type to a human-readable label. */
function getAttachmentLabel(type?: string): string {
  switch (type) {
    case 'before':  return 'Before photo';
    case 'during':  return 'During photo';
    case 'after':   return 'After photo';
    case 'document': return 'Document';
    default:        return 'Photo';
  }
}

