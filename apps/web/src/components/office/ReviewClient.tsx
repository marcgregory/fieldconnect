'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSocket } from '@/hooks/useSocket';
import {
  getReviewQueue,
  getJobNotes,
  getJobAttachments,
  getJobSignatures,
  updateScheduleStatus,
} from '@/lib/api';
import type {
  ScheduleWithDetails,
  JobNote,
  JobAttachment,
  Signature,
  JobStatus,
} from '@fieldconnect/shared';

interface ExpandedSchedule {
  id: string;
  notes: JobNote[];
  attachments: JobAttachment[];
  signatures: Signature[];
  loading: boolean;
}

type ActionType = 'office_review' | 'closed' | 'on_site' | 'traveling';

const STATUS_STYLES: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  completed: { bg: 'bg-gray-50 border-gray-200', text: 'text-gray-700', dot: 'bg-gray-400', label: 'Completed' },
  office_review: { bg: 'bg-purple-50 border-purple-200', text: 'text-purple-700', dot: 'bg-purple-500', label: 'Office Review' },
};

export function ReviewClient() {
  const [schedules, setSchedules] = useState<ScheduleWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<Record<string, ExpandedSchedule>>({});
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'completed' | 'office_review'>('all');
  const [reworkModal, setReworkModal] = useState<{
    schedule: ScheduleWithDetails;
    targetStatus: JobStatus;
  } | null>(null);
  const [reworkReason, setReworkReason] = useState('');

  const { onJobUpdate } = useSocket();

  const fetchSchedules = useCallback(async () => {
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
  }, []);

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
      [scheduleId]: { id: scheduleId, notes: [], attachments: [], signatures: [], loading: true },
    }));

    try {
      const [notes, attachments, signatures] = await Promise.all([
        getJobNotes(scheduleId),
        getJobAttachments(scheduleId),
        getJobSignatures(scheduleId),
      ]);
      setExpanded((prev) => ({
        ...prev,
        [scheduleId]: { id: scheduleId, notes, attachments, signatures, loading: false },
      }));
    } catch {
      setExpanded((prev) => ({
        ...prev,
        [scheduleId]: { id: scheduleId, notes: [], attachments: [], signatures: [], loading: false },
      }));
    }
  }

  async function handleAction(schedule: ScheduleWithDetails, action: ActionType) {
    if ((action === 'on_site' || action === 'traveling') && !reworkModal) {
      // Open rework modal first
      setReworkModal({ schedule, targetStatus: action });
      return;
    }

    setActionLoading(schedule.id);
    setError('');

    try {
      let notes: string | undefined;
      if (reworkModal && reworkModal.schedule.id === schedule.id && reworkReason.trim()) {
        notes = `Rework requested: ${reworkReason.trim()}`;
      }
      await updateScheduleStatus(schedule.id, action, notes);
      setReworkModal(null);
      setReworkReason('');
      fetchSchedules();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update status');
    } finally {
      setActionLoading(null);
    }
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
      await updateScheduleStatus(
        reworkModal.schedule.id,
        reworkModal.targetStatus,
        `Rework requested: ${reworkReason.trim()}`,
      );
      setReworkModal(null);
      setReworkReason('');
      fetchSchedules();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to request rework');
    } finally {
      setActionLoading(null);
    }
  }

  const filteredSchedules = filter === 'all'
    ? schedules
    : schedules.filter((s) => s.status === filter);

  function getActionsForStatus(status: string): { status: JobStatus; label: string; color: string }[] {
    if (status === 'completed') {
      return [
        { status: 'office_review', label: 'Move to Office Review', color: 'bg-purple-600 hover:bg-purple-700' },
        { status: 'on_site', label: 'Request Rework', color: 'bg-red-600 hover:bg-red-700' },
      ];
    }
    if (status === 'office_review') {
      return [
        { status: 'closed', label: 'Close Job', color: 'bg-gray-700 hover:bg-gray-800' },
        { status: 'traveling', label: 'Request Rework', color: 'bg-red-600 hover:bg-red-700' },
      ];
    }
    return [];
  }

  function getSignatureStatus(schedule: ScheduleWithDetails, sigs: Signature[]): { label: string; color: string } {
    if (!sigs || sigs.length === 0) {
      return { label: 'No signature', color: 'text-red-600' };
    }
    return { label: `${sigs.length} signature${sigs.length > 1 ? 's' : ''} captured`, color: 'text-green-600' };
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900">Work Review</h1>
              <p className="text-sm text-gray-500">
                {schedules.length} job{schedules.length !== 1 ? 's' : ''} pending review
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Status Filter */}
        <div className="flex gap-2 mb-6">
          {[
            { value: 'all' as const, label: 'All' },
            { value: 'completed' as const, label: 'Completed' },
            { value: 'office_review' as const, label: 'Office Review' },
          ].map((tab) => (
            <button
              key={tab.value}
              onClick={() => setFilter(tab.value)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filter === tab.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

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
        {!loading && !error && filteredSchedules.length === 0 && (
          <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
            <svg className="h-12 w-12 text-gray-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-gray-500 font-medium">No jobs pending review</p>
            <p className="text-sm text-gray-400 mt-1">
              {filter === 'all' ? 'Completed jobs will appear here for review.' : `No ${filter.replace('_', ' ')} jobs.`}
            </p>
          </div>
        )}

        {/* Review Cards */}
        {!loading && filteredSchedules.map((schedule) => {
          const style = STATUS_STYLES[schedule.status] || STATUS_STYLES.completed;
          const expandedData = expanded[schedule.id];
          const actions = getActionsForStatus(schedule.status);
          const techNotes = expandedData?.notes.filter((n) => n.note_type === 'technician') || [];
          const internalNotes = expandedData?.notes.filter((n) => n.note_type === 'internal') || [];
          const isActionLoading = actionLoading === schedule.id;

          return (
            <div key={schedule.id} className={`bg-white rounded-xl border mb-4 ${style.bg}`}>
              {/* Card Header */}
              <button
                onClick={() => toggleExpand(schedule.id)}
                className="w-full text-left p-4 flex items-start justify-between gap-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="text-lg font-semibold text-gray-900 truncate">
                      {schedule.project_name}
                    </h3>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${style.text} bg-white/80`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
                      {style.label}
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
                  {/* Summary badges */}
                  <div className="flex flex-wrap gap-2 mt-2">
                    {schedule.note_count !== undefined && schedule.note_count > 0 && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-blue-50 text-blue-700">
                        📝 {schedule.note_count} note{schedule.note_count !== 1 ? 's' : ''}
                      </span>
                    )}
                    {schedule.attachment_count !== undefined && schedule.attachment_count > 0 && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-green-50 text-green-700">
                        📎 {schedule.attachment_count} attachment{schedule.attachment_count !== 1 ? 's' : ''}
                      </span>
                    )}
                    {schedule.signature_count !== undefined && schedule.signature_count > 0 && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-green-50 text-green-700">
                        ✍️ {schedule.signature_count} signature{schedule.signature_count !== 1 ? 's' : ''}
                      </span>
                    )}
                    {schedule.signature_count !== undefined && schedule.signature_count === 0 && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-red-50 text-red-700">
                        ✍️ No signature
                      </span>
                    )}
                  </div>
                </div>
                <svg
                  className={`h-5 w-5 text-gray-400 mt-1 transition-transform ${expandedData ? 'rotate-180' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Expanded Details */}
              {expandedData && (
                <div className="border-t border-gray-200 px-4 py-4">
                  {expandedData.loading ? (
                    <div className="text-center py-4">
                      <div className="animate-spin h-5 w-5 border-2 border-blue-600 border-t-transparent rounded-full mx-auto" />
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* Technician Notes */}
                      {techNotes.length > 0 && (
                        <div>
                          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Technician Notes</h4>
                          <div className="space-y-2">
                            {techNotes.map((note) => (
                              <div key={note.id} className="bg-gray-50 rounded-lg px-3 py-2">
                                <p className="text-sm text-gray-700">{note.content}</p>
                                <p className="text-xs text-gray-400 mt-1">
                                  {note.user_name} · {new Date(note.created_at).toLocaleString()}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Internal Notes */}
                      {internalNotes.length > 0 && (
                        <div>
                          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Internal Notes</h4>
                          <div className="space-y-2">
                            {internalNotes.map((note) => (
                              <div key={note.id} className="bg-amber-50 rounded-lg px-3 py-2">
                                <p className="text-sm text-gray-700">{note.content}</p>
                                <p className="text-xs text-gray-400 mt-1">
                                  {note.user_name} · {new Date(note.created_at).toLocaleString()}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* No notes */}
                      {techNotes.length === 0 && internalNotes.length === 0 && (
                        <p className="text-sm text-gray-400">No notes recorded for this job.</p>
                      )}

                      {/* Attachments */}
                      {expandedData.attachments.length > 0 && (
                        <div>
                          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                            Attachments ({expandedData.attachments.length})
                          </h4>
                          <div className="flex flex-wrap gap-2">
                            {expandedData.attachments.map((att) => (
                              <div
                                key={att.id}
                                className="bg-gray-50 rounded-lg px-3 py-2 text-sm text-gray-700 flex items-center gap-2"
                              >
                                <span>📎</span>
                                <span className="truncate max-w-[200px]">{att.file_name}</span>
                                <span className="text-xs text-gray-400">
                                  {att.attachment_type} · {(att.file_size / 1024).toFixed(0)} KB
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Signatures */}
                      {expandedData.signatures.length > 0 && (
                        <div>
                          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Signatures</h4>
                          <div className="space-y-2">
                            {expandedData.signatures.map((sig) => (
                              <div key={sig.id} className="bg-gray-50 rounded-lg px-3 py-2 flex items-center justify-between">
                                <div>
                                  <p className="text-sm font-medium text-gray-700">{sig.label}</p>
                                  <p className="text-xs text-gray-400">
                                    {sig.user_name} · {new Date(sig.created_at).toLocaleString()}
                                  </p>
                                </div>
                                <svg className="h-6 w-6 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* No attachments or signatures */}
                      {expandedData.attachments.length === 0 && expandedData.signatures.length === 0 && (
                        <p className="text-sm text-gray-400">No attachments or signatures.</p>
                      )}

                      {/* Action Buttons */}
                      <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-200">
                        {actions.map((action) => (
                          <button
                            key={action.status}
                            onClick={() => handleAction(schedule, action.status as ActionType)}
                            disabled={isActionLoading}
                            className={`px-4 py-2 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${action.color}`}
                          >
                            {isActionLoading ? 'Processing...' : action.label}
                          </button>
                        ))}
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
              This will move &#34;{reworkModal.schedule.project_name}&#34; from{' '}
              <strong>{reworkModal.schedule.status.replace('_', ' ')}</strong> to{' '}
              <strong>{reworkModal.targetStatus.replace('_', ' ')}</strong>.
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
                onClick={() => {
                  setReworkModal(null);
                  setReworkReason('');
                }}
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
    </div>
  );
}
