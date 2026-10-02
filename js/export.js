// Export/import of all app data as a JSON backup file.
// Export writes schema version 2: { schemaVersion, exportedAt, days, entries, savedItems }.
// Import accepts schema version 1 (Stage 1 backups: days only) and version 2. The whole
// file is validated before anything is written; only after the owner confirms the counts
// are all three stores replaced, in one atomic transaction (ConsistencyDB.replaceAllData).

const SCHEMA_VERSION = 2;

const NOT_A_BACKUP = "That file doesn't look like a Consistency Checker backup.";

// Schema version 2 is strict: these are the only fields allowed.
const V2_FIELDS = {
  backup: ['schemaVersion', 'exportedAt', 'days', 'entries', 'savedItems'],
  day: ['date', 'status', 'updatedAt'],
  savedItem: ['id', 'type', 'name', 'archived', 'photo', 'createdAt', 'updatedAt'],
  gym: ['id', 'date', 'type', 'equipment', 'createdAt', 'updatedAt'],
  gymRow: ['itemId', 'sets', 'reps'],
  reading: ['id', 'date', 'type', 'bookItemId', 'pages', 'createdAt', 'updatedAt'],
};

function todayFilenameSuffix() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function exportToFile() {
  const days = await ConsistencyDB.getAllDays();
  const entries = await ConsistencyDB.getAllEntries();
  const savedItems = await ConsistencyDB.getAllSavedItems();
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

// Returns a Map of id -> saved item, used to check entry references.
function validateSavedItems(savedItems) {
  const itemsById = new Map();
  savedItems.forEach((item, i) => {
    let label = `saved item ${i + 1}`;
    if (!isPlainObject(item)) rejectBackup(`${label} is not a valid saved-item record.`);
    checkOnlyFields(item, V2_FIELDS.savedItem, label);
    if (!isPositiveSafeInteger(item.id)) rejectBackup(`${label} has an invalid id.`);
    label = `saved item ${i + 1} (id ${item.id})`;
    if (itemsById.has(item.id)) rejectBackup(`saved item id ${item.id} appears more than once.`);
    if (item.type !== 'equipment' && item.type !== 'book') rejectBackup(`${label} has an invalid type.`);
    // Names are restored exactly as stored; only a missing or blank name is rejected.
    if (typeof item.name !== 'string' || item.name.trim() === '') rejectBackup(`${label} has a missing or blank name.`);
    if (typeof item.archived !== 'boolean') rejectBackup(`${label} has an invalid archived value.`);
    if (item.photo !== null) rejectBackup(`${label} has a photo value, which this version doesn't support.`);
    checkTimestamps(item, label);
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

  if (version === 2) {
    checkOnlyFields(payload, V2_FIELDS.backup, 'the backup');
    for (const list of ['days', 'entries', 'savedItems']) {
      if (!Array.isArray(payload[list])) rejectBackup(`"${list}" is missing or is not a list.`);
    }
    validateDays(payload.days, true);
    const itemsById = validateSavedItems(payload.savedItems);
    validateEntries(payload.entries, itemsById);
    return { schemaVersion: 2, days: payload.days, entries: payload.entries, savedItems: payload.savedItems };
  }

  throw new Error(`This backup was made by a newer or unknown version of the app (schema version ${version}) and can't be imported.`);
}

// Reads, parses and validates a backup file, but does not touch storage.
async function readBackupFile(file) {
  const text = await file.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch (e) {
    throw new Error('That file is not valid JSON.');
  }
  return validateBackup(payload);
}

function backupCount(count, singular, plural) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function confirmationMessage(backup) {
  const lines = [
    'Replace ALL current data with this backup?',
    '',
    'The backup contains:',
    `• ${backupCount(backup.days.length, 'marked day', 'marked days')}`,
    `• ${backupCount(backup.entries.length, 'entry', 'entries')}`,
    `• ${backupCount(backup.savedItems.length, 'saved item', 'saved items')}`,
    '',
    "Everything currently in the app will be replaced by the backup. This can't be undone.",
  ];
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
