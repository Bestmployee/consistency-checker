// Export/import of the 'days' data as a JSON backup file.
// Import replaces all currently stored data after a confirmation prompt.

const SCHEMA_VERSION = 1;

function todayFilenameSuffix() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function exportToFile() {
  const days = await ConsistencyDB.getAllDays();
  const payload = {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    days,
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

function isValidDayRecord(r) {
  return r
    && typeof r.date === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(r.date)
    && (r.status === 'green' || r.status === 'red');
}

// Reads and validates a backup file, but does not touch storage yet.
async function readBackupFile(file) {
  const text = await file.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch (e) {
    throw new Error('That file is not valid JSON.');
  }
  if (!payload || payload.schemaVersion !== SCHEMA_VERSION || !Array.isArray(payload.days)) {
    throw new Error("That file doesn't look like a Consistency Checker backup.");
  }
  if (!payload.days.every(isValidDayRecord)) {
    throw new Error('That backup file contains unrecognized data.');
  }
  return payload.days;
}

// Prompts for confirmation, then replaces all stored days with the file's contents.
// Returns true if the import was applied, false if cancelled.
async function importFromFile(file) {
  const days = await readBackupFile(file);
  const confirmed = window.confirm(
    `This will replace all current data with the contents of this backup (${days.length} marked day${days.length === 1 ? '' : 's'}). Continue?`
  );
  if (!confirmed) return false;
  await ConsistencyDB.replaceAllDays(days);
  return true;
}

window.Backup = { exportToFile, importFromFile };
