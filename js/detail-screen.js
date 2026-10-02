// Per-day detail page (detail.html?date=YYYY-MM-DD): shows the selected date and the
// Gym (js/gym-section.js) and Reading (js/reading-section.js) sections.
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

// Reads the day's entries and a name lookup covering all saved items (archived too).
async function loadDayData(dateKey) {
  const [entries, savedItems] = await Promise.all([
    ConsistencyDB.getEntriesForDate(dateKey),
    ConsistencyDB.getAllSavedItems(),
  ]);
  const itemNames = new Map(savedItems.map((item) => [item.id, item.name]));
  const nameFor = (id) => (itemNames.has(id) ? itemNames.get(id) : '(unknown item)');
  return { entries, nameFor };
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
  const { entries, nameFor } = await loadDayData(dateKey);
  const href = `saved-items.html?type=${config.itemType}&date=${encodeURIComponent(dateKey)}`;
  return config.module().create({
    dateKey,
    entries,
    nameFor,
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

  for (const kind of Object.keys(DETAIL_SECTIONS)) {
    detailSectionElements[kind] = await buildDetailSection(kind, dateKey, null);
  }
  container.innerHTML = '';
  container.append(detailSectionElements.gym, detailSectionElements.reading);
}

renderDetailPage();
