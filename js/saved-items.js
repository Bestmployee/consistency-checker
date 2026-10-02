// Shared saved-item system for equipment and books: name tidying/matching,
// explicit creation, rename, archive, and a reusable picker component.
// Used by the saved-items management page and by the Gym/Reading entry workflows,
// so none of them implement their own matching or creation logic.

// Trims and collapses repeated internal whitespace: "  Bench   Press " -> "Bench Press".
function tidyName(name) {
  return String(name == null ? '' : name).trim().replace(/\s+/g, ' ');
}

// Comparison key: tidied and case-insensitive.
function nameKey(name) {
  return tidyName(name).toLowerCase();
}

function compareByName(a, b) {
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
}

// Active items whose name contains the typed text anywhere (ignoring case and
// whitespace differences), alphabetical, with an exact match moved to the top.
// Blank text returns all active items.
function filterSuggestions(items, text) {
  const key = nameKey(text);
  const matches = items
    .filter((item) => !item.archived && nameKey(item.name).includes(key))
    .sort(compareByName);
  const exactIndex = key ? matches.findIndex((item) => nameKey(item.name) === key) : -1;
  if (exactIndex > 0) matches.unshift(matches.splice(exactIndex, 1)[0]);
  return matches;
}

// Classifies a proposed name against the items of ONE type (active and archived):
//   { status: 'blank' }                  nothing usable typed
//   { status: 'active', item }           an active item already has this name
//   { status: 'archived', item }         an archived item already has this name
//   { status: 'new', name }              free to create; name is the tidied name
// ignoreId skips one item (the item being renamed).
function classifyName(items, text, ignoreId) {
  const name = tidyName(text);
  if (!name) return { status: 'blank' };
  const key = name.toLowerCase();
  const existing = items.find((item) => item.id !== ignoreId && nameKey(item.name) === key);
  if (existing) return { status: existing.archived ? 'archived' : 'active', item: existing };
  return { status: 'new', name };
}

function conflictMessage(result) {
  if (result.status === 'blank') return "Name can't be blank.";
  if (result.status === 'archived') return `'${result.item.name}' is archived.`;
  if (result.status === 'active') return `'${result.item.name}' already exists.`;
  return '';
}

async function getItemsOfType(type) {
  return ConsistencyDB.getSavedItems(type, { includeArchived: true });
}

// Creates a saved item only if the tidied name is free within its type.
// Resolves { ok: true, item } or { ok: false, message }.
async function createSavedItem(type, text) {
  const result = classifyName(await getItemsOfType(type), text);
  if (result.status !== 'new') return { ok: false, message: conflictMessage(result) };
  const id = await ConsistencyDB.addSavedItem(type, result.name);
  const item = (await getItemsOfType(type)).find((i) => i.id === id);
  return { ok: true, item };
}

// Renames an item (active or archived). Rejects blank names and names already used
// by another item of the same type, active or archived. Entries reference items by
// id, so they are never touched. Resolves { ok: true } or { ok: false, message }.
async function renameSavedItem(item, text) {
  const result = classifyName(await getItemsOfType(item.type), text, item.id);
  if (result.status !== 'new') return { ok: false, message: conflictMessage(result) };
  await ConsistencyDB.updateSavedItem(item.id, { name: result.name });
  return { ok: true };
}

// Shows how many entries use the item, asks for confirmation, then archives it.
// Resolves true if archived, false if cancelled.
async function confirmAndArchiveSavedItem(item) {
  const count = await ConsistencyDB.getEntryCountForItem(item.id);
  const usage = `${count} ${count === 1 ? 'entry' : 'entries'}`;
  const confirmed = window.confirm(
    `'${item.name}' is used in ${usage}. Archive it? It will no longer be suggested; past entries will still show it.`
  );
  if (!confirmed) return false;
  await ConsistencyDB.archiveSavedItem(item.id);
  return true;
}

// Reusable picker: a text box, live suggestions, and an explicit
// "+ Add 'X' as new item" control. Typing never creates or selects anything;
// only tapping a suggestion or the Add control does, and either one calls
// onSelect(item) with the chosen saved item (use item.id).
function createPicker(container, { type, onSelect, placeholder = 'Type to search' }) {
  let items = [];
  let selectedId = null;

  const root = document.createElement('div');
  root.className = 'picker';
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'picker-input';
  input.placeholder = placeholder;
  input.autocomplete = 'off';
  input.setAttribute('autocapitalize', 'words');
  const list = document.createElement('ul');
  list.className = 'picker-suggestions';
  const addButton = document.createElement('button');
  addButton.type = 'button';
  addButton.className = 'picker-add';
  addButton.hidden = true;
  const message = document.createElement('p');
  message.className = 'picker-message';
  message.hidden = true;
  root.append(input, list, addButton, message);
  container.appendChild(root);

  function select(item) {
    selectedId = item.id;
    input.value = item.name;
    render();
    if (onSelect) onSelect(item);
  }

  function render() {
    const text = input.value;
    list.innerHTML = '';
    for (const item of filterSuggestions(items, text)) {
      const li = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'picker-suggestion' + (item.id === selectedId ? ' picker-selected' : '');
      button.textContent = item.name;
      button.addEventListener('click', () => select(item));
      li.appendChild(button);
      list.appendChild(li);
    }

    let result = classifyName(items, text);
    // The currently selected item is never a conflict with itself. This lets an
    // existing value that has since been archived stay selected (e.g. when editing),
    // without making archived items selectable: typing clears the selection.
    if (result.item && result.item.id === selectedId) result = { status: 'selected' };
    addButton.hidden = result.status !== 'new';
    if (result.status === 'new') addButton.textContent = `+ Add '${result.name}' as new item`;
    message.hidden = result.status !== 'archived';
    if (result.status === 'archived') message.textContent = conflictMessage(result);
  }

  input.addEventListener('input', () => {
    selectedId = null; // typing clears any previous choice; choosing is always explicit
    render();
  });

  addButton.addEventListener('click', async () => {
    addButton.disabled = true;
    try {
      const created = await createSavedItem(type, input.value);
      await refresh();
      if (created.ok) {
        select(created.item);
      } else {
        message.textContent = created.message;
        message.hidden = false;
      }
    } finally {
      addButton.disabled = false;
    }
  });

  // Reloads items from storage (e.g. after a rename or archive elsewhere on the page).
  async function refresh() {
    items = await getItemsOfType(type);
    const selected = items.find((item) => item.id === selectedId);
    if (selected) input.value = selected.name;
    render();
  }

  function clear() {
    selectedId = null;
    input.value = '';
    render();
  }

  // Pre-fills the picker with an existing item (e.g. when editing an entry). The item
  // may be archived; it stays selected until the owner types or chooses another item.
  async function setSelected(id) {
    selectedId = id;
    await refresh();
  }

  refresh();

  return {
    refresh,
    clear,
    setSelected,
    getSelectedId: () => selectedId,
  };
}

window.SavedItems = {
  tidyName,
  nameKey,
  filterSuggestions,
  classifyName,
  createSavedItem,
  renameSavedItem,
  confirmAndArchiveSavedItem,
  createPicker,
};
