'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { ScheduleWithDetails } from '@fieldconnect/shared';
import {
  cacheJobs,
  getCachedJobs,
  cacheJob,
  enqueueAction,
  getPendingActions,
  getQueueSize,
  removeAction,
  markActionFailed,
  storeBlob,
  getBlob,
  deleteBlob,
} from '@/lib/db';
import { generateIdempotencyKey } from '@/lib/idempotency';
import { getMyJobs, getSchedule } from '@/lib/api';
import type {
  OfflineAction,
  UploadPhotoAction,
  StatusTransitionAction,
  AddNoteAction,
  CaptureSignatureAction,
} from '@/lib/offline-types';
import type { JobStatus, NoteType, AttachmentType } from '@fieldconnect/shared';

const MAX_SYNC_RETRIES = 3;

// ─── Lightweight connectivity check ────────────────────────────────────────
async function checkConnectivity(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const res = await fetch('/api/proxy/api/v1/health', {
      method: 'HEAD',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return res.ok;
  } catch {
    return false;
  }
}

// ─── Exposed return type ───────────────────────────────────────────────────
export interface UseOfflineSyncReturn {
  isOnline: boolean;
  pendingCount: number;
  isSyncing: boolean;
  syncErrors: string[];
  cachedJobs: ScheduleWithDetails[];
  updateCachedJob: (job: ScheduleWithDetails) => void;
  enqueueStatusTransition: (
    scheduleId: string,
    status: JobStatus,
    notes?: string,
  ) => Promise<string>;
  enqueueNote: (
    scheduleId: string,
    content: string,
    noteType?: NoteType,
  ) => Promise<string>;
  enqueuePhoto: (
    scheduleId: string,
    file: File,
    attachmentType: AttachmentType,
    /** Optional GPS evidence captured at upload time */
    gps?: { lat: number; lng: number; accuracy: number; capturedAt: string },
  ) => Promise<string>;
  enqueueSignature: (
    scheduleId: string,
    signatureData: string,
    label?: string,
  ) => Promise<string>;
  processQueue: () => Promise<void>;
  refreshJobCache: () => Promise<void>;
  clearSyncErrors: () => void;
}

// ─── Hook ──────────────────────────────────────────────────────────────────
export function useOfflineSync(): UseOfflineSyncReturn {
  const [isOnline, setIsOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncErrors, setSyncErrors] = useState<string[]>([]);
  const [cachedJobs, setCachedJobs] = useState<ScheduleWithDetails[]>([]);
  const processingRef = useRef(false);

  // ─── Update pending count from IndexedDB ─────────────────────────────────
  const refreshPendingCount = useCallback(async () => {
    try {
      const count = await getQueueSize();
      setPendingCount(count);
    } catch {
      // IndexedDB not available
    }
  }, []);

  // ─── Load cached jobs from IndexedDB ─────────────────────────────────────
  const loadCachedJobs = useCallback(async () => {
    try {
      const jobs = await getCachedJobs();
      setCachedJobs(jobs);
    } catch {
      // IndexedDB not available
    }
  }, []);

  // ─── Online/Offline Detection ────────────────────────────────────────────
  useEffect(() => {
    // Some browsers report online before actual connectivity — do a real check
    async function check() {
      const connected = await checkConnectivity();
      setIsOnline(connected);
    }
    // Initial state from navigator
    setIsOnline(navigator.onLine);

    const handleOnline = () => {
      // Optimistically set online — the sync flow will do its own connectivity
      // check before actually processing the queue
      setIsOnline(true);
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Do a deeper check after a short delay (page might report online before
    // the fetch actually works)
    const timer = setTimeout(check, 2000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearTimeout(timer);
    };
  }, []);

  // ─── Refresh pending count periodically ─────────────────────────────────
  useEffect(() => {
    refreshPendingCount();
  }, [refreshPendingCount]);

  // ─── Auto-sync on reconnect ──────────────────────────────────────────────
  useEffect(() => {
    if (!isOnline || processingRef.current) return;

    // When transitioning to online, process the queue
    const doSync = async () => {
      const count = await getQueueSize();
      if (count === 0) return;

      // Verify actual connectivity before processing
      const connected = await checkConnectivity();
      if (!connected) {
        setIsOnline(false);
        return;
      }

      await processQueue();
    };

    doSync();
  }, [isOnline]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Refresh Job Cache from API ──────────────────────────────────────────
  const refreshJobCache = useCallback(async () => {
    try {
      const jobs = await getMyJobs();
      await cacheJobs(jobs);
      setCachedJobs(jobs);
    } catch {
      // Offline or error — keep existing cache
    }
  }, []);

  // ─── Update Single Cached Job ────────────────────────────────────────────
  const updateCachedJob = useCallback((job: ScheduleWithDetails) => {
    cacheJob(job).then(() => {
      setCachedJobs((prev) => {
        const idx = prev.findIndex((j) => j.id === job.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = job;
          return next;
        }
        return [...prev, job];
      });
    }).catch(() => { /* silent — cache best-effort */ });
  }, []);

  // ─── Process Queue ───────────────────────────────────────────────────────
  const processQueue = useCallback(async () => {
    if (processingRef.current) return;
    processingRef.current = true;
    setIsSyncing(true);

    const newErrors: string[] = [];

    try {
      // Verify connectivity before processing
      const connected = await checkConnectivity();
      if (!connected) {
        setIsOnline(false);
        return;
      }

      const actions = await getPendingActions();

      for (const action of actions) {
        if (action.retryCount >= MAX_SYNC_RETRIES) continue; // Skip permanently failed

        try {
          await syncAction(action);
          // On success: remove from queue
          await removeAction(action.id);
          setPendingCount((prev) => Math.max(0, prev - 1));
        } catch (err) {
          const errorMsg =
            err instanceof Error ? err.message : 'Sync failed';

          if (action.retryCount + 1 >= MAX_SYNC_RETRIES) {
            // Exhausted retries — clean up blobs if photo upload
            if (action.type === 'upload_photo') {
              const blobId = (action as UploadPhotoAction).payload.blobId;
              await deleteBlob(blobId).catch(() => {});
            }
            await markActionFailed(
              action.id,
              errorMsg,
              action.retryCount + 1,
            );
            newErrors.push(
              `[${action.type}] ${errorMsg} (permanent failure after ${MAX_SYNC_RETRIES} retries)`,
            );
          } else {
            await markActionFailed(
              action.id,
              errorMsg,
              action.retryCount + 1,
            );
            newErrors.push(
              `[${action.type}] ${errorMsg} (retry ${action.retryCount + 1}/${MAX_SYNC_RETRIES})`,
            );
          }
        }
      }

      // After processing the queue, refresh job data from API
      await refreshJobCache();

      if (newErrors.length > 0) {
        setSyncErrors((prev) => [...prev, ...newErrors].slice(-20));
      }
    } finally {
      processingRef.current = false;
      setIsSyncing(false);
    }
  }, [refreshJobCache]);

  // ─── Sync a Single Action ────────────────────────────────────────────────
  async function syncAction(action: OfflineAction): Promise<void> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Idempotency-Key': action.id,
    };

    switch (action.type) {
      case 'status_transition': {
        const { status, notes } = (action as StatusTransitionAction).payload;
        const res = await fetch(
          `/api/proxy/api/v1/schedules/${action.scheduleId}/status`,
          {
            method: 'PATCH',
            headers,
            body: JSON.stringify({ status, notes }),
          },
        );
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          // 409 = duplicate idempotency key — treat as success
          if (res.status === 409) return;
          throw new Error(
            body?.error || `Status transition failed (${res.status})`,
          );
        }
        break;
      }

      case 'add_note': {
        const { content, note_type } = (action as AddNoteAction).payload;
        const res = await fetch(
          `/api/proxy/api/v1/schedules/${action.scheduleId}/notes`,
          {
            method: 'POST',
            headers,
            body: JSON.stringify({ content, note_type }),
          },
        );
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          if (res.status === 409) return;
          throw new Error(body?.error || `Add note failed (${res.status})`);
        }
        break;
      }

      case 'upload_photo': {
        const { blobId, attachmentType } = (action as UploadPhotoAction)
          .payload;

        // Retrieve the Blob from IndexedDB blob store
        const storedBlob = await getBlob(blobId);
        if (!storedBlob) {
          throw new Error('Photo blob not found in local storage');
        }

        // Reconstruct FormData for the upload
        const formData = new FormData();
        formData.append('file', storedBlob.blob, storedBlob.fileName);
        formData.append('attachment_type', attachmentType);

        // Append GPS evidence data if captured
        const pa = (action as UploadPhotoAction).payload;
        let url = `/api/proxy/api/v1/schedules/${action.scheduleId}/attachments`;
        if (pa.lat != null && pa.lng != null) {
          url += `?lat=${pa.lat}&lng=${pa.lng}&accuracy=${pa.accuracy ?? ''}&captured_at=${encodeURIComponent(pa.capturedAt ?? '')}`;
        }

        const res = await fetch(url, {
            method: 'POST',
            headers: {
              // Do NOT set Content-Type — browser sets it with boundary
              'Idempotency-Key': action.id,
            },
            body: formData,
          },
        );

        // Clean up the blob store regardless of outcome
        await deleteBlob(blobId).catch(() => {});

        if (!res.ok) {
          const body = await res.json().catch(() => null);
          if (res.status === 409) return;
          throw new Error(
            body?.error || `Photo upload failed (${res.status})`,
          );
        }
        break;
      }

      case 'capture_signature': {
        const { signatureData, label } = (action as CaptureSignatureAction)
          .payload;
        const res = await fetch(
          `/api/proxy/api/v1/schedules/${action.scheduleId}/signatures`,
          {
            method: 'POST',
            headers,
            body: JSON.stringify({ signature_data: signatureData, label }),
          },
        );
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          if (res.status === 409) return;
          throw new Error(
            body?.error || `Signature capture failed (${res.status})`,
          );
        }
        break;
      }
    }
  }

  // ─── Enqueue Helpers ─────────────────────────────────────────────────────

  const enqueueStatusTransition = useCallback(
    async (
      scheduleId: string,
      status: JobStatus,
      notes?: string,
    ): Promise<string> => {
      const id = generateIdempotencyKey();
      const action: StatusTransitionAction = {
        id,
        scheduleId,
        type: 'status_transition',
        payload: { status, notes },
        createdAt: new Date().toISOString(),
        retryCount: 0,
        lastError: null,
      };
      await enqueueAction(action);
      await refreshPendingCount();
      return id;
    },
    [refreshPendingCount],
  );

  const enqueueNote = useCallback(
    async (
      scheduleId: string,
      content: string,
      noteType?: NoteType,
    ): Promise<string> => {
      const id = generateIdempotencyKey();
      const action: AddNoteAction = {
        id,
        scheduleId,
        type: 'add_note',
        payload: { content, note_type: noteType || 'technician' },
        createdAt: new Date().toISOString(),
        retryCount: 0,
        lastError: null,
      };
      await enqueueAction(action);
      await refreshPendingCount();
      return id;
    },
    [refreshPendingCount],
  );

  const enqueuePhoto = useCallback(
    async (
      scheduleId: string,
      file: File,
      attachmentType: AttachmentType,
      gps?: { lat: number; lng: number; accuracy: number; capturedAt: string },
    ): Promise<string> => {
      const id = generateIdempotencyKey();
      const blobRecord = await storeBlob(id, file, file.name);
      const action: UploadPhotoAction = {
        id,
        scheduleId,
        type: 'upload_photo',
        payload: {
          blobId: blobRecord.id,
          attachmentType,
          ...(gps ? { lat: gps.lat, lng: gps.lng, accuracy: gps.accuracy, capturedAt: gps.capturedAt } : {}),
        },
        createdAt: new Date().toISOString(),
        retryCount: 0,
        lastError: null,
      };
      await enqueueAction(action);
      await refreshPendingCount();
      return id;
    },
    [refreshPendingCount],
  );

  const enqueueSignature = useCallback(
    async (
      scheduleId: string,
      signatureData: string,
      label?: string,
    ): Promise<string> => {
      const id = generateIdempotencyKey();
      const action: CaptureSignatureAction = {
        id,
        scheduleId,
        type: 'capture_signature',
        payload: { signatureData, label },
        createdAt: new Date().toISOString(),
        retryCount: 0,
        lastError: null,
      };
      await enqueueAction(action);
      await refreshPendingCount();
      return id;
    },
    [refreshPendingCount],
  );

  const clearSyncErrors = useCallback(() => {
    setSyncErrors([]);
  }, []);

  // ─── Initial Load ────────────────────────────────────────────────────────
  useEffect(() => {
    refreshJobCache().catch(() => {
      // If online fetch fails, load from cache
      loadCachedJobs();
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    isOnline,
    pendingCount,
    isSyncing,
    syncErrors,
    cachedJobs,
    updateCachedJob,
    enqueueStatusTransition,
    enqueueNote,
    enqueuePhoto,
    enqueueSignature,
    processQueue,
    refreshJobCache,
    clearSyncErrors,
  };
}
