// Automated tests for js/summary-calc.js (Stage 4 calculation engine).
// Run from the project folder with:  node --test
// Uses only Node's built-in test runner; nothing to install.

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  TRACKING_START,
  BREAK_NO_ACTIVITY,
  BREAK_FOURTH_HALF_DAY,
  classifyDate,
  isResultDay,
  computeSummary,
} = require('../js/summary-calc.js');

// --- Test data builders ---

// Day states. gym rows are [itemId, sets, reps]; books are book item ids.
const FULL = { gym: [[1, 3, 10]], books: [1] };
const GYM = { gym: [[1, 3, 10]] };
const READ = { books: [1] };
const RED = { status: 'red' };
const RED_READ = { status: 'red', books: [1] };
const EMPTY = {};
const MISMATCH_RED_GYM = { status: 'red', gym: [[1, 50, 50]] };
const MISMATCH_GREEN_ONLY = { status: 'green' };

// Every date from start to end inclusive (local calendar arithmetic).
function dateRange(start, end) {
  const [sy, sm, sd] = start.split('-').map(Number);
  const keys = [];
  for (let d = new Date(sy, sm - 1, sd); ; d.setDate(d.getDate() + 1)) {
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    keys.push(key);
    if (key === end) return keys;
  }
}

// { 'YYYY-MM-DD': state } for every date in the range.
function fill(start, end, state) {
  return Object.fromEntries(dateRange(start, end).map((key) => [key, state]));
}

// Turns { date: state } into the stored shape: 'days' records and entries. A day with gym
// rows is marked green (as the app does when a gym row is saved) unless a status is given.
function build(spec) {
  let nextId = 1;
  const days = [];
  const entries = [];
  for (const [date, state] of Object.entries(spec)) {
    const status = 'status' in state ? state.status : state.gym ? 'green' : undefined;
    if (status) days.push({ date, status });
    if (state.gym) {
      entries.push({
        id: nextId++, date, type: 'gym',
        equipment: state.gym.map(([itemId, sets, reps]) => ({ itemId, sets, reps })),
      });
    }
    for (const bookItemId of state.books || []) {
      entries.push({ id: nextId++, date, type: 'reading', bookItemId, pages: 10 });
    }
  }
  return { days, entries };
}

function summarize(spec, todayKey) {
  return computeSummary({ ...build(spec), todayKey });
}

function monthOf(summary, key) {
  const found = summary.months.find((m) => m.month === key);
  assert.ok(found, `month ${key} should be in the results`);
  return found;
}

// --- Tracking start and the first partial month ---

test('tracking starts on October 18, 2026', () => {
  assert.equal(TRACKING_START, '2026-10-18');
});

test('dates before Oct 18 are ignored: not scored, not missed, never a break', () => {
  const spec = {
    '2026-09-15': FULL,
    '2026-10-05': FULL,
    '2026-10-10': RED,
    ...fill('2026-10-18', '2026-10-30', FULL),
  };
  const s = summarize(spec, '2026-10-31');
  const oct = monthOf(s, '2026-10');
  assert.equal(oct.consistency, 13);
  assert.deepEqual(oct.breaks, []);
  assert.equal(oct.gym.days, 13);
  assert.equal(s.dates['2026-10-05'], undefined);
  assert.equal(s.dates['2026-10-17'], undefined);
  assert.ok(s.dates['2026-10-18']);
});

test('October 2026 is a partial first month: scored Oct 18–30, result day Oct 31', () => {
  const oct = monthOf(summarize({ '2026-10-20': FULL }, '2026-10-31'), '2026-10');
  assert.equal(oct.scoredStart, '2026-10-18');
  assert.equal(oct.scoredEnd, '2026-10-30');
  assert.equal(oct.resultDay, '2026-10-31');
});

test('empty days before the first activity do not break anything', () => {
  // Oct 18–27 empty with no streak running: no breaks are listed.
  const oct = monthOf(summarize(fill('2026-10-28', '2026-10-30', FULL), '2026-10-31'), '2026-10');
  assert.equal(oct.consistency, 3);
  assert.deepEqual(oct.breaks, []);
});

// --- Result day ---

test('result-day classification: the final calendar day of every month', () => {
  for (const key of ['2026-10-31', '2026-11-30', '2026-12-31', '2027-02-28', '2028-02-29']) {
    assert.equal(isResultDay(key), true, key);
  }
  for (const key of ['2026-10-30', '2026-11-29', '2027-02-27', '2028-02-28', '2026-11-01']) {
    assert.equal(isResultDay(key), false, key);
  }
});

test('a month is completed on its result day, not before', () => {
  const spec = fill('2026-10-18', '2026-10-30', FULL);
  assert.deepEqual(summarize(spec, '2026-10-30').months, []);
  assert.equal(summarize(spec, '2026-10-31').months.length, 1);
  assert.equal(summarize(spec, '2026-11-29').months.length, 1);
  assert.equal(summarize(spec, '2026-11-30').months.length, 2);
});

test('dates output marks the result day and February lengths are respected', () => {
  const s = summarize({ '2026-10-20': FULL }, '2028-02-29');
  assert.equal(s.dates['2026-10-31'].isResultDay, true);
  assert.equal(s.dates['2026-10-31'].scored, false);
  assert.equal(s.dates['2026-10-30'].isResultDay, false);
  assert.equal(monthOf(s, '2027-02').scoredEnd, '2027-02-27');
  assert.equal(monthOf(s, '2027-02').resultDay, '2027-02-28');
  assert.equal(monthOf(s, '2028-02').scoredEnd, '2028-02-28');
  assert.equal(monthOf(s, '2028-02').resultDay, '2028-02-29');
});

test('the final calendar day is excluded from scoring: activity there adds nothing, emptiness breaks nothing', () => {
  const withActivity = summarize({ ...fill('2026-10-18', '2026-10-30', FULL), '2026-10-31': FULL }, '2026-10-31');
  assert.equal(monthOf(withActivity, '2026-10').consistency, 13);
  assert.equal(monthOf(withActivity, '2026-10').gym.days, 13);

  // Oct 31 empty, streak continues into November without a break.
  const spec = { ...fill('2026-10-18', '2026-10-30', FULL), ...fill('2026-11-01', '2026-11-29', FULL) };
  const s = summarize(spec, '2026-11-30');
  const nov = monthOf(s, '2026-11');
  assert.deepEqual(nov.breaks, []);
  assert.equal(nov.consistency, 29);
  assert.equal(nov.carriedStreak.total, 42);
});

// --- Daily consistency states ---

function singleDayConsistency(state) {
  return monthOf(summarize({ '2026-10-20': FULL, '2026-10-30': state }, '2026-10-31'), '2026-10');
}

test('full day (Gym + Reading) = 1.0', () => {
  assert.equal(monthOf(summarize({ '2026-10-30': FULL }, '2026-10-31'), '2026-10').consistency, 1);
});

test('Gym only = 0.5', () => {
  assert.equal(monthOf(summarize({ '2026-10-30': GYM }, '2026-10-31'), '2026-10').consistency, 0.5);
});

test('Reading only = 0.5', () => {
  assert.equal(monthOf(summarize({ '2026-10-30': READ }, '2026-10-31'), '2026-10').consistency, 0.5);
});

test('red + Reading = Reading-only half-day (0.5)', () => {
  assert.equal(monthOf(summarize({ '2026-10-30': RED_READ }, '2026-10-31'), '2026-10').consistency, 0.5);
  const info = classifyDate('2026-10-30', 'red', [{ type: 'reading', bookItemId: 1, pages: 5 }]);
  assert.equal(info.integrity, 'ok');
  assert.equal(info.units, 0.5);
  assert.equal(info.hasGym, false);
});

test('red only breaks the streak immediately', () => {
  const spec = { ...fill('2026-10-18', '2026-10-30', FULL), '2026-10-21': RED };
  const oct = monthOf(summarize(spec, '2026-10-31'), '2026-10');
  assert.equal(oct.consistency, 9);
  assert.deepEqual(oct.breaks, [{ date: '2026-10-21', reason: BREAK_NO_ACTIVITY }]);
});

test('empty/unmarked day breaks the streak immediately (no grace period)', () => {
  const spec = { ...fill('2026-10-18', '2026-10-30', FULL), '2026-10-21': EMPTY };
  const oct = monthOf(summarize(spec, '2026-10-31'), '2026-10');
  assert.equal(oct.consistency, 9);
  assert.deepEqual(oct.breaks, [{ date: '2026-10-21', reason: BREAK_NO_ACTIVITY }]);
});

test('Gym data on an unmarked day is valid Gym (green is data-driven)', () => {
  const info = classifyDate('2026-10-20', undefined, [{ type: 'gym', equipment: [{ itemId: 1, sets: 3, reps: 10 }] }]);
  assert.equal(info.integrity, 'ok');
  assert.equal(info.hasGym, true);
  assert.equal(info.units, 0.5);
});

// --- Half-day rule ---

test('exactly 3 consecutive half-days survive', () => {
  const spec = {
    '2026-10-18': FULL,
    ...fill('2026-10-19', '2026-10-21', GYM),
    ...fill('2026-10-22', '2026-10-30', FULL),
  };
  const oct = monthOf(summarize(spec, '2026-10-31'), '2026-10');
  assert.deepEqual(oct.breaks, []);
  assert.equal(oct.consistency, 1 + 1.5 + 9);
});

test('the 4th consecutive half-day breaks the streak and is not counted', () => {
  const spec = {
    '2026-10-18': FULL,
    ...fill('2026-10-19', '2026-10-22', READ),
    ...fill('2026-10-23', '2026-10-30', FULL),
  };
  const oct = monthOf(summarize(spec, '2026-10-31'), '2026-10');
  assert.deepEqual(oct.breaks, [{ date: '2026-10-22', reason: BREAK_FOURTH_HALF_DAY }]);
  assert.equal(oct.consistency, 8);
  assert.equal(oct.reading.days, 8);
});

test('after a 4th-half-day break, the next half-day starts a new streak normally', () => {
  const spec = {
    '2026-10-18': FULL,
    ...fill('2026-10-19', '2026-10-23', GYM), // 22 breaks; 23 starts a new streak
    ...fill('2026-10-24', '2026-10-30', FULL),
  };
  const oct = monthOf(summarize(spec, '2026-10-31'), '2026-10');
  assert.deepEqual(oct.breaks, [{ date: '2026-10-22', reason: BREAK_FOURTH_HALF_DAY }]);
  assert.equal(oct.consistency, 0.5 + 7);
});

test('a full day resets the consecutive-half-day counter', () => {
  const spec = {
    '2026-10-18': FULL,
    ...fill('2026-10-19', '2026-10-21', GYM),
    '2026-10-22': FULL,
    ...fill('2026-10-23', '2026-10-25', READ),
    ...fill('2026-10-26', '2026-10-30', FULL),
  };
  const oct = monthOf(summarize(spec, '2026-10-31'), '2026-10');
  assert.deepEqual(oct.breaks, []);
  assert.equal(oct.consistency, 1 + 1.5 + 1 + 1.5 + 5);
});

test('half-day sequence carries across the result day (owner example: Oct 29, 30, [31], Nov 1, Nov 2)', () => {
  const base = { ...fill('2026-10-18', '2026-10-28', FULL), '2026-10-29': GYM, '2026-10-30': READ };

  const survives = summarize({ ...base, '2026-11-01': GYM, ...fill('2026-11-02', '2026-11-29', FULL) }, '2026-11-30');
  assert.deepEqual(monthOf(survives, '2026-11').breaks, []);
  assert.equal(monthOf(survives, '2026-10').consistency, 12);
  assert.equal(monthOf(survives, '2026-11').consistency, 28.5);
  assert.deepEqual(monthOf(survives, '2026-11').carriedStreak, {
    total: 40.5,
    parts: [{ month: '2026-10', consistency: 12 }, { month: '2026-11', consistency: 28.5 }],
  });

  const breaks = summarize({ ...base, '2026-11-01': GYM, '2026-11-02': READ, ...fill('2026-11-03', '2026-11-29', FULL) }, '2026-11-30');
  const nov = monthOf(breaks, '2026-11');
  assert.deepEqual(nov.breaks, [{ date: '2026-11-02', reason: BREAK_FOURTH_HALF_DAY }]);
  assert.equal(nov.consistency, 27);
  assert.deepEqual(nov.carriedStreak.parts, [{ month: '2026-11', consistency: 27 }]);
  // October keeps its own result.
  assert.equal(monthOf(breaks, '2026-10').consistency, 12);
});

test('half-day sequence also carries across a year boundary (Dec 31 result day)', () => {
  const spec = {
    ...fill('2026-12-01', '2026-12-28', FULL),
    '2026-12-29': GYM,
    '2026-12-30': GYM,
    '2027-01-01': GYM,
    '2027-01-02': GYM,
    ...fill('2027-01-03', '2027-01-30', FULL),
  };
  const jan = monthOf(summarize(spec, '2027-01-31'), '2027-01');
  assert.deepEqual(jan.breaks, [{ date: '2027-01-02', reason: BREAK_FOURTH_HALF_DAY }]);
  assert.equal(jan.consistency, 28);
});

// --- Integrity mismatch ---

test('integrity: Gym data + red, and green with no Gym data, are mismatches; Reading never mismatches', () => {
  const gymEntry = { type: 'gym', equipment: [{ itemId: 1, sets: 3, reps: 10 }] };
  const readingEntry = { type: 'reading', bookItemId: 1, pages: 5 };
  assert.equal(classifyDate('2026-10-20', 'red', [gymEntry]).integrity, 'mismatch');
  assert.equal(classifyDate('2026-10-20', 'green', []).integrity, 'mismatch');
  assert.equal(classifyDate('2026-10-20', 'green', [readingEntry]).integrity, 'mismatch');
  assert.equal(classifyDate('2026-10-20', 'green', [gymEntry]).integrity, 'ok');
  assert.equal(classifyDate('2026-10-20', undefined, [gymEntry]).integrity, 'ok');
  assert.equal(classifyDate('2026-10-20', undefined, [readingEntry]).integrity, 'ok');
  assert.equal(classifyDate('2026-10-20', undefined, []).integrity, 'ok');
  assert.equal(classifyDate('2026-10-20', 'red', []).integrity, 'ok');
  const unresolved = classifyDate('2026-10-20', 'red', [gymEntry]);
  assert.equal(unresolved.scored, false);
  assert.equal(unresolved.units, null);
});

test('green is data-driven: the full Gym state table', () => {
  const gymEntry = { type: 'gym', equipment: [{ itemId: 1, sets: 3, reps: 10 }] };
  const cases = [
    // [status, has gym entry, integrity, hasGym]
    ['green', true, 'ok', true],          // Gym entry, not red -> valid Gym
    [undefined, true, 'ok', true],        // Gym entry, unmarked -> valid Gym
    ['red', true, 'mismatch', true],      // Gym entry + red -> unresolved
    ['green', false, 'mismatch', false],  // legacy/manual green, no Gym entry -> unresolved
    ['red', false, 'ok', false],          // red, no Gym entry -> valid no-Gym
    [undefined, false, 'ok', false],      // unmarked, no Gym entry -> valid no-Gym
  ];
  for (const [status, withGym, integrity, hasGym] of cases) {
    const info = classifyDate('2026-10-20', status, withGym ? [gymEntry] : []);
    assert.equal(info.integrity, integrity, `${status} / gym entry ${withGym}`);
    assert.equal(info.hasGym, hasGym, `${status} / gym entry ${withGym}`);
  }
});

test('Reading is fully data-driven: present only when a Reading entry exists', () => {
  assert.equal(classifyDate('2026-10-20', undefined, [{ type: 'reading', bookItemId: 1, pages: 5 }]).hasReading, true);
  assert.equal(classifyDate('2026-10-20', undefined, []).hasReading, false);
  // Calendar marks never create Reading.
  assert.equal(classifyDate('2026-10-20', 'green', [{ type: 'gym', equipment: [{ itemId: 1, sets: 1, reps: 1 }] }]).hasReading, false);
});

test('dates before Oct 18 never get an integrity warning', () => {
  const gymEntry = { type: 'gym', equipment: [{ itemId: 1, sets: 3, reps: 10 }] };
  assert.equal(classifyDate('2026-10-17', 'green', []).integrity, 'ok');
  assert.equal(classifyDate('2026-10-17', 'red', [gymEntry]).integrity, 'ok');
  assert.equal(classifyDate('2026-09-30', 'green', []).integrity, 'ok');
  assert.equal(classifyDate('2026-10-17', 'green', []).tracked, false);
  assert.equal(classifyDate('2026-10-17', 'green', []).scored, false);
  // From Oct 18 on, the same states are mismatches.
  assert.equal(classifyDate('2026-10-18', 'green', []).integrity, 'mismatch');
  assert.equal(classifyDate('2026-10-18', 'red', [gymEntry]).integrity, 'mismatch');

  const s = summarize({ '2026-10-10': MISMATCH_GREEN_ONLY, '2026-10-12': MISMATCH_RED_GYM, '2026-10-20': FULL }, '2026-10-31');
  assert.deepEqual(s.unresolvedDates, []);
  assert.equal(monthOf(s, '2026-10').hasUnresolved, false);
});

test('a month with unresolved dates is exposed as not clean, and becomes clean once corrected', () => {
  const spec = {
    ...fill('2026-10-18', '2026-10-30', FULL),
    '2026-10-21': MISMATCH_GREEN_ONLY,
    '2026-10-26': MISMATCH_RED_GYM,
    ...fill('2026-11-01', '2026-11-29', FULL),
  };
  const before = summarize(spec, '2026-11-30');
  const oct = monthOf(before, '2026-10');
  assert.equal(oct.hasUnresolved, true);
  assert.deepEqual(oct.unresolvedDates, ['2026-10-21', '2026-10-26']);
  assert.equal(oct.consistency, 11); // the two unresolved dates are left out
  assert.equal(monthOf(before, '2026-11').hasUnresolved, false);
  assert.deepEqual(before.unresolvedDates, ['2026-10-21', '2026-10-26']);
  assert.equal(monthOf(before, '2026-11').history[0].hasUnresolved, true);

  const after = summarize({ ...spec, '2026-10-21': FULL, '2026-10-26': RED_READ }, '2026-11-30');
  assert.equal(monthOf(after, '2026-10').hasUnresolved, false);
  assert.deepEqual(monthOf(after, '2026-10').unresolvedDates, []);
  assert.equal(monthOf(after, '2026-10').consistency, 12.5);
  assert.equal(monthOf(after, '2026-11').carriedStreak.total, 12.5 + 29);
  assert.deepEqual(after.unresolvedDates, []);
});

test('unresolved dates in months before the baseline are still reported', () => {
  const s = summarize({ '2026-10-22': MISMATCH_GREEN_ONLY, '2026-11-10': FULL }, '2026-11-30');
  assert.equal(s.baselineMonth, '2026-11');
  assert.deepEqual(s.unresolvedDates, ['2026-10-22']);
});

test('the calculation never changes the source data (no migration, no invented entries)', () => {
  const data = build({ '2026-10-20': MISMATCH_GREEN_ONLY, '2026-10-21': MISMATCH_RED_GYM, '2026-10-22': FULL });
  const snapshot = JSON.parse(JSON.stringify(data));
  computeSummary({ ...data, todayKey: '2026-11-30' });
  assert.deepEqual(data, snapshot);
});

test('an unresolved date is skipped: it does not count, advance, break, or reset the half-day run', () => {
  // Does not break: full days either side of a mismatch.
  const noBreak = monthOf(summarize({
    ...fill('2026-10-18', '2026-10-30', FULL),
    '2026-10-21': MISMATCH_GREEN_ONLY,
  }, '2026-10-31'), '2026-10');
  assert.deepEqual(noBreak.breaks, []);
  assert.equal(noBreak.consistency, 12);

  // Does not count toward Gym/Reading: a red day with a huge Gym row is excluded.
  const excluded = monthOf(summarize({
    ...fill('2026-10-18', '2026-10-30', FULL),
    '2026-10-21': { ...MISMATCH_RED_GYM, books: [7] },
  }, '2026-10-31'), '2026-10');
  assert.equal(excluded.gym.contribution, 12 * 30);
  assert.equal(excluded.gym.days, 12);
  assert.equal(excluded.reading.days, 12);

  // Does not reset the half-day run: halves on either side keep counting (19, 20, 22, 23 -> 23 is the 4th).
  const notReset = monthOf(summarize({
    '2026-10-18': FULL,
    '2026-10-19': GYM,
    '2026-10-20': GYM,
    '2026-10-21': MISMATCH_RED_GYM,
    '2026-10-22': READ,
    '2026-10-23': READ,
    ...fill('2026-10-24', '2026-10-30', FULL),
  }, '2026-10-31'), '2026-10');
  assert.deepEqual(notReset.breaks, [{ date: '2026-10-23', reason: BREAK_FOURTH_HALF_DAY }]);

  // Does not advance: 19, 20, [21 unresolved], 22 is only the 3rd half-day.
  const notAdvanced = monthOf(summarize({
    '2026-10-18': FULL,
    '2026-10-19': GYM,
    '2026-10-20': GYM,
    '2026-10-21': MISMATCH_RED_GYM,
    '2026-10-22': READ,
    ...fill('2026-10-23', '2026-10-30', FULL),
  }, '2026-10-31'), '2026-10');
  assert.deepEqual(notAdvanced.breaks, []);
  assert.equal(notAdvanced.consistency, 1 + 1.5 + 8);
});

test('correcting a mismatch recalculates history from the corrected data', () => {
  const base = fill('2026-10-18', '2026-10-30', FULL);
  const before = summarize({ ...base, '2026-10-25': MISMATCH_GREEN_ONLY }, '2026-10-31');
  assert.equal(monthOf(before, '2026-10').consistency, 12);
  assert.equal(before.dates['2026-10-25'].integrity, 'mismatch');

  // Corrected by logging the missing Gym session: now a scored full day.
  const fixedWithData = summarize({ ...base, '2026-10-25': FULL }, '2026-10-31');
  assert.equal(monthOf(fixedWithData, '2026-10').consistency, 13);
  assert.equal(fixedWithData.dates['2026-10-25'].integrity, 'ok');

  // Corrected by removing the stray green: now an empty day, which is a real break.
  const fixedByUnmarking = summarize({ ...base, '2026-10-25': EMPTY }, '2026-10-31');
  const oct = monthOf(fixedByUnmarking, '2026-10');
  assert.equal(oct.consistency, 5);
  assert.deepEqual(oct.breaks, [{ date: '2026-10-25', reason: BREAK_NO_ACTIVITY }]);
});

// --- Gym measurement and metrics ---

test('Gym: the single highest sets × reps row wins, across all gym entries on the date', () => {
  const info = classifyDate('2026-10-20', 'green', [
    { type: 'gym', equipment: [{ itemId: 1, sets: 3, reps: 10 }, { itemId: 2, sets: 5, reps: 5 }] },
    { type: 'gym', equipment: [{ itemId: 3, sets: 2, reps: 20 }] },
  ]);
  assert.equal(info.gymValue, 40);
});

test('Gym: duplicate rows (same equipment twice) are not summed; the larger row is kept', () => {
  assert.equal(classifyDate('2026-10-20', 'green', [
    { type: 'gym', equipment: [{ itemId: 1, sets: 3, reps: 10 }, { itemId: 1, sets: 3, reps: 10 }] },
  ]).gymValue, 30);
  assert.equal(classifyDate('2026-10-20', 'green', [
    { type: 'gym', equipment: [{ itemId: 1, sets: 3, reps: 10 }, { itemId: 1, sets: 4, reps: 10 }] },
  ]).gymValue, 40);
});

test('Gym Contribution and Average Gym Performance (owner example 30, 40, 50)', () => {
  const oct = monthOf(summarize({
    '2026-10-28': { gym: [[1, 3, 10]] },
    '2026-10-29': { gym: [[1, 4, 10], [2, 2, 10]] },
    '2026-10-30': { gym: [[1, 5, 10]] },
  }, '2026-10-31'), '2026-10');
  assert.deepEqual(oct.gym, { contribution: 120, days: 3, average: 40 });
  assert.equal(oct.consistency, 1.5);
});

test('zero Gym metrics when the surviving streak has no Gym dates', () => {
  const oct = monthOf(summarize({
    '2026-10-28': READ, '2026-10-29': READ, '2026-10-30': READ,
  }, '2026-10-31'), '2026-10');
  assert.deepEqual(oct.gym, { contribution: 0, days: 0, average: 0 });
});

// --- Reading measurement and metrics ---

test('Reading: distinct books per date; the same book several times counts once', () => {
  const entries = (ids) => ids.map((bookItemId) => ({ type: 'reading', bookItemId, pages: 30 }));
  assert.equal(classifyDate('2026-10-20', undefined, entries([1])).readingUnits, 1);
  assert.equal(classifyDate('2026-10-20', undefined, entries([1, 1, 1])).readingUnits, 1);
  assert.equal(classifyDate('2026-10-20', undefined, entries([1, 2])).readingUnits, 2);
  assert.equal(classifyDate('2026-10-20', undefined, entries([1, 2, 3, 2])).readingUnits, 3);
});

test('Reading: pages do not change the units', () => {
  const few = classifyDate('2026-10-20', undefined, [{ type: 'reading', bookItemId: 1, pages: 1 }]);
  const many = classifyDate('2026-10-20', undefined, [{ type: 'reading', bookItemId: 1, pages: 500 }]);
  assert.equal(few.readingUnits, many.readingUnits);
});

test('Reading Contribution and Average Reading Breadth (owner example 1, 2, 1)', () => {
  const oct = monthOf(summarize({
    '2026-10-28': { books: [1] },
    '2026-10-29': { books: [1, 2] },
    '2026-10-30': { books: [3, 3] },
  }, '2026-10-31'), '2026-10');
  assert.equal(oct.reading.contribution, 4);
  assert.equal(oct.reading.days, 3);
  assert.equal(oct.reading.average, 4 / 3);
});

test('zero Reading metrics when the surviving streak has no Reading dates', () => {
  const oct = monthOf(summarize({
    '2026-10-28': GYM, '2026-10-29': GYM, '2026-10-30': GYM,
  }, '2026-10-31'), '2026-10');
  assert.deepEqual(oct.reading, { contribution: 0, days: 0, average: 0 });
});

test('active-day counts: Gym-only dates excluded from Reading and vice versa', () => {
  const oct = monthOf(summarize({
    '2026-10-26': GYM,
    '2026-10-27': FULL,
    '2026-10-28': READ,
    '2026-10-29': FULL,
    '2026-10-30': FULL,
  }, '2026-10-31'), '2026-10');
  assert.equal(oct.gym.days, 4);
  assert.equal(oct.reading.days, 4);
  assert.equal(oct.gym.contribution, 120);
  assert.equal(oct.reading.contribution, 4);
  assert.equal(oct.consistency, 4);
});

// --- Monthly surviving streak, carried streak, corrections ---

test('monthly surviving streak: everything before a break is excluded, including Gym/Reading', () => {
  const oct = monthOf(summarize({
    ...fill('2026-10-18', '2026-10-20', { gym: [[1, 10, 10]], books: [1, 2] }),
    '2026-10-21': EMPTY,
    ...fill('2026-10-22', '2026-10-30', { gym: [[1, 2, 5]], books: [1] }),
  }, '2026-10-31'), '2026-10');
  assert.equal(oct.consistency, 9);
  assert.deepEqual(oct.gym, { contribution: 90, days: 9, average: 10 });
  assert.deepEqual(oct.reading, { contribution: 9, days: 9, average: 1 });
});

test('a break on the last scored day leaves the month with 0 everywhere', () => {
  const oct = monthOf(summarize({
    ...fill('2026-10-18', '2026-10-29', FULL),
    '2026-10-30': RED,
  }, '2026-10-31'), '2026-10');
  assert.equal(oct.consistency, 0);
  assert.deepEqual(oct.gym, { contribution: 0, days: 0, average: 0 });
  assert.deepEqual(oct.reading, { contribution: 0, days: 0, average: 0 });
  assert.deepEqual(oct.carriedStreak, { total: 0, parts: [] });
  assert.deepEqual(oct.breaks, [{ date: '2026-10-30', reason: BREAK_NO_ACTIVITY }]);
});

test('a closed earlier month is unaffected by a later break', () => {
  const spec = {
    ...fill('2026-10-18', '2026-10-30', FULL),
    '2026-11-01': EMPTY,
    ...fill('2026-11-02', '2026-11-29', FULL),
  };
  const atOctClose = monthOf(summarize(spec, '2026-10-31'), '2026-10');
  const later = summarize(spec, '2026-11-30');
  assert.deepEqual(monthOf(later, '2026-10'), atOctClose);
  const nov = monthOf(later, '2026-11');
  assert.equal(nov.consistency, 28);
  assert.deepEqual(nov.carriedStreak, { total: 28, parts: [{ month: '2026-11', consistency: 28 }] });
  assert.deepEqual(later.currentCarriedStreak, nov.carriedStreak);
});

test('historical correction propagates through the connected carried streak and stops at the next real break', () => {
  const spec = {
    ...fill('2026-10-18', '2026-10-30', FULL),
    ...fill('2026-11-01', '2026-11-29', FULL),
    '2026-12-01': EMPTY,
    ...fill('2026-12-02', '2026-12-30', FULL),
  };
  const before = summarize(spec, '2026-12-31');
  assert.equal(monthOf(before, '2026-11').carriedStreak.total, 42);
  assert.equal(monthOf(before, '2026-12').carriedStreak.total, 29);

  // Correction: Oct 25 actually had no activity.
  const after = summarize({ ...spec, '2026-10-25': EMPTY }, '2026-12-31');
  assert.equal(monthOf(after, '2026-10').consistency, 5);
  assert.deepEqual(monthOf(after, '2026-11').carriedStreak, {
    total: 34,
    parts: [{ month: '2026-10', consistency: 5 }, { month: '2026-11', consistency: 29 }],
  });
  // November's own result and December's own results (after the Dec 1 break) are unchanged.
  assert.equal(monthOf(after, '2026-11').consistency, 29);
  for (const field of ['consistency', 'breaks', 'carriedStreak', 'gym', 'reading', 'vsPrevious']) {
    assert.deepEqual(monthOf(after, '2026-12')[field], monthOf(before, '2026-12')[field], field);
  }
  // ...but December's same-year history shows the corrected October.
  assert.equal(monthOf(after, '2026-12').history[0].consistency, 5);
});

test('a correction updates the next month\'s comparison even when a break stops propagation', () => {
  const spec = {
    ...fill('2026-10-18', '2026-10-30', FULL),
    ...fill('2026-11-01', '2026-11-29', FULL),
    '2026-12-01': EMPTY,
    ...fill('2026-12-02', '2026-12-30', FULL),
  };
  // Nov 1–29 and Dec 2–30 are both 29 full days of 30: equal.
  const before = monthOf(summarize(spec, '2026-12-31'), '2026-12');
  assert.equal(before.vsPrevious.gymContribution, 'unchanged');
  assert.equal(before.vsPrevious.readingContribution, 'unchanged');

  // Correction: Nov 10 actually had no activity, so November now counts only Nov 11–29.
  const after = monthOf(summarize({ ...spec, '2026-11-10': EMPTY }, '2026-12-31'), '2026-12');
  assert.equal(after.consistency, before.consistency);
  assert.deepEqual(after.gym, before.gym);
  assert.equal(after.vsPrevious.gymContribution, 'higher');
  assert.equal(after.vsPrevious.readingContribution, 'higher');
  assert.equal(after.vsPrevious.gymAverage, 'unchanged');
});

// --- Break recording ---

test('break dates and reasons; following empty days are not listed again', () => {
  const oct = monthOf(summarize({
    ...fill('2026-10-18', '2026-10-20', FULL),
    ...fill('2026-10-21', '2026-10-23', EMPTY), // only the 21st is a break
    '2026-10-24': RED,                         // still no streak running: not listed
    '2026-10-25': FULL,
    ...fill('2026-10-26', '2026-10-29', GYM),  // the 29th is the 4th half-day
    '2026-10-30': FULL,
  }, '2026-10-31'), '2026-10');
  assert.deepEqual(oct.breaks, [
    { date: '2026-10-21', reason: BREAK_NO_ACTIVITY },
    { date: '2026-10-29', reason: BREAK_FOURTH_HALF_DAY },
  ]);
  assert.equal(oct.consistency, 1);
});

test('breaks are recorded in the month they happen', () => {
  const s = summarize({
    ...fill('2026-10-18', '2026-10-30', FULL),
    '2026-11-05': EMPTY,
    ...fill('2026-11-01', '2026-11-04', FULL),
    ...fill('2026-11-06', '2026-11-29', FULL),
  }, '2026-11-30');
  assert.deepEqual(monthOf(s, '2026-10').breaks, []);
  assert.deepEqual(monthOf(s, '2026-11').breaks, [{ date: '2026-11-05', reason: BREAK_NO_ACTIVITY }]);
});

// --- Baseline month ---

test('first valid baseline month: October 2026 when Oct 18–30 has activity', () => {
  const s = summarize({ '2026-10-20': READ }, '2026-11-30');
  assert.equal(s.baselineMonth, '2026-10');
  assert.equal(monthOf(s, '2026-10').isBaseline, true);
  assert.equal(monthOf(s, '2026-10').vsPrevious, null);
  assert.equal(monthOf(s, '2026-10').previousMonth, null);
  // A later month with no activity at all is still a completed month with zero results.
  const nov = monthOf(s, '2026-11');
  assert.equal(nov.isBaseline, false);
  assert.equal(nov.previousMonth, '2026-10');
  assert.equal(nov.consistency, 0);
});

test('baseline is not created by pre-tracking, result-day, or unresolved-only activity', () => {
  const s = summarize({
    '2026-10-10': FULL,               // before tracking start
    '2026-10-22': MISMATCH_RED_GYM,   // unresolved
    '2026-10-31': FULL,               // result day (legacy data)
    '2026-11-10': GYM,
  }, '2026-11-30');
  assert.equal(s.baselineMonth, '2026-11');
  assert.deepEqual(s.months.map((m) => m.month), ['2026-11']);
  assert.equal(monthOf(s, '2026-11').isBaseline, true);
});

test('no completed month with activity yet: no results', () => {
  const s = summarize({ '2026-11-03': FULL }, '2026-11-20');
  assert.equal(s.baselineMonth, null);
  assert.deepEqual(s.months, []);
  assert.deepEqual(s.currentCarriedStreak, { total: 0, parts: [] });
});

// --- Comparisons ---

test('previous-month comparison: higher, lower, unchanged', () => {
  const s = summarize({
    '2026-10-30': { gym: [[1, 3, 10]], books: [1] },     // Gym 30 / 1 day; Reading 1 / 1 day
    '2026-11-28': { gym: [[1, 2, 10]], books: [1] },     // Gym 20 + 20 = 40 / 2 days -> avg 20
    '2026-11-29': { gym: [[1, 4, 5]], books: [2] },      // Reading 2 / 2 days -> avg 1
  }, '2026-11-30');
  const nov = monthOf(s, '2026-11');
  assert.deepEqual(nov.vsPrevious, {
    gymContribution: 'higher',
    gymAverage: 'lower',
    readingContribution: 'higher',
    readingAverage: 'unchanged',
  });
});

test('zero is an ordinary value in comparisons', () => {
  const s = summarize({
    '2026-10-30': READ,       // Gym 0
    '2026-11-29': READ,       // Gym 0 again
    '2026-12-30': FULL,       // Gym 30
  }, '2027-01-31');
  assert.equal(monthOf(s, '2026-11').vsPrevious.gymContribution, 'unchanged');
  assert.equal(monthOf(s, '2026-11').vsPrevious.gymAverage, 'unchanged');
  assert.equal(monthOf(s, '2026-12').vsPrevious.gymContribution, 'higher');
  assert.equal(monthOf(s, '2026-12').vsPrevious.gymAverage, 'higher');
});

test('a month whose values drop to 0 compares as lower', () => {
  const s = summarize({ '2026-10-30': FULL }, '2026-11-30');
  const nov = monthOf(s, '2026-11');
  assert.deepEqual(nov.vsPrevious, {
    gymContribution: 'lower', gymAverage: 'lower', readingContribution: 'lower', readingAverage: 'lower',
  });
});

test('averages are compared exactly, not by rounded values', () => {
  // October average 200 / 3 = 66.666..., November average 201 / 3 = 67: higher.
  // Then December 67 + 67 + 67 = 201 / 3, equal to November exactly: unchanged.
  const s = summarize({
    '2026-10-28': { gym: [[1, 67, 1]] }, '2026-10-29': { gym: [[1, 67, 1]] }, '2026-10-30': { gym: [[1, 66, 1]] },
    '2026-11-27': { gym: [[1, 67, 1]] }, '2026-11-28': { gym: [[1, 67, 1]] }, '2026-11-29': { gym: [[1, 67, 1]] },
    '2026-12-28': { gym: [[1, 67, 1]] }, '2026-12-29': { gym: [[1, 67, 1]] }, '2026-12-30': { gym: [[1, 67, 1]] },
  }, '2026-12-31');
  assert.equal(monthOf(s, '2026-11').vsPrevious.gymAverage, 'higher');
  assert.equal(monthOf(s, '2026-12').vsPrevious.gymAverage, 'unchanged');

  // Different totals, equal averages: Reading 3 / 3 against 6 / 6.
  const t = summarize({
    ...fill('2026-10-28', '2026-10-30', FULL),
    ...fill('2026-11-24', '2026-11-29', FULL),
  }, '2026-11-30');
  assert.equal(monthOf(t, '2026-11').vsPrevious.readingContribution, 'higher');
  assert.equal(monthOf(t, '2026-11').vsPrevious.readingAverage, 'unchanged');
});

// --- Same-year history ---

test('same-year multi-month history, oldest first, up to the selected month only', () => {
  const s = summarize({
    '2026-10-30': FULL,
    '2026-11-29': { gym: [[1, 4, 10]], books: [1, 2] },
    '2026-12-30': GYM,
  }, '2026-12-31');
  assert.deepEqual(monthOf(s, '2026-10').history.map((h) => h.month), ['2026-10']);
  assert.deepEqual(monthOf(s, '2026-11').history.map((h) => h.month), ['2026-10', '2026-11']);
  assert.deepEqual(monthOf(s, '2026-12').history, [
    { month: '2026-10', hasUnresolved: false, consistency: 1, gymContribution: 30, gymAverage: 30, readingContribution: 1, readingAverage: 1 },
    { month: '2026-11', hasUnresolved: false, consistency: 1, gymContribution: 40, gymAverage: 40, readingContribution: 2, readingAverage: 2 },
    { month: '2026-12', hasUnresolved: false, consistency: 0.5, gymContribution: 30, gymAverage: 30, readingContribution: 0, readingAverage: 0 },
  ]);
});

test('year rollover: January starts a new year\'s history and has no previous-month comparison', () => {
  const s = summarize({
    '2026-10-30': FULL,
    '2026-11-29': FULL,
    '2026-12-30': FULL,
    '2027-01-30': GYM,
    '2027-02-27': FULL,
  }, '2027-02-28');
  assert.deepEqual(monthOf(s, '2027-01').history.map((h) => h.month), ['2027-01']);
  assert.deepEqual(monthOf(s, '2027-02').history.map((h) => h.month), ['2027-01', '2027-02']);
  assert.deepEqual(monthOf(s, '2026-12').history.map((h) => h.month), ['2026-10', '2026-11', '2026-12']);
  const jan = monthOf(s, '2027-01');
  assert.equal(jan.previousMonth, null);
  assert.equal(jan.vsPrevious, null);
  assert.equal(jan.isBaseline, false);
  const feb = monthOf(s, '2027-02');
  assert.equal(feb.previousMonth, '2027-01');
  assert.equal(feb.vsPrevious.readingContribution, 'higher');
});

test('the carried streak still crosses December -> January', () => {
  const s = summarize({
    ...fill('2026-12-01', '2026-12-30', FULL),
    ...fill('2027-01-01', '2027-01-30', FULL),
  }, '2027-01-31');
  assert.deepEqual(monthOf(s, '2027-01').carriedStreak, {
    total: 60,
    parts: [{ month: '2026-12', consistency: 30 }, { month: '2027-01', consistency: 30 }],
  });
  assert.deepEqual(s.currentCarriedStreak, monthOf(s, '2027-01').carriedStreak);
});

test('history reflects a correction to an earlier month of the same year', () => {
  const spec = { '2026-10-30': FULL, '2026-11-29': FULL, '2026-12-30': FULL };
  const before = monthOf(summarize(spec, '2026-12-31'), '2026-12');
  assert.equal(before.history[0].gymContribution, 30);
  const after = monthOf(summarize({ ...spec, '2026-10-30': { gym: [[1, 10, 10]], books: [1] } }, '2026-12-31'), '2026-12');
  assert.equal(after.history[0].gymContribution, 100);
});

// --- Input checks ---

test('an invalid today date is rejected', () => {
  assert.throws(() => computeSummary({ days: [], entries: [], todayKey: '2026-02-30' }));
});
