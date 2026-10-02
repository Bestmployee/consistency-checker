// Reading section of the detail page. Each reading record is its own entry
// ({ date, type: 'reading', bookItemId, pages }); a day may have any number of them,
// including several for the same book. Entries are added, edited and deleted one at a
// time and saved immediately (no section-level Save). Reading never changes the
// calendar day's mark.

const READING_ERRORS = {
  book: 'Choose a book from the list.',
  pages: 'Pages must be a whole number greater than 0.',
};

// "Dune: 20 pages", "Dune: 1 page"
function describeReadingEntry(name, entry) {
  return `${name}: ${EntryUtils.countLabel(entry.pages, 'page', 'pages')}`;
}

// Re-reads the entry and checks it is still the one shown on screen.
async function getStoredReadingEntry(dateKey, expected) {
  const entry = (await ConsistencyDB.getEntriesForDate(dateKey)).find((e) => e.id === expected.id);
  if (!entry || entry.type !== 'reading' || entry.bookItemId !== expected.bookItemId || entry.pages !== expected.pages) {
    throw new Error('This entry changed since the page was opened.');
  }
  return entry;
}

// Every add creates a new, separate reading entry.
async function addReadingEntry(dateKey, { bookItemId, pages }) {
  await ConsistencyDB.addEntry({ date: dateKey, type: 'reading', bookItemId, pages });
}

async function updateReadingEntry(dateKey, expected, { bookItemId, pages }) {
  const entry = await getStoredReadingEntry(dateKey, expected);
  await ConsistencyDB.updateEntry({ ...entry, bookItemId, pages });
}

async function deleteReadingEntry(dateKey, expected) {
  await getStoredReadingEntry(dateKey, expected);
  await ConsistencyDB.deleteEntry(expected.id);
}

let readingFormCounter = 0;

function makeReadingButton(label, onClick, disabled) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.disabled = Boolean(disabled);
  button.addEventListener('click', onClick);
  return button;
}

// Inline add/edit form. onSave receives { bookItemId, pages } once both are valid,
// and returns an error message (string) if saving failed, or nothing on success.
function makeReadingForm({ initial, onSave, onCancel }) {
  const form = document.createElement('div');
  form.className = 'reading-form';

  const bookLabel = document.createElement('p');
  bookLabel.className = 'reading-form-label';
  bookLabel.textContent = 'Book';
  form.appendChild(bookLabel);
  const pickerArea = document.createElement('div');
  form.appendChild(pickerArea);
  const picker = SavedItems.createPicker(pickerArea, { type: 'book', placeholder: 'Type to search books' });
  if (initial) picker.setSelected(initial.bookItemId);

  const field = document.createElement('div');
  field.className = 'reading-field';
  const pagesId = `reading-field-${++readingFormCounter}`;
  const pagesLabel = document.createElement('label');
  pagesLabel.htmlFor = pagesId;
  pagesLabel.textContent = 'Pages';
  const pagesInput = document.createElement('input');
  pagesInput.id = pagesId;
  pagesInput.type = 'text';
  pagesInput.inputMode = 'numeric';
  pagesInput.autocomplete = 'off';
  pagesInput.className = 'reading-number-input';
  pagesInput.value = initial ? String(initial.pages) : '';
  field.append(pagesLabel, pagesInput);
  form.appendChild(field);

  const errors = document.createElement('div');
  errors.className = 'reading-form-errors';
  errors.setAttribute('role', 'alert');
  form.appendChild(errors);

  const showErrors = (messages) => {
    errors.innerHTML = '';
    for (const text of messages) {
      const line = document.createElement('p');
      line.textContent = text;
      errors.appendChild(line);
    }
  };

  const actions = document.createElement('div');
  actions.className = 'reading-form-actions';
  const saveButton = makeReadingButton('Save', async () => {
    const bookItemId = picker.getSelectedId();
    const pages = EntryUtils.parsePositiveWholeNumber(pagesInput.value);
    const messages = [];
    if (bookItemId == null) messages.push(READING_ERRORS.book);
    if (pages === null) messages.push(READING_ERRORS.pages);
    showErrors(messages);
    if (messages.length > 0) return;

    saveButton.disabled = true;
    const failure = await onSave({ bookItemId, pages });
    if (failure) {
      showErrors([failure]);
      saveButton.disabled = false;
    }
  });
  actions.append(saveButton, makeReadingButton('Cancel', onCancel));
  form.appendChild(actions);
  return form;
}

// Builds the Reading section from the day's entries (reading entries oldest first).
// onChanged(notice) redraws this section from storage, optionally showing a notice.
function createReadingSection({ dateKey, entries, nameFor, header, notice, onChanged }) {
  const readings = entries.filter((e) => e.type === 'reading').sort(EntryUtils.compareOldestFirst);

  const section = document.createElement('section');
  section.className = 'detail-section reading-section';
  const body = document.createElement('div');
  section.append(header, body);

  // null, 'add', or the id of the entry being edited. Only one Reading form at a time.
  let openForm = null;

  async function save(action) {
    try {
      await action();
    } catch (err) {
      return `Couldn't save: ${err.message}`;
    }
    await onChanged(null);
    return null;
  }

  async function confirmAndDelete(entry) {
    if (!window.confirm(`Delete ${describeReadingEntry(nameFor(entry.bookItemId), entry)}?`)) return;
    try {
      await deleteReadingEntry(dateKey, entry);
      await onChanged(null);
    } catch (err) {
      await onChanged(`Couldn't delete: ${err.message}`);
    }
  }

  function render() {
    body.innerHTML = '';
    if (notice) {
      const p = document.createElement('p');
      p.className = 'reading-notice';
      p.setAttribute('role', 'alert');
      p.textContent = notice;
      body.appendChild(p);
    }
    const busy = openForm !== null;

    if (readings.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'detail-empty';
      empty.textContent = 'No reading entries yet.';
      body.appendChild(empty);
    } else {
      const list = document.createElement('ul');
      list.className = 'detail-list';
      for (const entry of readings) {
        const li = document.createElement('li');
        if (openForm === entry.id) {
          li.className = 'detail-row-editing';
          li.appendChild(makeReadingForm({
            initial: entry,
            onSave: (values) => save(() => updateReadingEntry(dateKey, entry, values)),
            onCancel: () => { openForm = null; render(); },
          }));
        } else {
          li.className = 'detail-row';
          const label = document.createElement('span');
          label.className = 'detail-row-text';
          label.textContent = describeReadingEntry(nameFor(entry.bookItemId), entry);
          const actions = document.createElement('span');
          actions.className = 'detail-row-actions';
          actions.append(
            makeReadingButton('Edit', () => { openForm = entry.id; render(); }, busy),
            makeReadingButton('Delete', () => confirmAndDelete(entry), busy),
          );
          li.append(label, actions);
        }
        list.appendChild(li);
      }
      body.appendChild(list);
    }

    if (openForm === 'add') {
      body.appendChild(makeReadingForm({
        initial: null,
        onSave: (values) => save(() => addReadingEntry(dateKey, values)),
        onCancel: () => { openForm = null; render(); },
      }));
    } else {
      body.appendChild(makeReadingButton('+ Add reading', () => { openForm = 'add'; render(); }, busy));
    }
  }

  render();
  return section;
}

window.ReadingSection = {
  create: createReadingSection,
  describeReadingEntry,
};
