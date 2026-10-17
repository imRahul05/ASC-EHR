/**
 * AIMS Offline Flowsheet Queue.
 *
 * Regulations & Standards:
 * - NFR-14: Zero data loss during intra-operative anesthesia flowsheet charting.
 * - HIPAA 45 CFR § 164.312(a)(2)(iii): Emergency mode offline operation and local queue purge
 *   on session termination to prevent PHI retention on shared clinical devices.
 */

import type { AimsBatchEntry, AnesthesiaEntryPayload } from "@asc/types";
import { syncAimsBatch } from "../clinical/cases";

const DB_NAME = "asc_aims_offline";
const DB_VERSION = 1;
const STORE_NAME = "queue";
const MAX_BATCH_SIZE = 200;

// In-memory fallback for SSR, test environments, or when IndexedDB is unavailable
const memoryQueue = new Map<string, AimsBatchEntry>();

let cachedDb: IDBDatabase | null = null;
let openDbPromise: Promise<IDBDatabase | null> | null = null;

function getIndexedDb(): IDBFactory | null {
  if (typeof globalThis !== "undefined" && globalThis.indexedDB) {
    return globalThis.indexedDB;
  }
  return null;
}

function openDatabase(): Promise<IDBDatabase | null> {
  if (cachedDb) {
    return Promise.resolve(cachedDb);
  }
  if (openDbPromise) {
    return openDbPromise;
  }

  const factory = getIndexedDb();
  if (!factory) {
    return Promise.resolve(null);
  }

  openDbPromise = new Promise<IDBDatabase | null>((resolve) => {
    try {
      const request = factory.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: "clientId" });
          store.createIndex("caseId", "caseId", { unique: false });
          store.createIndex("recordedAt", "recordedAt", { unique: false });
          store.createIndex("facilityId", "facilityId", { unique: false });
          store.createIndex("userId", "userId", { unique: false });
        }
      };

      request.onsuccess = () => {
        const db = request.result;
        cachedDb = db;
        openDbPromise = null;
        db.onversionchange = () => {
          db.close();
          cachedDb = null;
        };
        db.onclose = () => {
          cachedDb = null;
        };
        resolve(db);
      };

      request.onerror = () => {
        openDbPromise = null;
        resolve(null);
      };
    } catch {
      openDbPromise = null;
      resolve(null);
    }
  });

  return openDbPromise;
}

/**
 * Explicitly closes the cached IndexedDB connection (useful in test teardown).
 */
export function closeDatabase(): void {
  if (cachedDb) {
    cachedDb.close();
    cachedDb = null;
  }
  openDbPromise = null;
}

function generateClientId(): string {
  if (typeof globalThis !== "undefined" && globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `offline-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export interface EnqueueAimsEntryOptions {
  readonly caseId: string;
  readonly payload: AnesthesiaEntryPayload;
  readonly facilityId?: string;
  readonly userId?: string;
}

/**
 * Enqueues an anesthesia flowsheet entry into offline storage.
 * Supports passing either an options object or positional arguments.
 */
export async function enqueueAimsEntry(
  caseIdOrOptions: string | EnqueueAimsEntryOptions,
  payloadOrUndefined?: AnesthesiaEntryPayload,
  facilityId?: string,
  userId?: string,
): Promise<string> {
  const caseId = typeof caseIdOrOptions === "object" ? caseIdOrOptions.caseId : caseIdOrOptions;
  const payload =
    typeof caseIdOrOptions === "object" ? caseIdOrOptions.payload : payloadOrUndefined!;
  const facId = typeof caseIdOrOptions === "object" ? caseIdOrOptions.facilityId : facilityId;
  const uId = typeof caseIdOrOptions === "object" ? caseIdOrOptions.userId : userId;

  const clientId = generateClientId();
  const entry: AimsBatchEntry = {
    clientId,
    caseId,
    facilityId: facId,
    userId: uId,
    payload,
    recordedAt: new Date().toISOString(),
  };

  const db = await openDatabase();
  if (!db) {
    memoryQueue.set(clientId, entry);
    return clientId;
  }

  return new Promise<string>((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const request = store.put(entry);

      request.onsuccess = () => resolve(clientId);
      request.onerror = () => {
        // Fallback to memory on store error
        memoryQueue.set(clientId, entry);
        resolve(clientId);
      };
      tx.onerror = () => {
        memoryQueue.set(clientId, entry);
        resolve(clientId);
      };
    } catch {
      memoryQueue.set(clientId, entry);
      resolve(clientId);
    }
  });
}

export interface GetPendingAimsOptions {
  readonly caseId?: string;
  readonly facilityId?: string;
  readonly userId?: string;
}

function matchesEntryFilter(
  entry: AimsBatchEntry,
  caseId?: string,
  facilityId?: string,
  userId?: string,
): boolean {
  if (caseId && entry.caseId !== caseId) return false;
  if (facilityId && entry.facilityId && entry.facilityId !== facilityId) return false;
  if (userId && entry.userId && entry.userId !== userId) return false;
  return true;
}

/**
 * Retrieves all pending offline AIMS entries for a given case, sorted chronologically.
 */
export async function getPendingAimsEntries(
  caseIdOrOptions?: string | GetPendingAimsOptions,
): Promise<readonly AimsBatchEntry[]> {
  const caseId = typeof caseIdOrOptions === "object" ? caseIdOrOptions.caseId : caseIdOrOptions;
  const facilityId = typeof caseIdOrOptions === "object" ? caseIdOrOptions.facilityId : undefined;
  const userId = typeof caseIdOrOptions === "object" ? caseIdOrOptions.userId : undefined;

  const db = await openDatabase();
  if (!db) {
    const filtered = Array.from(memoryQueue.values()).filter((e) =>
      matchesEntryFilter(e, caseId, facilityId, userId),
    );
    return filtered.sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
  }

  return new Promise<readonly AimsBatchEntry[]>((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const results: AimsBatchEntry[] = [];
      const request = store.openCursor();

      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          const item = cursor.value as AimsBatchEntry;
          if (item && matchesEntryFilter(item, caseId, facilityId, userId)) {
            results.push(item);
          }
          cursor.continue();
        } else {
          // Include any in-memory fallback entries as well
          for (const item of memoryQueue.values()) {
            if (
              matchesEntryFilter(item, caseId, facilityId, userId) &&
              !results.some((r) => r.clientId === item.clientId)
            ) {
              results.push(item);
            }
          }
          resolve(results.sort((a, b) => a.recordedAt.localeCompare(b.recordedAt)));
        }
      };

      request.onerror = () => {
        const filtered = Array.from(memoryQueue.values()).filter((e) =>
          matchesEntryFilter(e, caseId, facilityId, userId),
        );
        resolve(filtered.sort((a, b) => a.recordedAt.localeCompare(b.recordedAt)));
      };
    } catch {
      const filtered = Array.from(memoryQueue.values()).filter((e) =>
        matchesEntryFilter(e, caseId, facilityId, userId),
      );
      resolve(filtered.sort((a, b) => a.recordedAt.localeCompare(b.recordedAt)));
    }
  });
}

/**
 * Deletes synchronized entries from offline storage by their client IDs.
 */
async function removeAimsEntries(clientIds: readonly string[]): Promise<void> {
  for (const id of clientIds) {
    memoryQueue.delete(id);
  }

  const db = await openDatabase();
  if (!db) return;

  return new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      for (const id of clientIds) {
        store.delete(id);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export interface FlushAimsQueueOptions {
  readonly facilityId?: string;
  readonly userId?: string;
}

/**
 * Flushes pending offline entries for a case by sending them in batches to the API.
 */
export async function flushAimsQueue(
  caseId: string,
  facilityIdOrOptions?: string | FlushAimsQueueOptions,
): Promise<{ readonly synced: number; readonly remaining: number }> {
  const facilityId =
    typeof facilityIdOrOptions === "object"
      ? facilityIdOrOptions.facilityId
      : facilityIdOrOptions;
  const userId =
    typeof facilityIdOrOptions === "object"
      ? facilityIdOrOptions.userId
      : undefined;

  const pending = await getPendingAimsEntries({ caseId, facilityId, userId });
  if (pending.length === 0) {
    return { synced: 0, remaining: 0 };
  }

  const batch = pending.slice(0, MAX_BATCH_SIZE);
  await syncAimsBatch(caseId, batch, facilityId);

  const syncedIds = batch.map((item) => item.clientId);
  await removeAimsEntries(syncedIds);

  const remainingEntries = await getPendingAimsEntries({ caseId, facilityId, userId });
  return {
    synced: batch.length,
    remaining: remainingEntries.length,
  };
}

export interface ClearAimsQueueOptions {
  readonly caseId?: string;
  readonly facilityId?: string;
  readonly userId?: string;
}

/**
 * Purges offline queue. When caseId or filter options are specified, deletes matching entries.
 * When called without arguments, purges ALL offline data (required on logout / session end per HIPAA).
 */
export async function clearAimsQueue(
  caseIdOrOptions?: string | ClearAimsQueueOptions,
): Promise<void> {
  const caseId = typeof caseIdOrOptions === "object" ? caseIdOrOptions.caseId : caseIdOrOptions;
  const facilityId = typeof caseIdOrOptions === "object" ? caseIdOrOptions.facilityId : undefined;
  const userId = typeof caseIdOrOptions === "object" ? caseIdOrOptions.userId : undefined;

  if (caseId || facilityId || userId) {
    const entries = await getPendingAimsEntries({ caseId, facilityId, userId });
    await removeAimsEntries(entries.map((e) => e.clientId));
    return;
  }

  memoryQueue.clear();

  const db = await openDatabase();
  if (!db) return;

  return new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

/**
 * Returns the count of pending offline entries for a given case or filter, or total pending if omitted.
 */
export async function getAimsQueueSize(
  caseIdOrOptions?: string | GetPendingAimsOptions,
): Promise<number> {
  const caseId = typeof caseIdOrOptions === "object" ? caseIdOrOptions.caseId : caseIdOrOptions;
  const facilityId = typeof caseIdOrOptions === "object" ? caseIdOrOptions.facilityId : undefined;
  const userId = typeof caseIdOrOptions === "object" ? caseIdOrOptions.userId : undefined;

  if (caseId || facilityId || userId) {
    const entries = await getPendingAimsEntries({ caseId, facilityId, userId });
    return entries.length;
  }

  const db = await openDatabase();
  if (!db) {
    return memoryQueue.size;
  }

  return new Promise<number>((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const countReq = store.count();
      countReq.onsuccess = () => resolve(countReq.result);
      countReq.onerror = () => resolve(memoryQueue.size);
    } catch {
      resolve(memoryQueue.size);
    }
  });
}
