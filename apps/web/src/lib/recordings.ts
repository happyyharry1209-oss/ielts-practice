/**
 * Saved Speaking recordings live in this browser's IndexedDB.
 */
import { api, getToken } from './api';

export interface SavedRecording {
  id: string;
  userId?: string;
  synced?: boolean;
  syncedMockId?: string;
  contentId: string;
  part: 1 | 2 | 3;
  mockId?: string;
  promptIndex?: number;
  topic: string;
  durationSec: number;
  createdAt: number;
  mimeType: string;
  blob: Blob;
}

const DB_NAME = 'ielts-practice';
const DB_VERSION = 1;
const STORE = 'recordings';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open IndexedDB'));
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

export async function saveRecording(recording: SavedRecording): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(recording);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Could not save recording'));
  });
  db.close();
}

export async function listRecordings(): Promise<SavedRecording[]> {
  const db = await openDb();
  const all = await requestToPromise<SavedRecording[]>(db.transaction(STORE).objectStore(STORE).getAll());
  db.close();
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export async function claimLegacyRecordings(userId: string): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const request = tx.objectStore(STORE).openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        const recording: SavedRecording = cursor.value;
        if (!recording.userId) cursor.update({ ...recording, userId });
        cursor.continue();
      };
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function syncSpeakingRecording(recording: SavedRecording, token: string | null): Promise<void> {
  if (!recording.userId || !token || token !== getToken()) throw new Error('Signed-in account changed');
  const { clientId, mockId } = await api<{ clientId: string; mockId?: string | null }>('/api/speaking/recordings', {
    method: 'POST',
    json: {
      clientId: recording.id,
      mockId: recording.mockId,
      contentId: recording.contentId,
      part: recording.part,
      promptIndex: recording.promptIndex,
      prompt: recording.topic.slice(0, 2000),
      durationSec: recording.durationSec,
      createdAt: new Date(recording.createdAt).toISOString(),
    },
  });
  if (clientId !== recording.id) throw new Error('Recording history is unavailable');

  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const request = store.get(recording.id);
      request.onsuccess = () => {
        const saved: SavedRecording | undefined = request.result;
        if (saved && saved.userId === recording.userId) {
          store.put({ ...saved, synced: true, syncedMockId: mockId ?? saved.syncedMockId });
        }
      };
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export function isRecordingSynced(recording: SavedRecording): boolean {
  return Boolean(recording.synced && (!recording.mockId || recording.syncedMockId === recording.mockId));
}

export async function deleteRecording(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Could not delete recording'));
  });
  db.close();
}

export async function clearRecordings(): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Could not clear recordings'));
  });
  db.close();
}
