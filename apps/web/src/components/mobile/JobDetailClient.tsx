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
  getReworkRequests,
  resumeRework,
  completeRework,
  clockIn,
  clockOut,
  getCurrentEntry,
} from '@/lib/api';
import type {
  ScheduleWithDetails,
  JobStatus,
  JobNote,
  JobAttachment,
  Signature,
  GeofenceStatus,
  ReworkRequest,
  TechnicianWorkflowStatus,
  ActiveTimeEntry,
} from '@fieldconnect/shared';
import {
  calculateDistance,
  evaluateGeofence,
  formatDistance,
} from '@fieldconnect/shared';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSession } from 'next-auth/react';
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
  scheduled: { bg: 'bg-brand-100', text: 'text-brand-800', label: 'Scheduled', step: 0 },
  traveling: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'Traveling', step: 1 },
  on_site: { bg: 'bg-green-100', text: 'text-green-800', label: 'On Site', step: 2 },
  completed: { bg: 'bg-gray-100', text: 'text-gray-700', label: 'Work Completed', step: 3 },
  rework_required: { bg: 'bg-red-100', text: 'text-red-800', label: 'Rework Required', step: 3 },
  closed: { bg: 'bg-gray-200', text: 'text-gray-600', label: 'Closed', step: 5 },
};

const STATUS_STEPS = ['scheduled', 'traveling', 'on_site', 'completed', 'rework_required', 'closed'];

const NEXT_STATUS: Record<string, { status: JobStatus; label: string; color: string; confirm: string } | null> = {
  scheduled: { status: 'traveling', label: 'Start Traveling', color: 'bg-brand-600', confirm: 'Start traveling to this job?' },
  traveling: { status: 'on_site', label: 'Arrived On Site', color: 'bg-green-600', confirm: 'Mark yourself as on site?' },
  on_site: { status: 'completed', label: 'Mark Complete', color: 'bg-brand-600', confirm: 'Mark this job as completed?' },
  completed: null,
  rework_required: null, // Handled separately with Resume Work button
  closed: null,
};

const ATTACHMENT_LABELS: Record<string, string> = {
  before: 'Before',
  during: 'During',
  after: 'After',
  document: 'Document',
};

const ATTACHMENT_COLORS: Record<string, string> = {
  before: 'bg-brand-100 text-brand-700',
  during: 'bg-blue-100 text-blue-700',
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

function getAttachmentUrl(att: JobAttachment): string {
  return att.secure_url || (att.file_path ? getUploadUrl(att.file_path) : '');
}

export function JobDetailClient({ scheduleId }: JobDetailClientProps) {
  const { data: session } = useSession();
  const router = useRouter();
  const [schedule, setSchedule] = useState<ScheduleWithDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [transitioning, setTransitioning] = useState(false);
  const [confirmStatus, setConfirmStatus] = useState<JobStatus | null>(null);

  // ─── Current technician's workflow status ──────────────────────────────
  const myWorkflow = useMemo<TechnicianWorkflowStatus | null>(() => {
    if (!schedule || !session?.user?.id) return null;
    return schedule.technician_workflow?.find(
      (tw) => tw.technician_id === session.user.id
    ) ?? null;
  }, [schedule, session?.user?.id]);

  // Resolved per-technician status (or derived schedule status as fallback)
  const myStatus: JobStatus = myWorkflow?.status ?? schedule?.status ?? 'scheduled';
  const myTechnicianId = session?.user?.id;

  // Field data state
  const [notes, setNotes] = useState<JobNote[]>([]);
  const [attachments, setAttachments] = useState<JobAttachment[]>([]);
  const [signatures, setSignatures] = useState<Signature[]>([]);
  const [reworkRequests, setReworkRequests] = useState<ReworkRequest[]>([]);
  const [newNote, setNewNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [showSignaturePad, setShowSignaturePad] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedAttachmentType, setSelectedAttachmentType] = useState<string>('before');
  const selectedAttachmentTypeRef = useRef<string>('before');
  const [showMissingDocsModal, setShowMissingDocsModal] = useState(false);

  // ─── Time Entry State (merged workflow) ────────────────────────────────────
  const [activeTimeEntry, setActiveTimeEntry] = useState<ActiveTimeEntry | null>(null);
  const [timeEntryLoading, setTimeEntryLoading] = useState(false);
  const [showClockOutPrompt, setShowClockOutPrompt] = useState(false);

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
      const [scheduleData, notesData, attachmentsData, signaturesData, reworkData] = await Promise.all([
        getSchedule(scheduleId),
        getJobNotes(scheduleId),
        getJobAttachments(scheduleId),
        getJobSignatures(scheduleId),
        getReworkRequests(scheduleId).catch(() => [] as ReworkRequest[]),
      ]);
      setSchedule(scheduleData);

      // Filter evidence to only show the current technician's own submissions
      const currentUserId = session?.user?.id;
      if (currentUserId) {
        setNotes((notesData || []).filter((n) => ownsEvidence(n, currentUserId)));
        setAttachments((attachmentsData || []).filter((a) => ownsEvidence(a, currentUserId)));
        setSignatures((signaturesData || []).filter((s) => ownsEvidence(s, currentUserId)));
      } else {
        setNotes(notesData);
        setAttachments(attachmentsData);
        setSignatures(signaturesData);
      }
      setReworkRequests(reworkData);

      // Best-effort: fetch current time entry for merged workflow
      try {
        const entry = await getCurrentEntry();
        setActiveTimeEntry(entry);
      } catch {
        // Non-critical — time entry state is best-effort
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load job details');
    } finally {
      setLoading(false);
    }
  }, [scheduleId, session?.user?.id]);

  /** Check whether evidence belongs to the current user (by technician_id if set, else user_id) */
  function ownsEvidence(item: { technician_id?: string | null; user_id: string }, userId: string): boolean {
    return item.technician_id != null ? item.technician_id === userId : item.user_id === userId;
  }

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
        getJobNotes(scheduleId).then((data) => {
          const uid = session?.user?.id;
          setNotes(uid ? data.filter((n) => n.technician_id ? n.technician_id === uid : n.user_id === uid) : data);
        }).catch(() => {});
      }
    });
    // Refetch when an attachment is uploaded/deleted for this schedule
    const unsubAttachment = onAttachmentUpdate((event) => {
      if (event.schedule_id === scheduleId) {
        getJobAttachments(scheduleId).then((data) => {
          const uid = session?.user?.id;
          setAttachments(uid ? data.filter((a) => a.technician_id ? a.technician_id === uid : a.user_id === uid) : data);
        }).catch(() => {});
      }
    });
    // Refetch when a signature is captured for this schedule
    const unsubSignature = onSignatureCaptured((event) => {
      if (event.schedule_id === scheduleId) {
        getJobSignatures(scheduleId).then((data) => {
          const uid = session?.user?.id;
          setSignatures(uid ? data.filter((s) => s.technician_id ? s.technician_id === uid : s.user_id === uid) : data);
        }).catch(() => {});
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

    // ─── Auto clock-in on "Arrived On Site" ─────────────────────────────
    if (newStatus === 'on_site') {
      if (!schedule) {
        setError('Schedule data not loaded');
        setTransitioning(false);
        return;
      }
      const isForThisProject = activeTimeEntry?.project_id === schedule.project_id;

      if (!activeTimeEntry) {
        // No active entry — auto-clock-in to this project.
        // clockIn() and getCurrentEntry() are intentionally separated so
        // that a non-critical getCurrentEntry() failure does NOT abort
        // the subsequent updateScheduleStatus() call.
        let clockInSucceeded = false;
        try {
          const pos = await captureGps();
          await clockIn(
            schedule.project_id,
            'Auto clock-in on arrival',
            pos?.lat,
            pos?.lng,
            pos?.accuracy,
          );
          clockInSucceeded = true;
          // Best-effort: refetch to get authoritative time entry
          // (non-critical — clock-in succeeded, proceed regardless)
          try {
            const entry = await getCurrentEntry();
            setActiveTimeEntry(entry);
          } catch {
            // Non-critical — clock-in already succeeded; time entry state
            // will catch up on the next fetchAll() call
          }
        } catch (clockErr) {
          setError(
            clockErr instanceof Error
              ? `Clock-in failed: ${clockErr.message}. Please clock in manually before proceeding.`
              : 'Clock-in failed. Please clock in manually before proceeding.',
          );
          setTransitioning(false);
          return;
        }
        if (!clockInSucceeded) return; // safety guard
      } else if (!isForThisProject) {
        // Active entry for a different project — warn
        setError(
          'You are already clocked into a different project. Please clock out first.',
        );
        setTransitioning(false);
        return;
      }
      // isForThisProject === true: already clocked in — proceed with status change
    }

    // ─── Guard: require active time entry before "completed" ─────────────
    if (newStatus === 'completed') {
      const isForThisSchedule = activeTimeEntry?.project_id === schedule?.project_id;
      if (!activeTimeEntry || !isForThisSchedule) {
        setError(
          'You must clock in before completing this job. Please clock in first.',
        );
        setTransitioning(false);
        return;
      }
    }

    try {
      await updateScheduleStatus(scheduleId, newStatus, undefined, myTechnicianId);
      await fetchAll();

      // ─── Show clock-out prompt after "Mark Complete" ───────────────
      if (newStatus === 'completed') {
        setShowClockOutPrompt(true);
      }
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
          rework_version: 0,
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

  /** Capture GPS position — best-effort, degrades gracefully */
  async function captureGps(): Promise<{ lat: number; lng: number; accuracy: number } | null> {
    if (!navigator.geolocation) return null;
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 8000,
          maximumAge: 30000,
        });
      });
      return {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: Math.round(pos.coords.accuracy),
      };
    } catch {
      return null;
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Capture GPS for photo evidence (best-effort, runs in parallel with compression)
    const gps = await captureGps();
    const gpsPayload = gps
      ? { ...gps, capturedAt: new Date().toISOString() }
      : undefined;

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

        await enqueuePhoto(
          scheduleId,
          uploadFile,
          selectedAttachmentTypeRef.current as any,
          gpsPayload,
        );
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
          attachment_type: selectedAttachmentTypeRef.current as any,
          rework_version: 0,
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
      await uploadJobAttachment(scheduleId, formData, selectedAttachmentTypeRef.current, gpsPayload);
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

  async function handleDocumentUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!isOnline) {
      setUploading(true);
      try {
        if (file.size > 10 * 1024 * 1024) {
          setError('Document is too large for offline upload. Max is 10 MB.');
          if (e.target) e.target.value = '';
          return;
        }
        await enqueuePhoto(scheduleId, file, 'document');
        const optimisticAttachment: JobAttachment = {
          id: `offline-${Date.now()}`,
          schedule_id: scheduleId,
          user_id: '',
          user_name: 'You (offline — pending sync)',
          file_name: file.name,
          file_path: '',
          mime_type: file.type || 'application/octet-stream',
          file_size: file.size,
          attachment_type: 'document',
          rework_version: 0,
          created_at: new Date().toISOString(),
        };
        setAttachments((prev) => [...prev, optimisticAttachment]);
        setOfflineToast('Document saved offline — will sync when connected');
        setTimeout(() => setOfflineToast(''), 3000);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to queue document');
      } finally {
        setUploading(false);
        if (e.target) e.target.value = '';
      }
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      await uploadJobAttachment(scheduleId, formData, 'document');
      const updated = await getJobAttachments(scheduleId);
      setAttachments(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload document');
    } finally {
      setUploading(false);
      if (e.target) e.target.value = '';
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
          rework_version: 0,
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
    const s = schedule;
    if (!s) return;
    // Prefer stored coordinates over the address string for accuracy
    const destLat = s.project_latitude;
    const destLng = s.project_longitude;
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

    if (destLat != null && destLng != null) {
      const url = isIOS
        ? `maps://?daddr=${destLat},${destLng}`
        : `https://www.google.com/maps/dir/?api=1&destination=${destLat},${destLng}`;
      window.open(url, '_blank');
      return;
    }

    // Fallback to the address string if no coordinates are stored
    if (!s.project_address) return;
    const encoded = encodeURIComponent(s.project_address);
    const url = isIOS
      ? `maps://?daddr=${encoded}`
      : `https://www.google.com/maps/dir/?api=1&destination=${encoded}`;
    window.open(url, '_blank');
  }

  function handleContactCustomer() {
    if (!schedule?.project_contact_phone) return;
    window.open(`tel:${schedule.project_contact_phone}`, '_blank');
  }

  const nextAction = schedule ? NEXT_STATUS[myStatus] : null;

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

  // ─── Required Documentation Check ──────────────────────────────────────────
  interface RequiredDocItem {
    key: string;
    label: string;
    present: boolean;
    count: number;
  }

  function getRequiredDocsStatus(): { items: RequiredDocItem[]; allPresent: boolean } {
    const beforePhotos = attachments.filter((a) => a.attachment_type === 'before');
    const afterPhotos = attachments.filter((a) => a.attachment_type === 'after');
    const techNotes = notes.filter((n) => n.note_type === 'technician');

    const items: RequiredDocItem[] = [
      { key: 'note', label: 'Work Note', present: techNotes.length > 0, count: techNotes.length },
      { key: 'before', label: 'Before Photo', present: beforePhotos.length > 0, count: beforePhotos.length },
      { key: 'after', label: 'After Photo', present: afterPhotos.length > 0, count: afterPhotos.length },
      { key: 'signature', label: 'Customer Signature', present: signatures.length > 0, count: signatures.length },
    ];
    return { items, allPresent: items.every((i) => i.present) };
  }

  const requiredDocs = getRequiredDocsStatus();

  function canDeleteEvidence(att: JobAttachment): boolean {
    if (isClosed) return false;
    // During rework, prevent deletion of original (version 0) evidence
    if (isReworkActive && (att.rework_version ?? 0) === 0) return false;
    return true;
  }

  // ─── Attachment card renderer ─────────────────────────────────────────────
  function renderAttachmentCard(att: JobAttachment) {
    const canDelete = canDeleteEvidence(att);
    return (
      <div key={att.id} className="border border-gray-200 rounded-xl overflow-hidden">
        {att.mime_type.startsWith('image/') ? (
          <div className="relative">
            <img
              src={att.id.startsWith('offline-') ? att.file_path || '' : getAttachmentUrl(att)}
              alt={att.file_name}
              className="w-full h-32 object-cover"
              loading="lazy"
            />
            {canDelete && (
            <button
              onClick={() => handleDeleteAttachment(att.id)}
              className="absolute top-1 right-1 w-7 h-7 min-w-[44px] min-h-[44px] bg-black/50 rounded-full flex items-center justify-center text-white text-xs hover:bg-black/70 transition-colors"
              title="Delete"
            >
              &times;
            </button>
            )}
            {att.id.startsWith('offline-') && (
              <div className="absolute bottom-1 left-1 bg-blue-500 text-white text-xs px-1.5 py-0.5 rounded">
                Pending
              </div>
            )}
          </div>
        ) : (
          <div className="p-3 text-center">
            <svg className="h-8 w-8 text-gray-400 mx-auto mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
            <p className="text-xs text-gray-700 truncate">{att.file_name}</p>
            <p className="text-xs text-gray-400">{formatFileSize(att.file_size)}</p>
            {canDelete && (
            <button
              onClick={() => handleDeleteAttachment(att.id)}
              className="mt-1 text-xs text-red-500 hover:text-red-700"
            >
              Delete
            </button>
            )}
          </div>
        )}
        {/* GPS evidence badge for photos */}
        {att.mime_type.startsWith('image/') && (
          <div className="px-2 py-1.5 border-t border-slate-100">
            {att.latitude && att.longitude ? (
              <div className="space-y-0.5">
                <p className={`text-xs font-medium flex items-center gap-1 ${
                  att.inside_geofence ? 'text-green-700' : 'text-blue-700'
                }`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${att.inside_geofence ? 'bg-green-500' : 'bg-blue-500'}`} />
                  {att.inside_geofence ? 'Inside Geofence' : 'Outside Geofence'}
                </p>
                {att.distance_from_site != null && (
                  <p className="text-xs text-gray-500">{att.distance_from_site} m from site</p>
                )}
                {att.accuracy != null && (
                  <p className="text-xs text-gray-400">±{att.accuracy} m</p>
                )}
                {att.captured_at && (
                  <p className="text-xs text-gray-400">
                    {new Date(att.captured_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-xs text-gray-400 flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-gray-400 inline-block" />
                GPS Unavailable
              </p>
            )}
          </div>
        )}
        <div className="px-2 py-1 flex items-center justify-between bg-gray-50">
          <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${ATTACHMENT_COLORS[att.attachment_type] || ATTACHMENT_COLORS.document}`}>
            {ATTACHMENT_LABELS[att.attachment_type] || 'Document'}
          </span>
          {(att.rework_version ?? 0) > 0 && (
            <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-red-100 text-red-700">
              Rework {att.rework_version}
            </span>
          )}
          <span className="text-xs text-gray-400">{att.user_name?.split(' ')[0]}</span>
        </div>
      </div>
    );
  }

  // ─── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <Spinner size="lg" />
        <p className="text-sm text-slate-500 mt-3">Loading job details...</p>
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
            className="px-4 py-2 bg-gradient-to-r from-brand-600 to-brand-500 text-white rounded-lg text-sm font-medium"
          >
            Back to Jobs
          </button>
        </div>
      </div>
    );
  }

  const statusConfig = STATUS_CONFIG[myStatus] || STATUS_CONFIG.scheduled;
  const currentStep = statusConfig.step;
  const isClosed = myStatus === 'closed';
  const isReworkRequired = myStatus === 'rework_required';
  const isReworkActive = myStatus === 'on_site' && reworkRequests.some((r) => r.status === 'open');
  const openRework = reworkRequests.find((r) => r.status === 'open');

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
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
          <div className="rounded-xl bg-gradient-to-r from-brand-600 to-brand-500 px-4 py-3 text-center text-sm font-medium text-white shadow-lg shadow-brand-700/20">
            {offlineToast}
          </div>
        </div>
      )}

      {/* Rework Required Banner */}
      {isReworkRequired && openRework && (
        <div className="fixed top-4 left-4 right-4 z-50 max-w-md mx-auto">
          <div className="bg-red-50 border-2 border-red-400 rounded-xl shadow-lg px-4 py-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xl">⚠</span>
              <h3 className="font-bold text-red-800 text-base">Rework Requested</h3>
            </div>
            <p className="text-sm text-red-700 mb-1">
              <span className="font-medium">Reason:</span> {openRework.reason}
            </p>
            <p className="text-xs text-red-600 mb-3">
              Requested by: {openRework.requested_by_name || 'Unknown'} ·{' '}
              {new Date(openRework.requested_at).toLocaleString()}
            </p>
            <button
              onClick={async () => {
                setTransitioning(true);
                let clockedInThisCall = false;
                try {
                  // Auto clock-in if not already clocked in
                    if (schedule && (!activeTimeEntry || activeTimeEntry.project_id !== schedule.project_id)) {
                      const pos = await captureGps();
                      await clockIn(schedule.project_id, 'Auto clock-in for rework', pos?.lat, pos?.lng, pos?.accuracy);
                      clockedInThisCall = true;
                      try { const entry = await getCurrentEntry(); setActiveTimeEntry(entry); } catch {}
                    }
                    await resumeRework(scheduleId, openRework.id, myTechnicianId);
                  await fetchAll();
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Failed to resume rework');
                  // Rollback: clock out if we clocked in but resume failed
                  if (clockedInThisCall) {
                    try { await clockOut(undefined); } catch {}
                    setActiveTimeEntry(null);
                  }
                } finally {
                  setTransitioning(false);
                }
              }}
              disabled={transitioning}
              className="w-full bg-red-600 text-white rounded-xl py-3 text-base font-semibold shadow-lg active:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {transitioning ? 'Resuming...' : 'Resume Work'}
            </button>
          </div>
        </div>
      )}

      {/* Rework Active Banner */}
      {isReworkActive && (
        <div className="fixed top-4 left-4 right-4 z-50 max-w-md mx-auto">
          <div className="rounded-xl border-2 border-brand-300 bg-brand-50 px-4 py-3 shadow-lg">
            <div className="flex items-center gap-2">
              <span className="font-bold text-brand-700">↻</span>
              <p className="text-sm font-medium text-brand-800">
                Rework in progress — add additional evidence below
              </p>
            </div>
            {openRework && (
              <p className="text-xs ml-6 mt-1 text-brand-700">
                Reason: {openRework.reason}
              </p>
            )}
            <p className="text-xs ml-6 mt-1 text-brand-600">
              Original evidence is read-only. New photos and notes will be appended.
            </p>
          </div>
        </div>
      )}

      {/* Pending Sync Badge */}
      {!isOnline && pendingCount > 0 && (
        <div className="fixed top-4 left-4 right-4 z-50 max-w-md mx-auto mt-14">
          <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-2 rounded-xl shadow text-sm font-medium text-center">
            {pendingCount} action{pendingCount !== 1 ? 's' : ''} pending sync
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-blue-600 px-4 pb-4 pt-12 text-white">
        <button
          onClick={() => router.back()}
          className="mb-3 flex items-center gap-1 text-sm font-semibold text-white/90"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
        <h1 className="text-xl font-bold text-white">{schedule.project_name}</h1>
        <div className="flex items-center gap-2 mt-2">
          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusConfig.bg} ${statusConfig.text}`}
          >
            {statusConfig.label}
          </span>
          <span className="text-sm text-white/80">
            {formatDate(schedule.scheduled_date)}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 px-4 py-4 space-y-4">
        {/* Time Range */}
        <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-2">
            Time
          </h2>
          {schedule.start_time ? (
            <p className="text-base font-medium text-slate-950">
              {formatTime(schedule.start_time)}
              {schedule.end_time ? ` — ${formatTime(schedule.end_time)}` : ''}
            </p>
          ) : (
            <p className="text-sm italic text-slate-400">No time set</p>
          )}

          {/* Time entry status indicator — merged workflow */}
          {activeTimeEntry && activeTimeEntry.project_id === schedule.project_id && (
            <div className="mt-3 pt-3 border-t border-slate-100">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Time Entry</p>
              <p className="text-sm text-green-700 font-medium flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-green-500 inline-block" />
                Clocked in since{' '}
                {new Date(activeTimeEntry.clock_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          )}
          {!activeTimeEntry && (myStatus === 'on_site') && (
            <div className="mt-3 pt-3 border-t border-slate-100">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Time Entry</p>
              <p className="text-sm text-blue-700 font-medium flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-blue-500 inline-block" />
                Not clocked in — required to complete this job
              </p>
            </div>
          )}
        </div>

        {/* Address */}
        {schedule.project_address && (
          <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-2">
              Address
            </h2>
            <p className="text-base font-medium text-slate-950">
              {schedule.project_address}
            </p>
          </div>
        )}

        {/* Contact */}
        {schedule.project_contact_name && (
          <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-2">
              Contact
            </h2>
            <p className="text-sm text-slate-500 text-xs font-medium">Contact Person</p>
            <p className="text-base font-medium text-slate-950 mb-2">
              {schedule.project_contact_name}
            </p>
            {schedule.project_contact_phone && (
              <>
                <p className="text-sm text-slate-500 text-xs font-medium">Mobile</p>
                <p className="text-sm text-gray-700">
                  {schedule.project_contact_phone}
                </p>
              </>
            )}
          </div>
        )}

        {/* Schedule Notes */}
        {schedule.notes && (
          <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-2">
              Notes
            </h2>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{schedule.notes}</p>
          </div>
        )}

        {/* Status Progress Stepper */}
        <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-4">
            Progress
          </h2>
          <div className="space-y-0">
            {STATUS_STEPS.map((status, index) => {
              const cfg = STATUS_CONFIG[status];
              // Rework step is only "complete" if there were actual rework requests
              // that have been resolved. Without rework, it should NOT show as checked.
              const isReworkWithNoRequests = status === 'rework_required' && reworkRequests.length === 0;
              const isReworkCompleted = status === 'rework_required' && reworkRequests.some(r => r.status === 'completed');
              const isComplete = isReworkWithNoRequests
                ? false
                : isReworkCompleted
                  ? true
                  : index <= currentStep;
              const isCurrent = index === currentStep;
              return (
                <div key={status} className="flex items-start gap-3">
                  <div className="flex flex-col items-center">
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border-2 ${
                        isComplete
                          ? 'bg-brand-600 border-brand-600 text-white'
                          : status === 'rework_required'
                            ? 'bg-white border-gray-300 text-gray-400'
                            : 'bg-white border-gray-300 text-gray-400'
                      } ${isCurrent ? 'ring-2 ring-brand-300' : ''}`}
                    >
                      {isComplete && status !== 'rework_required' && index < currentStep ? '✓' : isComplete && status === 'rework_required' ? '✓' : index + 1}
                    </div>
                    {index < STATUS_STEPS.length - 1 && (
                      <div
                        className={`w-0.5 h-6 ${
                          index < currentStep || (status === 'completed' && reworkRequests.some(r => r.status === 'completed'))
                            ? 'bg-brand-600'
                            : 'bg-slate-200'
                        }`}
                      />
                    )}
                  </div>
                  <div className={`pb-5 ${index < currentStep ? 'text-gray-500' : index === currentStep ? 'text-brand-700 font-medium' : isComplete && status === 'rework_required' ? 'text-gray-500' : 'text-gray-400'}`}>
                    <span className="text-sm">{cfg.label}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ─── Technician Notes Section ─────────────────────────────────────── */}
        <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-3">
            Technician Notes
            {isReworkActive && <span className="ml-2 text-red-600 font-normal normal-case">(Rework)</span>}
          </h2>

          {/* Note Input — hidden for closed (read-only) jobs */}
          {!isClosed && (
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder="Add a note..."
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
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
              className="px-4 py-2 bg-gradient-to-r from-brand-600 to-brand-500 text-white rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed active:bg-brand-700 transition-colors"
            >
              {saving ? '...' : 'Add'}
            </button>
          </div>
          )}

          {/* Notes List */}
          {notes.length === 0 ? (
            <p className="text-sm italic text-slate-400">No notes yet</p>
          ) : (
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {notes.map((note) => (
                <div key={note.id} className="border-l-2 border-brand-300 pl-3">
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{note.content}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {note.user_name} • {formatDateTime(note.created_at)}
                    {note.id.startsWith('offline-') && (
                      <span className="ml-2 text-blue-600 font-medium">(pending sync)</span>
                    )}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ─── Photos Section ──────────────────────────────────────────────── */}
        <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-3">
            Photos & Attachments
          </h2>

          {/* Required Photo Checklist */}
          <div className="mb-4 space-y-1.5">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
              Required Photos
            </p>
            {(['before', 'during', 'after'] as const).map((type) => {
              const count = attachments.filter((a) => a.attachment_type === type).length;
              const isSelected = selectedAttachmentType === type;
              return (
                <button
                  key={type}
                  onClick={() => { setSelectedAttachmentType(type); selectedAttachmentTypeRef.current = type; }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                    isSelected
                      ? 'bg-brand-50 border border-brand-300'
                      : 'bg-gray-50 border border-transparent hover:border-gray-300'
                  }`}
                >
                  {/* Radio indicator */}
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                    isSelected ? 'border-brand-600' : 'border-gray-300'
                  }`}>
                    {isSelected && <div className="w-2.5 h-2.5 rounded-full bg-brand-600" />}
                  </div>
                  <span className={`font-medium capitalize ${isSelected ? 'text-brand-700' : 'text-gray-700'}`}>
                    {type}
                  </span>
                  {count > 0 ? (
                    <span className="ml-auto flex items-center gap-1 text-green-700 font-medium">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      {count}
                    </span>
                  ) : (
                    <span className="ml-auto text-xs text-gray-400">
                      {type === 'before' || type === 'after' ? 'Required' : 'Optional'}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Upload button — hidden for closed (read-only) jobs */}
          {!isClosed && (
          <div className="flex gap-2 mb-4">
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
              <div className="flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-brand-600 to-brand-500 text-white rounded-xl text-sm font-medium active:bg-brand-700 transition-colors cursor-pointer disabled:opacity-50 shadow-sm">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {uploading ? 'Uploading...' : `Add ${ATTACHMENT_LABELS[selectedAttachmentType] || 'Photo'}`}
              </div>
            </label>
            {/* Document upload option */}
            <label>
              <input
                type="file"
                accept=".pdf,.doc,.docx,.txt,.csv,.xls,.xlsx"
                onChange={handleDocumentUpload}
                className="hidden"
                disabled={uploading}
              />
              <div className="flex items-center justify-center px-4 py-3 bg-white border-2 border-dashed border-gray-300 text-gray-500 rounded-xl text-sm font-medium active:bg-gray-50 transition-colors cursor-pointer disabled:opacity-50 hover:border-gray-400" title="Upload Document">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
            </label>
          </div>
          )}

          {/* ── Photos (before & after) ────────────────────────────────────── */}
          {(() => {
            const photos = attachments.filter((a) => a.attachment_type !== 'document');
            if (photos.length === 0) return null;
            return (
              <div className="mb-4">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Photos</h3>
                <div className="grid grid-cols-2 gap-3">
                  {photos.map((att) => renderAttachmentCard(att))}
                </div>
              </div>
            );
          })()}

          {/* ── Documents ──────────────────────────────────────────────────── */}
          {(() => {
            const docs = attachments.filter((a) => a.attachment_type === 'document');
            if (docs.length === 0) return null;
            return (
              <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Documents</h3>
                <div className="grid grid-cols-2 gap-3">
                  {docs.map((att) => renderAttachmentCard(att))}
                </div>
              </div>
            );
          })()}

          {/* Empty state — no attachments at all */}
          {attachments.length === 0 && (
            <p className="text-sm italic text-slate-400">No photos or attachments yet</p>
          )}
        </div>

        {/* ─── Signatures Section ──────────────────────────────────────────── */}
        <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-3">
            Signatures
          </h2>

          {/* Capture Signature button — hidden for closed (read-only) jobs */}
          {!isClosed && (
          <button
            onClick={() => setShowSignaturePad(true)}
            className="w-full mb-4 px-4 py-3 border-2 border-dashed border-gray-300 text-gray-500 rounded-xl text-sm font-medium active:bg-gray-50 transition-colors hover:border-brand-400 hover:text-brand-700"
          >
            <svg className="h-5 w-5 inline mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
            Capture Signature
          </button>
          )}

          {signatures.length === 0 ? (
            <p className="text-sm italic text-slate-400">No signatures yet</p>
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
                    <span className="text-xs text-gray-500 capitalize">
                      {sig.label}
                      {(sig.rework_version ?? 0) > 0 && (
                        <span className="ml-1 text-red-600 font-medium">(Rework {sig.rework_version})</span>
                      )}
                    </span>
                    <span className="text-xs text-gray-400">
                      {sig.user_name} • {formatDateTime(sig.created_at)}
                      {sig.id.startsWith('offline-') && (
                        <span className="ml-2 text-blue-600 font-medium">(pending sync)</span>
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
              {isReworkActive ? 'Confirm Rework Complete' : 'Confirm Status Change'}
            </h3>
            <p className="text-sm text-gray-600 mb-6">
              {isReworkActive
                ? 'Submit this rework as complete? The schedule will go back to office review.'
                : NEXT_STATUS[myStatus]?.confirm || 'Update job status?'}
            </p>
            <div className="space-y-3">
              <button
                onClick={async () => {
                  if (isReworkActive && openRework) {
                    setTransitioning(true);
                    setConfirmStatus(null);
                    try {
                      await completeRework(scheduleId, openRework.id, myTechnicianId);
                      // Auto clock-out after rework complete
                      if (activeTimeEntry) {
                        const pos = await captureGps();
                        await clockOut(undefined, pos?.lat, pos?.lng, pos?.accuracy);
                        setActiveTimeEntry(null);
                      }
                      await fetchAll();
                    } catch (err) {
                      let clockOutFailed = false;
                      if (err instanceof Error && err.message.includes('clock_out')) { clockOutFailed = true; }
                      setError(clockOutFailed ? 'Rework submitted but clock-out failed. Please clock out manually.' : err instanceof Error ? err.message : 'Failed to complete rework');
                    } finally {
                      setTransitioning(false);
                    }
                  } else {
                    handleStatusTransition(confirmStatus);
                  }
                }}
                disabled={transitioning}
                className="w-full bg-gradient-to-r from-brand-600 to-brand-500 text-white rounded-xl py-4 text-base font-semibold shadow-lg active:bg-brand-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {transitioning ? 'Updating...' : `Yes, ${isReworkActive ? 'Submit Rework' : NEXT_STATUS[myStatus]?.label || 'Update'}`}
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

      {/* Missing Documentation Modal */}
      {showMissingDocsModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50">
          <div className="bg-white rounded-t-2xl w-full max-w-md mx-auto px-6 pt-6 pb-10">
            <h3 className="text-lg font-semibold text-red-700 mb-2">
              Cannot Complete Job
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              All required items must be completed before marking this job as complete.
            </p>
            <div className="space-y-2 mb-6">
              {requiredDocs.items.map((item) => (
                <div
                  key={item.key}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm ${
                    item.present
                      ? 'bg-green-50 text-green-700'
                      : 'bg-red-50 text-red-700'
                  }`}
                >
                  {item.present ? (
                    <svg className="h-5 w-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="h-5 w-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  )}
                  <span className="font-medium">{item.label}</span>
                  {item.present && item.count > 0 && (
                    <span className="text-xs ml-auto opacity-75">({item.count})</span>
                  )}
                  {!item.present && (
                    <span className="text-xs font-medium ml-auto text-red-600">Missing</span>
                  )}
                </div>
              ))}
            </div>
            <div className="space-y-3">
              <button
                onClick={() => setShowMissingDocsModal(false)}
                className="w-full bg-gradient-to-r from-brand-600 to-brand-500 text-white rounded-xl py-4 text-base font-semibold shadow-lg active:bg-brand-700 transition-colors"
              >
                Got It
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Clock Out Prompt After Work Complete ──────────────────────────── */}
      {showClockOutPrompt && (
        <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50">
          <div className="bg-white rounded-t-2xl w-full max-w-md mx-auto px-6 pt-6 pb-10">
            <div className="text-center mb-6">
              <div className="text-green-600 text-4xl mb-3">✓</div>
              <h3 className="text-lg font-semibold text-gray-900">Work Completed</h3>
              <p className="text-sm text-slate-500 mt-1">
                Your work has been marked complete and sent for review.
              </p>
            </div>
            <p className="text-sm font-medium text-gray-700 mb-4 text-center">
              Would you like to clock out now?
            </p>
            <div className="space-y-3">
              <button
                onClick={async () => {
                  setShowClockOutPrompt(false);
                  setTimeEntryLoading(true);
                  try {
                    const pos = await captureGps();
                    await clockOut(undefined, pos?.lat, pos?.lng, pos?.accuracy);
                    setActiveTimeEntry(null);
                    setTimeEntryLoading(false);
                  } catch (err) {
                    setTimeEntryLoading(false);
                    setError(err instanceof Error ? err.message : 'Failed to clock out');
                  }
                }}
                disabled={timeEntryLoading}
                className="w-full bg-red-600 text-white rounded-xl py-4 text-base font-semibold shadow-lg active:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {timeEntryLoading ? 'Clocking out...' : 'Clock Out'}
              </button>
              <button
                onClick={() => setShowClockOutPrompt(false)}
                disabled={timeEntryLoading}
                className="w-full bg-white border border-gray-300 text-gray-700 rounded-xl py-4 text-base font-semibold active:bg-gray-50 transition-colors"
              >
                I&apos;ll Clock Out Later
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="sticky bottom-0 bg-white border-t border-gray-200 px-4 py-4 space-y-3">
        {/* Status transition buttons — hidden for closed (read-only) jobs */}
        {!isClosed && (
          <>
        {nextAction && nextAction.status === 'completed' && myStatus === 'on_site' && (
          <>
            <button
              onClick={() => {
                if (!requiredDocs.allPresent) {
                  setShowMissingDocsModal(true);
                } else if (isReworkActive && openRework) {
                  setConfirmStatus('completed');
                } else {
                  setConfirmStatus(nextAction.status);
                }
              }}
              disabled={transitioning}
              className={`w-full rounded-xl py-4 text-base font-semibold shadow-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${
                requiredDocs.allPresent
                  ? 'bg-gradient-to-r from-brand-600 to-brand-500 text-white active:bg-brand-700'
                  : 'bg-gray-200 text-gray-500'
              }`}
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
                  {isReworkActive ? 'Submit Rework Complete' : nextAction.label}
                </>
              )}
            </button>
            {!requiredDocs.allPresent && (
              <p className="text-xs text-red-600 text-center -mt-2">
                {requiredDocs.items.filter((i) => !i.present).length} required item(s) missing
              </p>
            )}
          </>
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

        {!isClosed && nextAction == null && myStatus !== 'completed' && (
          <p className="text-center text-sm italic text-slate-400">No further actions</p>
        )}
          </>
        )}

        {isClosed && (
          <div className="w-full bg-green-50 border border-green-200 text-green-800 rounded-xl py-4 text-base font-semibold text-center">
            ✓ Job Closed
            <span className="block text-sm font-normal text-green-600 mt-0.5">
              This work order has been completed and approved by the office. This page is read-only.
            </span>
          </div>
        )}

        {myStatus === 'completed' && (
          <div className="w-full bg-purple-50 border border-purple-200 text-purple-700 rounded-xl py-4 text-base font-semibold text-center">
            Work Completed
            <span className="block text-sm font-normal text-purple-600 mt-0.5">Waiting for office approval</span>
          </div>
        )}

        {myStatus === 'rework_required' && (
          <div className="w-full bg-red-50 border border-red-200 text-red-700 rounded-xl py-4 text-base font-semibold text-center">
            ⚠ Rework Required
            <span className="block text-sm font-normal text-red-600 mt-0.5">
              The office has requested changes. Resume work to proceed.
            </span>
          </div>
        )}

        {schedule.project_address && myStatus !== 'completed' && myStatus !== 'rework_required' && (
          <button
            onClick={handleStartNavigation}
            className="w-full bg-gradient-to-r from-brand-600 to-brand-500 text-white rounded-xl py-4 text-base font-semibold shadow-lg active:bg-brand-700 transition-colors flex items-center justify-center gap-2"
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
            className="w-full bg-white border-2 border-brand-600 text-brand-700 rounded-xl py-4 text-base font-semibold active:bg-brand-50 transition-colors flex items-center justify-center gap-2"
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





