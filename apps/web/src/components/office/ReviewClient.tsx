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
  ScheduleWithDetails,
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

type ActionType = 'closed' | 'on_site' | 'traveling';

interface ChecklistItem {
  label: string;
  present: boolean;
  count: number;
  required: boolean;
  gpsStatus?: 'verified' | 'outside' | 'unavailable' | null;
}

const REQUIRED_ITEMS: ChecklistItem[] = [
  { label: 'Technician Notes', present: false, count: 0, required: true },
  { label: 'Before Photo', present: false, count: 0, required: true },
  { label: 'After Photo', present: false, count: 0, required: true },
  { label: 'Customer Signature', present: false, count: 0, required: true },
];

const OPTIONAL_ITEMS: ChecklistItem[] = [
  { label: 'During Photos', present: false, count: 0, required: false },
  { label: 'Internal Notes', present: false, count: 0, required: false },
  { label: 'Documents', present: false, count: 0, required: false },
];

function evaluateChecklist(notes: JobNote[], attachments: JobAttachment[], signatures: Signature[]) {
  const techNotes = notes.filter((n) => n.note_type === 'technician');
  const internalNotes = notes.filter((n) => n.note_type === 'internal');
  const beforePhotos = attachments.filter((a) => a.attachment_type === 'before');
  const duringPhotos = attachments.filter((a) => a.attachment_type === 'during');
  const afterPhotos = attachments.filter((a) => a.attachment_type === 'after');
  const documents = attachments.filter((a) => a.attachment_type === 'document');

  /** Determine GPS quality for a set of photos */
  function photoGpsStatus(photos: JobAttachment[]): ChecklistItem['gpsStatus'] {
    if (photos.length === 0) return null;
    const allInside = photos.every((p) => p.inside_geofence === true);
    const anyGps = photos.some((p) => p.latitude != null);
    if (!anyGps) return 'unavailable';
    return allInside ? 'verified' : 'outside';
  }

  const required = REQUIRED_ITEMS.map((item) => {
    switch (item.label) {
      case 'Technician Notes': return { ...item, present: techNotes.length > 0, count: techNotes.length };
      case 'Before Photo': {
        const base = { ...item, present: beforePhotos.length > 0, count: beforePhotos.length };
        return { ...base, gpsStatus: photoGpsStatus(beforePhotos) };
      }
      case 'After Photo': {
        const base = { ...item, present: afterPhotos.length > 0, count: afterPhotos.length };
        return { ...base, gpsStatus: photoGpsStatus(afterPhotos) };
      }
      case 'Customer Signature': return { ...item, present: signatures.length > 0, count: signatures.length };
      default: return item;
    }
  });

  const optional = OPTIONAL_ITEMS.map((item) => {
    switch (item.label) {
      case 'During Photos': return { ...item, present: duringPhotos.length > 0, count: duringPhotos.length, gpsStatus: photoGpsStatus(duringPhotos) };
      case 'Internal Notes': return { ...item, present: internalNotes.length > 0, count: internalNotes.length };
      case 'Documents': return { ...item, present: documents.length > 0, count: documents.length };
      default: return item;
    }
  });

  const allRequired = required.every((r) => r.present);
  const presentCount = [...required, ...optional].filter((r) => r.present).length;
  const totalCount = [...required, ...optional].length;
  const score = totalCount > 0 ? Math.round((presentCount / totalCount) * 100) : 0;

  return { required, optional, allRequired, score, presentCount, totalCount };
}

export function ReviewClient() {
  const { data: session } = useSession();
  const [schedules, setSchedules] = useState<ScheduleWithDetails[]>([]);
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

  /** Group evidence by technician_id. Items without technician_id go to "Unassigned". */
  function groupEvidenceByTech(
    schedule: ScheduleWithDetails,
    notes: JobNote[],
    attachments: JobAttachment[],
    signatures: Signature[],
  ) {
    type TechEvidence = { techId: string; techName: string; notes: JobNote[]; attachments: JobAttachment[]; signatures: Signature[] };
    const techMap = new Map<string, TechEvidence>();

    // Initialize from technician_workflow so we know all techs even if they have no evidence
    for (const tw of schedule.technician_workflow || []) {
      if (!techMap.has(tw.technician_id)) {
        techMap.set(tw.technician_id, {
          techId: tw.technician_id,
          techName: tw.technician_name,
          notes: [],
          attachments: [],
          signatures: [],
        });
      }
    }

    // Assign evidence to owning technician
    for (const n of notes) {
      const tid = n.technician_id || n.user_id;
      const group = techMap.get(tid);
      if (group) group.notes.push(n);
    }
    for (const a of attachments) {
      const tid = a.technician_id || a.user_id;
      const group = techMap.get(tid);
      if (group) group.attachments.push(a);
    }
    for (const s of signatures) {
      const tid = s.technician_id || s.user_id;
      const group = techMap.get(tid);
      if (group) group.signatures.push(s);
    }

    // Return only technicians that have evidence or are relevant (have status != scheduled)
    return Array.from(techMap.values()).filter(
      (g) => g.attachments.length > 0 || g.signatures.length > 0 || g.notes.length > 0
    );
  }

  // Rework modal
  const [reworkModal, setReworkModal] = useState<{
    schedule: ScheduleWithDetails;
    targetStatus: JobStatus;
  } | null>(null);
  const [reworkReason, setReworkReason] = useState('');

  // Force Close modal
  const [forceCloseModal, setForceCloseModal] = useState<ScheduleWithDetails | null>(null);
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
      setSchedules(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load review queue');
    } finally {
      setLoading(false);
    }
  }, [isOfficeStaff]);

  useEffect(() => {
    fetchSchedules();
  }, [fetchSchedules]);

  // ─── Socket: refresh on status changes ────────────────────────────────────
  useEffect(() => {
    const unsub = onJobUpdate(() => {
      fetchSchedules();
    });
    return unsub;
  }, [onJobUpdate, fetchSchedules]);

  async function toggleExpand(scheduleId: string) {
    if (expanded[scheduleId]) {
      setExpanded((prev) => {
        const next = { ...prev };
        delete next[scheduleId];
        return next;
      });
      return;
    }

    setExpanded((prev) => ({
      ...prev,
      [scheduleId]: { notes: [], attachments: [], signatures: [], reworkRequests: [], loading: true },
    }));

    try {
      const [notes, attachments, signatures, reworkRequests] = await Promise.all([
        getJobNotes(scheduleId),
        getJobAttachments(scheduleId),
        getJobSignatures(scheduleId),
        getReworkRequests(scheduleId).catch(() => [] as ReworkRequest[]),
      ]);
      setExpanded((prev) => ({
        ...prev,
        [scheduleId]: { notes, attachments, signatures, reworkRequests, loading: false },
      }));
    } catch {
      setExpanded((prev) => ({
        ...prev,
        [scheduleId]: { notes: [], attachments: [], signatures: [], reworkRequests: [], loading: false },
      }));
    }
  }

  function getChecklistData(schedule: ScheduleWithDetails, data: ExpandedData | undefined) {
    if (data && !data.loading) {
      return evaluateChecklist(data.notes, data.attachments, data.signatures);
    }
    // Fallback: use summary counts from query
    // We can't split by type from summary counts, so treat any attachment as at least
    // having a before photo (optimistic for the collapsed state)
    const hasNotes = (schedule.note_count ?? 0) > 0;
    const hasAttachments = (schedule.attachment_count ?? 0) > 0;
    const hasSig = (schedule.signature_count ?? 0) > 0;

    const required = REQUIRED_ITEMS.map((item) => {
      switch (item.label) {
        case 'Technician Notes': return { ...item, present: hasNotes, count: schedule.note_count ?? 0 };
        case 'Before Photo': return { ...item, present: hasAttachments, count: schedule.attachment_count ?? 0 };
        case 'After Photo': return { ...item, present: hasAttachments, count: schedule.attachment_count ?? 0 };
        case 'Customer Signature': return { ...item, present: hasSig, count: schedule.signature_count ?? 0 };
        default: return item;
      }
    });
    const optional = OPTIONAL_ITEMS.map(() => ({ ...OPTIONAL_ITEMS[0], present: false, count: 0 }));

    const allRequired = required.every((r) => r.present);
    const presentCount = [...required, ...optional].filter((r) => r.present).length;
    const totalCount = [...required, ...optional].length;
    const score = totalCount > 0 ? Math.round((presentCount / totalCount) * 100) : 0;

    return { required, optional, allRequired, score, presentCount, totalCount };
  }

  async function handleClose(schedule: ScheduleWithDetails) {
    if (expanded[schedule.id] && !expanded[schedule.id].loading) {
      // We have full data — check required items
      const { allRequired } = getChecklistData(schedule, expanded[schedule.id]);
      if (!allRequired && !isAdmin) return; // Block non-admins
      if (!allRequired && isAdmin) {
        // Show Force Close modal
        setForceCloseModal(schedule);
        return;
      }
    }

    // Normal close
    setActionLoading(schedule.id);
    setError('');
    try {
      await updateScheduleStatus(schedule.id, 'closed');
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
    setActionLoading(forceCloseModal.id);
    setError('');
    try {
      await updateScheduleStatus(
        forceCloseModal.id,
        'closed',
        `Force close: ${forceCloseReason.trim()}`,
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

  async function handleAddInternalNote(scheduleId: string) {
    const content = internalNotes[scheduleId]?.trim();
    if (!content) return;

    setSavingInternalNote((prev) => ({ ...prev, [scheduleId]: true }));
    setError('');
    try {
      await addJobNote(scheduleId, { content, note_type: 'internal' });
      // Clear input and refresh notes
      setInternalNotes((prev) => ({ ...prev, [scheduleId]: '' }));
      const notes = await getJobNotes(scheduleId);
      setExpanded((prev) => ({
        ...prev,
        [scheduleId]: { ...prev[scheduleId], notes, loading: false },
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add internal note');
    } finally {
      setSavingInternalNote((prev) => ({ ...prev, [scheduleId]: false }));
    }
  }

  async function handleRework(schedule: ScheduleWithDetails, targetStatus: JobStatus) {
    setReworkModal({ schedule, targetStatus });
    setReworkReason('');
  }

  async function confirmRework() {
    if (!reworkModal) return;
    if (!reworkReason.trim()) {
      setError('Please provide a reason for rework');
      return;
    }
    setActionLoading(reworkModal.schedule.id);
    setError('');
    try {
      await requestRework(reworkModal.schedule.id, reworkReason.trim());
      setReworkModal(null);
      setReworkReason('');
      fetchSchedules();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to request rework');
    } finally {
      setActionLoading(null);
    }
  }

  // ─── Render helpers ─────────────────────────────────────────────────────

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

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <h1 className="text-xl font-bold text-gray-900 mb-1">Work Review</h1>
        <p className="text-sm text-gray-500 mb-6">
          {schedules.length} work completed job{schedules.length !== 1 ? 's' : ''} pending review
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
        {!loading && !error && schedules.length === 0 && (
          <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
            <svg className="h-12 w-12 text-gray-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-gray-500 font-medium">All caught up!</p>
            <p className="text-sm text-gray-400 mt-1">No work completed jobs waiting for review.</p>
          </div>
        )}

        {/* Review Cards */}
        {!loading && schedules.map((schedule) => {
          const expandedData = expanded[schedule.id];
          const isActionLoading = actionLoading === schedule.id;
          const { required, optional, allRequired, score, presentCount, totalCount } =
            getChecklistData(schedule, expandedData);

          const canClose = expandedData && !expandedData.loading
            ? allRequired
            : false;

          return (
            <div key={schedule.id} className="bg-white rounded-xl border border-gray-200 mb-4 overflow-hidden">
              {/* Card Header — Expand/Collapse */}
              <button
                onClick={() => toggleExpand(schedule.id)}
                className="w-full text-left p-4 flex items-start justify-between gap-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="text-lg font-semibold text-gray-900 truncate">
                      {schedule.project_name}
                    </h3>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                      schedule.status === 'rework_required'
                        ? 'bg-orange-100 text-orange-700'
                        : 'bg-gray-100 text-gray-700'
                    }`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${
                        schedule.status === 'rework_required' ? 'bg-orange-500' : 'bg-gray-400'
                      }`} />
                      {schedule.status === 'rework_required' ? 'Rework Required' : 'Work Completed'}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-600">
                    <span>🔧 {schedule.technician_name}</span>
                    <span>📅 {new Date(schedule.scheduled_date + 'T00:00:00').toLocaleDateString()}</span>
                    {schedule.start_time && (
                      <span>⏰ {schedule.start_time.slice(0, 5)}{schedule.end_time ? ` — ${schedule.end_time.slice(0, 5)}` : ''}</span>
                    )}
                  </div>
                  {schedule.project_address && (
                    <p className="text-sm text-gray-500 mt-1">📍 {schedule.project_address}</p>
                  )}
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
                      {/* ── Clock-In Location & Geofence ──────────────────── */}
                      <div>
                        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Clock-In Location</h4>
                        {schedule.clock_in_lat && schedule.clock_in_lng ? (
                          <div className="bg-gray-50 rounded-lg px-3 py-3 space-y-1.5">
                            {/* Clock-in time */}
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium text-gray-700">Clock In</span>
                              <span className="text-sm text-gray-500">
                                {schedule.clock_in_time
                                  ? new Date(schedule.clock_in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                  : 'N/A'}
                              </span>
                            </div>

                            {/* Distance + Geofence badge */}
                            {(() => {
                              const dist = calculateDistance(
                                schedule.clock_in_lat,
                                schedule.clock_in_lng,
                                schedule.project_latitude,
                                schedule.project_longitude,
                              );
                              const gfStatus: GeofenceStatus = evaluateGeofence(
                                dist,
                                schedule.project_geofence_radius ?? 50,
                              );
                              return (
                                <>
                                  <p className="text-sm text-gray-700">
                                    📍 {dist !== null ? formatDistance(dist) : 'Unknown'} from customer site
                                  </p>
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
                                </>
                              );
                            })()}

                            {/* Accuracy */}
                            {schedule.clock_in_accuracy != null && (
                              <p className="text-xs text-gray-400">
                                Accuracy ±{schedule.clock_in_accuracy} m
                              </p>
                            )}

                            {/* Google Maps link */}
                            <a
                              href={`https://www.google.com/maps?q=${schedule.clock_in_lat},${schedule.clock_in_lng}`}
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
                              No GPS data captured at clock-in.
                            </p>
                          </div>
                        )}

                        {/* Customer site link (always shown) */}
                        {schedule.project_latitude && schedule.project_longitude && (
                          <a
                            href={`https://www.google.com/maps?q=${schedule.project_latitude},${schedule.project_longitude}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 underline mt-2"
                          >
                            📍 View customer site on Google Maps
                          </a>
                        )}
                      </div>

                      {/* ── Per-Technician Evidence Panels ──────────────── */}
                      {(() => {
                        const techGroups = groupEvidenceByTech(
                          schedule,
                          expandedData.notes,
                          expandedData.attachments,
                          expandedData.signatures,
                        );
                        return techGroups.map((group) => {
                          const techChecklist = evaluateChecklist(group.notes, group.attachments, group.signatures);
                          return (
                            <div key={group.techId} className="border border-gray-200 rounded-lg overflow-hidden">
                              {/* Technician header */}
                              <div className="bg-gray-50 px-3 py-2 border-b border-gray-200 flex items-center justify-between">
                                <h4 className="text-sm font-semibold text-gray-700">{group.techName}</h4>
                                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                                  techChecklist.allRequired
                                    ? 'bg-green-100 text-green-700'
                                    : 'bg-amber-100 text-amber-700'
                                }`}>
                                  {techChecklist.allRequired ? '✓ Complete' : `${techChecklist.presentCount}/${techChecklist.totalCount}`}
                                </span>
                              </div>
                              <div className="p-3 space-y-3">
                                {/* Checklist */}
                                {techChecklist.required.some((r) => r.required) && (
                                  <div className="grid grid-cols-2 gap-1.5">
                                    {techChecklist.required.map((item) => (
                                      <div key={item.label} className="flex items-center gap-1.5 text-xs">
                                        {item.present ? (
                                          <span className="text-green-600 font-bold">✓</span>
                                        ) : (
                                          <span className="text-gray-300">○</span>
                                        )}
                                        <span className={item.present ? 'text-gray-700' : 'text-gray-400'}>
                                          {item.label}
                                          {item.count > 0 && <span className="text-gray-400 ml-0.5">({item.count})</span>}
                                        </span>
                                        {item.gpsStatus === 'verified' && <span className="text-green-600 text-[10px]">📍</span>}
                                        {item.gpsStatus === 'outside' && <span className="text-amber-600 text-[10px]">⚠</span>}
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {/* Evidence gallery — group by rework_version */}
                                {(() => {
                                  // Group this tech's attachments/signatures/notes by rework_version
                                  const attVersions: Record<number, JobAttachment[]> = {};
                                  group.attachments.forEach((a) => {
                                    const v = a.rework_version ?? 0;
                                    if (!attVersions[v]) attVersions[v] = [];
                                    attVersions[v].push(a);
                                  });
                                  const sigVersions: Record<number, Signature[]> = {};
                                  group.signatures.forEach((s) => {
                                    const v = s.rework_version ?? 0;
                                    if (!sigVersions[v]) sigVersions[v] = [];
                                    sigVersions[v].push(s);
                                  });
                                  const noteVersions: Record<number, JobNote[]> = {};
                                  group.notes.filter((n) => n.note_type === 'technician').forEach((n) => {
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
                                })()}
                              </div>
                            </div>
                          );
                        });
                      })()}

                      {/* ── Internal Notes ──────────────────────────────── */}
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
                        {/* Internal note input for office staff */}
                        {(['admin', 'office_manager', 'dispatcher'].includes(userRole)) && (
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={internalNotes[schedule.id] || ''}
                              onChange={(e) =>
                                setInternalNotes((prev) => ({ ...prev, [schedule.id]: e.target.value }))
                              }
                              placeholder="Add internal note..."
                              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                  e.preventDefault();
                                  handleAddInternalNote(schedule.id);
                                }
                              }}
                              disabled={savingInternalNote[schedule.id]}
                            />
                            <button
                              onClick={() => handleAddInternalNote(schedule.id)}
                              disabled={!internalNotes[schedule.id]?.trim() || savingInternalNote[schedule.id]}
                              className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-amber-700 transition-colors"
                            >
                              {savingInternalNote[schedule.id] ? '...' : 'Add'}
                            </button>
                          </div>
                        )}
                      </div>

                      {/* ── Rework History ──────────────────────────────── */}
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

                      {/* ── Actions ─────────────────────────────────────── */}
                      <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-200">
                        {allRequired ? (
                          <button
                            onClick={() => handleClose(schedule)}
                            disabled={isActionLoading}
                            className="px-5 py-2.5 bg-gray-700 hover:bg-gray-800 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {isActionLoading ? 'Processing...' : 'Close Job'}
                          </button>
                        ) : isAdmin ? (
                          <button
                            onClick={() => handleClose(schedule)}
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

                        {schedule.status === 'completed' && (
                          <button
                            onClick={() => handleRework(schedule, 'rework_required')}
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
      </main>

      {/* Rework Reason Modal */}
      {reworkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Request Rework</h2>
            <p className="text-sm text-gray-500 mb-4">
              This will create a rework request for &#34;{reworkModal.schedule.project_name}&#34;.{' '}
              The existing evidence (photos, signature, notes) will be preserved as the
              original submission. The technician can then add new evidence for the rework.
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
                disabled={!reworkReason.trim() || actionLoading === reworkModal.schedule.id}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {actionLoading === reworkModal.schedule.id ? 'Requesting...' : 'Request Rework'}
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
                disabled={!forceCloseReason.trim() || actionLoading === forceCloseModal.id}
                className="px-4 py-2 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {actionLoading === forceCloseModal.id ? 'Closing...' : 'Force Close'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
