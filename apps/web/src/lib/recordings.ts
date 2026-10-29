/**
 * Speaking recordings live in IndexedDB: they survive a refresh and never
 * leave the browser. Nothing is uploaded, so they are per-browser only.
 */
export interface SavedRecording {
  id: string;
  contentId: string;
  part: number;
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

export async function saveRecording(
  input: Omit<SavedRecording, 'id' | 'createdAt'> & { createdAt?: number },
): Promise<SavedRecording> {
  const db = await openDb();
  const recording: SavedRecording = {
    ...input,
    id: crypto.randomUUID(),
    createdAt: input.createdAt ?? Date.now(),
  };
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(recording);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Could not save recording'));
  });
  db.close();
  return recording;
}

export async function listRecordings(): Promise<SavedRecording[]> {
  const db = await openDb();
  const all = await requestToPromise<SavedRecording[]>(db.transaction(STORE).objectStore(STORE).getAll());
  db.close();
  return all.sort((a, b) => b.createdAt - a.createdAt);
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
