# Phase F — Offline PWA Sync

## Overview

Add IndexedDB-based offline queue and auto-sync for field technicians. Technicians can view their cached jobs and queue actions (status transitions, notes, photo uploads, signatures) while offline. Actions auto-sync when connectivity returns. REST remains the source of truth; Socket.io remains live notification only.

## Files to Create

### 1. `apps/web/src/lib/db.ts` — IndexedDB wrapper

A thin wrapper around IndexedDB using raw promises (no library). Manages two object stores:

- **`jobs`** — cached `ScheduleWithDetails[]` keyed by `id`
- **`queue`** — pending offline actions with idempotency keys

Schema (upgrade v1):
```
jobs: { keyPath: 'id' }
queue: { keyPath: 'id' }  — id = idempotency key
```

Exports:
- `initDB()` — open/create database, run upgrades
- `cacheJobs(jobs: ScheduleWithDetails[])` — bulk put into jobs store
- `getCachedJobs(): Promise<ScheduleWithDetails[]>` — get all cached jobs
- `getCachedJob(id: string): Promise<ScheduleWithDetails | null>`
- `cacheJob(job: ScheduleWithDetails)` — upsert single job
- `enqueueAction(action: OfflineAction): Promise<string>` — add to queue with generated idempotency key
- `getPendingActions(): Promise<OfflineAction[]>` — get all pending
- `removeAction(id: string): Promise<void>` — remove after successful sync
- `markActionFailed(id: string, error: string): Promise<void>` — mark as failed
- `getQueueSize(): Promise<number>` — count pending
- `clearJobCache(): Promise<void>` — clear all cached jobs

### 2. `apps/web/src/lib/idempotency.ts` — Idempotency key generation

- `generateIdempotencyKey(): string` — `crypto.randomUUID()` wrapped

### 3. `apps/web/src/lib/offline-types.ts` — Offline action types

```ts
interface OfflineActionBase {
  id: string;              // idempotency key
  scheduleId: string;
  createdAt: string;       // ISO timestamp
  retryCount: number;
  lastError: string | null;
}

interface StatusTransitionAction extends OfflineActionBase {
  type: 'status_transition';
  payload: { status: JobStatus; notes?: string };
}

interface AddNoteAction extends OfflineActionBase {
  type: 'add_note';
  payload: { content: string; note_type: NoteType };
}

interface UploadPhotoAction extends OfflineActionBase {
  type: 'upload_photo';
  payload: {
    fileData: string;      // base64-encoded
    fileName: string;
    mimeType: string;
    attachmentType: AttachmentType;
  };
}

interface CaptureSignatureAction extends OfflineActionBase {
  type: 'capture_signature';
  payload: { signatureData: string; label?: string };
}

type OfflineAction = StatusTransitionAction | AddNoteAction | UploadPhotoAction | CaptureSignatureAction;
```

### 4. `apps/web/src/hooks/useOfflineSync.ts` — Core sync hook

This is the main orchestrator hook. It:

1. On mount: initializes IndexedDB, reads cached jobs
2. Listens for `online`/`offline` events
3. On transition to online: triggers sync of all pending queue items
4. Exposes methods and state

**Exports:**
```ts
function useOfflineSync(): {
  isOnline: boolean;
  pendingCount: number;
  isSyncing: boolean;
  syncErrors: string[];
  cachedJobs: ScheduleWithDetails[];
  updateCachedJob: (job: ScheduleWithDetails) => void;
  enqueueAndCache: (action: Omit<OfflineAction, 'id' | 'createdAt' | 'retryCount' | 'lastError'>) => Promise<string>;
  processQueue: () => Promise<void>;
  refreshJobCache: () => Promise<void>;
  clearSyncErrors: () => void;
}
```

**Sync logic (processQueue):**
- Read all pending actions from IndexedDB, ordered by createdAt asc
- For each action, attempt the corresponding API call
- On success: remove from queue
- On failure: increment retryCount, store lastError
  - If retryCount >= 3: mark permanently failed (stop retrying)
  - Otherwise: keep in queue for next sync attempt
- After all items processed: refetch jobs from API and update cache

### 5. `apps/web/src/components/mobile/OfflineIndicator.tsx` — Offline/online + sync badge

A small fixed-position badge at the bottom of the mobile layout showing:
- Green dot + "Online" when connected and queue is empty
- Yellow dot + "Syncing..." when actively syncing
- Red dot + "Offline" when disconnected
- Blue badge with number when pending items in queue

### 6. `apps/web/src/components/mobile/OfflineJobQueueClient.tsx` — Offline-aware job queue

Wrap/modify `JobQueueClient` to:

1. On mount: attempt API fetch; if online succeeds, cache the result; if offline, load from cache
2. Subscribe to sync events to refresh when online sync completes
3. Show a subtle "Cached" indicator on job cards when viewing cached data
4. Show a retry/refresh option at the top

### 7. Modify `apps/web/src/components/mobile/JobDetailClient.tsx` — offline-aware actions

Modify the existing `JobDetailClient` to:

**Status transitions:**
- Before calling `updateScheduleStatus`, check `isOnline` from `useOfflineSync`
- If online: call API normally, update cache on success
- If offline: enqueue action in IndexedDB, optimistically update local state + cache, show toast "Action saved offline — will sync when connected"

**Notes:**
- Same pattern: online → API, offline → queue + local update

**Photo uploads:**
- Online → API call via FormData
- Offline → read File as base64 data URL, enqueue with `UploadPhotoAction`, show local preview in attachments list with "Pending sync" badge
- Size limit: reject files > 10MB for offline (too large for IndexedDB), show toast message

**Signatures:**
- Online → API call
- Offline → enqueue as `CaptureSignatureAction`, show in signatures list with "Pending sync" badge

## Idempotency Strategy

- Each queued action gets a `crypto.randomUUID()` idempotency key
- The key is sent as an `Idempotency-Key` header when the action is synced
- The API should check for duplicate keys (backend changes in a future phase — for now, the client deduplicates by removing from queue on success, and if the same action is queued twice, the first sync succeeds and the second gets a 409 which we treat as "already done" and remove from queue)
- This prevents double-submits when a sync succeeds but the client doesn't receive the response (e.g., network drops between API success and client receiving the 200)

## Sync Flow

```
Offline → User performs action → Enqueue in IndexedDB → Optimistic local update
        → Network comes back → processQueue() called
        → For each queued action (oldest first):
          → Call API with Idempotency-Key header
          → On 2xx: remove from queue
          → On 409 (duplicate): treat as success, remove from queue
          → On 4xx/5xx (non-409): increment retryCount
            → If retryCount < 3: keep in queue for next sync attempt
            → If retryCount >= 3: mark as permanently failed, keep in queue for visibility
        → After all processed: refetch jobs from API → update IndexedDB cache
```

## Offline/Online Detection

- Use `navigator.onLine` for initial state
- Listen for `window` `online` / `offline` events
- Additionally, do a lightweight connectivity check (HEAD to `/api/proxy/api/v1/health`) on transition to online before triggering sync — some browsers report online before actual connectivity

## Integration Points

### `apps/web/src/app/(mobile)/layout.tsx`
- Add `OfflineIndicator` component to the mobile layout (rendered below children)

### `apps/web/src/app/(mobile)/jobs/page.tsx`
- Replace `JobQueueClient` with a version that wraps offline awareness (or keep as-is and pass offline data as prop)

### `apps/web/src/app/(mobile)/jobs/[id]/page.tsx`
- Modify `JobDetailClient` to use offline queue for actions

## Files Modified

1. `apps/web/src/components/mobile/JobDetailClient.tsx` — add offline-aware action dispatch
2. `apps/web/src/app/(mobile)/layout.tsx` — add OfflineIndicator

## Test Plan

1. Load job queue while online (caches jobs in IndexedDB)
2. Go offline (disable network)
3. Verify job cards still visible from cache
4. Perform a status transition offline → verify action queued, optimistic update shown
5. Add a note offline → verify action queued, note shown locally
6. Capture a signature offline → verify action queued, signature shown locally
7. Take a photo offline → verify action queued, photo shown with "pending" badge
8. Go back online → verify all actions sync in order
9. Verify job data refreshes after sync completes
10. Verify duplicate submit guard (double-tap while offline → only one syncs)
11. Verify large photo rejection (>10MB offline)
12. Run `pnpm typecheck` — zero errors
13. Run `pnpm build` — all packages pass

## What NOT to Build

- Reporting
- Payroll
- GPS tracking
- Server-side idempotency (that's a future API change — client dedup only for now)
- Pending sync count in navigation header or push notifications
