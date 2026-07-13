'use client';

import { useState } from 'react';
import type {
  ReviewItem,
  JobNote,
  JobAttachment,
  Signature,
  ReworkRequest,
  GeofenceStatus,
} from '@fieldconnect/shared';
import {
  calculateDistance,
  evaluateGeofence,
  formatDistance,
} from '@fieldconnect/shared';

// ─── Helpers shared between collapsed and expanded state ──────────────────

interface ChecklistItem {
  label: string;
  present: boolean;
  count: number;
  required: boolean;
  gpsStatus?: 'verified' | 'outside' | 'unavailable' | null;
}

function buildChecklist(
  item: ReviewItem,
  data?: {
    notes: JobNote[];
    attachments: JobAttachment[];
    signatures: Signature[];
    loading: boolean;
  },
) {
  if (data && !data.loading) {
    const techNotes = data.notes.filter((n) => n.note_type === 'technician');
    const internalNotes = data.notes.filter((n) => n.note_type === 'internal');
    const beforePhotos = data.attachments.filter((a) => a.attachment_type === 'before');
    const duringPhotos = data.attachments.filter((a) => a.attachment_type === 'during');
    const afterPhotos = data.attachments.filter((a) => a.attachment_type === 'after');
    const documents = data.attachments.filter((a) => a.attachment_type === 'document');

    function photoGpsStatus(photos: JobAttachment[]): ChecklistItem['gpsStatus'] {
      if (photos.length === 0) return null;
      const allInside = photos.every((p) => p.inside_geofence === true);
      const anyGps = photos.some((p) => p.latitude != null);
      if (!anyGps) return 'unavailable';
      return allInside ? 'verified' : 'outside';
    }

    const required: ChecklistItem[] = [
      { label: 'Technician Notes', present: techNotes.length > 0, count: techNotes.length, required: true },
      { label: 'Before Photo', present: beforePhotos.length > 0, count: beforePhotos.length, required: true, gpsStatus: photoGpsStatus(beforePhotos) },
      { label: 'After Photo', present: afterPhotos.length > 0, count: afterPhotos.length, required: true, gpsStatus: photoGpsStatus(afterPhotos) },
      { label: 'Customer Signature', present: data.signatures.length > 0, count: data.signatures.length, required: true },
    ];

    const optional: ChecklistItem[] = [
      { label: 'During Photos', present: duringPhotos.length > 0, count: duringPhotos.length, required: false, gpsStatus: photoGpsStatus(duringPhotos) },
      { label: 'Internal Notes', present: internalNotes.length > 0, count: internalNotes.length, required: false },
      { label: 'Documents', present: documents.length > 0, count: documents.length, required: false },
    ];

    const allRequired = required.every((r) => r.present);
    const presentCount = required.filter((r) => r.present).length;
    const totalCount = required.length;
    const score = totalCount > 0 ? Math.round((presentCount / totalCount) * 100) : 0;

    return { required, optional, allRequired, score, presentCount, totalCount };
  }

  const required: ChecklistItem[] = [
    { label: 'Technician Notes', present: item.note_count > 0, count: item.note_count, required: true },
    { label: 'Before Photo', present: item.before_photo_count > 0, count: item.before_photo_count, required: true },
    { label: 'After Photo', present: item.after_photo_count > 0, count: item.after_photo_count, required: true },
    { label: 'Customer Signature', present: item.signature_count > 0, count: item.signature_count, required: true },
  ];

  const optional: ChecklistItem[] = [
    { label: 'During Photos', present: item.during_photo_count > 0, count: item.during_photo_count, required: false },
    { label: 'Internal Notes', present: false, count: 0, required: false },
    { label: 'Documents', present: item.document_count > 0, count: item.document_count, required: false },
  ];

  const allRequired = required.every((r) => r.present);
  const presentCount = required.filter((r) => r.present).length;
  const totalCount = required.length;
  const score = totalCount > 0 ? Math.round((presentCount / totalCount) * 100) : 0;

  return { required, optional, allRequired, score, presentCount, totalCount };
}

// ─── Sub-components ────────────────────────────────────────────────────────

function GpsNotCaptured({ status, error }: { status: string | null; error: string | null }) {
  const config: Record<string, { title: string; message: string }> = {
    permission_denied: { title: 'GPS Permission Denied', message: 'Location access was denied in the browser.' },
    timeout: { title: 'GPS Timed Out', message: 'The location request did not resolve in time.' },
    position_unavailable: { title: 'GPS Unavailable', message: 'The browser could not determine a position — weak signal or indoors.' },
    unsupported: { title: 'GPS Not Supported', message: 'This browser does not support geolocation.' },
    omitted: { title: 'GPS Not Saved', message: 'No location data was saved for this clock-in.' },
  };

  const info = status && config[status] ? config[status] : {
    title: 'GPS Not Saved',
    message: 'No location data was saved for this clock-in.',
  };

  return (
    <div className="bg-gray-50 rounded-lg px-3 py-3">
      <p className="text-sm text-gray-500 flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-gray-400 inline-block" />
        {info.title}
      </p>
      <p className="text-xs text-gray-400 mt-1">{info.message}</p>
      {error && <p className="text-xs text-gray-400 mt-0.5 italic">{error}</p>}
    </div>
  );
}

function ChecklistItemRow({ item }: { item: ChecklistItem }) {
  return (
    <div
      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
        item.present
          ? 'bg-green-50 text-green-700'
          : item.required
            ? 'bg-red-50 text-red-700'
            : 'bg-gray-50 text-gray-500'
      }`}
    >
      {item.present ? (
        <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      )}
      <span className="font-medium">{item.label}</span>
      {item.count > 0 && <span className="text-xs opacity-75">({item.count})</span>}
      {item.required && !item.present && (
        <span className="text-xs font-medium ml-auto text-red-600">Required</span>
      )}
      {item.gpsStatus === 'verified' && item.present && (
        <span className="text-xs font-medium ml-auto flex items-center gap-1 text-green-600">
          <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
          GPS Verified
        </span>
      )}
      {item.gpsStatus === 'outside' && item.present && (
        <span className="text-xs font-medium ml-auto flex items-center gap-1 text-blue-600">
          <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
          Outside Geofence
        </span>
      )}
      {item.gpsStatus === 'unavailable' && item.present && (
        <span className="text-xs font-medium ml-auto flex items-center gap-1 text-gray-500">
          <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />
          No GPS
        </span>
      )}
    </div>
  );
}

function ScoreBar({ score }: { score: number }) {
  const segments = 10;
  const filled = Math.round((score / 100) * segments);
  const color =
    score === 100 ? 'bg-green-500' : score >= 60 ? 'bg-blue-500' : 'bg-red-500';

  return (
    <div className="flex items-center gap-3">
      <div className="flex gap-0.5 flex-1">
        {Array.from({ length: segments }, (_, i) => (
          <div key={i} className={`h-2 flex-1 rounded-sm ${i < filled ? color : 'bg-gray-200'}`} />
        ))}
      </div>
      <span className={`text-sm font-semibold tabular-nums ${
        score === 100 ? 'text-green-700' : score >= 60 ? 'text-blue-700' : 'text-red-700'
      }`}>
        {score}%
      </span>
    </div>
  );
}

function EvidenceGallery({
  attachments,
  signatures,
  notes,
  getAttachmentUrl,
}: {
  attachments: JobAttachment[];
  signatures: Signature[];
  notes: JobNote[];
  getAttachmentUrl: (att: JobAttachment) => string;
}) {
  // Group by rework_version
  const attVersions: Record<number, JobAttachment[]> = {};
  attachments.forEach((a) => {
    const v = a.rework_version ?? 0;
    if (!attVersions[v]) attVersions[v] = [];
    attVersions[v].push(a);
  });
  const sigVersions: Record<number, Signature[]> = {};
  signatures.forEach((s) => {
    const v = s.rework_version ?? 0;
    if (!sigVersions[v]) sigVersions[v] = [];
    sigVersions[v].push(s);
  });
  const noteVersions: Record<number, JobNote[]> = {};
  notes.filter((n) => n.note_type === 'technician').forEach((n) => {
    const v = n.rework_version ?? 0;
    if (!noteVersions[v]) noteVersions[v] = [];
    noteVersions[v].push(n);
  });

  const allV = new Set([
    ...Object.keys(attVersions).map(Number),
    ...Object.keys(sigVersions).map(Number),
    ...Object.keys(noteVersions).map(Number),
  ]);
  const sortedV = Array.from(allV).sort((a, b) => a - b);

  if (sortedV.length === 0) {
    return <p className="text-xs text-gray-400 italic">No evidence submitted</p>;
  }

  return (
    <>
      {sortedV.map((version) => (
        <div key={version} className="border-t border-gray-100 pt-3 mt-3 first:border-0 first:pt-0 first:mt-0">
          {sortedV.length > 1 && (
            <p className="text-[10px] font-semibold text-gray-400 uppercase mb-2 tracking-wide">
              {version === 0 ? 'Original Submission' : `Rework Cycle ${version}`}
            </p>
          )}
          {attVersions[version]?.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {attVersions[version].map((att) =>
                att.mime_type?.startsWith('image/') ? (
                  <div key={att.id} className="bg-gray-50 rounded-lg overflow-hidden w-28">
                    <div className="w-full h-20 relative">
                      <img
                        src={getAttachmentUrl(att)}
                        alt={att.file_name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    </div>
                    <div className="px-1.5 py-1">
                      {att.inside_geofence != null && (
                        <p className={`text-[10px] ${att.inside_geofence ? 'text-green-600' : 'text-blue-600'}`}>
                          {att.inside_geofence ? '📍 Inside' : '⚠ Outside'}
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div key={att.id} className="bg-gray-50 rounded px-2 py-1 text-xs text-gray-600">
                    📎 {att.file_name}
                  </div>
                ),
              )}
            </div>
          )}
          {sigVersions[version]?.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {sigVersions[version].map((sig) => (
                <div key={sig.id} className="bg-gray-50 rounded px-2 py-1 text-xs text-gray-600">
                  ✍️ {sig.label.charAt(0).toUpperCase() + sig.label.slice(1)}
                </div>
              ))}
            </div>
          )}
          {noteVersions[version]?.length > 0 && (
            <div className="space-y-1 mt-1.5">
              {noteVersions[version].map((note) => (
                <p key={note.id} className="text-xs text-gray-600 bg-gray-50 rounded px-2 py-1">
                  {note.content}
                </p>
              ))}
            </div>
          )}
        </div>
      ))}
    </>
  );
}

function ReworkTimeline({
  reworks,
  closedAt,
}: {
  reworks: ReworkRequest[];
  closedAt: string | null;
}) {
  if (reworks.length === 0) return null;

  return (
    <div className="space-y-4">
      {reworks.map((rw, idx) => {
        const cycleNum = idx + 1;
        const events: { ts: string; icon: 'requested' | 'resumed' | 'completed' | 'closed'; label: string; detail?: string }[] = [];

        // 1. Requested
        events.push({
          ts: rw.requested_at,
          icon: 'requested',
          label: 'Office requested rework',
          detail: rw.reason
            ? `Reason: ${rw.reason}${rw.requested_by_name ? ` — by ${rw.requested_by_name}` : ''}`
            : rw.requested_by_name ? `By ${rw.requested_by_name}` : undefined,
        });

        // 2. Resumed
        if (rw.resumed_at) {
          events.push({
            ts: rw.resumed_at,
            icon: 'resumed',
            label: 'Technician resumed work',
          });
        }

        // 3. Resolved (technician completed rework)
        if (rw.resolved_at) {
          events.push({
            ts: rw.resolved_at,
            icon: 'completed',
            label: 'Technician completed rework',
          });
        }

        // Sort chronologically
        events.sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());

        const iconMap = {
          requested: { bg: 'bg-orange-500', ring: 'ring-orange-200' },
          resumed: { bg: 'bg-blue-500', ring: 'ring-blue-200' },
          completed: { bg: 'bg-green-500', ring: 'ring-green-200' },
          closed: { bg: 'bg-gray-500', ring: 'ring-gray-200' },
        };

        return (
          <div key={rw.id} className="bg-white border border-orange-200 rounded-lg overflow-hidden">
            <div className="bg-orange-50 px-4 py-2 border-b border-orange-200">
              <p className="text-xs font-bold text-orange-800 uppercase tracking-wide">
                Rework Cycle #{cycleNum}
              </p>
            </div>
            <div className="p-4">
              <div className="relative pl-10 space-y-0">
                {events.map((evt, evtIdx) => {
                  const { bg, ring } = iconMap[evt.icon];
                  const isLast = evtIdx === events.length - 1;
                  return (
                    <div key={`${evt.ts}-${evtIdx}`} className="relative pb-5 last:pb-0">
                      {!isLast && (
                        <div className="absolute left-[13px] top-4 bottom-0 w-0.5 bg-gray-200" />
                      )}
                      <div className={`absolute left-0 top-0.5 h-6 w-6 rounded-full ${bg} ring-[3px] ${ring} flex items-center justify-center`}>
                        <div className="h-2 w-2 rounded-full bg-white" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 leading-snug">{evt.label}</p>
                        {evt.detail && <p className="text-xs text-gray-500 mt-1 leading-relaxed">{evt.detail}</p>}
                        <p className="text-[11px] text-gray-400 mt-1">
                          {new Date(evt.ts).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* Closed event after the last cycle's events */}
              {closedAt && (
                <div className="relative pl-10 mt-0 border-t border-gray-100 pt-4">
                  <div className="absolute left-0 top-4 h-6 w-6 rounded-full bg-gray-500 ring-[3px] ring-gray-200 flex items-center justify-center">
                    <div className="h-2 w-2 rounded-full bg-white" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 leading-snug">Assignment closed</p>
                    <p className="text-[11px] text-gray-400 mt-1">
                      {new Date(closedAt).toLocaleString()}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────

export interface TechnicianReviewPanelProps {
  item: ReviewItem;
  expandedData: {
    notes: JobNote[];
    attachments: JobAttachment[];
    signatures: Signature[];
    reworkRequests: ReworkRequest[];
    loading: boolean;
  };
  pendingAction: { technicianId: string | null; action: 'close' | 'request_rework' | null };
  isAdmin: boolean;
  isOfficeStaff: boolean;
  getAttachmentUrl: (att: JobAttachment) => string;
  onClose: () => void;
  onRework: () => void;
  onAddInternalNote: (content: string) => Promise<void>;
}

export function TechnicianReviewPanel({
  item,
  expandedData,
  pendingAction,
  isAdmin,
  isOfficeStaff,
  getAttachmentUrl,
  onClose,
  onRework,
  onAddInternalNote,
}: TechnicianReviewPanelProps) {
  const [internalNote, setInternalNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  const { required, optional, allRequired, score } = buildChecklist(item, expandedData);

  const isCloseLoading = pendingAction.technicianId === item.technician_id && pendingAction.action === 'close';
  const isReworkLoading = pendingAction.technicianId === item.technician_id && pendingAction.action === 'request_rework';
  const isClosed = item.status === 'closed';
  const isReworkRequired = item.status === 'rework_required';

  // Filter reworks to this technician only
  const techReworks = expandedData.reworkRequests
    .filter((rw) => rw.technician_id === item.technician_id);

  async function handleSubmitInternalNote() {
    const content = internalNote.trim();
    if (!content) return;
    setSavingNote(true);
    try {
      await onAddInternalNote(content);
      setInternalNote('');
    } finally {
      setSavingNote(false);
    }
  }

  if (expandedData.loading) {
    return (
      <div className="border-t border-gray-200">
        <div className="text-center py-8">
          <div className="animate-spin h-6 w-6 border-2 border-blue-600 border-t-transparent rounded-full mx-auto" />
        </div>
      </div>
    );
  }

  return (
    <div className="border-t border-gray-200">
      <div className="p-4 space-y-5">
        {/* ── Clock-In Location & Geofence ─────────────────────────────── */}
        <section>
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Clock-In Location
          </h4>
          {item.clock_in_lat && item.clock_in_lng ? (
            <div className="bg-gray-50 rounded-lg px-3 py-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">Clock In</span>
                <span className="text-sm text-gray-500">
                  {item.clock_in_time
                    ? new Date(item.clock_in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    : 'N/A'}
                </span>
              </div>

              {(() => {
                const dist = calculateDistance(
                  item.clock_in_lat,
                  item.clock_in_lng,
                  item.project_latitude,
                  item.project_longitude,
                );
                const gfStatus: GeofenceStatus = evaluateGeofence(
                  dist,
                  item.project_geofence_radius ?? 50,
                );
                const hasProjectCoords = item.project_latitude != null && item.project_longitude != null;
                const gpsCaptured = item.clock_in_lat != null && item.clock_in_lng != null;

                let distanceLabel: string;
                if (dist !== null) {
                  distanceLabel = formatDistance(dist);
                } else if (!hasProjectCoords && gpsCaptured) {
                  distanceLabel = 'Unknown — customer site coordinates not configured';
                } else {
                  distanceLabel = 'Unknown from customer site';
                }

                return (
                  <>
                    <p className="text-sm text-gray-700">📍 {distanceLabel}</p>
                    {hasProjectCoords && (
                      <p className="text-sm">
                        {gfStatus === 'inside' ? (
                          <span className="inline-flex items-center gap-1 text-green-700 font-medium">
                            <span className="h-2 w-2 rounded-full bg-green-500" />
                            Inside Geofence
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-blue-700 font-medium">
                            <span className="h-2 w-2 rounded-full bg-blue-500" />
                            Outside Geofence
                          </span>
                        )}
                      </p>
                    )}
                    {!hasProjectCoords && gpsCaptured && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        Set site coordinates in project settings to enable distance tracking.
                      </p>
                    )}
                  </>
                );
              })()}

              {item.clock_in_accuracy != null && (
                <p className="text-xs text-gray-400">Accuracy ±{item.clock_in_accuracy} m</p>
              )}

              <a
                href={`https://www.google.com/maps?q=${item.clock_in_lat},${item.clock_in_lng}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 underline"
              >
                View Clock-in Location
              </a>
            </div>
          ) : (
            <GpsNotCaptured status={item.clock_in_gps_status} error={item.clock_in_gps_error} />
          )}

          {item.project_latitude && item.project_longitude && (
            <a
              href={`https://www.google.com/maps?q=${item.project_latitude},${item.project_longitude}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 underline mt-2"
            >
              📍 View customer site on Google Maps
            </a>
          )}
        </section>

        {/* ── Evidence ─────────────────────────────────────────────────── */}
        <section>
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Evidence — {item.technician_name}
          </h4>

          {/* Checklist */}
          {required.some((r) => r.required) && (
            <div className="grid grid-cols-2 gap-1.5 mb-3">
              {required.map((ci) => <ChecklistItemRow key={ci.label} item={ci} />)}
            </div>
          )}
          {optional.some((o) => o.present || o.required) && (
            <div className="grid grid-cols-2 gap-1.5 mb-3">
              {optional.map((ci) => <ChecklistItemRow key={ci.label} item={ci} />)}
            </div>
          )}

          {/* Evidence gallery */}
          <EvidenceGallery
            attachments={expandedData.attachments}
            signatures={expandedData.signatures}
            notes={expandedData.notes}
            getAttachmentUrl={getAttachmentUrl}
          />
        </section>

        {/* ── Rework History ──────────────────────────────────────────── */}
        {techReworks.length > 0 && (
          <section>
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Rework History
            </h4>
            <ReworkTimeline
              reworks={techReworks}
              closedAt={item.closed_at}
            />
          </section>
        )}

        {/* ── Internal Notes ──────────────────────────────────────────── */}
        <section>
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Internal Notes
          </h4>
          {expandedData.notes.filter((n) => n.note_type === 'internal').length > 0 ? (
            <div className="space-y-2 mb-3">
              {expandedData.notes.filter((n) => n.note_type === 'internal').map((note) => (
                <div key={note.id} className="bg-blue-50 rounded-lg px-3 py-2">
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{note.content}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {note.user_name} · {new Date(note.created_at).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-400 italic mb-3">No internal notes yet</p>
          )}

          {isOfficeStaff && (
            <div className="flex gap-2">
              <input
                type="text"
                value={internalNote}
                onChange={(e) => setInternalNote(e.target.value)}
                placeholder="Add internal note..."
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmitInternalNote();
                  }
                }}
                disabled={savingNote}
              />
              <button
                onClick={handleSubmitInternalNote}
                disabled={!internalNote.trim() || savingNote}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-700 transition-colors"
              >
                {savingNote ? '...' : 'Add'}
              </button>
            </div>
          )}
        </section>

        {/* ── Actions ─────────────────────────────────────────────────── */}
        <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-200">
          {(() => {
            if (isClosed) {
              return (
                <>
                  <div className="w-full mb-1">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-sm font-medium">
                      <svg className="h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Assignment Closed
                    </span>
                  </div>
                  <a
                    href={`/api/proxy/api/v1/reports/completion/${item.schedule_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    View PDF
                  </a>
                </>
              );
            }

            if (isReworkRequired) {
              return (
                <>
                  <div className="w-full mb-1">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-100 text-red-700 rounded-lg text-sm font-medium">
                      <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                      Waiting for Technician
                    </span>
                  </div>
                  {isAdmin && (
                    <button
                      onClick={onClose}
                      disabled={isCloseLoading}
                      className="px-5 py-2.5 bg-gray-500 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isCloseLoading ? 'Processing...' : 'Close Assignment'}
                    </button>
                  )}
                </>
              );
            }

            if (item.status === 'completed') {
              const isReworkCycle = item.current_rework_version > 0;

              const closeBtn = allRequired ? (
                <button
                  onClick={onClose}
                  disabled={isCloseLoading}
                  className="px-5 py-2.5 bg-gray-700 hover:bg-gray-800 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isCloseLoading ? 'Processing...' : 'Close Assignment'}
                </button>
              ) : isAdmin ? (
                <button
                  onClick={onClose}
                  disabled={isCloseLoading}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {isCloseLoading ? 'Processing...' : 'Force Close'}
                </button>
              ) : (
                <button
                  disabled
                  className="px-5 py-2.5 bg-gray-300 text-gray-500 rounded-lg text-sm font-medium cursor-not-allowed flex items-center gap-1.5"
                  title="Complete all required documentation first"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m0 0v2m0-2h2m-2 0H10m9.364-7.364A9 9 0 1112 3a9 9 0 017.364 4.636z" />
                  </svg>
                  Close Assignment
                </button>
              );

              return (
                <>
                  {closeBtn}
                  <button
                    onClick={onRework}
                    disabled={isReworkLoading}
                    className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isReworkLoading
                      ? 'Processing...'
                      : isReworkCycle
                        ? 'Request Another Rework'
                        : 'Request Rework'}
                  </button>
                  <a
                    href={`/api/proxy/api/v1/reports/completion/${item.schedule_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    PDF
                  </a>
                </>
              );
            }

            return null;
          })()}
        </div>
      </div>
    </div>
  );
}
