// Renders a month calendar grid into a container element, with prev/next
// navigation and today-highlighting. Delegates tap/long-press detection to
// Gestures (js/gestures.js), storage reads to ConsistencyDB (js/db.js), and what each
// day shows (green / red / Reading / "?" / gold result day) to DayState (js/day-state.js).

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function createCalendar(container, { onDayTap, onDayLongPress }) {
  let currentYear, currentMonth; // month is 0-indexed

  const header = document.createElement('div');
  header.className = 'cal-header';
  const prevBtn = document.createElement('button');
  prevBtn.className = 'cal-nav';
  prevBtn.textContent = '‹';
  prevBtn.setAttribute('aria-label', 'Previous month');
  const label = document.createElement('div');
  label.className = 'cal-label';
  const nextBtn = document.createElement('button');
  nextBtn.className = 'cal-nav';
  nextBtn.textContent = '›';
  nextBtn.setAttribute('aria-label', 'Next month');
  header.appendChild(prevBtn);
  header.appendChild(label);
  header.appendChild(nextBtn);

  const weekdayRow = document.createElement('div');
  weekdayRow.className = 'cal-grid cal-weekdays';
  for (const w of WEEKDAY_LABELS) {
    const el = document.createElement('div');
    el.className = 'cal-weekday';
    el.textContent = w;
    weekdayRow.appendChild(el);
  }

  const grid = document.createElement('div');
  grid.className = 'cal-grid cal-days';

  container.appendChild(header);
  container.appendChild(weekdayRow);
  container.appendChild(grid);

  prevBtn.addEventListener('click', () => goToMonth(currentYear, currentMonth - 1));
  nextBtn.addEventListener('click', () => goToMonth(currentYear, currentMonth + 1));

  function goToMonth(year, month) {
    // Normalize month overflow/underflow (e.g. month -1 -> previous year's December)
    const d = new Date(year, month, 1);
    currentYear = d.getFullYear();
    currentMonth = d.getMonth();
    renderMonth();
  }

  // Counts renders so a slower, older render never replaces a newer one.
  let renderCount = 0;

  // Reads the month from storage and draws it. The new grid is built off-screen and
  // swapped in once complete, so redraws (after every tap, and on Back) don't flicker.
  async function renderMonth() {
    const render = ++renderCount;
    const year = currentYear;
    const month = currentMonth;
    // Re-read today on every render so the "today" ring stays current.
    const todayKey = ConsistencyDB.toDateKey(new Date());

    const firstOfMonth = new Date(year, month, 1);
    const startWeekday = firstOfMonth.getDay(); // 0 = Sunday
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const totalCells = Math.ceil((startWeekday + daysInMonth) / 7) * 7;

    const monthStartKey = ConsistencyDB.toDateKey(new Date(year, month, 1));
    const monthEndKey = ConsistencyDB.toDateKey(new Date(year, month, daysInMonth));
    const [statuses, entries] = await Promise.all([
      ConsistencyDB.getDaysInRange(monthStartKey, monthEndKey),
      ConsistencyDB.getEntriesInRange(monthStartKey, monthEndKey),
    ]);
    if (render !== renderCount) return;

    const entriesByDate = new Map();
    for (const entry of entries) {
      if (!entriesByDate.has(entry.date)) entriesByDate.set(entry.date, []);
      entriesByDate.get(entry.date).push(entry);
    }

    const cells = document.createDocumentFragment();
    for (let i = 0; i < totalCells; i++) {
      const dayNum = i - startWeekday + 1;
      const cell = document.createElement('div');

      if (dayNum < 1) {
        cell.className = 'cal-cell cal-filler';
        cell.textContent = daysInPrevMonth + dayNum;
      } else if (dayNum > daysInMonth) {
        cell.className = 'cal-cell cal-filler';
        cell.textContent = dayNum - daysInMonth;
      } else {
        const dateKey = ConsistencyDB.toDateKey(new Date(year, month, dayNum));
        const look = DayState.describeDay(dateKey, statuses[dateKey], entriesByDate.get(dateKey) || []);
        cell.className = 'cal-cell cal-day' + (look.color ? ` cal-${look.color}` : '');
        if (dateKey === todayKey) cell.classList.add('cal-today');
        // Reading marker: shown if the day has any Reading entry, independent of the Gym colour.
        if (look.reading) cell.classList.add('cal-reading');
        // "?": stored mark and Gym data disagree; the date is left out of scoring until corrected.
        if (look.unresolved) cell.classList.add('cal-unresolved');
        // A month's final day is its result day (no activity), always shown gold.
        if (look.resultDay) cell.classList.add('cal-result-day');
        if (look.gold) cell.classList.add('cal-gold');
        cell.textContent = String(dayNum);
        cell.dataset.date = dateKey;

        Gestures.attach(cell, {
          onTap: () => onDayTap(dateKey, cell),
          onLongPress: () => onDayLongPress(dateKey, cell),
        });
      }

      cells.appendChild(cell);
    }
    label.textContent = `${MONTH_LABELS[month]} ${year}`;
    grid.replaceChildren(cells);
  }

  const now = new Date();
  goToMonth(now.getFullYear(), now.getMonth());

  return { refresh: renderMonth };
}

window.Calendar = { create: createCalendar };
