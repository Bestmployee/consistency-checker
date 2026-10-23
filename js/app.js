// Entry point: wires together storage, calendar, gestures, export/import,
// and registers the service worker.

function showBanner(message) {
  document.getElementById('banner-text').textContent = message;
  document.getElementById('banner').hidden = false;
}

document.getElementById('banner-dismiss').addEventListener('click', () => {
  document.getElementById('banner').hidden = true;
});

let toastTimer = null;
function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 2500);
}

// A tap marks a day red or unmarks it (DayState.nextTapStatus); green comes only from Gym
// data. The tap rule is decided from storage, not from the cell, and taps are handled one
// at a time so a quick double tap can't act on stale state. The month is then redrawn,
// since a tap can also add or clear a "?".
// A tap on a gold result day opens its monthly result (as a long-press does).
let tapQueue = Promise.resolve();
function handleDayTap(dateKey) {
  if (DayState.tapOpensDay(dateKey)) {
    handleDayLongPress(dateKey);
    return;
  }
  tapQueue = tapQueue.then(async () => {
    const [day, entries] = await Promise.all([
      ConsistencyDB.getDay(dateKey),
      ConsistencyDB.getEntriesForDate(dateKey),
    ]);
    const status = DayState.nextTapStatus(dateKey, day ? day.status : undefined, entries);
    if (status === undefined) return;
    if (status) {
      await ConsistencyDB.setDay(dateKey, status);
    } else {
      await ConsistencyDB.deleteDay(dateKey);
    }
    await calendar.refresh();
  }).catch((err) => showToast(`Couldn't save: ${err.message}`));
}

// Normal navigation (not replace) so Android Back returns to the calendar.
function handleDayLongPress(dateKey) {
  window.location.href = `detail.html?date=${encodeURIComponent(dateKey)}`;
}

const calendar = Calendar.create(document.getElementById('calendar'), {
  onDayTap: handleDayTap,
  onDayLongPress: handleDayLongPress,
});

// When Back restores this page from the browser's memory (back/forward cache), the
// cells still show the state from before leaving, e.g. not a day whose Gym entries have
// since been added or removed (green, "?"). Reload the current month from storage so the
// display matches what is saved. The visible month is kept.
window.addEventListener('pageshow', (event) => {
  if (event.persisted) calendar.refresh();
});

document.getElementById('export-btn').addEventListener('click', () => {
  Backup.exportToFile();
});

const importInput = document.getElementById('import-input');
document.getElementById('import-btn').addEventListener('click', () => {
  importInput.value = '';
  importInput.click();
});
importInput.addEventListener('change', async () => {
  const file = importInput.files[0];
  if (!file) return;
  try {
    const applied = await Backup.importFromFile(file);
    if (applied) {
      await calendar.refresh();
      showToast('Backup imported.');
    }
  } catch (err) {
    alert(err.message);
  }
});

// Scoring reference: a read-only panel (a native <dialog>, so Escape closes it, focus stays
// inside, and the calendar behind can't be tapped). It never reads or writes app data.
const scoringDialog = document.getElementById('scoring-dialog');
document.getElementById('scoring-btn').addEventListener('click', () => {
  if (!scoringDialog.open) scoringDialog.showModal();
});
document.getElementById('scoring-close').addEventListener('click', () => scoringDialog.close());
// A tap on the dimmed area outside the panel closes it. The panel fills the dialog, so only
// the backdrop reports the dialog itself as the target.
scoringDialog.addEventListener('click', (event) => {
  if (event.target === scoringDialog) scoringDialog.close();
});

StoragePermission.requestPersistentStorage(showBanner);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js');
  });
}
