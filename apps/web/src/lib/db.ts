import type { ScheduleWithDetails } from '@fieldconnect/shared';
import type { OfflineAction, StoredBlob } from './offline-types';

const DB_NAME = 'fieldconnect-offline';
const DB_VERSION = 1;

const MAX_PHOTO_BYTES = 10 * 1024 * 1024; // 10 MB

// ─── Open / Initialize ──────────────────────────────────────────────────────

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Jobs cache — one row per job, keyed by id
      if (!db.objectStoreNames.contains('jobs')) {
        const store = db.createObjectStore('jobs', { keyPath: 'id' });
        store.createIndex('technician_id', 'technician_id', { unique: false });
      }

      // Offline action queue — one row per action, keyed by idempotency key
      if (!db.objectStoreNames.contains('queue')) {
        const store = db.createObjectStore('queue', { keyPath: 'id' });
        store.createIndex('scheduleId', 'scheduleId', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }

      // Blob storage for queued photo uploads
      if (!db.objectStoreNames.contains('blobs')) {
        const store = db.createObjectStore('blobs', { keyPath: 'id' });
        store.createIndex('actionId', 'actionId', { unique: false });
      }
    };

    request.onsuccess = (event) => {
      resolve((event.target as IDBOpenDBRequest).result);
    };

    request.onerror = (event) => {
      reject((event.target as IDBOpenDBRequest).error);
    };
  });

  return dbPromise;
}

// ─── Generic Transaction Helper ────────────────────────────────────────────

async function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDB();
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    const request = fn(store);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ─── Jobs Cache ────────────────────────────────────────────────────────────

export async function cacheJobs(jobs: ScheduleWithDetails[]): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('jobs', 'readwrite');
    const store = transaction.objectStore('jobs');

    // Clear existing then bulk insert
    store.clear();

    for (const job of jobs) {
      store.put(job);
    }

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function getCachedJobs(): Promise<ScheduleWithDetails[]> {
  return withStore('jobs', 'readonly', (store) => store.getAll());
}

export async function getCachedJob(
  id: string,
): Promise<ScheduleWithDetails | null> {
  return withStore('jobs', 'readonly', (store) => store.get(id)).then(
    (result) => result ?? null,
  );
}

export async function cacheJob(job: ScheduleWithDetails): Promise<void> {
  return withStore('jobs', 'readwrite', (store) => store.put(job)).then(
    () => undefined,
  );
}

export async function clearJobCache(): Promise<void> {
  return withStore('jobs', 'readwrite', (store) => store.clear()).then(
    () => undefined,
  );
}

// ─── Action Queue ──────────────────────────────────────────────────────────

export async function enqueueAction(
  action: OfflineAction,
): Promise<void> {
  return withStore('queue', 'readwrite', (store) => store.add(action)).then(
    () => undefined,
  );
}

export async function getPendingActions(): Promise<OfflineAction[]> {
  return withStore('queue', 'readonly', (store) => store.getAll()).then(
    (actions) =>
      actions.sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      ),
  );
}

export async function getQueueSize(): Promise<number> {
  return withStore('queue', 'readonly', (store) => store.count());
}

export async function removeAction(id: string): Promise<void> {
  // Also clean up any associated blobs
  await removeBlobsByActionId(id);
  return withStore('queue', 'readwrite', (store) => store.delete(id)).then(
    () => undefined,
  );
}

export async function markActionFailed(
  id: string,
  error: string,
  newRetryCount: number,
): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('queue', 'readwrite');
    const store = transaction.objectStore('queue');
    const getRequest = store.get(id);

    getRequest.onsuccess = () => {
      const action = getRequest.result as OfflineAction | undefined;
      if (!action) {
        resolve();
        return;
      }
      action.retryCount = newRetryCount;
      action.lastError = error;
      store.put(action);
    };

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function clearFailedActions(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('queue', 'readwrite');
    const store = transaction.objectStore('queue');
    const request = store.getAll();

    request.onsuccess = () => {
      const actions = request.result as OfflineAction[];
      for (const action of actions) {
        if (action.retryCount >= 3) {
          store.delete(action.id);
        }
      }
    };

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

// ─── Blob Storage (for queued photo uploads) ───────────────────────────────

/**
 * Store a photo Blob for offline queued upload.
 * Rejects if the blob exceeds MAX_PHOTO_BYTES.
 */
export async function storeBlob(
  actionId: string,
  blob: Blob,
  fileName: string,
): Promise<StoredBlob> {
  if (blob.size > MAX_PHOTO_BYTES) {
    throw new Error(
      `Photo is too large for offline queue (${(blob.size / (1024 * 1024)).toFixed(1)} MB). Max is 10 MB.`,
    );
  }

  const record: StoredBlob = {
    id: crypto.randomUUID(),
    actionId,
    blob,
    fileName,
    mimeType: blob.type || 'image/jpeg',
    fileSize: blob.size,
  };

  return withStore('blobs', 'readwrite', (store) => store.add(record)).then(
    () => record,
  );
}

export async function getBlob(id: string): Promise<StoredBlob | null> {
  return withStore('blobs', 'readonly', (store) => store.get(id)).then(
    (result) => result ?? null,
  );
}

export async function deleteBlob(id: string): Promise<void> {
  return withStore('blobs', 'readwrite', (store) => store.delete(id)).then(
    () => undefined,
  );
}

async function removeBlobsByActionId(actionId: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('blobs', 'readwrite');
    const store = transaction.objectStore('blobs');
    const index = store.index('actionId');
    const request = index.getAllKeys(IDBKeyRange.only(actionId));

    request.onsuccess = () => {
      const keys = request.result;
      for (const key of keys) {
        store.delete(key);
      }
    };

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

// ─── Clear All Data ────────────────────────────────────────────────────────

export async function clearAllData(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(
      ['jobs', 'queue', 'blobs'],
      'readwrite',
    );
    transaction.objectStore('jobs').clear();
    transaction.objectStore('queue').clear();
    transaction.objectStore('blobs').clear();
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}
