'use client';

import { useRouter } from 'next/navigation';
import { Spinner } from '@fieldconnect/ui';
import {
  getSchedule,
  updateScheduleStatus,
  getJobNotes,
  addJobNote,
  getJobAttachments,
  uploadJobAttachment,
  deleteJobAttachment,
  getJobSignatures,
  addJobSignature,
} from '@/lib/api';
import type {
  ScheduleWithDetails,
  JobStatus,
  JobNote,
  JobAttachment,
  Signature,
} from '@fieldconnect/shared';
import { useState, useEffect, useCallback, useRef } from 'react';
import { SignatureCanvas } from './SignatureCanvas';
import { useSocket } from '@/hooks/useSocket';
import { useOfflineSync } from '@/hooks/useOfflineSync';

interface JobDetailClientProps {
  scheduleId: string;
}

const STATUS_CONFIG: Record<
  string,
  { bg: string; text: string; label: string; step: number }
> = {
  scheduled: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'Scheduled', step: 0 },
  traveling: { bg: 'bg-amber-100', text: 'text-amber-800', label: 'Traveling', step: 1 },
  on_site: { bg: 'bg-green-100', text: 'text-green-800', label: 'On Site', step: 2 },
  completed: { bg: 'bg-gray-100', text: 'text-gray-700', label: 'Completed', step: 3 },
  office_review: { bg: 'bg-purple-100', text: 'text-purple-800', label: 'Office Review', step: 4 },
  closed: { bg: 'bg-gray-200', text: 'text-gray-600', label: 'Closed', step: 5 },
};

const STATUS_STEPS = ['scheduled', 'traveling', 'on_site', 'completed', 'office_review', 'closed'];

const NEXT_STATUS: Record<string, { status: JobStatus; label: string; color: string; confirm: string } | null> = {
  scheduled: { status: 'traveling', label: 'Start Traveling', color: 'bg-blue-600', confirm: 'Start traveling to this job?' },
  traveling: { status: 'on_site', label: 'Arrived On Site', color: 'bg-green-600', confirm: 'Mark yourself as on site?' },
  on_site: { status: 'completed', label: 'Mark Complete', color: 'bg-blue-600', confirm: 'Mark this job as completed?' },
  completed: null,
  office_review: null,
  closed: null,
};

const ATTACHMENT_LABELS: Record<string, string> = {
  before: 'Before',
  during: 'During',
  after: 'After',
  document: 'Document',
};

const ATTACHMENT_COLORS: Record<string, string> = {
  before: 'bg-blue-100 text-blue-700',
  during: 'bg-amber-100 text-amber-700',
  after: 'bg-green-100 text-green-700',
  document: 'bg-gray-100 text-gray-700',
};

function formatTime(time: string | null): string {
  if (!time) return '';
  const [h, m] = time.split(':');
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;
  return `${hour12}:${m} ${ampm}`;
}

function formatDate(date: string): string {
  const d = new Date(date + 'T00:00:00');
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getUploadUrl(filePath: string): string {
  return `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/uploads/${filePath}`;
}

export function JobDetailClient({ scheduleId }: JobDetailClientProps) {
  const router = useRouter();
  const [schedule, setSchedule] = useState<ScheduleWithDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [transitioning, setTransitioning] = useState(false);
  const [confirmStatus, setConfirmStatus] = useState<JobStatus | null>(null);

  // Field data state
  const [notes, setNotes] = useState<JobNote[]>([]);
  const [attachments, setAttachments] = useState<JobAttachment[]>([]);
  const [signatures, setSignatures] = useState<Signature[]>([]);
  const [newNote, setNewNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [showSignaturePad, setShowSignaturePad] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedAttachmentType, setSelectedAttachmentType] = useState<string>('during');

  // ─── Offline Sync ────────────────────────────────────────────────────────
  const {
    isOnline,
    pendingCount,
    isSyncing,
    enqueueStatusTransition,
    enqueueNote,
    enqueuePhoto,
    enqueueSignature,
    processQueue,
  } = useOfflineSync();
  const [offlineToast, setOfflineToast] = useState('');

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const [scheduleData, notesData, attachmentsData, signaturesData] = await Promise.all([
        getSchedule(scheduleId),
        getJobNotes(scheduleId),
        getJobAttachments(scheduleId),
        getJobSignatures(scheduleId),
      ]);
      setSchedule(scheduleData);
      setNotes(notesData);
      setAttachments(attachmentsData);
      setSignatures(signaturesData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load job details');
    } finally {
      setLoading(false);
    }
  }, [scheduleId]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // ─── Socket Event Subscriptions ─────────────────────────────────────────
  const { onJobUpdate, onNoteAdded, onAttachmentUpdate, onSignatureCaptured } = useSocket();

  useEffect(() => {
    // Refetch when a job update event arrives for this schedule
    const unsubJob = onJobUpdate((event) => {
      if (event.schedule_id === scheduleId) {
        fetchAll();
      }
    });
    // Refetch when a note is added to this schedule
    const unsubNote = onNoteAdded((event) => {
      if (event.schedule_id === scheduleId) {
        getJobNotes(scheduleId).then(setNotes).catch(() => {});
      }
    });
    // Refetch when an attachment is uploaded/deleted for this schedule
    const unsubAttachment = onAttachmentUpdate((event) => {
      if (event.schedule_id === scheduleId) {
        getJobAttachments(scheduleId).then(setAttachments).catch(() => {});
      }
    });
    // Refetch when a signature is captured for this schedule
    const unsubSignature = onSignatureCaptured((event) => {
      if (event.schedule_id === scheduleId) {
        getJobSignatures(scheduleId).then(setSignatures).catch(() => {});
      }
    });

    return () => {
      unsubJob();
      unsubNote();
      unsubAttachment();
      unsubSignature();
    };
  }, [scheduleId, fetchAll, onJobUpdate, onNoteAdded, onAttachmentUpdate, onSignatureCaptured]);

  async function handleStatusTransition(newStatus: JobStatus) {
    setTransitioning(true);
    setConfirmStatus(null);

    if (!isOnline) {
      try {
        await enqueueStatusTransition(scheduleId, newStatus);
        // Optimistically update local state
        if (schedule) {
          setSchedule({ ...schedule, status: newStatus });
        }
        setOfflineToast('Status change saved offline — will sync when connected');
        setTimeout(() => setOfflineToast(''), 3000);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to queue status change');
      } finally {
        setTransitioning(false);
      }
      return;
    }

    try {
      await updateScheduleStatus(scheduleId, newStatus);
      await fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update status');
    } finally {
      setTransitioning(false);
    }
  }

  async function handleAddNote() {
    if (!newNote.trim()) return;
    setSaving(true);

    if (!isOnline) {
      try {
        await enqueueNote(scheduleId, newNote.trim(), 'technician');
        // Optimistically add to local notes list
        const optimisticNote: JobNote = {
          id: `offline-${Date.now()}`,
          schedule_id: scheduleId,
          user_id: '',
          user_name: 'You (offline)',
          content: newNote.trim(),
          note_type: 'technician',
          created_at: new Date().toISOString(),
        };
        setNotes((prev) => [...prev, optimisticNote]);
        setNewNote('');
        setOfflineToast('Note saved offline — will sync when connected');
        setTimeout(() => setOfflineToast(''), 3000);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to queue note');
      } finally {
        setSaving(false);
      }
      return;
    }

    try {
      await addJobNote(scheduleId, { content: newNote.trim(), note_type: 'technician' });
      setNewNote('');
      const updated = await getJobNotes(scheduleId);
      setNotes(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add note');
    } finally {
      setSaving(false);
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Offline upload handling
    if (!isOnline) {
      // Check size limit for offline queue (10 MB)
      const MAX_OFFLINE_BYTES = 10 * 1024 * 1024;
      if (file.size > MAX_OFFLINE_BYTES) {
        setError(`Photo is too large for offline upload (${(file.size / (1024 * 1024)).toFixed(1)} MB). Max is 10 MB. Try uploading when online.`);
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }

      setUploading(true);
      try {
        let uploadFile = file;
        if (file.type.startsWith('image/')) {
          try {
            uploadFile = await compressImage(file, 1200, 0.8);
          } catch {
            // Fall back to original if compression fails
          }
        }

        await enqueuePhoto(scheduleId, uploadFile, selectedAttachmentType as any);
        // Optimistically add to local attachments list
        const optimisticAttachment: JobAttachment = {
          id: `offline-${Date.now()}`,
          schedule_id: scheduleId,
          user_id: '',
          user_name: 'You (offline — pending sync)',
          file_name: uploadFile.name,
          file_path: '',
          mime_type: uploadFile.type || 'image/jpeg',
          file_size: uploadFile.size,
          attachment_type: selectedAttachmentType as any,
          created_at: new Date().toISOString(),
        };
        setAttachments((prev) => [...prev, optimisticAttachment]);
        setOfflineToast('Photo saved offline — will sync when connected');
        setTimeout(() => setOfflineToast(''), 3000);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to queue photo');
      } finally {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
      return;
    }

    // Client-side compression for images (online path)
    let uploadFile = file;
    if (file.type.startsWith('image/')) {
      try {
        uploadFile = await compressImage(file, 1200, 0.8);
      } catch {
        // Fall back to original if compression fails
      }
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', uploadFile);
      formData.append('attachment_type', selectedAttachmentType);
      await uploadJobAttachment(scheduleId, formData);
      const updated = await getJobAttachments(scheduleId);
      setAttachments(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload file');
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }

  async function handleDeleteAttachment(attachmentId: string) {
    if (!confirm('Delete this attachment?')) return;
    try {
      await deleteJobAttachment(scheduleId, attachmentId);
      const updated = await getJobAttachments(scheduleId);
      setAttachments(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete attachment');
    }
  }

  async function handleSignatureSave(dataUrl: string) {
    setSaving(true);

    if (!isOnline) {
      try {
        await enqueueSignature(scheduleId, dataUrl);
        // Optimistically add to local signatures list
        const optimisticSignature: Signature = {
          id: `offline-${Date.now()}`,
          schedule_id: scheduleId,
          user_id: '',
          user_name: 'You (offline — pending sync)',
          signature_data: dataUrl,
          label: 'customer',
          created_at: new Date().toISOString(),
        };
        setSignatures((prev) => [...prev, optimisticSignature]);
        setShowSignaturePad(false);
        setOfflineToast('Signature saved offline — will sync when connected');
        setTimeout(() => setOfflineToast(''), 3000);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to queue signature');
      } finally {
        setSaving(false);
      }
      return;
    }

    try {
      await addJobSignature(scheduleId, { signature_data: dataUrl });
      setShowSignaturePad(false);
      const updated = await getJobSignatures(scheduleId);
      setSignatures(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save signature');
    } finally {
      setSaving(false);
    }
  }

  function handleStartNavigation() {
    if (!schedule?.project_address) return;
    const encoded = encodeURIComponent(schedule.project_address);
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const url = isIOS
      ? `maps://?daddr=${encoded}`
      : `https://www.google.com/maps/dir/?api=1&destination=${encoded}`;
    window.open(url, '_blank');
  }

  function handleContactCustomer() {
    if (!schedule?.project_contact_phone) return;
    window.open(`tel:${schedule.project_contact_phone}`, '_blank');
  }

  const nextAction = schedule ? NEXT_STATUS[schedule.status] : null;

  // ─── Compress Image Client-Side ──────────────────────────────────────────
  async function compressImage(
    file: File,
    maxDimension: number,
    quality: number,
  ): Promise<File> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDimension || height > maxDimension) {
          const ratio = Math.min(maxDimension / width, maxDimension / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(new File([blob], file.name, { type: 'image/jpeg' }));
            } else {
              reject(new Error('Compression failed'));
            }
          },
          'image/jpeg',
          quality,
        );
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = URL.createObjectURL(file);
    });
  }

  // ─── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <Spinner size="lg" />
        <p className="text-sm text-gray-500 mt-3">Loading job details...</p>
      </div>
    );
  }

  // ─── Error ────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="px-4 py-8">
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
          <p className="text-red-700 text-sm mb-3">{error}</p>
          <button
            onClick={fetchAll}
            className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // ─── Not Found ────────────────────────────────────────────────────────────
  if (!schedule) {
    return (
      <div className="px-4 py-8">
        <div className="text-center py-16">
          <h3 className="text-lg font-semibold text-gray-500 mb-1">Job Not Found</h3>
          <p className="text-sm text-gray-400 mb-4">
            This job may have been removed or you do not have access.
          </p>
          <button
            onClick={() => router.push('/jobs')}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium"
          >
            Back to Jobs
          </button>
        </div>
      </div>
    );
  }

  const statusConfig = STATUS_CONFIG[schedule.status] || STATUS_CONFIG.scheduled;
  const currentStep = statusConfig.step;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Signature Canvas Overlay */}
      {showSignaturePad && (
        <SignatureCanvas
          onSave={handleSignatureSave}
          onCancel={() => setShowSignaturePad(false)}
          saving={saving}
        />
      )}

      {/* Offline Toast */}
      {offlineToast && (
        <div className="fixed top-4 left-4 right-4 z-50 max-w-md mx-auto">
          <div className="bg-blue-600 text-white px-4 py-3 rounded-xl shadow-lg text-sm font-medium text-center">
            {offlineToast}
          </div>
        </div>
      )}

      {/* Pending Sync Badge */}
      {!isOnline && pendingCount > 0 && (
        <div className="fixed top-4 left-4 right-4 z-50 max-w-md mx-auto mt-14">
          <div className="bg-amber-50 border border-amber-200 text-amber-700 px-4 py-2 rounded-xl shadow text-sm font-medium text-center">
            {pendingCount} action{pendingCount !== 1 ? 's' : ''} pending sync
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 pt-12 pb-4">
        <button
          onClick={() => router.back()}
          className="text-blue-600 font-medium text-sm flex items-center gap-1 mb-3"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
        <h1 className="text-xl font-bold text-gray-900">{schedule.project_name}</h1>
        <div className="flex items-center gap-2 mt-2">
          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusConfig.bg} ${statusConfig.text}`}
          >
            {statusConfig.label}
          </span>
          <span className="text-sm text-gray-500">
            {formatDate(schedule.scheduled_date)}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 px-4 py-4 space-y-4">
        {/* Time Range */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Time
          </h2>
          {schedule.start_time ? (
            <p className="text-base font-medium text-gray-900">
              {formatTime(schedule.start_time)}
              {schedule.end_time ? ` — ${formatTime(schedule.end_time)}` : ''}
            </p>
          ) : (
            <p className="text-sm text-gray-400 italic">No time set</p>
          )}
        </div>

        {/* Address */}
        {schedule.project_address && (
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Address
            </h2>
            <p className="text-base font-medium text-gray-900">
              {schedule.project_address}
            </p>
          </div>
        )}

        {/* Contact */}
        {schedule.project_contact_name && (
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Contact
            </h2>
            <p className="text-sm text-gray-500 text-xs font-medium">Contact Person</p>
            <p className="text-base font-medium text-gray-900 mb-2">
              {schedule.project_contact_name}
            </p>
            {schedule.project_contact_phone && (
              <>
                <p className="text-sm text-gray-500 text-xs font-medium">Mobile</p>
                <p className="text-sm text-gray-700">
                  {schedule.project_contact_phone}
                </p>
              </>
            )}
          </div>
        )}

        {/* Schedule Notes */}
        {schedule.notes && (
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Notes
            </h2>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{schedule.notes}</p>
          </div>
        )}

        {/* Status Progress Stepper */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
            Progress
          </h2>
          <div className="space-y-0">
            {STATUS_STEPS.map((status, index) => {
              const cfg = STATUS_CONFIG[status];
              const isComplete = index <= currentStep;
              const isCurrent = index === currentStep;
              return (
                <div key={status} className="flex items-start gap-3">
                  <div className="flex flex-col items-center">
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border-2 ${
                        isComplete
                          ? 'bg-blue-600 border-blue-600 text-white'
                          : 'bg-white border-gray-300 text-gray-400'
                      } ${isCurrent ? 'ring-2 ring-blue-300' : ''}`}
                    >
                      {isComplete && index < currentStep ? '✓' : index + 1}
                    </div>
                    {index < STATUS_STEPS.length - 1 && (
                      <div
                        className={`w-0.5 h-6 ${
                          index < currentStep ? 'bg-blue-600' : 'bg-gray-200'
                        }`}
                      />
                    )}
                  </div>
                  <div className={`pb-5 ${index < currentStep ? 'text-gray-500' : index === currentStep ? 'text-blue-700 font-medium' : 'text-gray-400'}`}>
                    <span className="text-sm">{cfg.label}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ─── Technician Notes Section ─────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Technician Notes
          </h2>

          {/* Note Input */}
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder="Add a note..."
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleAddNote();
                }
              }}
              disabled={saving}
            />
            <button
              onClick={handleAddNote}
              disabled={!newNote.trim() || saving}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed active:bg-blue-700 transition-colors"
            >
              {saving ? '...' : 'Add'}
            </button>
          </div>

          {/* Notes List */}
          {notes.length === 0 ? (
            <p className="text-sm text-gray-400 italic">No notes yet</p>
          ) : (
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {notes.map((note) => (
                <div key={note.id} className="border-l-2 border-blue-300 pl-3">
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{note.content}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {note.user_name} • {formatDateTime(note.created_at)}
                    {note.id.startsWith('offline-') && (
                      <span className="ml-2 text-amber-600 font-medium">(pending sync)</span>
                    )}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ─── Photos Section ──────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Photos & Attachments
          </h2>

          {/* Upload controls */}
          <div className="flex gap-2 mb-4">
            <select
              value={selectedAttachmentType}
              onChange={(e) => setSelectedAttachmentType(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={uploading}
            >
              <option value="before">Before</option>
              <option value="during">During</option>
              <option value="after">After</option>
              <option value="document">Document</option>
            </select>
            <label className="flex-1">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFileUpload}
                className="hidden"
                disabled={uploading}
              />
              <div className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium active:bg-blue-700 transition-colors cursor-pointer disabled:opacity-50">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                {uploading ? 'Uploading...' : 'Add Photo'}
              </div>
            </label>
          </div>

          {/* Attachments Grid */}
          {attachments.length === 0 ? (
            <p className="text-sm text-gray-400 italic">No photos or attachments yet</p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {attachments.map((att) => (
                <div key={att.id} className="border border-gray-200 rounded-xl overflow-hidden">
                  {att.mime_type.startsWith('image/') ? (
                    <div className="relative">
                      <img
                        src={att.id.startsWith('offline-') ? att.file_path || '' : getUploadUrl(att.file_path)}
                        alt={att.file_name}
                        className="w-full h-32 object-cover"
                        loading="lazy"
                      />
                      <button
                        onClick={() => handleDeleteAttachment(att.id)}
                        className="absolute top-1 right-1 w-6 h-6 bg-black/50 rounded-full flex items-center justify-center text-white text-xs hover:bg-black/70 transition-colors"
                        title="Delete"
                      >
                        &times;
                      </button>
                      {att.id.startsWith('offline-') && (
                        <div className="absolute bottom-1 left-1 bg-amber-500 text-white text-xs px-1.5 py-0.5 rounded">
                          Pending
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="p-3 text-center">
                      <p className="text-xs text-gray-700 truncate">{att.file_name}</p>
                      <p className="text-xs text-gray-400">{formatFileSize(att.file_size)}</p>
                    </div>
                  )}
                  <div className="px-2 py-1 flex items-center justify-between bg-gray-50">
                    <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${ATTACHMENT_COLORS[att.attachment_type] || ATTACHMENT_COLORS.document}`}>
                      {ATTACHMENT_LABELS[att.attachment_type] || 'Document'}
                    </span>
                    <span className="text-xs text-gray-400">{att.user_name?.split(' ')[0]}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ─── Signatures Section ──────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Signatures
          </h2>

          <button
            onClick={() => setShowSignaturePad(true)}
            className="w-full mb-4 px-4 py-3 border-2 border-dashed border-gray-300 text-gray-500 rounded-xl text-sm font-medium active:bg-gray-50 transition-colors hover:border-blue-400 hover:text-blue-600"
          >
            <svg className="h-5 w-5 inline mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
            Capture Signature
          </button>

          {signatures.length === 0 ? (
            <p className="text-sm text-gray-400 italic">No signatures yet</p>
          ) : (
            <div className="space-y-3">
              {signatures.map((sig) => (
                <div key={sig.id} className="border border-gray-200 rounded-xl p-3">
                  <img
                    src={sig.signature_data}
                    alt={`Signature (${sig.label})`}
                    className="w-full h-16 object-contain bg-white"
                  />
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-gray-500 capitalize">{sig.label}</span>
                    <span className="text-xs text-gray-400">
                      {sig.user_name} • {formatDateTime(sig.created_at)}
                      {sig.id.startsWith('offline-') && (
                        <span className="ml-2 text-amber-600 font-medium">(pending sync)</span>
                      )}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Confirmation Dialog Overlay */}
      {confirmStatus && (
        <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50">
          <div className="bg-white rounded-t-2xl w-full max-w-md mx-auto px-6 pt-6 pb-10">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Confirm Status Change
            </h3>
            <p className="text-sm text-gray-600 mb-6">
              {NEXT_STATUS[schedule.status]?.confirm || 'Update job status?'}
            </p>
            <div className="space-y-3">
              <button
                onClick={() => handleStatusTransition(confirmStatus)}
                disabled={transitioning}
                className="w-full bg-blue-600 text-white rounded-xl py-4 text-base font-semibold shadow-lg active:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {transitioning ? 'Updating...' : `Yes, ${NEXT_STATUS[schedule.status]?.label || 'Update'}`}
              </button>
              <button
                onClick={() => setConfirmStatus(null)}
                disabled={transitioning}
                className="w-full bg-white border border-gray-300 text-gray-700 rounded-xl py-4 text-base font-semibold active:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="sticky bottom-0 bg-white border-t border-gray-200 px-4 py-4 space-y-3">
        {nextAction && nextAction.status === 'completed' && schedule.status === 'on_site' && (
          <button
            onClick={() => setConfirmStatus(nextAction.status)}
            disabled={transitioning}
            className={`w-full ${nextAction.color} text-white rounded-xl py-4 text-base font-semibold shadow-lg active:opacity-90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2`}
          >
            {transitioning ? (
              <>
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Updating...
              </>
            ) : (
              <>
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                {nextAction.label}
              </>
            )}
          </button>
        )}

        {nextAction && nextAction.status !== 'completed' && (
          <button
            onClick={() => setConfirmStatus(nextAction.status)}
            disabled={transitioning}
            className={`w-full ${nextAction.color} text-white rounded-xl py-4 text-base font-semibold shadow-lg active:opacity-90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {transitioning ? 'Updating...' : nextAction.label}
          </button>
        )}

        {schedule.status === 'completed' && (
          <div className="w-full bg-purple-50 border border-purple-200 text-purple-700 rounded-xl py-4 text-base font-semibold text-center">
            Awaiting Office Review
          </div>
        )}

        {schedule.project_address && schedule.status !== 'completed' && schedule.status !== 'office_review' && schedule.status !== 'closed' && (
          <button
            onClick={handleStartNavigation}
            className="w-full bg-blue-600 text-white rounded-xl py-4 text-base font-semibold shadow-lg active:bg-blue-700 transition-colors flex items-center justify-center gap-2"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
            Start Navigation
          </button>
        )}

        {schedule.project_contact_phone && (
          <button
            onClick={handleContactCustomer}
            className="w-full bg-white border-2 border-blue-600 text-blue-700 rounded-xl py-4 text-base font-semibold active:bg-blue-50 transition-colors flex items-center justify-center gap-2"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
            Contact Customer
          </button>
        )}
      </div>
    </div>
  );
}
