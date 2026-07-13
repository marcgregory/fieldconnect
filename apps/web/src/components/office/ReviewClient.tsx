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
  ReworkRequest,
} from '@fieldconnect/shared';
import { TechnicianReviewPanel } from './TechnicianReviewPanel';

// ─── Types ─────────────────────────────────────────────────────────────────

interface ExpandedData {
  notes: JobNote[];
  attachments: JobAttachment[];
  signatures: Signature[];
  reworkRequests: ReworkRequest[];
  loading: boolean;
}

function expandedKey(item: ReviewItem): string {
  return `${item.schedule_id}::${item.technician_id}`;
}

// ─── Status helpers ────────────────────────────────────────────────────────

const STATUS_BADGES: Record<JobStatus, { label: string; color: string; dot: string }> = {
  scheduled: { label: 'Scheduled', color: 'bg-blue-50 text-blue-700', dot: 'bg-blue-500' },
  traveling: { label: 'Traveling', color: 'bg-indigo-50 text-indigo-700', dot: 'bg-indigo-500' },
  on_site: { label: 'On Site', color: 'bg-cyan-50 text-cyan-700', dot: 'bg-cyan-500' },
  rework_required: { label: 'Rework Required', color: 'bg-red-100 text-red-700', dot: 'bg-red-500' },
  completed: { label: 'Completed', color: 'bg-green-100 text-green-700', dot: 'bg-green-500' },
  closed: { label: 'Closed', color: 'bg-gray-100 text-gray-600', dot: 'bg-gray-400' },
};

function statusBadge(item: ReviewItem): { label: string; color: string; dot: string } {
  return STATUS_BADGES[item.status];
}

function reworkCycleLabel(item: ReviewItem): string | null {
  if (item.status !== 'completed' || item.current_rework_version <= 0) {
    return null;
  }

  const cycleText = item.current_rework_version === 1 ? '1 rework cycle' : `${item.current_rework_version} rework cycles`;
  return `${cycleText} completed`;
}

// ─── Score bar (compact for pill list) ─────────────────────────────────────

function CompactScore({ score }: { score: number }) {
  const segments = 6;
  const filled = Math.round((score / 100) * segments);
  const color = score === 100 ? 'bg-green-500' : score >= 60 ? 'bg-blue-500' : 'bg-red-500';

  return (
    <div className="flex items-center gap-1.5">
      <div className="flex gap-px">
        {Array.from({ length: segments }, (_, i) => (
          <div
            key={i}
            className={`h-1.5 w-1.5 rounded-sm ${i < filled ? color : 'bg-gray-200'}`}
          />
        ))}
      </div>
      <span className="text-[11px] font-semibold tabular-nums">{score}%</span>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function ReviewClient() {
  const { data: session } = useSession();
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<Record<string, ExpandedData>>({});
  const [pendingAction, setPendingAction] = useState<{
    technicianId: string | null;
    action: 'close' | 'request_rework' | null;
  }>({ technicianId: null, action: null });

  // ── Image URL helper ──────────────────────────────────────────────────
  function getUploadUrl(filePath: string): string {
    return `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/uploads/${filePath}`;
  }

  function getAttachmentUrl(att: JobAttachment): string {
    return att.secure_url || (att.file_path ? getUploadUrl(att.file_path) : '');
  }

  // ── Rework modal ─────────────────────────────────────────────────────
  const [reworkModal, setReworkModal] = useState<{
    item: ReviewItem;
    targetStatus: JobStatus;
  } | null>(null);
  const [reworkReason, setReworkReason] = useState('');

  // ── Force Close modal ────────────────────────────────────────────────
  const [forceCloseModal, setForceCloseModal] = useState<ReviewItem | null>(null);
  const [forceCloseReason, setForceCloseReason] = useState('');

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

  useEffect(() => {
    const unsub = onJobUpdate(() => {
      fetchSchedules();
    });
    return unsub;
  }, [onJobUpdate, fetchSchedules]);

  // ── Select / deselect a technician ─────────────────────────────────────
  async function selectTechnician(item: ReviewItem) {
    const key = expandedKey(item);

    // Clicking the already-selected tech closes the panel
    if (expanded[key]) {
      setExpanded((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      return;
    }

    // Close any other open panels first
    setExpanded({});

    // Open with loading state
    setExpanded({
      [key]: { notes: [], attachments: [], signatures: [], reworkRequests: [], loading: true },
    });

    try {
      const techId = item.technician_id;
      const [notes, attachments, signatures, reworkRequests] = await Promise.all([
        getJobNotes(item.schedule_id, techId),
        getJobAttachments(item.schedule_id, techId),
        getJobSignatures(item.schedule_id, techId),
        getReworkRequests(item.schedule_id).catch(() => [] as ReworkRequest[]),
      ]);
      setExpanded({
        [key]: { notes, attachments, signatures, reworkRequests, loading: false },
      });
    } catch {
      setExpanded({
        [key]: { notes: [], attachments: [], signatures: [], reworkRequests: [], loading: false },
      });
    }
  }

  // ── Close assignment ──────────────────────────────────────────────────
  async function handleClose(item: ReviewItem) {
    const key = expandedKey(item);
    const data = expanded[key];

    // Check if all required items are present
    const requiredPresent =
      (item.note_count > 0 ? 1 : 0) +
      (item.before_photo_count > 0 ? 1 : 0) +
      (item.after_photo_count > 0 ? 1 : 0) +
      (item.signature_count > 0 ? 1 : 0);
    const allReq = requiredPresent === 4;

    if (!allReq) {
      if (!isAdmin) return;
      setForceCloseModal(item);
      return;
    }

    setPendingAction({ technicianId: item.technician_id, action: 'close' });
    setError('');
    try {
      await updateScheduleStatus(item.schedule_id, 'closed', undefined, item.technician_id);
      fetchSchedules();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update status');
    } finally {
      setPendingAction({ technicianId: null, action: null });
    }
  }

  async function confirmForceClose() {
    if (!forceCloseModal) return;
    if (!forceCloseReason.trim()) {
      setError('Please provide a reason for force close');
      return;
    }
    setPendingAction({ technicianId: forceCloseModal.technician_id, action: 'close' });
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
      setPendingAction({ technicianId: null, action: null });
    }
  }

  // ── Add internal note (for TechnicianReviewPanel callback) ────────────
  async function handleAddInternalNote(item: ReviewItem, content: string) {
    setError('');
    try {
      await addJobNote(item.schedule_id, { content, note_type: 'internal', technician_id: item.technician_id });
      const notes = await getJobNotes(item.schedule_id, item.technician_id);
      const key = expandedKey(item);
      setExpanded((prev) => ({
        ...prev,
        [key]: { ...prev[key], notes, loading: false },
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add internal note');
    }
  }

  // ── Request rework ────────────────────────────────────────────────────
  function handleRework(item: ReviewItem) {
    setReworkModal({ item, targetStatus: 'rework_required' });
    setReworkReason('');
  }

  async function confirmRework() {
    if (!reworkModal) return;
    if (!reworkReason.trim()) {
      setError('Please provide a reason for rework');
      return;
    }
    const techId = reworkModal.item.technician_id;
    setPendingAction({ technicianId: techId, action: 'request_rework' });
    setError('');
    try {
      await requestRework(reworkModal.item.schedule_id, reworkReason.trim(), techId);
      setReworkModal(null);
      setReworkReason('');
      fetchSchedules();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to request rework');
    } finally {
      setPendingAction({ technicianId: null, action: null });
    }
  }

  // ── Group items by schedule ───────────────────────────────────────────
  const groups = items.reduce<Record<string, ReviewItem[]>>((acc, item) => {
    if (!acc[item.schedule_id]) acc[item.schedule_id] = [];
    acc[item.schedule_id].push(item);
    return acc;
  }, {});

  // ── Render ────────────────────────────────────────────────────────────
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

        {/* Schedule Groups — one card per schedule */}
        {!loading && Object.entries(groups).map(([scheduleId, scheduleItems]) => {
          const first = scheduleItems[0];
          const techCount = scheduleItems.length;
          const completedCount = scheduleItems.filter((i) => i.status === 'completed').length;
          const closedCount = scheduleItems.filter((i) => i.status === 'closed').length;
          const reworkCount = scheduleItems.filter((i) => i.status === 'rework_required').length;

          // Derive aggregate completion from all items in this schedule
          const allClosed = closedCount === techCount;

          return (
            <div key={scheduleId} className="mb-6 bg-white rounded-xl border border-gray-200 overflow-hidden">
              {/* ── Project Header ──────────────────────────────────────── */}
              <div className="p-4 border-b border-gray-100">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <h2 className="text-lg font-bold text-gray-900">{first.project_name}</h2>
                    <p className="text-sm text-gray-500 mt-0.5">
                      📅 {new Date(first.scheduled_date + 'T00:00:00').toLocaleDateString()}
                      {first.start_time && ` ⏰ ${first.start_time.slice(0, 5)}${first.end_time ? ` — ${first.end_time.slice(0, 5)}` : ''}`}
                      {first.project_address && ` 📍 ${first.project_address}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {allClosed && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-gray-100 text-gray-600 rounded-full text-xs font-medium">
                        <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />
                        All Closed
                      </span>
                    )}
                    <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-2.5 py-1">
                      {techCount} tech{techCount !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>

                {/* Summary chips */}
                <div className="flex flex-wrap gap-2 mt-3">
                  {completedCount > 0 && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700">
                      <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                      {completedCount} Completed
                    </span>
                  )}
                  {closedCount > 0 && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                      <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />
                      {closedCount} Closed
                    </span>
                  )}
                  {reworkCount > 0 && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700">
                      <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                      {reworkCount} Rework
                    </span>
                  )}
                </div>
              </div>

              {/* ── Technician Pill List ────────────────────────────────── */}
              <div className="border-b border-gray-100 bg-gray-50/50">
                <div className="px-4 py-2 flex flex-wrap gap-2">
                  {scheduleItems.map((item) => {
                    const key = expandedKey(item);
                    const isSelected = !!expanded[key];
                    const badge = statusBadge(item);
                    const secondaryLabel = reworkCycleLabel(item);

                    // Compute collapsed score from item-level counts
                    const requiredPresent =
                      (item.note_count > 0 ? 1 : 0) +
                      (item.before_photo_count > 0 ? 1 : 0) +
                      (item.after_photo_count > 0 ? 1 : 0) +
                      (item.signature_count > 0 ? 1 : 0);
                    const score = Math.round((requiredPresent / 4) * 100);

                    return (
                      <button
                        key={key}
                        onClick={() => selectTechnician(item)}
                        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                          isSelected
                            ? 'bg-blue-100 text-blue-800 ring-2 ring-blue-300'
                            : 'bg-white text-gray-700 border border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        <span className="truncate max-w-[120px]">🔧 {item.technician_name}</span>
                        <span className="flex flex-col items-start gap-0.5">
                          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${badge.color}`}>
                            <span className={`h-1 w-1 rounded-full ${badge.dot}`} />
                            {badge.label}
                          </span>
                          {secondaryLabel && (
                            <span className="text-[10px] leading-none text-amber-700">
                              {secondaryLabel}
                            </span>
                          )}
                        </span>
                        <CompactScore score={score} />
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* ── Selected Technician Detail Panel ──────────────────── */}
              {(() => {
                // Find which tech is selected in this schedule group
                const selectedKey = Object.keys(expanded).find((k) =>
                  scheduleItems.some((item) => expandedKey(item) === k),
                );
                if (!selectedKey) return null;

                const selectedItem = scheduleItems.find(
                  (item) => expandedKey(item) === selectedKey,
                );
                if (!selectedItem) return null;

                const data = expanded[selectedKey];

                return (
                  <TechnicianReviewPanel
                    item={selectedItem}
                    expandedData={data}
                    pendingAction={pendingAction}
                    isAdmin={isAdmin}
                    isOfficeStaff={isOfficeStaff}
                    getAttachmentUrl={getAttachmentUrl}
                    onClose={() => handleClose(selectedItem)}
                    onRework={() => handleRework(selectedItem)}
                    onAddInternalNote={async (content: string) => {
                      await handleAddInternalNote(selectedItem, content);
                    }}
                  />
                );
              })()}
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
                disabled={!reworkReason.trim() || (pendingAction.technicianId === reworkModal.item.technician_id && pendingAction.action === 'request_rework')}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {(pendingAction.technicianId === reworkModal.item.technician_id && pendingAction.action === 'request_rework') ? 'Requesting...' : 'Request Rework'}
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
            <p className="text-sm text-blue-600 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 mb-4">
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
                disabled={!forceCloseReason.trim() || (pendingAction.technicianId === forceCloseModal.technician_id && pendingAction.action === 'close')}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {(pendingAction.technicianId === forceCloseModal.technician_id && pendingAction.action === 'close') ? 'Closing...' : 'Force Close'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
