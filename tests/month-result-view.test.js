// Automated tests for js/month-result-view.js (the monthly result shown on a gold result
// day) together with the gold-day tap rule in js/day-state.js.
// Run from the project folder with:  node --test

const test = require('node:test');
const assert = require('node:assert/strict');
const { computeSummary } = require('../js/summary-calc.js');
const { formatNumber, buildMonthView, calendarResult } = require('../js/month-result-view.js');
const { tapOpensDay, nextTapStatus, describeDay } = require('../js/day-state.js');

// --- Test data builders (same shapes the app stores) ---

const FULL = { gym: [[1, 3, 10]], books: [1] };
const GYM = { gym: [[1, 3, 10]] };
const READ = { books: [1] };
const EMPTY = {};

function dateRange(start, end) {
  const [sy, sm, sd] = start.split('-').map(Number);
  const keys = [];
  for (let d = new Date(sy, sm - 1, sd); ; d.setDate(d.getDate() + 1)) {
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    keys.push(key);
    if (key === end) return keys;
  }
}

function fill(start, end, state) {
  return Object.fromEntries(dateRange(start, end).map((key) => [key, state]));
}

function build(spec) {
  let nextId = 1;
  const days = [];
  const entries = [];
  for (const [date, state] of Object.entries(spec)) {
    if (state.status) days.push({ date, status: state.status });
    if (state.gym) {
      entries.push({ id: nextId++, date, type: 'gym', equipment: state.gym.map(([itemId, sets, reps]) => ({ itemId, sets, reps })) });
    }
    for (const bookItemId of state.books || []) entries.push({ id: nextId++, date, type: 'reading', bookItemId, pages: 10 });
  }
  return { days, entries };
}

function view(spec, resultDay, todayKey) {
  const summary = computeSummary({ ...build(spec), todayKey });
  return buildMonthView(summary, resultDay, todayKey);
}

// --- Formatting ---

test('averages show up to 2 decimals with no forced trailing zeros', () => {
  assert.equal(formatNumber(2), '2');
  assert.equal(formatNumber(2.5), '2.5');
  assert.equal(formatNumber(7 / 3), '2.33');
  assert.equal(formatNumber(107 / 3), '35.67');
  assert.equal(formatNumber(4 / 3), '1.33');
  assert.equal(formatNumber(0), '0');
  assert.equal(formatNumber(24.5), '24.5');
});

// --- Calendar / navigation ---

test('a normal tap on a gold result day opens it and never toggles a mark', () => {
  for (const key of ['2026-10-31', '2026-11-30', '2027-02-28', '2028-02-29', '2030-12-31']) {
    assert.equal(tapOpensDay(key), true, key);
    for (const status of [undefined, 'red', 'green']) assert.equal(nextTapStatus(key, status, []), undefined);
  }
  for (const key of ['2026-10-30', '2026-11-01', '2026-09-30']) assert.equal(tapOpensDay(key), false, key);
});

test('a future final day is already gold', () => {
  assert.equal(describeDay('2027-06-30', undefined, []).gold, true);
});

test('completed gold cell shows the month\'s Consistency result', () => {
  const summary = computeSummary({ ...build(fill('2026-10-18', '2026-10-30', FULL)), todayKey: '2026-11-03' });
  assert.deepEqual(calendarResult(summary, '2026-10-31', '2026-11-03'), {
    text: '13', label: 'Consistency 13', unresolved: false,
  });
});

test('gold cell shows nothing before its month closes, or for a month with no result', () => {
  const summary = computeSummary({ ...build({ '2026-11-05': FULL }), todayKey: '2026-11-20' });
  assert.equal(calendarResult(summary, '2026-11-30', '2026-11-20'), null);
  assert.equal(calendarResult(summary, '2026-10-31', '2026-11-20'), null); // October had no activity
});

test('an unresolved completed gold cell does not show a number as if final', () => {
  const spec = { ...fill('2026-10-18', '2026-10-30', FULL), '2026-10-22': { status: 'green' } };
  const summary = computeSummary({ ...build(spec), todayKey: '2026-10-31' });
  const cell = calendarResult(summary, '2026-10-31', '2026-10-31');
  assert.equal(cell.unresolved, true);
  assert.equal(cell.label, 'Unresolved');
  assert.doesNotMatch(cell.text, /\d/);
});

// --- Result view states ---

test('a future gold day shows the result-not-ready state, with no numbers', () => {
  const v = view(fill('2026-10-18', '2026-10-30', FULL), '2026-11-30', '2026-11-10');
  assert.deepEqual(v, { monthKey: '2026-11', monthLabel: 'November 2026', resultDayLabel: 'November 30', state: 'notReady' });
});

test('a gold day becomes complete on the result day itself', () => {
  assert.equal(view(fill('2026-10-18', '2026-10-30', FULL), '2026-10-31', '2026-10-30').state, 'notReady');
  assert.equal(view(fill('2026-10-18', '2026-10-30', FULL), '2026-10-31', '2026-10-31').state, 'complete');
});

test('a closed month without a Stage 4 result says so', () => {
  const v = view({ '2026-11-05': FULL }, '2026-10-31', '2026-11-20');
  assert.equal(v.state, 'noResult');
  assert.deepEqual(v.unresolvedDates, []);
});

test('a completed gold day shows the selected month', () => {
  const spec = { ...fill('2026-10-18', '2026-10-30', FULL), ...fill('2026-11-01', '2026-11-29', GYM) };
  const oct = view(spec, '2026-10-31', '2026-12-05');
  const nov = view(spec, '2026-11-30', '2026-12-05');
  assert.equal(oct.monthLabel, 'October 2026');
  assert.equal(oct.scoredRangeLabel, 'Oct 18–30');
  assert.equal(nov.monthLabel, 'November 2026');
  assert.equal(nov.scoredRangeLabel, 'Nov 1–29');
});

test('Consistency is shown without a denominator', () => {
  const v = view({ ...fill('2026-10-18', '2026-10-29', FULL), '2026-10-30': READ }, '2026-10-31', '2026-10-31');
  assert.equal(v.consistency, '12.5');
  assert.doesNotMatch(v.consistency, /\/|out of/);
});

test('break dates and reasons are shown', () => {
  const v = view({
    ...fill('2026-10-18', '2026-10-20', FULL),
    '2026-10-21': EMPTY,
    ...fill('2026-10-22', '2026-10-25', GYM),
    ...fill('2026-10-26', '2026-10-30', FULL),
  }, '2026-10-31', '2026-10-31');
  assert.deepEqual(v.breaks, [
    { dateLabel: 'Oct 21', reason: 'no activity' },
    { dateLabel: 'Oct 25', reason: '4th consecutive half-day' },
  ]);
});

test('carried streak continuity across months', () => {
  const spec = { ...fill('2026-10-18', '2026-10-30', FULL), ...fill('2026-11-01', '2026-11-29', FULL) };
  const nov = view(spec, '2026-11-30', '2026-11-30');
  assert.deepEqual(nov.streak, { total: '42', parts: [{ name: 'October', value: '13' }, { name: 'November', value: '29' }] });
});

test('Gym and Reading contribution, average and active-day count', () => {
  const v = view({
    '2026-10-28': { gym: [[1, 3, 10]], books: [1] },
    '2026-10-29': { gym: [[1, 4, 10], [2, 2, 10]], books: [1, 2] },
    '2026-10-30': { gym: [[1, 5, 10]], books: [3, 3] },
  }, '2026-10-31', '2026-10-31');
  assert.deepEqual(v.gym, { contribution: '120', average: '40', daysLabel: '3 Gym days' });
  assert.deepEqual(v.reading, { contribution: '4', average: '1.33', daysLabel: '3 Reading days' });
});

test('zero metrics display as 0, with singular day labels where needed', () => {
  const v = view({ '2026-10-30': READ }, '2026-10-31', '2026-10-31');
  assert.deepEqual(v.gym, { contribution: '0', average: '0', daysLabel: '0 Gym days' });
  assert.deepEqual(v.reading, { contribution: '1', average: '1', daysLabel: '1 Reading day' });
});

// --- Comparisons ---

test('the baseline month has no previous-month comparison', () => {
  const v = view({ '2026-10-30': FULL }, '2026-10-31', '2026-10-31');
  assert.deepEqual(v.comparison, { kind: 'baseline' });
});

test('a later same-year month compares with the previous month: higher, lower, unchanged', () => {
  const v = view({
    '2026-10-30': { gym: [[1, 3, 10]], books: [1] },
    '2026-11-28': { gym: [[1, 2, 10]], books: [1] },
    '2026-11-29': { gym: [[1, 4, 5]], books: [2] },
  }, '2026-11-30', '2026-11-30');
  assert.equal(v.comparison.kind, 'previous');
  assert.equal(v.comparison.previousName, 'October');
  assert.deepEqual(v.comparison.rows, [
    { metric: 'Gym Contribution', previous: '30', verdict: 'higher' },
    { metric: 'Average Gym Performance', previous: '30', verdict: 'lower' },
    { metric: 'Reading Contribution', previous: '1', verdict: 'higher' },
    { metric: 'Average Reading Breadth', previous: '1', verdict: 'unchanged' },
  ]);
});

test('January has no December comparison', () => {
  const v = view({ '2026-12-30': FULL, '2027-01-30': FULL }, '2027-01-31', '2027-02-02');
  assert.deepEqual(v.comparison, { kind: 'newYear' });
});

// --- History ---

const YEAR_SPEC = {
  '2026-10-30': FULL,
  '2026-11-29': GYM,
  '2026-12-30': READ,
  '2027-01-30': FULL,
  '2027-02-27': GYM,
  '2027-03-30': FULL,
};

test('October 2026 history contains October only', () => {
  assert.deepEqual(view(YEAR_SPEC, '2026-10-31', '2027-04-01').history.map((h) => h.name), ['October']);
});

test('December 2026 history contains October, November, December', () => {
  const v = view(YEAR_SPEC, '2026-12-31', '2027-04-01');
  assert.deepEqual(v.history, [
    { name: 'October', unresolved: false, consistency: '1', gymContribution: '30', gymAverage: '30', readingContribution: '1', readingAverage: '1' },
    { name: 'November', unresolved: false, consistency: '0.5', gymContribution: '30', gymAverage: '30', readingContribution: '0', readingAverage: '0' },
    { name: 'December', unresolved: false, consistency: '0.5', gymContribution: '0', gymAverage: '0', readingContribution: '1', readingAverage: '1' },
  ]);
});

test('January resets the history scope', () => {
  assert.deepEqual(view(YEAR_SPEC, '2027-01-31', '2027-04-01').history.map((h) => h.name), ['January']);
});

test('opening an older gold day excludes later months', () => {
  // In April 2027, January's gold day shows January only, and February's shows Jan–Feb.
  assert.deepEqual(view(YEAR_SPEC, '2027-01-31', '2027-04-01').history.map((h) => h.name), ['January']);
  assert.deepEqual(view(YEAR_SPEC, '2027-02-28', '2027-04-01').history.map((h) => h.name), ['January', 'February']);
});

test('a historical correction updates the displayed history', () => {
  const before = view(YEAR_SPEC, '2026-12-31', '2027-04-01');
  const after = view({ ...YEAR_SPEC, '2026-10-30': { gym: [[1, 10, 10]], books: [1, 2] } }, '2026-12-31', '2027-04-01');
  assert.equal(before.history[0].gymContribution, '30');
  assert.equal(after.history[0].gymContribution, '100');
  assert.equal(after.history[0].readingContribution, '2');
});

// --- Unresolved months ---

test('an unresolved month is clearly flagged with its dates', () => {
  const spec = { ...fill('2026-10-18', '2026-10-30', FULL), '2026-10-22': { status: 'green' }, '2026-10-25': { status: 'red', gym: [[1, 1, 1]] } };
  const v = view(spec, '2026-10-31', '2026-11-02');
  assert.equal(v.unresolved, true);
  assert.deepEqual(v.unresolvedDates, ['Oct 22', 'Oct 25']);
  assert.equal(v.consistency, '11'); // the unresolved dates are left out
});

test('correcting the data removes the unresolved state and recalculates', () => {
  const spec = { ...fill('2026-10-18', '2026-10-30', FULL), '2026-10-22': { status: 'green' } };
  const before = view(spec, '2026-10-31', '2026-11-02');
  const after = view({ ...spec, '2026-10-22': { status: 'green', gym: [[1, 3, 10]], books: [1] } }, '2026-10-31', '2026-11-02');
  assert.equal(before.unresolved, true);
  assert.equal(after.unresolved, false);
  assert.deepEqual(after.unresolvedDates, []);
  assert.equal(after.consistency, '13');
});

test('a later month notes when its previous month is unresolved', () => {
  const spec = { '2026-10-22': { status: 'green' }, '2026-10-30': FULL, '2026-11-29': FULL };
  const v = view(spec, '2026-11-30', '2026-11-30');
  assert.equal(v.comparison.previousUnresolved, true);
  assert.equal(v.history[0].unresolved, true);
});

test('unresolved dates in a month without a result are still listed', () => {
  const v = view({ '2026-10-22': { status: 'green' }, '2026-11-05': FULL }, '2026-10-31', '2026-11-30');
  assert.equal(v.state, 'noResult');
  assert.deepEqual(v.unresolvedDates, ['Oct 22']);
});
