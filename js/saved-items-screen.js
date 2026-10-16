// Saved-item management page (saved-items.html?type=equipment|book&date=YYYY-MM-DD):
// find or create items with the shared picker, rename items inline, and archive them.
// Archived items stay listed (marked Archived) but never appear in picker suggestions;
// they can be restored or permanently deleted. Permanently deleted items aren't listed.
// Equipment rows show a 64×64 photo slot; active equipment can add, replace or remove its photo.

const MANAGE_TITLES = { equipment: 'Equipment', book: 'Books' };

const manageParams = new URLSearchParams(window.location.search);
const manageType = manageParams.get('type');
const manageDate = manageParams.get('date');

let managePicker = null;
let editingItemId = null;
let highlightedItemId = null;
// { id, text }: a message shown under one row after one of its actions failed.
let rowError = null;
const showPhotos = manageType === 'equipment';
const listThumbUrls = showPhotos ? Photo.createThumbUrls() : null;
let photoInput = null;
let photoTargetId = null; // the item the image chooser was opened for
const photoBusyIds = new Set(); // items whose photo is being saved

function makeButton(label, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.addEventListener('click', onClick);
  return button;
}

async function reloadManagePage() {
  if (managePicker) await managePicker.refresh();
  await renderItemList();
}

function makeItemRow(item) {
  const row = document.createElement('li');
  row.className = 'manage-row' + (item.id === highlightedItemId ? ' manage-highlight' : '');
  row.dataset.id = item.id;

  if (item.id === editingItemId) {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'manage-rename-input';
    input.value = item.name;
    input.autocomplete = 'off';
    const error = document.createElement('p');
    error.className = 'manage-error';
    error.hidden = true;
    const actions = document.createElement('span');
    actions.className = 'detail-row-actions';
    actions.appendChild(makeButton('Save', async () => {
      const result = await SavedItems.renameSavedItem(item, input.value);
      if (!result.ok) {
        error.textContent = result.message;
        error.hidden = false;
        return;
      }
      editingItemId = null;
      await reloadManagePage();
    }));
    actions.appendChild(makeButton('Cancel', async () => {
      editingItemId = null;
      await renderItemList();
    }));
    const line = document.createElement('div');
    line.className = 'manage-row-line';
    if (showPhotos) line.appendChild(Photo.makePhotoThumb(item, listThumbUrls));
    line.append(input, actions);
    row.append(line, error);
    return row;
  }

  const label = document.createElement('span');
  label.className = 'manage-name';
  label.textContent = item.name;
  if (showPhotos) label.classList.add('photo-name');
  if (item.archived) {
    const tag = document.createElement('span');
    tag.className = 'manage-archived-tag';
    tag.textContent = 'Archived';
    label.append(' ', tag);
  }
  const actions = document.createElement('span');
  actions.className = 'detail-row-actions';
  actions.appendChild(makeButton('Rename', async () => {
    rowError = null;
    editingItemId = item.id;
    await renderItemList();
    const input = document.querySelector('.manage-rename-input');
    if (input) input.focus();
  }));
  if (!item.archived) {
    actions.appendChild(makeButton('Archive', async () => {
      if (await SavedItems.confirmAndArchiveSavedItem(item)) await reloadManagePage();
    }));
    if (showPhotos) appendPhotoButtons(actions, item);
  } else {
    actions.appendChild(makeButton('Restore', async () => {
      const result = await runRowAction(() => SavedItems.restoreSavedItem(item));
      if (!result.ok) {
        rowError = { id: item.id, text: result.message };
        await renderItemList();
        return;
      }
      await reloadManagePage();
    }));
    actions.appendChild(makeButton('Delete permanently', async () => {
      const result = await runRowAction(async () => ({ ok: await SavedItems.confirmAndPermanentlyDeleteSavedItem(item) }));
      if (result.message) {
        rowError = { id: item.id, text: result.message };
        await renderItemList();
        return;
      }
      if (result.ok) await reloadManagePage();
    }));
  }
  const line = document.createElement('div');
  line.className = 'manage-row-line';
  if (showPhotos) line.appendChild(Photo.makePhotoThumb(item, listThumbUrls));
  line.append(label, actions);
  row.appendChild(line);
  if (rowError && rowError.id === item.id) {
    const error = document.createElement('p');
    error.className = 'manage-error';
    error.setAttribute('role', 'alert');
    error.textContent = rowError.text;
    row.appendChild(error);
  }
  return row;
}

// Photo buttons for an active equipment row: Add photo, or Replace photo and Remove photo.
// While its photo is being saved, the row's photo buttons are disabled.
function appendPhotoButtons(actions, item) {
  const busy = photoBusyIds.has(item.id);
  const hasPhoto = item.photo instanceof Blob;
  const choose = makeButton(busy ? 'Saving photo…' : hasPhoto ? 'Replace photo' : 'Add photo', () => {
    rowError = null;
    photoTargetId = item.id;
    photoInput.open();
  });
  choose.disabled = busy;
  actions.appendChild(choose);
  if (hasPhoto) {
    const remove = makeButton('Remove photo', async () => {
      if (!window.confirm('Remove this photo?')) return;
      await finishPhotoAction(item.id, Photo.removePhoto(item.id));
    });
    remove.disabled = busy;
    actions.appendChild(remove);
  }
}

// The old photo stays until the new one is saved; any failure leaves it unchanged.
async function saveChosenPhoto(file) {
  const itemId = photoTargetId;
  photoTargetId = null;
  if (itemId == null || photoBusyIds.has(itemId)) return;
  photoBusyIds.add(itemId);
  rowError = null;
  await renderItemList();
  const work = Photo.savePhotoFromFile(itemId, file);
  await finishPhotoAction(itemId, work);
}

async function finishPhotoAction(itemId, work) {
  photoBusyIds.add(itemId);
  rowError = null;
  const result = await work;
  photoBusyIds.delete(itemId);
  if (!result.ok) rowError = { id: itemId, text: result.message };
  await reloadManagePage();
}

// Runs a row action, turning a storage failure into { ok: false, message }. Any earlier
// row message is cleared first.
async function runRowAction(action) {
  rowError = null;
  try {
    return await action();
  } catch (err) {
    return { ok: false, message: `Couldn't save: ${err.message}` };
  }
}

async function renderItemList() {
  const items = await ConsistencyDB.getSavedItems(manageType, { includeArchived: true });
  items.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  const active = items.filter((item) => !item.archived);
  const archived = items.filter((item) => item.archived);

  const listArea = document.getElementById('manage-list-area');
  listArea.innerHTML = '';
  if (listThumbUrls) listThumbUrls.reset();

  const activeHeading = document.createElement('h2');
  activeHeading.textContent = 'Saved';
  listArea.appendChild(activeHeading);
  if (active.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'detail-empty';
    empty.textContent = 'Nothing saved yet.';
    listArea.appendChild(empty);
  } else {
    const list = document.createElement('ul');
    list.className = 'detail-list';
    for (const item of active) list.appendChild(makeItemRow(item));
    listArea.appendChild(list);
  }

  if (archived.length > 0) {
    const archivedHeading = document.createElement('h2');
    archivedHeading.textContent = 'Archived';
    listArea.appendChild(archivedHeading);
    const list = document.createElement('ul');
    list.className = 'detail-list';
    for (const item of archived) list.appendChild(makeItemRow(item));
    listArea.appendChild(list);
  }
}

async function renderManagePage() {
  const back = document.getElementById('detail-back');
  if (/^\d{4}-\d{2}-\d{2}$/.test(manageDate || '')) {
    back.href = `detail.html?date=${encodeURIComponent(manageDate)}`;
  }

  const title = document.getElementById('manage-title');
  if (!Object.prototype.hasOwnProperty.call(MANAGE_TITLES, manageType)) {
    title.textContent = "This page isn't valid.";
    return;
  }
  title.textContent = MANAGE_TITLES[manageType];

  const container = document.getElementById('manage');
  const pickerSection = document.createElement('section');
  pickerSection.className = 'detail-section';
  const pickerHeading = document.createElement('h2');
  pickerHeading.textContent = manageType === 'equipment' ? 'Find or add equipment' : 'Find or add a book';
  pickerSection.appendChild(pickerHeading);
  container.appendChild(pickerSection);

  const listArea = document.createElement('section');
  listArea.id = 'manage-list-area';
  listArea.className = 'detail-section';
  container.appendChild(listArea);
  if (showPhotos) photoInput = Photo.createPhotoInput(container, saveChosenPhoto);

  managePicker = SavedItems.createPicker(pickerSection, {
    type: manageType,
    onSelect: async (item) => {
      // Selecting an item on this page just locates it in the list below.
      highlightedItemId = item.id;
      await renderItemList();
      const row = document.querySelector(`.manage-row[data-id="${item.id}"]`);
      if (row) row.scrollIntoView({ block: 'nearest' });
    },
  });

  await renderItemList();
}

renderManagePage();
