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

function getIndexedDb(): IDBFactory | null {
  if (typeof globalThis !== "undefined" && globalThis.indexedDB) {
    return globalThis.indexedDB;
  }
  return null;
}

function openDatabase(): Promise<IDBDatabase | null> {
  const factory = getIndexedDb();
  if (!factory) {
    return Promise.resolve(null);
  }

  return new Promise<IDBDatabase | null>((resolve) => {
    try {
      const request = factory.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: "clientId" });
          store.createIndex("caseId", "caseId", { unique: false });
          store.createIndex("recordedAt", "recordedAt", { unique: false });
        }
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        resolve(null);
      };
    } catch {
      resolve(null);
    }
  });
}

function generateClientId(): string {
  if (typeof globalThis !== "undefined" && globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `offline-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Enqueues an anesthesia flowsheet entry into offline storage.
 */
export async function enqueueAimsEntry(
  caseId: string,
  payload: AnesthesiaEntryPayload,
): Promise<string> {
  const clientId = generateClientId();
  const entry: AimsBatchEntry = {
    clientId,
    caseId,
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

/**
 * Retrieves all pending offline AIMS entries for a given case, sorted chronologically.
 */
export async function getPendingAimsEntries(caseId: string): Promise<readonly AimsBatchEntry[]> {
  const db = await openDatabase();
  if (!db) {
    const filtered = Array.from(memoryQueue.values()).filter((e) => e.caseId === caseId);
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
          if (item && item.caseId === caseId) {
            results.push(item);
          }
          cursor.continue();
        } else {
          // Include any in-memory fallback entries as well
          for (const item of memoryQueue.values()) {
            if (item.caseId === caseId && !results.some((r) => r.clientId === item.clientId)) {
              results.push(item);
            }
          }
          resolve(results.sort((a, b) => a.recordedAt.localeCompare(b.recordedAt)));
        }
      };

      request.onerror = () => {
        const filtered = Array.from(memoryQueue.values()).filter((e) => e.caseId === caseId);
        resolve(filtered.sort((a, b) => a.recordedAt.localeCompare(b.recordedAt)));
      };
    } catch {
      const filtered = Array.from(memoryQueue.values()).filter((e) => e.caseId === caseId);
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

/**
 * Flushes pending offline entries for a case by sending them in batches to the API.
 */
export async function flushAimsQueue(
  caseId: string,
  facilityId?: string,
): Promise<{ readonly synced: number; readonly remaining: number }> {
  const pending = await getPendingAimsEntries(caseId);
  if (pending.length === 0) {
    return { synced: 0, remaining: 0 };
  }

  const batch = pending.slice(0, MAX_BATCH_SIZE);
  await syncAimsBatch(caseId, batch, facilityId);

  const syncedIds = batch.map((item) => item.clientId);
  await removeAimsEntries(syncedIds);

  const remainingEntries = await getPendingAimsEntries(caseId);
  return {
    synced: batch.length,
    remaining: remainingEntries.length,
  };
}

/**
 * Purges offline queue. When caseId is specified, deletes entries for that case.
 * When caseId is omitted, purges ALL offline data (required on logout / session end per HIPAA).
 */
export async function clearAimsQueue(caseId?: string): Promise<void> {
  if (caseId) {
    const entries = await getPendingAimsEntries(caseId);
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
 * Returns the count of pending offline entries for a given case, or total pending if omitted.
 */
export async function getAimsQueueSize(caseId?: string): Promise<number> {
  if (caseId) {
    const entries = await getPendingAimsEntries(caseId);
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
