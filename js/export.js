// Export/import of all app data as a JSON backup file.
// Export writes schema version 4: { schemaVersion, exportedAt, days, entries, savedItems }.
// Version 3 is version 2 plus an optional deletedAt on saved items (permanently deleted
// items, kept so past entries still show their names).
// Version 4 is version 3 plus equipment photos: a saved item's photo is null or a
// "data:image/jpeg;base64,..." string (stored in the app as a JPEG Blob).
// Import accepts schema version 1 (Stage 1 backups: days only), and versions 2, 3 and 4. The whole
// file is validated (every photo is checked to open as an image) before anything is written;
// only after the owner confirms the counts are all three stores replaced, in one atomic
// transaction (ConsistencyDB.replaceAllData).

const SCHEMA_VERSION = 4;

// Largest photo accepted from a backup (the app itself stores far smaller ones).
const MAX_BACKUP_PHOTO_BYTES = 2 * 1024 * 1024;
const JPEG_DATA_URL_PREFIX = 'data:image/jpeg;base64,';

const NOT_A_BACKUP = "That file doesn't look like a Consistency Checker backup.";

// Schema versions 2 and 3 are strict: these are the only fields allowed.
const V2_FIELDS = {
  backup: ['schemaVersion', 'exportedAt', 'days', 'entries', 'savedItems'],
  day: ['date', 'status', 'updatedAt'],
  savedItem: ['id', 'type', 'name', 'archived', 'photo', 'createdAt', 'updatedAt'],
  gym: ['id', 'date', 'type', 'equipment', 'createdAt', 'updatedAt'],
  gymRow: ['itemId', 'sets', 'reps'],
  reading: ['id', 'date', 'type', 'bookItemId', 'pages', 'createdAt', 'updatedAt'],
};

// Versions 3 and 4 allow exactly the version 2 fields, plus deletedAt on saved items.
const V3_SAVED_ITEM_FIELDS = [...V2_FIELDS.savedItem, 'deletedAt'];

function todayFilenameSuffix() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

// A stored photo (Blob) can't go into JSON directly, so it is written as a data URL.
async function savedItemForBackup(item) {
  if (!(item.photo instanceof Blob)) return item;
  return { ...item, photo: await blobToDataUrl(item.photo) };
}

async function exportToFile() {
  const days = await ConsistencyDB.getAllDays();
  const entries = await ConsistencyDB.getAllEntries();
  const savedItems = await Promise.all((await ConsistencyDB.getAllSavedItems()).map(savedItemForBackup));
  const payload = {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    days,
    entries,
    savedItems,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `consistency-checker-backup-${todayFilenameSuffix()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// --- Validation (pure: never reads or writes storage) ---

function rejectBackup(problem) {
  throw new Error(`That backup file can't be imported: ${problem}`);
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasField(record, field) {
  return Object.prototype.hasOwnProperty.call(record, field);
}

function isPositiveSafeInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function isNonNegativeSafeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

// Exact "YYYY-MM-DD" naming a real calendar date, checked from its numeric parts
// (never new Date(dateString), which is read as UTC and can shift the day).
function isRealDateKey(value) {
  const match = typeof value === 'string' && /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1) return false;
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  return day <= daysInMonth;
}

function checkOnlyFields(record, allowed, label) {
  for (const field of Object.keys(record)) {
    if (!allowed.includes(field)) rejectBackup(`${label} has an unknown field "${field}".`);
  }
}

function checkTimestamps(record, label) {
  for (const field of ['createdAt', 'updatedAt']) {
    if (!isNonNegativeSafeInteger(record[field])) rejectBackup(`${label} has an invalid ${field}.`);
  }
}

// Days, for both versions. Version 1 keeps Stage 1's tolerance (extra fields and any
// updatedAt accepted; see canonicalV1Day); version 2 allows only known fields and
// checks updatedAt if present.
function validateDays(days, strict) {
  const seenDates = new Set();
  days.forEach((day, i) => {
    const label = `day ${i + 1}`;
    if (!isPlainObject(day)) rejectBackup(`${label} is not a valid day record.`);
    if (strict) checkOnlyFields(day, V2_FIELDS.day, label);
    if (!isRealDateKey(day.date)) rejectBackup(`${label} has an invalid date.`);
    if (day.status !== 'green' && day.status !== 'red') rejectBackup(`${label} (${day.date}) has an invalid status.`);
    if (strict && hasField(day, 'updatedAt') && !isNonNegativeSafeInteger(day.updatedAt)) {
      rejectBackup(`${label} (${day.date}) has an invalid updatedAt.`);
    }
    if (seenDates.has(day.date)) rejectBackup(`the date ${day.date} appears more than once.`);
    seenDates.add(day.date);
  });
}

// A version 1 file is accepted with Stage 1's tolerance, but only the fields a
// version 2 backup allows are stored, so the data can later be exported and
// re-imported: date and status always, updatedAt only if it is a valid timestamp.
function canonicalV1Day(day) {
  const record = { date: day.date, status: day.status };
  if (isNonNegativeSafeInteger(day.updatedAt)) record.updatedAt = day.updatedAt;
  return record;
}

// Checks a version 4 photo: null, or a JPEG data URL no larger than the backup limit.
// (Whether it really opens as an image is checked afterwards, in decodeBackupPhotos.)
function checkBackupPhoto(item, label) {
  if (item.photo === null) return;
  if (item.type !== 'equipment') rejectBackup(`${label} is a book with a photo, which isn't allowed.`);
  if (hasField(item, 'deletedAt')) rejectBackup(`${label} is permanently deleted but still has a photo.`);
  const base64 = typeof item.photo === 'string' && item.photo.startsWith(JPEG_DATA_URL_PREFIX)
    ? item.photo.slice(JPEG_DATA_URL_PREFIX.length) : null;
  if (base64 === null || base64.length === 0 || base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
    rejectBackup(`${label} has an invalid photo.`);
  }
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  if ((base64.length / 4) * 3 - padding > MAX_BACKUP_PHOTO_BYTES) {
    rejectBackup(`${label} has a photo that is too large.`);
  }
}

// Returns a Map of id -> saved item, used to check entry references. allowDeleted (versions 3
// and 4) accepts deletedAt, which marks a permanently deleted item; such an item must be archived.
// allowPhotos (version 4) accepts equipment photos. Entries may refer to permanently deleted items.
function validateSavedItems(savedItems, allowDeleted, allowPhotos) {
  const itemsById = new Map();
  savedItems.forEach((item, i) => {
    let label = `saved item ${i + 1}`;
    if (!isPlainObject(item)) rejectBackup(`${label} is not a valid saved-item record.`);
    checkOnlyFields(item, allowDeleted ? V3_SAVED_ITEM_FIELDS : V2_FIELDS.savedItem, label);
    if (!isPositiveSafeInteger(item.id)) rejectBackup(`${label} has an invalid id.`);
    label = `saved item ${i + 1} (id ${item.id})`;
    if (itemsById.has(item.id)) rejectBackup(`saved item id ${item.id} appears more than once.`);
    if (item.type !== 'equipment' && item.type !== 'book') rejectBackup(`${label} has an invalid type.`);
    // Names are restored exactly as stored; only a missing or blank name is rejected.
    if (typeof item.name !== 'string' || item.name.trim() === '') rejectBackup(`${label} has a missing or blank name.`);
    if (typeof item.archived !== 'boolean') rejectBackup(`${label} has an invalid archived value.`);
    if (!allowPhotos && item.photo !== null) rejectBackup(`${label} has a photo value, which this version doesn't support.`);
    checkTimestamps(item, label);
    if (hasField(item, 'deletedAt')) {
      if (!isNonNegativeSafeInteger(item.deletedAt)) rejectBackup(`${label} has an invalid deletedAt.`);
      if (item.archived !== true) rejectBackup(`${label} is permanently deleted but not archived.`);
    }
    if (allowPhotos) checkBackupPhoto(item, label);
    itemsById.set(item.id, item);
  });
  return itemsById;
}

// Checks a reference to a saved item of the expected type (archived items are valid).
function checkItemReference(itemId, expectedType, itemsById, label) {
  if (!isPositiveSafeInteger(itemId)) rejectBackup(`${label} has an invalid saved-item id.`);
  const item = itemsById.get(itemId);
  if (!item) rejectBackup(`${label} refers to saved item ${itemId}, which isn't in the backup.`);
  if (item.type !== expectedType) {
    rejectBackup(`${label} refers to saved item ${itemId}, which is not ${expectedType === 'book' ? 'a book' : 'equipment'}.`);
  }
}

function validateEntries(entries, itemsById) {
  const seenIds = new Set();
  entries.forEach((entry, i) => {
    let label = `entry ${i + 1}`;
    if (!isPlainObject(entry)) rejectBackup(`${label} is not a valid entry record.`);
    if (!isPositiveSafeInteger(entry.id)) rejectBackup(`${label} has an invalid id.`);
    label = `entry ${i + 1} (id ${entry.id})`;
    if (seenIds.has(entry.id)) rejectBackup(`entry id ${entry.id} appears more than once.`);
    seenIds.add(entry.id);
    if (entry.type !== 'gym' && entry.type !== 'reading') rejectBackup(`${label} has an unknown type.`);
    checkOnlyFields(entry, V2_FIELDS[entry.type], label);
    if (!isRealDateKey(entry.date)) rejectBackup(`${label} has an invalid date.`);
    checkTimestamps(entry, label);

    if (entry.type === 'gym') {
      if (!Array.isArray(entry.equipment) || entry.equipment.length === 0) {
        rejectBackup(`${label} must have at least one equipment row.`);
      }
      entry.equipment.forEach((row, r) => {
        const rowLabel = `${label}, equipment row ${r + 1}`;
        if (!isPlainObject(row)) rejectBackup(`${rowLabel} is not a valid row.`);
        checkOnlyFields(row, V2_FIELDS.gymRow, rowLabel);
        checkItemReference(row.itemId, 'equipment', itemsById, rowLabel);
        if (!isPositiveSafeInteger(row.sets)) rejectBackup(`${rowLabel} has invalid sets.`);
        if (!isPositiveSafeInteger(row.reps)) rejectBackup(`${rowLabel} has invalid reps.`);
      });
    } else {
      checkItemReference(entry.bookItemId, 'book', itemsById, label);
      if (!isPositiveSafeInteger(entry.pages)) rejectBackup(`${label} has invalid pages.`);
    }
  });
}

// Validates a parsed backup completely, without touching storage. Returns the data to
// import, { schemaVersion, days, entries, savedItems }, or throws a plain-English error.
// A version 1 backup becomes its days plus zero entries and zero saved items.
function validateBackup(payload) {
  if (!isPlainObject(payload) || typeof payload.schemaVersion !== 'number') throw new Error(NOT_A_BACKUP);
  const version = payload.schemaVersion;

  if (version === 1) {
    if (!Array.isArray(payload.days)) throw new Error(NOT_A_BACKUP);
    validateDays(payload.days, false);
    return { schemaVersion: 1, days: payload.days.map(canonicalV1Day), entries: [], savedItems: [] };
  }

  if (version === 2 || version === 3 || version === 4) {
    checkOnlyFields(payload, V2_FIELDS.backup, 'the backup');
    for (const list of ['days', 'entries', 'savedItems']) {
      if (!Array.isArray(payload[list])) rejectBackup(`"${list}" is missing or is not a list.`);
    }
    validateDays(payload.days, true);
    const itemsById = validateSavedItems(payload.savedItems, version >= 3, version === 4);
    validateEntries(payload.entries, itemsById);
    return { schemaVersion: version, days: payload.days, entries: payload.entries, savedItems: payload.savedItems };
  }

  throw new Error(`This backup was made by a newer or unknown version of the app (schema version ${version}) and can't be imported.`);
}

function dataUrlToJpegBlob(dataUrl) {
  const binary = atob(dataUrl.slice(JPEG_DATA_URL_PREFIX.length));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: 'image/jpeg' });
}

// Turns each validated photo back into a JPEG Blob and checks that it really opens as a
// JPEG image; any photo that doesn't rejects the whole backup. Returns the backup with
// Blob photos (the parsed records themselves are left unchanged).
async function decodeBackupPhotos(backup) {
  const savedItems = [];
  for (const [i, item] of backup.savedItems.entries()) {
    if (typeof item.photo !== 'string') {
      savedItems.push(item);
      continue;
    }
    const label = `saved item ${i + 1} (id ${item.id})`;
    const blob = dataUrlToJpegBlob(item.photo);
    const start = new Uint8Array(await blob.slice(0, 3).arrayBuffer());
    if (start[0] !== 0xff || start[1] !== 0xd8 || start[2] !== 0xff) rejectBackup(`${label} has a photo that isn't a JPEG image.`);
    try {
      const bitmap = await createImageBitmap(blob);
      bitmap.close();
    } catch (err) {
      rejectBackup(`${label} has a photo that can't be opened.`);
    }
    savedItems.push({ ...item, photo: blob });
  }
  return { ...backup, savedItems };
}

// Reads, parses and validates a backup file (including opening every photo), but does not
// touch storage.
async function readBackupFile(file) {
  const text = await file.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch (e) {
    throw new Error('That file is not valid JSON.');
  }
  return decodeBackupPhotos(validateBackup(payload));
}

function backupCount(count, singular, plural) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function confirmationMessage(backup) {
  const deletedCount = backup.savedItems.filter((item) => hasField(item, 'deletedAt')).length;
  const photoCount = backup.savedItems.filter((item) =>
    item.type === 'equipment' && !hasField(item, 'deletedAt') && item.photo != null
  ).length;
  const lines = [
    'Replace ALL current data with this backup?',
    '',
    'The backup contains:',
    `• ${backupCount(backup.days.length, 'marked day', 'marked days')}`,
    `• ${backupCount(backup.entries.length, 'entry', 'entries')}`,
    `• ${backupCount(backup.savedItems.length - deletedCount, 'saved item', 'saved items')}`,
  ];
  if (photoCount > 0) {
    lines.push(`• ${backupCount(photoCount, 'equipment photo', 'equipment photos')}`);
  }
  if (deletedCount > 0) {
    lines.push(`• ${backupCount(deletedCount, 'permanently deleted item', 'permanently deleted items')} (kept for past history)`);
  }
  lines.push('', "Everything currently in the app will be replaced by the backup. This can't be undone.");
  if (backup.schemaVersion === 1) {
    lines.push('', 'This is an older backup without gym/reading details, so all current entries and saved items will be removed.');
  }
  return lines.join('\n');
}

// Validates the file, shows the counts and asks for confirmation, then replaces all
// stored data in one atomic transaction. Returns true if applied, false if cancelled.
async function importFromFile(file) {
  const backup = await readBackupFile(file);
  if (!window.confirm(confirmationMessage(backup))) return false;
  try {
    await ConsistencyDB.replaceAllData({
      days: backup.days,
      entries: backup.entries,
      savedItems: backup.savedItems,
    });
  } catch (err) {
    // replaceAllData is a single transaction: on failure it rolls back completely.
    throw new Error(`Import failed, so your existing data was not changed. (${err && err.message ? err.message : err})`);
  }
  return true;
}

window.Backup = { exportToFile, importFromFile, validateBackup };
