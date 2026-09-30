// Saved-item management page (saved-items.html?type=equipment|book&date=YYYY-MM-DD):
// find or create items with the shared picker, rename items inline, and archive them.
// Archived items stay listed (marked Archived) but never appear in picker suggestions.

const MANAGE_TITLES = { equipment: 'Equipment', book: 'Books' };

const manageParams = new URLSearchParams(window.location.search);
const manageType = manageParams.get('type');
const manageDate = manageParams.get('date');

let managePicker = null;
let editingItemId = null;
let highlightedItemId = null;

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
    line.append(input, actions);
    row.append(line, error);
    return row;
  }

  const label = document.createElement('span');
  label.className = 'manage-name';
  label.textContent = item.name;
  if (item.archived) {
    const tag = document.createElement('span');
    tag.className = 'manage-archived-tag';
    tag.textContent = 'Archived';
    label.append(' ', tag);
  }
  const actions = document.createElement('span');
  actions.className = 'detail-row-actions';
  actions.appendChild(makeButton('Rename', async () => {
    editingItemId = item.id;
    await renderItemList();
    const input = document.querySelector('.manage-rename-input');
    if (input) input.focus();
  }));
  if (!item.archived) {
    actions.appendChild(makeButton('Archive', async () => {
      if (await SavedItems.confirmAndArchiveSavedItem(item)) await reloadManagePage();
    }));
  }
  const line = document.createElement('div');
  line.className = 'manage-row-line';
  line.append(label, actions);
  row.appendChild(line);
  return row;
}

async function renderItemList() {
  const items = await ConsistencyDB.getSavedItems(manageType, { includeArchived: true });
  items.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  const active = items.filter((item) => !item.archived);
  const archived = items.filter((item) => item.archived);

  const listArea = document.getElementById('manage-list-area');
  listArea.innerHTML = '';

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
