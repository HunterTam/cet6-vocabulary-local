// Lightweight IndexedDB mirror for localStorage keys so iOS Safari / PWA never silently loses study progress.
// Safe no-op in Node.js test environments or restricted private browsing modes.

const DB_NAME = "cet6-vocab-durable-v1";
const STORE_NAME = "kv";

const MIRRORED_KEYS = [
  "cet6-vocabulary-local-v1",
  "cet6-vocabulary-drive-v1",
  "cet6-deck-sessions-v2",
  "cet6-deck-cursors-v1",
  "cet6-selected-deck-v1",
  "cet6-deck-tab-v1",
  "cet6-study-prefs-v1",
  "cet6-audio-prefs-v1",
  "cet6-unlocked-batch-v1",
  "cet6-exam-date-v1",
] as const;

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase | null>(resolve => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

export function mirrorKeyToDurable(key: string, value: string | null) {
  if (typeof indexedDB === "undefined") return;
  void openDb().then(db => {
    if (!db) return;
    try {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      if (value === null) store.delete(key);
      else store.put(value, key);
    } catch {}
  });
}

export function requestPersistentStorage() {
  try {
    if (typeof navigator !== "undefined" && navigator.storage?.persist) {
      void navigator.storage.persist().catch(() => undefined);
    }
  } catch {}
}

/**
 * Restores any missing localStorage keys from IndexedDB (e.g. after iOS clears localStorage)
 * and backs up existing localStorage keys into IndexedDB.
 * Returns true if localStorage was hydrated with recovered study progress.
 */
export async function syncDurableMirror(): Promise<boolean> {
  if (typeof indexedDB === "undefined" || typeof localStorage === "undefined") return false;
  const db = await openDb();
  if (!db) return false;

  let restoredRecords = false;
  await new Promise<void>(resolve => {
    try {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      let pending = MIRRORED_KEYS.length;

      for (const key of MIRRORED_KEYS) {
        const localVal = localStorage.getItem(key);
        const getReq = store.get(key);
        getReq.onsuccess = () => {
          const idbVal = typeof getReq.result === "string" ? getReq.result : null;
          const localEmpty = !localVal || localVal === "[]" || localVal === "{}";
          const idbHasData = Boolean(idbVal && idbVal !== "[]" && idbVal !== "{}");
          if (localEmpty && idbHasData) {
            try {
              localStorage.setItem(key, idbVal!);
              if (key === "cet6-vocabulary-local-v1" || key === "cet6-vocabulary-drive-v1") {
                restoredRecords = true;
              }
            } catch {}
          } else if (localVal && localVal !== idbVal) {
            try {
              store.put(localVal, key);
            } catch {}
          }
          if (--pending === 0) resolve();
        };
        getReq.onerror = () => {
          if (--pending === 0) resolve();
        };
      }
    } catch {
      resolve();
    }
  });

  return restoredRecords;
}
