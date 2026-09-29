// IndexedDB wrapper.
// 'days' record shape: { date: "YYYY-MM-DD", status: "green" | "red", updatedAt: <epoch ms> }
// Unmarked days simply have no record.
// 'entries' record shape (v2): { id, date: "YYYY-MM-DD", type: "gym" | "reading", createdAt, updatedAt,
//   equipment: [{ itemId, sets, reps }, ...] (gym) | bookItemId, pages (reading) }
// 'savedItems' record shape (v2): { id, type: "equipment" | "book", name, archived, photo: null, createdAt, updatedAt }

const DB_NAME = 'consistencyCheckerDB';
const DB_VERSION = 2;
const STORE_DAYS = 'days';
const STORE_ENTRIES = 'entries';
const STORE_SAVED_ITEMS = 'savedItems';

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
      if (!db.objectStoreNames.contains(STORE_ENTRIES)) {
        const entries = db.createObjectStore(STORE_ENTRIES, { keyPath: 'id', autoIncrement: true });
        entries.createIndex('date', 'date');
      }
      if (!db.objectStoreNames.contains(STORE_SAVED_ITEMS)) {
        const savedItems = db.createObjectStore(STORE_SAVED_ITEMS, { keyPath: 'id', autoIncrement: true });
        savedItems.createIndex('type', 'type');
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

// Returns the day record ({ date, status, updatedAt }) or null if the day is unmarked.
async function getDay(dateKey) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_DAYS, 'readonly');
    const request = tx.objectStore(STORE_DAYS).get(dateKey);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
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

// --- Entries ---

async function getEntriesForDate(dateKey) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_ENTRIES, 'readonly');
    const request = tx.objectStore(STORE_ENTRIES).index('date').getAll(dateKey);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Adds a new entry (any id passed in is ignored); sets createdAt/updatedAt. Resolves with the new id.
async function addEntry(entry) {
  const db = await openDB();
  const now = Date.now();
  const record = { ...entry, createdAt: now, updatedAt: now };
  delete record.id;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_ENTRIES, 'readwrite');
    const request = tx.objectStore(STORE_ENTRIES).add(record);
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = () => reject(tx.error);
  });
}

// Overwrites an existing entry (must include id); refreshes updatedAt.
async function updateEntry(entry) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_ENTRIES, 'readwrite');
    tx.objectStore(STORE_ENTRIES).put({ ...entry, updatedAt: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function deleteEntry(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_ENTRIES, 'readwrite');
    tx.objectStore(STORE_ENTRIES).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getAllEntries() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_ENTRIES, 'readonly');
    const request = tx.objectStore(STORE_ENTRIES).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// --- Saved items (equipment and books) ---

// Returns saved items of one type; archived items are excluded unless includeArchived is true.
async function getSavedItems(type, { includeArchived = false } = {}) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_SAVED_ITEMS, 'readonly');
    const request = tx.objectStore(STORE_SAVED_ITEMS).index('type').getAll(type);
    request.onsuccess = () => {
      resolve(includeArchived ? request.result : request.result.filter((item) => !item.archived));
    };
    request.onerror = () => reject(request.error);
  });
}

// Resolves with the new item's id.
async function addSavedItem(type, name) {
  const db = await openDB();
  const now = Date.now();
  const record = { type, name, archived: false, photo: null, createdAt: now, updatedAt: now };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_SAVED_ITEMS, 'readwrite');
    const request = tx.objectStore(STORE_SAVED_ITEMS).add(record);
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = () => reject(tx.error);
  });
}

// Reads and rewrites one saved item in a single transaction, applying the changes and refreshing updatedAt.
async function modifySavedItem(id, changes) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_SAVED_ITEMS, 'readwrite');
    const store = tx.objectStore(STORE_SAVED_ITEMS);
    const request = store.get(id);
    request.onsuccess = () => {
      if (!request.result) {
        tx.abort();
        return;
      }
      store.put({ ...request.result, ...changes, updatedAt: Date.now() });
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error(`Saved item ${id} not found`));
  });
}

async function updateSavedItem(id, { name }) {
  return modifySavedItem(id, { name });
}

async function archiveSavedItem(id) {
  return modifySavedItem(id, { archived: true });
}

// Counts entries that reference the item (a Gym entry's equipment rows or a Reading entry's book).
async function getEntryCountForItem(itemId) {
  const entries = await getAllEntries();
  return entries.filter((entry) =>
    entry.bookItemId === itemId ||
    (Array.isArray(entry.equipment) && entry.equipment.some((row) => row.itemId === itemId))
  ).length;
}

async function getAllSavedItems() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_SAVED_ITEMS, 'readonly');
    const request = tx.objectStore(STORE_SAVED_ITEMS).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Clears all three stores and writes the given records in one transaction (used by Import).
// Either everything is replaced or, on any failure, nothing changes.
async function replaceAllData({ days = [], entries = [], savedItems = [] }) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_DAYS, STORE_ENTRIES, STORE_SAVED_ITEMS], 'readwrite');
    const daysStore = tx.objectStore(STORE_DAYS);
    const entriesStore = tx.objectStore(STORE_ENTRIES);
    const savedItemsStore = tx.objectStore(STORE_SAVED_ITEMS);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
    try {
      daysStore.clear();
      entriesStore.clear();
      savedItemsStore.clear();
      for (const record of days) daysStore.put(record);
      for (const record of entries) entriesStore.put(record);
      for (const record of savedItems) savedItemsStore.put(record);
    } catch (err) {
      // A record was rejected outright (e.g. missing key); abort so the clears above are rolled back.
      tx.abort();
      reject(err);
    }
  });
}

window.ConsistencyDB = {
  toDateKey,
  getDay,
  setDay,
  deleteDay,
  getDaysInRange,
  getAllDays,
  replaceAllDays,
  getEntriesForDate,
  addEntry,
  updateEntry,
  deleteEntry,
  getAllEntries,
  getSavedItems,
  addSavedItem,
  updateSavedItem,
  archiveSavedItem,
  getEntryCountForItem,
  getAllSavedItems,
  replaceAllData,
};
