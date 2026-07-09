'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useSocket } from '@/hooks/useSocket';
import {
  getReviewQueue,
  getJobNotes,
  getJobAttachments,
  getJobSignatures,
  updateScheduleStatus,
  addJobNote,
  requestRework,
  getReworkRequests,
} from '@/lib/api';
import type {
  ReviewItem,
  JobNote,
  JobAttachment,
  Signature,
  JobStatus,
  GeofenceStatus,
  ReworkRequest,
} from '@fieldconnect/shared';
import {
  calculateDistance,
  evaluateGeofence,
  formatDistance,
} from '@fieldconnect/shared';

interface ExpandedData {
  notes: JobNote[];
  attachments: JobAttachment[];
  signatures: Signature[];
  reworkRequests: ReworkRequest[];
  loading: boolean;
}

interface ChecklistItem {
  label: string;
  present: boolean;
  count: number;
  required: boolean;
  gpsStatus?: 'verified' | 'outside' | 'unavailable' | null;
}

/**
 * Build a per-technician checklist from either expanded data or ReviewItem
 * summary counts. This is the SINGLE source of truth — used identically in
 * collapsed and expanded views so they always agree.
 */
function buildTechnicianReviewChecklist(
  item: ReviewItem,
  data?: ExpandedData,
) {
  // Expanded mode: use full data
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
    // Score counts REQUIRED items only — optional items (During Photos,
    // Internal Notes, Documents) are display-only and never reduce percentage.
    const presentCount = required.filter((r) => r.present).length;
    const totalCount = required.length;
    const score = totalCount > 0 ? Math.round((presentCount / totalCount) * 100) : 0;

    return { required, optional, allRequired, score, presentCount, totalCount };
  }

  // Collapsed mode: use per-type summary counts from the review query
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
  // Score counts REQUIRED items only — same as expanded path.
  const presentCount = required.filter((r) => r.present).length;
  const totalCount = required.length;
  const score = totalCount > 0 ? Math.round((presentCount / totalCount) * 100) : 0;

  return { required, optional, allRequired, score, presentCount, totalCount };
}

/**
 * Review queue keyed by schedule_id + technician_id — unique ID for expanded panels.
 */
function expandedKey(item: ReviewItem): string {
  return `${item.schedule_id}::${item.technician_id}`;
}

export function ReviewClient() {
  const { data: session } = useSession();
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<Record<string, ExpandedData>>({});
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // ─── Image URL helper ──────────────────────────────────────────────────
  function getUploadUrl(filePath: string): string {
    return `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/uploads/${filePath}`;
  }

  function getAttachmentUrl(att: JobAttachment): string {
    return att.secure_url || (att.file_path ? getUploadUrl(att.file_path) : '');
  }

  // Rework modal
  const [reworkModal, setReworkModal] = useState<{
    item: ReviewItem;
    targetStatus: JobStatus;
  } | null>(null);
  const [reworkReason, setReworkReason] = useState('');

  // Force Close modal
  const [forceCloseModal, setForceCloseModal] = useState<ReviewItem | null>(null);
  const [forceCloseReason, setForceCloseReason] = useState('');

  // Internal Note state
  const [internalNotes, setInternalNotes] = useState<Record<string, string>>({});
  const [savingInternalNote, setSavingInternalNote] = useState<Record<string, boolean>>({});

  const userRole = session?.user?.role || '';
  const isAdmin = userRole === 'admin';
  const isOfficeStaff = ['admin', 'office_manager', 'dispatcher'].includes(userRole);

  const { onJobUpdate } = useSocket();

  const fetchSchedules = useCallback(async () => {
    if (!isOfficeStaff) return;
    try {
      setLoading(true);
      setError('');
      const data = await getReviewQueue();
      setItems(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load review queue');
    } finally {
      setLoading(false);
    }
  }, [isOfficeStaff]);

  useEffect(() => {
    fetchSchedules();
  }, [fetchSchedules]);

  // ─── Socket: refresh on status changes ──────────────────────────────────
  useEffect(() => {
    const unsub = onJobUpdate(() => {
      fetchSchedules();
    });
    return unsub;
  }, [onJobUpdate, fetchSchedules]);

  async function toggleExpand(item: ReviewItem) {
    const key = expandedKey(item);

    if (expanded[key]) {
      setExpanded((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      return;
    }

    setExpanded((prev) => ({
      ...prev,
      [key]: { notes: [], attachments: [], signatures: [], reworkRequests: [], loading: true },
    }));

    try {
      const techId = item.technician_id;
      const [notes, attachments, signatures, reworkRequests] = await Promise.all([
        getJobNotes(item.schedule_id, techId),
        getJobAttachments(item.schedule_id, techId),
        getJobSignatures(item.schedule_id, techId),
        getReworkRequests(item.schedule_id).catch(() => [] as ReworkRequest[]),
      ]);
      setExpanded((prev) => ({
        ...prev,
        [key]: { notes, attachments, signatures, reworkRequests, loading: false },
      }));
    } catch {
      setExpanded((prev) => ({
        ...prev,
        [key]: { notes: [], attachments: [], signatures: [], reworkRequests: [], loading: false },
      }));
    }
  }

  function getChecklistData(item: ReviewItem, data: ExpandedData | undefined) {
    return buildTechnicianReviewChecklist(item, data);
  }

  async function handleClose(item: ReviewItem) {
    const key = expandedKey(item);
    if (expanded[key] && !expanded[key].loading) {
      const { allRequired } = getChecklistData(item, expanded[key]);
      if (!allRequired && !isAdmin) return;
      if (!allRequired && isAdmin) {
        setForceCloseModal(item);
        return;
      }
    }

    // Normal close — target this specific technician
    setActionLoading(key);
    setError('');
    try {
      await updateScheduleStatus(item.schedule_id, 'closed', undefined, item.technician_id);
      fetchSchedules();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update status');
    } finally {
      setActionLoading(null);
    }
  }

  async function confirmForceClose() {
    if (!forceCloseModal) return;
    if (!forceCloseReason.trim()) {
      setError('Please provide a reason for force close');
      return;
    }
    const key = expandedKey(forceCloseModal);
    setActionLoading(key);
    setError('');
    try {
      await updateScheduleStatus(
        forceCloseModal.schedule_id,
        'closed',
        `Force close: ${forceCloseReason.trim()}`,
        forceCloseModal.technician_id,
      );
      setForceCloseModal(null);
      setForceCloseReason('');
      fetchSchedules();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to close job');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleAddInternalNote(item: ReviewItem) {
    const key = expandedKey(item);
    const content = internalNotes[key]?.trim();
    if (!content) return;

    setSavingInternalNote((prev) => ({ ...prev, [key]: true }));
    setError('');
    try {
      await addJobNote(item.schedule_id, { content, note_type: 'internal', technician_id: item.technician_id });
      setInternalNotes((prev) => ({ ...prev, [key]: '' }));
      const notes = await getJobNotes(item.schedule_id, item.technician_id);
      setExpanded((prev) => ({
        ...prev,
        [key]: { ...prev[key], notes, loading: false },
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add internal note');
    } finally {
      setSavingInternalNote((prev) => ({ ...prev, [key]: false }));
    }
  }

  async function handleRework(item: ReviewItem) {
    setReworkModal({ item, targetStatus: 'rework_required' });
    setReworkReason('');
  }

  async function confirmRework() {
    if (!reworkModal) return;
    if (!reworkReason.trim()) {
      setError('Please provide a reason for rework');
      return;
    }
    const key = expandedKey(reworkModal.item);
    setActionLoading(key);
    setError('');
    try {
      await requestRework(reworkModal.item.schedule_id, reworkReason.trim(), reworkModal.item.technician_id);
      setReworkModal(null);
      setReworkReason('');
      fetchSchedules();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to request rework');
    } finally {
      setActionLoading(null);
    }
  }

  // Group items by schedule for display (multiple techs on same schedule grouped together)
  const groups = items.reduce<Record<string, ReviewItem[]>>((acc, item) => {
    if (!acc[item.schedule_id]) acc[item.schedule_id] = [];
    acc[item.schedule_id].push(item);
    return acc;
  }, {});

  // ─── Render helpers ────────────────────────────────────────────────────

  function renderScoreBar(score: number) {
    const segments = 10;
    const filled = Math.round((score / 100) * segments);
    const color =
      score === 100
        ? 'bg-green-500'
        : score >= 60
          ? 'bg-yellow-500'
          : 'bg-red-500';

    return (
      <div className="flex items-center gap-3">
        <div className="flex gap-0.5 flex-1">
          {Array.from({ length: segments }, (_, i) => (
            <div
              key={i}
              className={`h-2 flex-1 rounded-sm ${i < filled ? color : 'bg-gray-200'}`}
            />
          ))}
        </div>
        <span className={`text-sm font-semibold tabular-nums ${
          score === 100 ? 'text-green-700' : score >= 60 ? 'text-yellow-700' : 'text-red-700'
        }`}>
          {score}%
        </span>
      </div>
    );
  }

  function renderChecklistItem(item: ChecklistItem) {
    return (
      <div
        key={item.label}
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
        {item.count > 0 && (
          <span className="text-xs opacity-75">({item.count})</span>
        )}
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
          <span className="text-xs font-medium ml-auto flex items-center gap-1 text-amber-600">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
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

  function renderEvidenceGallery(attachments: JobAttachment[], signatures: Signature[], notes: JobNote[]) {
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
    return sortedV.map((version) => (
      <div key={version} className="border-t border-gray-100 pt-2 mt-2 first:border-0 first:pt-0 first:mt-0">
        <p className="text-[10px] font-semibold text-gray-400 uppercase mb-1.5">
          {version === 0 ? 'Original' : `Rework ${version}`}
        </p>
        {/* Photos */}
        {attVersions[version]?.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-1.5">
            {(() => {
              const byType: Record<string, JobAttachment[]> = {};
              attVersions[version].forEach((att) => {
                if (!byType[att.attachment_type]) byType[att.attachment_type] = [];
                byType[att.attachment_type].push(att);
              });
              return Object.entries(byType).flatMap(([type, items]) =>
                items.map((att) =>
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
                        <p className="text-[10px] text-gray-500 capitalize">{type}</p>
                        {att.inside_geofence != null && (
                          <p className={`text-[10px] ${att.inside_geofence ? 'text-green-600' : 'text-amber-600'}`}>
                            {att.inside_geofence ? '📍 Inside' : '⚠ Outside'}
                          </p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div key={att.id} className="bg-gray-50 rounded px-2 py-1 text-xs text-gray-600">
                      📎 {att.file_name}
                    </div>
                  )
                )
              );
            })()}
          </div>
        )}
        {/* Signatures */}
        {sigVersions[version]?.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-1.5">
            {sigVersions[version].map((sig) => (
              <div key={sig.id} className="bg-gray-50 rounded px-2 py-1 text-xs text-gray-600">
                ✍️ {sig.label} — {sig.user_name}
              </div>
            ))}
          </div>
        )}
        {/* Notes */}
        {noteVersions[version]?.length > 0 && (
          <div className="space-y-1">
            {noteVersions[version].map((note) => (
              <p key={note.id} className="text-xs text-gray-600 bg-gray-50 rounded px-2 py-1">
                {note.content}
              </p>
            ))}
          </div>
        )}
      </div>
    ));
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <h1 className="text-xl font-bold text-gray-900 mb-1">Work Review</h1>
        <p className="text-sm text-gray-500 mb-6">
          {items.length} completed technician{items.length !== 1 ? 's' : ''} pending review
        </p>
        {/* Error State */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mb-6">
            {error}
            <button onClick={fetchSchedules} className="ml-2 underline">Retry</button>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="text-center py-12">
            <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-3" />
            <p className="text-sm text-gray-500">Loading review queue...</p>
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && items.length === 0 && (
          <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
            <svg className="h-12 w-12 text-gray-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-gray-500 font-medium">All caught up!</p>
            <p className="text-sm text-gray-400 mt-1">No completed technicians waiting for review.</p>
          </div>
        )}

        {/* Review Cards — grouped by schedule */}
        {!loading && Object.entries(groups).map(([scheduleId, scheduleItems]) => {
          // All items in a group share the same project info from the first item
          const first = scheduleItems[0];
          return (
            <div key={scheduleId} className="mb-6">
              {/* Schedule header (shown once per schedule) */}
              <div className="flex items-center justify-between mb-2 px-1">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">{first.project_name}</h2>
                  <p className="text-sm text-gray-500">
                    📅 {new Date(first.scheduled_date + 'T00:00:00').toLocaleDateString()}
                    {first.start_time && ` ⏰ ${first.start_time.slice(0, 5)}${first.end_time ? ` — ${first.end_time.slice(0, 5)}` : ''}`}
                    {first.project_address && ` 📍 ${first.project_address}`}
                  </p>
                </div>
                <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-2 py-1">
                  {scheduleItems.length} tech{scheduleItems.length !== 1 ? 's' : ''}
                </span>
              </div>

              {/* One card per technician */}
              {scheduleItems.map((item) => {
                const key = expandedKey(item);
                const expandedData = expanded[key];
                const isActionLoading = actionLoading === key;
                const { required, optional, allRequired, score, presentCount, totalCount } =
                  getChecklistData(item, expandedData);

                const canClose = expandedData && !expandedData.loading ? allRequired : false;

                return (
                  <div key={key} className="bg-white rounded-xl border border-gray-200 mb-3 overflow-hidden">
                    {/* Card Header — technician identity */}
                    <button
                      onClick={() => toggleExpand(item)}
                      className="w-full text-left p-4 flex items-start justify-between gap-4 hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-1">
                          <h3 className="text-base font-semibold text-gray-900">
                            🔧 {item.technician_name}
                          </h3>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                            item.status === 'rework_required'
                              ? 'bg-orange-100 text-orange-700'
                              : 'bg-gray-100 text-gray-700'
                          }`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${
                              item.status === 'rework_required' ? 'bg-orange-500' : 'bg-gray-400'
                            }`} />
                            {item.status === 'rework_required' ? 'Rework Required' : 'Work Completed'}
                          </span>
                          {/* Other techs context */}
                          {item.other_technicians.length > 0 && (
                            <span className="text-xs text-gray-400 ml-auto">
                              +{item.other_technicians.length} other{item.other_technicians.length !== 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                        {renderScoreBar(score)}
                      </div>
                      <svg
                        className={`h-5 w-5 text-gray-400 mt-1 transition-transform flex-shrink-0 ${expandedData ? 'rotate-180' : ''}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {/* Expanded Details */}
                    {expandedData && (
                      <div className="border-t border-gray-200">
                        {expandedData.loading ? (
                          <div className="text-center py-8">
                            <div className="animate-spin h-6 w-6 border-2 border-blue-600 border-t-transparent rounded-full mx-auto" />
                          </div>
                        ) : (
                          <div className="p-4 space-y-5">
                            {/* ── Other Technicians on Schedule ─────────────── */}
                            {item.other_technicians.length > 0 && (
                              <div>
                                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                                  Other Technicians on Schedule
                                </h4>
                                <div className="bg-gray-50 rounded-lg px-3 py-2 space-y-1">
                                  {item.other_technicians.map((ot) => (
                                    <div key={ot.technician_id} className="flex items-center justify-between text-sm">
                                      <span className="text-gray-700">{ot.technician_name}</span>
                                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                                        ot.status === 'completed' ? 'bg-green-100 text-green-700' :
                                        ot.status === 'on_site' ? 'bg-blue-100 text-blue-700' :
                                        ot.status === 'traveling' ? 'bg-purple-100 text-purple-700' :
                                        ot.status === 'rework_required' ? 'bg-orange-100 text-orange-700' :
                                        'bg-gray-100 text-gray-600'
                                      }`}>
                                        <span className={`h-1.5 w-1.5 rounded-full ${
                                          ot.status === 'completed' ? 'bg-green-500' :
                                          ot.status === 'on_site' ? 'bg-blue-500' :
                                          ot.status === 'traveling' ? 'bg-purple-500' :
                                          ot.status === 'rework_required' ? 'bg-orange-500' :
                                          'bg-gray-400'
                                        }`} />
                                        {ot.status}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* ── Clock-In Location & Geofence ────────────── */}
                            <div>
                              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Clock-In Location</h4>
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
                                        <p className="text-sm text-gray-700">
                                          📍 {distanceLabel}
                                        </p>
                                        {hasProjectCoords && (
                                          <p className="text-sm">
                                            {gfStatus === 'inside' ? (
                                              <span className="inline-flex items-center gap-1 text-green-700 font-medium">
                                                <span className="h-2 w-2 rounded-full bg-green-500" />
                                                Inside Geofence
                                              </span>
                                            ) : (
                                              <span className="inline-flex items-center gap-1 text-amber-700 font-medium">
                                                <span className="h-2 w-2 rounded-full bg-amber-500" />
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
                                    <p className="text-xs text-gray-400">
                                      Accuracy ±{item.clock_in_accuracy} m
                                    </p>
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
                                <div className="bg-gray-50 rounded-lg px-3 py-3">
                                  <p className="text-sm text-gray-500 flex items-center gap-1.5">
                                    <span className="h-2 w-2 rounded-full bg-gray-400 inline-block" />
                                    GPS Unavailable
                                  </p>
                                  <p className="text-xs text-gray-400 mt-1">
                                    No GPS data captured at clock-in. The device or browser did not provide a location — this can happen on desktop/laptop when GPS access is denied, blocked, or unavailable. Mobile devices typically capture GPS reliably.
                                  </p>
                                </div>
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
                            </div>

                            {/* ── Technician Evidence Panel ────────────── */}
                            <div>
                              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                                Evidence — {item.technician_name}
                              </h4>
                              {/* Checklist */}
                              {required.some((r) => r.required) && (
                                <div className="grid grid-cols-2 gap-1.5 mb-3">
                                  {required.map((ci) => renderChecklistItem(ci))}
                                </div>
                              )}
                              {optional.some((o) => o.present || o.required) && (
                                <div className="grid grid-cols-2 gap-1.5 mb-3">
                                  {optional.map((ci) => renderChecklistItem(ci))}
                                </div>
                              )}
                              {/* Evidence gallery */}
                              {renderEvidenceGallery(
                                expandedData.attachments,
                                expandedData.signatures,
                                expandedData.notes,
                              )}
                            </div>

                            {/* ── Internal Notes ──────────────────────── */}
                            <div>
                              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Internal Notes</h4>
                              {expandedData.notes.filter((n) => n.note_type === 'internal').length > 0 ? (
                                <div className="space-y-2 mb-3">
                                  {expandedData.notes.filter((n) => n.note_type === 'internal').map((note) => (
                                    <div key={note.id} className="bg-amber-50 rounded-lg px-3 py-2">
                                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{note.content}</p>
                                      <p className="text-xs text-gray-400 mt-1">{note.user_name} · {new Date(note.created_at).toLocaleString()}</p>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-xs text-gray-400 italic mb-3">No internal notes yet</p>
                              )}
                              {/* Internal note input */}
                              {isOfficeStaff && (
                                <div className="flex gap-2">
                                  <input
                                    type="text"
                                    value={internalNotes[key] || ''}
                                    onChange={(e) =>
                                      setInternalNotes((prev) => ({ ...prev, [key]: e.target.value }))
                                    }
                                    placeholder="Add internal note..."
                                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleAddInternalNote(item);
                                      }
                                    }}
                                    disabled={savingInternalNote[key]}
                                  />
                                  <button
                                    onClick={() => handleAddInternalNote(item)}
                                    disabled={!internalNotes[key]?.trim() || savingInternalNote[key]}
                                    className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-amber-700 transition-colors"
                                  >
                                    {savingInternalNote[key] ? '...' : 'Add'}
                                  </button>
                                </div>
                              )}
                            </div>

                            {/* ── Rework History ────────────────────────── */}
                            {expandedData.reworkRequests.length > 0 && (
                              <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 space-y-2">
                                <h4 className="text-xs font-semibold text-orange-700 uppercase tracking-wide">
                                  Rework History
                                </h4>
                                {expandedData.reworkRequests.map((rw) => (
                                  <div key={rw.id} className="text-sm text-orange-800">
                                    <div className="flex items-center justify-between">
                                      <span className="font-medium">
                                        {rw.status === 'open' ? '⚠ Open Rework Request' : '✓ Completed Rework'}
                                      </span>
                                      <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${
                                        rw.status === 'open' ? 'bg-orange-200 text-orange-800' : 'bg-green-200 text-green-800'
                                      }`}>
                                        {rw.status}
                                      </span>
                                    </div>
                                    <p className="mt-1 text-orange-700">Reason: {rw.reason}</p>
                                    <p className="text-xs text-orange-600 mt-0.5">
                                      {rw.requested_by_name || 'Unknown'} · {new Date(rw.requested_at).toLocaleString()}
                                      {rw.resolved_at && ` → Resolved: ${new Date(rw.resolved_at).toLocaleString()}`}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* ── Actions ───────────────────────────────── */}
                            <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-200">
                              {allRequired ? (
                                <button
                                  onClick={() => handleClose(item)}
                                  disabled={isActionLoading}
                                  className="px-5 py-2.5 bg-gray-700 hover:bg-gray-800 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  {isActionLoading ? 'Processing...' : 'Close Job'}
                                </button>
                              ) : isAdmin ? (
                                <button
                                  onClick={() => handleClose(item)}
                                  disabled={isActionLoading}
                                  className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                                >
                                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  </svg>
                                  {isActionLoading ? 'Processing...' : 'Force Close'}
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
                                  Close Job
                                </button>
                              )}

                              {item.status === 'completed' && (
                                <button
                                  onClick={() => handleRework(item)}
                                  disabled={isActionLoading}
                                  className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  {isActionLoading ? 'Processing...' : 'Request Rework'}
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </main>

      {/* Rework Reason Modal */}
      {reworkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Request Rework</h2>
            <p className="text-sm text-gray-500 mb-4">
              This will create a rework request for <strong>{reworkModal.item.technician_name}</strong>&#39;s work on &#34;{reworkModal.item.project_name}&#34;. The existing evidence (photos, signature, notes) will be preserved as the original submission.
            </p>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Reason for rework <span className="text-red-500">*</span>
            </label>
            <textarea
              value={reworkReason}
              onChange={(e) => setReworkReason(e.target.value)}
              placeholder="Describe what needs to be corrected..."
              rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              autoFocus
            />
            <div className="flex justify-end gap-3 mt-4">
              <button
                onClick={() => { setReworkModal(null); setReworkReason(''); }}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmRework}
                disabled={!reworkReason.trim() || actionLoading === expandedKey(reworkModal.item)}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {actionLoading === expandedKey(reworkModal.item) ? 'Requesting...' : 'Request Rework'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Force Close Modal */}
      {forceCloseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Force Close Job</h2>
            <p className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
              ⚠ This job is missing required documentation. Only admins can force close.
            </p>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Reason for force close <span className="text-red-500">*</span>
            </label>
            <textarea
              value={forceCloseReason}
              onChange={(e) => setForceCloseReason(e.target.value)}
              placeholder="Emergency close due to customer request..."
              rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              autoFocus
            />
            <p className="text-xs text-gray-400 mt-1">
              This will be written to the audit log.
            </p>
            <div className="flex justify-end gap-3 mt-4">
              <button
                onClick={() => { setForceCloseModal(null); setForceCloseReason(''); }}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmForceClose}
                disabled={!forceCloseReason.trim() || actionLoading === expandedKey(forceCloseModal)}
                className="px-4 py-2 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {actionLoading === expandedKey(forceCloseModal) ? 'Closing...' : 'Force Close'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
