import type { AppFileData } from '@/lib/types';

const DB_NAME = 'rotawise';
const DB_VERSION = 1;
const STORE = 'kv';

export const WORKING_COPY_KEY = 'workingCopy';
export const FILE_HANDLE_KEY = 'fileHandle';

export type PersistenceMode = 'browser' | 'file';

export interface SessionMeta {
  mode: PersistenceMode;
  fileName: string | null;
}

export interface WorkingCopy {
  data: AppFileData;
  meta: SessionMeta;
}

const memory = new Map<string, unknown>();

function canUseIdb(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && typeof indexedDB.open === 'function';
  } catch {
    return false;
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('indexedDB.open failed'));
  });
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result as T | undefined);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const req = tx.objectStore(STORE).put(value, key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

async function idbDel(key: string): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const req = tx.objectStore(STORE).delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

async function storageGet<T>(key: string): Promise<T | undefined> {
  if (canUseIdb()) {
    try {
      return await idbGet<T>(key);
    } catch (err) {
      console.warn('[browser-storage] IndexedDB get failed, using memory', err);
    }
  }
  return memory.get(key) as T | undefined;
}

async function storageSet(key: string, value: unknown): Promise<void> {
  memory.set(key, value);
  if (!canUseIdb()) return;
  try {
    await idbSet(key, value);
  } catch (err) {
    console.warn('[browser-storage] IndexedDB set failed, using memory', err);
  }
}

async function storageDel(key: string): Promise<void> {
  memory.delete(key);
  if (!canUseIdb()) return;
  try {
    await idbDel(key);
  } catch (err) {
    console.warn('[browser-storage] IndexedDB delete failed', err);
  }
}

export async function loadWorkingCopy(): Promise<WorkingCopy | null> {
  const copy = await storageGet<WorkingCopy>(WORKING_COPY_KEY);
  return copy ?? null;
}

export async function saveWorkingCopy(data: AppFileData, meta: SessionMeta): Promise<void> {
  const copy: WorkingCopy = { data, meta };
  await storageSet(WORKING_COPY_KEY, copy);
}

export async function clearWorkingCopy(): Promise<void> {
  await storageDel(WORKING_COPY_KEY);
}

export async function loadPersistedFileHandle(): Promise<FileSystemFileHandle | null> {
  const handle = await storageGet<FileSystemFileHandle>(FILE_HANDLE_KEY);
  return handle ?? null;
}

export async function savePersistedFileHandle(handle: FileSystemFileHandle): Promise<void> {
  await storageSet(FILE_HANDLE_KEY, handle);
}

export async function clearPersistedFileHandle(): Promise<void> {
  await storageDel(FILE_HANDLE_KEY);
}

/** Test-only: wipe the in-memory fallback. IndexedDB is origin-scoped. */
export function resetMemoryFallback(): void {
  memory.clear();
}
