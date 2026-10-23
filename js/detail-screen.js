// Per-day detail page (detail.html?date=YYYY-MM-DD): shows the selected date and the
// Gym (js/gym-section.js) and Reading (js/reading-section.js) sections, or, on a month's
// result day, a non-entry notice instead.
// After a change, only the section that changed is redrawn from storage, so an
// unfinished form in the other section keeps its typed values.

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

// Reads the day's entries and a name lookup covering all saved items (archived and
// permanently deleted too, so past entries keep their names), plus which items are
// permanently deleted (entries using them are read-only).
async function loadDayData(dateKey) {
  const [entries, savedItems] = await Promise.all([
    ConsistencyDB.getEntriesForDate(dateKey),
    ConsistencyDB.getAllSavedItems(),
  ]);
  const itemNames = new Map(savedItems.map((item) => [item.id, item.name]));
  const deletedIds = new Set(savedItems.filter(ConsistencyDB.isDeletedSavedItem).map((item) => item.id));
  const nameFor = (id) => (itemNames.has(id) ? itemNames.get(id) : '(unknown item)');
  const isDeletedItem = (id) => deletedIds.has(id);
  return { entries, nameFor, isDeletedItem };
}

const DETAIL_SECTIONS = {
  gym: { module: () => GymSection, title: 'Gym', itemType: 'equipment', manageLabel: 'Manage equipment' },
  reading: { module: () => ReadingSection, title: 'Reading', itemType: 'book', manageLabel: 'Manage books' },
};

// The section elements currently on the page, by kind.
const detailSectionElements = {};

// Builds one section from fresh storage data. notice is an optional message for it.
async function buildDetailSection(kind, dateKey, notice) {
  const config = DETAIL_SECTIONS[kind];
  const { entries, nameFor, isDeletedItem } = await loadDayData(dateKey);
  const href = `saved-items.html?type=${config.itemType}&date=${encodeURIComponent(dateKey)}`;
  return config.module().create({
    dateKey,
    entries,
    nameFor,
    isDeletedItem,
    header: makeSectionHeader(config.title, { href, label: config.manageLabel }),
    notice: notice || null,
    onChanged: (changeNotice) => refreshDetailSection(kind, dateKey, changeNotice),
  });
}

// Redraws only one section; the other section (and any open form in it) is untouched.
async function refreshDetailSection(kind, dateKey, notice) {
  const fresh = await buildDetailSection(kind, dateKey, notice);
  detailSectionElements[kind].replaceWith(fresh);
  detailSectionElements[kind] = fresh;
}

// A month's final day is its result day: it shows the month's result (js/month-result-view.js,
// calculated fresh from all stored data) and has no Gym or Reading controls. Any activity
// stored there earlier is listed read-only (kept, never deleted, and not counted).
async function renderResultDayPage(container, dateKey, date) {
  const todayKey = ConsistencyDB.toDateKey(new Date());
  const [{ entries, nameFor }, allDays, allEntries] = await Promise.all([
    loadDayData(dateKey),
    ConsistencyDB.getAllDays(),
    ConsistencyDB.getAllEntries(),
  ]);
  const summary = SummaryCalc.computeSummary({ days: allDays, entries: allEntries, todayKey });
  const result = MonthResultView.render(MonthResultView.buildMonthView(summary, dateKey, todayKey));

  const month = date.toLocaleDateString('en-US', { month: 'long' });
  const section = document.createElement('section');
  section.className = 'detail-section result-day-section';
  const note = document.createElement('p');
  note.className = 'result-day-note';
  note.textContent = `This is ${month}'s result day. Gym and Reading activity can't be added on a month's result day.`;
  section.appendChild(note);

  const lines = [];
  for (const entry of entries.slice().sort(EntryUtils.compareOldestFirst)) {
    if (entry.type === 'gym') {
      for (const row of entry.equipment || []) lines.push(`Gym — ${GymSection.describeGymRow(nameFor(row.itemId), row)}`);
    } else if (entry.type === 'reading') {
      lines.push(`Reading — ${ReadingSection.describeReadingEntry(nameFor(entry.bookItemId), entry)}`);
    }
  }
  if (lines.length > 0) {
    const intro = document.createElement('p');
    intro.className = 'detail-empty';
    intro.textContent = 'Activity saved on this date earlier (kept, but not counted):';
    const list = document.createElement('ul');
    list.className = 'detail-list';
    for (const text of lines) {
      const li = document.createElement('li');
      li.className = 'detail-row';
      li.textContent = text;
      list.appendChild(li);
    }
    section.append(intro, list);
  }
  container.replaceChildren(result, section);
}

async function renderDetailPage() {
  const heading = document.getElementById('detail-date');
  const container = document.getElementById('detail');
  const dateKey = new URLSearchParams(window.location.search).get('date');
  const date = parseDateKey(dateKey);

  if (!date) {
    heading.textContent = "This date isn't valid.";
    return;
  }
  heading.textContent = formatDateHeading(date);

  if (!DayState.entriesAllowed(dateKey)) {
    await renderResultDayPage(container, dateKey, date);
    return;
  }

  for (const kind of Object.keys(DETAIL_SECTIONS)) {
    detailSectionElements[kind] = await buildDetailSection(kind, dateKey, null);
  }
  container.innerHTML = '';
  container.append(detailSectionElements.gym, detailSectionElements.reading);
}

// A result day's page restored by Back (back/forward cache) may show a result from before
// other days were edited; recalculate it from storage.
window.addEventListener('pageshow', (event) => {
  const dateKey = new URLSearchParams(window.location.search).get('date');
  const date = parseDateKey(dateKey);
  if (event.persisted && date && !DayState.entriesAllowed(dateKey)) {
    renderResultDayPage(document.getElementById('detail'), dateKey, date);
  }
});

renderDetailPage();
