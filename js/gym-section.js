// Gym section of the detail page: lists the day's equipment rows and adds, edits and
// deletes individual rows, saving each row immediately (no section-level Save).
// The owner sees one Gym session per day. If storage holds several gym entries for
// the day, their rows are shown together, each row stays tied to its own entry, and
// new rows are appended to the oldest entry. Entries are never merged automatically.

const GYM_ERRORS = {
  equipment: 'Choose equipment from the list.',
  sets: 'Sets must be a whole number greater than 0.',
  reps: 'Reps must be a whole number greater than 0.',
};

// "1 set", "3 sets"
function countLabel(count, singular, plural) {
  return `${count} ${count === 1 ? singular : plural}`;
}

// "Bench Press: 3 sets × 10 reps"
function describeGymRow(name, row) {
  return `${name}: ${countLabel(row.sets, 'set', 'sets')} × ${countLabel(row.reps, 'rep', 'reps')}`;
}

// Digits only (leading zeros allowed, e.g. "08" -> 8) and greater than 0; anything else
// (blank, 0, negatives, decimals, "1e2", letters) returns null. Numbers too large to be
// stored exactly are also rejected rather than silently rounded.
function parsePositiveWholeNumber(text) {
  const trimmed = String(text == null ? '' : text).trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

// Oldest first: by createdAt, then by id as a stable tie-breaker.
function compareOldestFirst(a, b) {
  return (a.createdAt || 0) - (b.createdAt || 0) || a.id - b.id;
}

async function getGymEntries(dateKey) {
  const entries = await ConsistencyDB.getEntriesForDate(dateKey);
  return entries.filter((entry) => entry.type === 'gym').sort(compareOldestFirst);
}

// Re-reads the source entry and checks the row is still the one shown on screen.
async function getStoredGymRow(dateKey, entryId, index, expected) {
  const entry = (await getGymEntries(dateKey)).find((e) => e.id === entryId);
  const row = entry && entry.equipment && entry.equipment[index];
  if (!row || row.itemId !== expected.itemId || row.sets !== expected.sets || row.reps !== expected.reps) {
    throw new Error('This row changed since the page was opened.');
  }
  return entry;
}

// Appends a row to the oldest gym entry for the day, or creates the day's gym entry.
async function addGymRow(dateKey, row) {
  const [oldest] = await getGymEntries(dateKey);
  if (oldest) {
    await ConsistencyDB.updateEntry({ ...oldest, equipment: [...oldest.equipment, row] });
  } else {
    await ConsistencyDB.addEntry({ date: dateKey, type: 'gym', equipment: [row] });
  }
}

// Replaces one row in its own entry, keeping its position.
async function updateGymRow(dateKey, entryId, index, expected, row) {
  const entry = await getStoredGymRow(dateKey, entryId, index, expected);
  const equipment = entry.equipment.slice();
  equipment[index] = row;
  await ConsistencyDB.updateEntry({ ...entry, equipment });
}

// Removes one row from its own entry; removing the entry's last row deletes the entry,
// so an entry with equipment: [] is never stored.
async function deleteGymRow(dateKey, entryId, index, expected) {
  const entry = await getStoredGymRow(dateKey, entryId, index, expected);
  if (entry.equipment.length <= 1) {
    await ConsistencyDB.deleteEntry(entry.id);
    return;
  }
  const equipment = entry.equipment.slice();
  equipment.splice(index, 1);
  await ConsistencyDB.updateEntry({ ...entry, equipment });
}

// Saving gym data marks an unmarked day green; an existing green/red mark is never changed.
async function markDayGreenIfUnmarked(dateKey) {
  const day = await ConsistencyDB.getDay(dateKey);
  if (!day) await ConsistencyDB.setDay(dateKey, 'green');
}

let gymFormCounter = 0;

function makeGymButton(label, onClick, disabled) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.disabled = Boolean(disabled);
  button.addEventListener('click', onClick);
  return button;
}

function makeLabelledNumberInput(labelText, value) {
  const id = `gym-field-${++gymFormCounter}`;
  const wrapper = document.createElement('div');
  wrapper.className = 'gym-field';
  const label = document.createElement('label');
  label.htmlFor = id;
  label.textContent = labelText;
  const input = document.createElement('input');
  input.id = id;
  input.type = 'text';
  input.inputMode = 'numeric';
  input.autocomplete = 'off';
  input.className = 'gym-number-input';
  input.value = value;
  wrapper.append(label, input);
  return { wrapper, input };
}

// Inline add/edit form. onSave receives { itemId, sets, reps } once all fields are valid,
// and returns an error message (string) if saving failed, or nothing on success.
function makeGymForm({ initial, onSave, onCancel }) {
  const form = document.createElement('div');
  form.className = 'gym-form';

  const equipmentLabel = document.createElement('p');
  equipmentLabel.className = 'gym-form-label';
  equipmentLabel.textContent = 'Equipment';
  form.appendChild(equipmentLabel);
  const pickerArea = document.createElement('div');
  form.appendChild(pickerArea);
  const picker = SavedItems.createPicker(pickerArea, { type: 'equipment', placeholder: 'Type to search equipment' });
  if (initial) picker.setSelected(initial.itemId);

  const numbers = document.createElement('div');
  numbers.className = 'gym-numbers';
  const sets = makeLabelledNumberInput('Sets', initial ? String(initial.sets) : '');
  const reps = makeLabelledNumberInput('Reps', initial ? String(initial.reps) : '');
  numbers.append(sets.wrapper, reps.wrapper);
  form.appendChild(numbers);

  const errors = document.createElement('div');
  errors.className = 'gym-form-errors';
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
  actions.className = 'gym-form-actions';
  const saveButton = makeGymButton('Save', async () => {
    const itemId = picker.getSelectedId();
    const setsValue = parsePositiveWholeNumber(sets.input.value);
    const repsValue = parsePositiveWholeNumber(reps.input.value);
    const messages = [];
    if (itemId == null) messages.push(GYM_ERRORS.equipment);
    if (setsValue === null) messages.push(GYM_ERRORS.sets);
    if (repsValue === null) messages.push(GYM_ERRORS.reps);
    showErrors(messages);
    if (messages.length > 0) return;

    saveButton.disabled = true;
    const failure = await onSave({ itemId, sets: setsValue, reps: repsValue });
    if (failure) {
      showErrors([failure]);
      saveButton.disabled = false;
    }
  });
  actions.append(saveButton, makeGymButton('Cancel', onCancel));
  form.appendChild(actions);
  return form;
}

// Builds the Gym section. rows come from every gym entry for the day (oldest entry first).
// onChanged(notice) redraws the whole page from storage, optionally showing a notice.
function createGymSection({ dateKey, entries, nameFor, header, notice, onChanged }) {
  const rows = [];
  for (const entry of entries.filter((e) => e.type === 'gym').sort(compareOldestFirst)) {
    (entry.equipment || []).forEach((row, index) => rows.push({ entryId: entry.id, index, row }));
  }

  const section = document.createElement('section');
  section.className = 'detail-section gym-section';
  const body = document.createElement('div');
  section.append(header, body);

  // null, 'add', or the { entryId, index } of the row being edited. Only one form at a time.
  let openForm = null;

  async function saveAndRefresh(action) {
    try {
      await action();
    } catch (err) {
      return `Couldn't save: ${err.message}`;
    }
    let afterNotice = null;
    try {
      await markDayGreenIfUnmarked(dateKey);
    } catch (err) {
      afterNotice = `Saved, but the calendar day couldn't be marked green: ${err.message}`;
    }
    await onChanged(afterNotice);
    return null;
  }

  async function deleteRow(r) {
    if (!window.confirm(`Delete ${describeGymRow(nameFor(r.row.itemId), r.row)}?`)) return;
    try {
      await deleteGymRow(dateKey, r.entryId, r.index, r.row);
      await onChanged(null);
    } catch (err) {
      await onChanged(`Couldn't delete: ${err.message}`);
    }
  }

  function render() {
    body.innerHTML = '';
    if (notice) {
      const p = document.createElement('p');
      p.className = 'gym-notice';
      p.setAttribute('role', 'alert');
      p.textContent = notice;
      body.appendChild(p);
    }
    const busy = openForm !== null;

    if (rows.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'detail-empty';
      empty.textContent = 'No gym entries yet.';
      body.appendChild(empty);
    } else {
      const list = document.createElement('ul');
      list.className = 'detail-list';
      for (const r of rows) {
        const li = document.createElement('li');
        const editing = openForm && openForm !== 'add' && openForm.entryId === r.entryId && openForm.index === r.index;
        if (editing) {
          li.className = 'detail-row-editing';
          li.appendChild(makeGymForm({
            initial: r.row,
            onSave: (row) => saveAndRefresh(() => updateGymRow(dateKey, r.entryId, r.index, r.row, row)),
            onCancel: () => { openForm = null; render(); },
          }));
        } else {
          li.className = 'detail-row';
          const label = document.createElement('span');
          label.className = 'detail-row-text';
          label.textContent = describeGymRow(nameFor(r.row.itemId), r.row);
          const actions = document.createElement('span');
          actions.className = 'detail-row-actions';
          actions.append(
            makeGymButton('Edit', () => { openForm = { entryId: r.entryId, index: r.index }; render(); }, busy),
            makeGymButton('Delete', () => deleteRow(r), busy),
          );
          li.append(label, actions);
        }
        list.appendChild(li);
      }
      body.appendChild(list);
    }

    if (openForm === 'add') {
      body.appendChild(makeGymForm({
        initial: null,
        onSave: (row) => saveAndRefresh(() => addGymRow(dateKey, row)),
        onCancel: () => { openForm = null; render(); },
      }));
    } else {
      body.appendChild(makeGymButton('+ Add equipment to this session', () => { openForm = 'add'; render(); }, busy));
    }
  }

  render();
  return section;
}

window.GymSection = {
  create: createGymSection,
  describeGymRow,
  countLabel,
  parsePositiveWholeNumber,
};
