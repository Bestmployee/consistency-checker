// IndexedDB wrapper for the 'days' object store.
// Record shape: { date: "YYYY-MM-DD", status: "green" | "red", updatedAt: <epoch ms> }
// Unmarked days simply have no record.

const DB_NAME = 'consistencyCheckerDB';
const DB_VERSION = 1;
const STORE_DAYS = 'days';

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_DAYS)) {
        db.createObjectStore(STORE_DAYS, { keyPath: 'date' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

// Formats a Date object as a local "YYYY-MM-DD" string (avoids UTC shifting).
function toDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

async function setDay(dateKey, status) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_DAYS, 'readwrite');
    tx.objectStore(STORE_DAYS).put({ date: dateKey, status, updatedAt: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function deleteDay(dateKey) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_DAYS, 'readwrite');
    tx.objectStore(STORE_DAYS).delete(dateKey);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Returns { "YYYY-MM-DD": "green"|"red", ... } for all days in [startKey, endKey] inclusive.
async function getDaysInRange(startKey, endKey) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_DAYS, 'readonly');
    const range = IDBKeyRange.bound(startKey, endKey);
    const request = tx.objectStore(STORE_DAYS).getAll(range);
    request.onsuccess = () => {
      const result = {};
      for (const record of request.result) {
        result[record.date] = record.status;
      }
      resolve(result);
    };
    request.onerror = () => reject(request.error);
  });
}

async function getAllDays() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_DAYS, 'readonly');
    const request = tx.objectStore(STORE_DAYS).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Clears the store and writes the given records in one transaction (used by Import).
async function replaceAllDays(records) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_DAYS, 'readwrite');
    const store = tx.objectStore(STORE_DAYS);
    store.clear();
    for (const record of records) {
      store.put(record);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

window.ConsistencyDB = {
  toDateKey,
  setDay,
  deleteDay,
  getDaysInRange,
  getAllDays,
  replaceAllDays,
};
