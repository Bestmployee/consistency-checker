// Shared saved-item system for equipment and books: name tidying/matching,
// explicit creation, rename, archive, restore, permanent delete, and a reusable picker component.
// Permanently deleted items are never loaded here, so they never block a name.
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

// Returns an archived item to active. Names stay unique among all items of the type that
// aren't permanently deleted (active or archived), so if another such item has the same
// name (possible only through imported data) the item stays archived.
// Resolves { ok: true } or { ok: false, message }.
async function restoreSavedItem(item) {
  const result = classifyName(await getItemsOfType(item.type), item.name, item.id);
  if (result.status !== 'new') {
    return { ok: false, message: `Can't restore: another item is already named '${tidyName(item.name)}'. Rename one of the items first.` };
  }
  await ConsistencyDB.restoreSavedItem(item.id);
  return { ok: true };
}

// Shows how many entries use the archived item and what permanent deletion means, asks
// for confirmation, then permanently deletes it (its photo too). Resolves true if deleted,
// false if cancelled.
async function confirmAndPermanentlyDeleteSavedItem(item) {
  const count = await ConsistencyDB.getEntryCountForItem(item.id);
  // Read the stored item, so the photo sentence matches what is actually stored.
  const stored = await ConsistencyDB.getSavedItem(item.id);
  const photoNote = stored && stored.photo != null ? ['', 'Its photo will also be permanently deleted.'] : [];
  const kind = item.type === 'book' ? 'books' : 'equipment';
  const values = item.type === 'book' ? 'pages read' : 'sets and reps';
  let usage = "It isn't used in any entries.";
  if (count === 1) {
    usage = `It is used in 1 entry. That past entry will stay in your history, still showing '${item.name}' and its ${values}, but it can no longer be edited — only deleted.`;
  } else if (count > 1) {
    usage = `It is used in ${count} entries. Those past entries will stay in your history, still showing '${item.name}' and their ${values}, but they can no longer be edited — only deleted.`;
  }
  const confirmed = window.confirm([
    `Permanently delete '${item.name}'?`,
    '',
    `This can't be undone. '${item.name}' will be removed from your saved ${kind} for good and can't be restored.`,
    ...photoNote,
    '',
    usage,
    '',
    `You can later create a new item called '${item.name}'; it will be a separate, unrelated item.`,
  ].join('\n'));
  if (!confirmed) return false;
  await ConsistencyDB.permanentlyDeleteSavedItem(item.id);
  return true;
}

// Reusable picker: a text box, live suggestions, and an explicit
// "+ Add 'X' as new item" control. Typing never creates or selects anything;
// only tapping a suggestion or the Add control does, and either one calls
// onSelect(item) with the chosen saved item (use item.id).
// Equipment suggestions show a 64×64 photo slot. offerPhotoOnCreate (Gym form only) shows an
// optional "Add photo (optional)" button for an item just created here, while it is selected.
function createPicker(container, { type, onSelect, placeholder = 'Type to search', offerPhotoOnCreate = false }) {
  let items = [];
  let selectedId = null;
  const showPhotos = type === 'equipment';
  const thumbUrls = showPhotos ? Photo.createThumbUrls() : null;
  const offerPhoto = showPhotos && offerPhotoOnCreate;
  let createdId = null; // the item just created here, which may be offered a photo
  let photoBusy = false;

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

  let photoButton = null;
  let photoMessage = null;
  let photoInput = null;
  if (offerPhoto) {
    photoButton = document.createElement('button');
    photoButton.type = 'button';
    photoButton.className = 'picker-photo';
    photoButton.hidden = true;
    photoMessage = document.createElement('p');
    photoMessage.className = 'picker-message picker-photo-message';
    photoMessage.hidden = true;
    root.append(photoButton, photoMessage);
    photoInput = Photo.createPhotoInput(root, addPhotoToCreatedItem);
    photoButton.addEventListener('click', () => photoInput.open());
  }
  container.appendChild(root);

  // The photo is saved to the item on its own, apart from any form: saving or closing
  // the form meanwhile is fine, and the photo still lands on the item.
  async function addPhotoToCreatedItem(file) {
    const itemId = createdId;
    if (itemId == null || photoBusy) return;
    photoBusy = true;
    photoMessage.hidden = true;
    render();
    const result = await Photo.savePhotoFromFile(itemId, file);
    photoBusy = false;
    if (!root.isConnected) return; // the form has closed; nothing on screen to update
    if (result.ok) {
      if (createdId === itemId) createdId = null; // done: the button goes away
      await refresh();
    } else {
      photoMessage.textContent = result.message;
      photoMessage.hidden = false;
      render();
    }
  }

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
      if (showPhotos) {
        button.classList.add('picker-suggestion-photo');
        const name = document.createElement('span');
        name.className = 'photo-name';
        name.textContent = item.name;
        button.append(Photo.makePhotoThumb(item, thumbUrls), name);
      } else {
        button.textContent = item.name;
      }
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

    if (offerPhoto) {
      const offered = createdId != null && createdId === selectedId;
      photoButton.hidden = !offered;
      photoButton.disabled = photoBusy;
      photoButton.textContent = photoBusy ? 'Adding photo…' : 'Add photo (optional)';
      if (!offered) photoMessage.hidden = true;
    }
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
        if (offerPhoto && !photoBusy) createdId = created.item.id;
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
    if (thumbUrls) thumbUrls.reset();
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
  restoreSavedItem,
  confirmAndPermanentlyDeleteSavedItem,
  createPicker,
};
