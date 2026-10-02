// Per-day detail page (detail.html?date=YYYY-MM-DD): shows the selected date, the
// working Gym section (js/gym-section.js) and a read-only Reading section whose
// Add/Edit/Delete controls stay disabled until the Reading workflow is built.
// The page redraws itself from storage after every change.

// Parses a "YYYY-MM-DD" string into a local Date using numeric components
// (never new Date(dateString), which is read as UTC and can shift the day).
// Returns null for anything malformed or impossible (e.g. "2026-02-31").
function parseDateKey(dateKey) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey || '');
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date;
}

// e.g. "Tuesday, September 29, 2026"
function formatDateHeading(date) {
  return date.toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
}

function makeDisabledButton(label) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.disabled = true;
  return button;
}

// Builds one entry row: its description text plus disabled Edit/Delete controls.
function makeEntryRow(text) {
  const row = document.createElement('li');
  row.className = 'detail-row';
  const label = document.createElement('span');
  label.className = 'detail-row-text';
  label.textContent = text;
  const actions = document.createElement('span');
  actions.className = 'detail-row-actions';
  actions.appendChild(makeDisabledButton('Edit'));
  actions.appendChild(makeDisabledButton('Delete'));
  row.appendChild(label);
  row.appendChild(actions);
  return row;
}

// Section heading plus its "Manage …" link.
function makeSectionHeader(title, manageLink) {
  const header = document.createElement('div');
  header.className = 'detail-section-header';
  const heading = document.createElement('h2');
  heading.textContent = title;
  const manage = document.createElement('a');
  manage.className = 'detail-manage-link';
  manage.href = manageLink.href;
  manage.textContent = manageLink.label;
  header.append(heading, manage);
  return header;
}

function makeSection(title, rowTexts, emptyText, addLabel, manageLink) {
  const section = document.createElement('section');
  section.className = 'detail-section';
  section.appendChild(makeSectionHeader(title, manageLink));

  if (rowTexts.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'detail-empty';
    empty.textContent = emptyText;
    section.appendChild(empty);
  } else {
    const list = document.createElement('ul');
    list.className = 'detail-list';
    for (const text of rowTexts) list.appendChild(makeEntryRow(text));
    section.appendChild(list);
  }

  section.appendChild(makeDisabledButton(addLabel));
  return section;
}

// Draws (or redraws) the page from storage. gymNotice is an optional message shown
// in the Gym section, e.g. when a save partly failed.
async function renderDetailPage(gymNotice) {
  const heading = document.getElementById('detail-date');
  const container = document.getElementById('detail');
  const dateKey = new URLSearchParams(window.location.search).get('date');
  const date = parseDateKey(dateKey);

  if (!date) {
    heading.textContent = "This date isn't valid.";
    return;
  }
  heading.textContent = formatDateHeading(date);

  const [entries, savedItems] = await Promise.all([
    ConsistencyDB.getEntriesForDate(dateKey),
    ConsistencyDB.getAllSavedItems(),
  ]);
  const itemNames = new Map(savedItems.map((item) => [item.id, item.name]));
  const nameFor = (id) => (itemNames.has(id) ? itemNames.get(id) : '(unknown item)');

  const readingRows = [];
  for (const entry of entries) {
    if (entry.type === 'reading') {
      readingRows.push(`${nameFor(entry.bookItemId)}: ${entry.pages} pages`);
    }
  }

  const manageHref = (type) => `saved-items.html?type=${type}&date=${encodeURIComponent(dateKey)}`;
  const gymSection = GymSection.create({
    dateKey,
    entries,
    nameFor,
    header: makeSectionHeader('Gym', { href: manageHref('equipment'), label: 'Manage equipment' }),
    notice: gymNotice || null,
    onChanged: (notice) => renderDetailPage(notice),
  });
  const readingSection = makeSection('Reading', readingRows, 'No reading entries yet.', '+ Add reading',
    { href: manageHref('book'), label: 'Manage books' });

  container.innerHTML = '';
  container.append(gymSection, readingSection);
}

renderDetailPage();
