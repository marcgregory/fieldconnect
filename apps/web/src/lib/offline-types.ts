import type {
  JobStatus,
  NoteType,
  AttachmentType,
  ScheduleWithDetails,
} from '@fieldconnect/shared';

// ─── Stored Blob Record ─────────────────────────────────────────────────────
export interface StoredBlob {
  id: string;
  actionId: string;
  blob: Blob;
  fileName: string;
  mimeType: string;
  fileSize: number;
}

// ─── Offline Action Base ────────────────────────────────────────────────────
interface OfflineActionBase {
  id: string; // idempotency key
  scheduleId: string;
  createdAt: string; // ISO timestamp
  retryCount: number;
  lastError: string | null;
}

// ─── Action Variants ────────────────────────────────────────────────────────
export interface StatusTransitionAction extends OfflineActionBase {
  type: 'status_transition';
  payload: { status: JobStatus; notes?: string };
}

export interface AddNoteAction extends OfflineActionBase {
  type: 'add_note';
  payload: { content: string; note_type: NoteType };
}

export interface UploadPhotoAction extends OfflineActionBase {
  type: 'upload_photo';
  payload: { blobId: string; attachmentType: AttachmentType };
}

export interface CaptureSignatureAction extends OfflineActionBase {
  type: 'capture_signature';
  payload: { signatureData: string; label?: string };
}

export type OfflineAction =
  | StatusTransitionAction
  | AddNoteAction
  | UploadPhotoAction
  | CaptureSignatureAction;

// ─── Sync Status ────────────────────────────────────────────────────────────
export interface SyncState {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  syncErrors: string[];
}
