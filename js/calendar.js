// Renders a month calendar grid into a container element, with prev/next
// navigation and today-highlighting. Delegates tap/long-press detection to
// Gestures (js/gestures.js) and day-state reads/writes to ConsistencyDB (js/db.js).

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function createCalendar(container, { onDayTap, onDayLongPress }) {
  let currentYear, currentMonth; // month is 0-indexed
  const today = new Date();
  const todayKey = ConsistencyDB.toDateKey(today);

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

  async function renderMonth() {
    label.textContent = `${MONTH_LABELS[currentMonth]} ${currentYear}`;
    grid.innerHTML = '';

    const firstOfMonth = new Date(currentYear, currentMonth, 1);
    const startWeekday = firstOfMonth.getDay(); // 0 = Sunday
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(currentYear, currentMonth, 0).getDate();

    const totalCells = Math.ceil((startWeekday + daysInMonth) / 7) * 7;

    const monthStartKey = ConsistencyDB.toDateKey(new Date(currentYear, currentMonth, 1));
    const monthEndKey = ConsistencyDB.toDateKey(new Date(currentYear, currentMonth, daysInMonth));
    const statuses = await ConsistencyDB.getDaysInRange(monthStartKey, monthEndKey);

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
        const dateKey = ConsistencyDB.toDateKey(new Date(currentYear, currentMonth, dayNum));
        const status = statuses[dateKey]; // undefined | "green" | "red"
        cell.className = 'cal-cell cal-day' + (status ? ` cal-${status}` : '');
        if (dateKey === todayKey) cell.classList.add('cal-today');
        cell.textContent = String(dayNum);
        cell.dataset.date = dateKey;

        Gestures.attach(cell, {
          onTap: () => onDayTap(dateKey, cell),
          onLongPress: () => onDayLongPress(dateKey, cell),
        });
      }

      grid.appendChild(cell);
    }
  }

  // Updates a single cell's visual state without re-rendering the whole grid.
  function setCellStatus(cell, status) {
    cell.classList.remove('cal-green', 'cal-red');
    if (status) cell.classList.add(`cal-${status}`);
  }

  const now = new Date();
  goToMonth(now.getFullYear(), now.getMonth());

  return { setCellStatus, refresh: renderMonth };
}

window.Calendar = { create: createCalendar };
