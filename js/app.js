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

function nextStatus(cell) {
  if (cell.classList.contains('cal-green')) return 'red';
  if (cell.classList.contains('cal-red')) return null; // back to unmarked
  return 'green';
}

async function handleDayTap(dateKey, cell) {
  const status = nextStatus(cell);
  if (status) {
    await ConsistencyDB.setDay(dateKey, status);
  } else {
    await ConsistencyDB.deleteDay(dateKey);
  }
  calendar.setCellStatus(cell, status);
}

// Normal navigation (not replace) so Android Back returns to the calendar.
function handleDayLongPress(dateKey) {
  window.location.href = `detail.html?date=${encodeURIComponent(dateKey)}`;
}

const calendar = Calendar.create(document.getElementById('calendar'), {
  onDayTap: handleDayTap,
  onDayLongPress: handleDayLongPress,
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

StoragePermission.requestPersistentStorage(showBanner);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js');
  });
}
