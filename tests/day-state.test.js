// Automated tests for js/day-state.js (Stage 4 calendar-day display, tap and Gym-save rules).
// Run from the project folder with:  node --test

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isExclusiveResultDay,
  entriesAllowed,
  gymSaveRefusal,
  describeDay,
  nextTapStatus,
} = require('../js/day-state.js');
const { computeSummary } = require('../js/summary-calc.js');

const GYM_ENTRY = { id: 1, date: '', type: 'gym', equipment: [{ itemId: 1, sets: 3, reps: 10 }] };
const READING_ENTRY = { id: 2, date: '', type: 'reading', bookItemId: 1, pages: 10 };
const RESULT_DAY_LOOK = { resultDay: true, gold: true, color: null, reading: false, unresolved: false };

// Applies one tap to a stored status the way app.js does: undefined means no change.
function tap(dateKey, status, entries) {
  const next = nextTapStatus(dateKey, status, entries);
  return next === undefined ? status : next || undefined;
}

// --- Data-driven green ---

test('Gym entry + unmarked displays green automatically', () => {
  const d = describeDay('2026-10-20', undefined, [GYM_ENTRY]);
  assert.equal(d.color, 'green');
  assert.equal(d.unresolved, false);
});

test('Gym entry + stored green displays green, no "?"', () => {
  const d = describeDay('2026-10-20', 'green', [GYM_ENTRY]);
  assert.equal(d.color, 'green');
  assert.equal(d.unresolved, false);
});

test('with the last Gym entry removed (and its green cleared), the automatic green disappears', () => {
  assert.equal(describeDay('2026-10-20', undefined, [GYM_ENTRY]).color, 'green');
  const d = describeDay('2026-10-20', undefined, []);
  assert.equal(d.color, null);
  assert.equal(d.unresolved, false);
});

test('no Gym data + red is a valid no-Gym day; no Gym data + unmarked too', () => {
  assert.deepEqual(describeDay('2026-10-20', 'red', []), { resultDay: false, gold: false, color: 'red', reading: false, unresolved: false });
  assert.deepEqual(describeDay('2026-10-20', undefined, []), { resultDay: false, gold: false, color: null, reading: false, unresolved: false });
});

test('Reading marker comes from Reading entries only', () => {
  assert.equal(describeDay('2026-10-20', undefined, [READING_ENTRY]).reading, true);
  assert.equal(describeDay('2026-10-20', 'red', [READING_ENTRY]).reading, true);
  assert.equal(describeDay('2026-10-20', 'green', [GYM_ENTRY]).reading, false);
});

// --- Tap behaviour ---

test('no Gym data: a tap toggles unmarked -> red -> unmarked', () => {
  let status;
  status = tap('2026-10-20', status, []);
  assert.equal(status, 'red');
  status = tap('2026-10-20', status, []);
  assert.equal(status, undefined);
  status = tap('2026-10-20', status, []);
  assert.equal(status, 'red');
});

test('the tap cycle also works on a Reading-only day (Reading never blocks red)', () => {
  assert.equal(tap('2026-10-20', undefined, [READING_ENTRY]), 'red');
  assert.equal(tap('2026-10-20', 'red', [READING_ENTRY]), undefined);
});

test('a tap never creates green', () => {
  for (const status of [undefined, 'red', 'green']) {
    for (const entries of [[], [GYM_ENTRY], [READING_ENTRY]]) {
      for (const date of ['2026-10-05', '2026-10-20', '2026-10-31']) {
        assert.notEqual(nextTapStatus(date, status, entries), 'green');
      }
    }
  }
});

test('a valid Gym day cannot be toggled to red by a tap', () => {
  assert.equal(nextTapStatus('2026-10-20', undefined, [GYM_ENTRY]), undefined);
  assert.equal(nextTapStatus('2026-10-20', 'green', [GYM_ENTRY]), undefined);
  assert.equal(describeDay('2026-10-20', tap('2026-10-20', undefined, [GYM_ENTRY]), [GYM_ENTRY]).color, 'green');
});

test('a normal tap does not auto-fix a mismatch: Gym + red is left as it is', () => {
  assert.equal(nextTapStatus('2026-10-20', 'red', [GYM_ENTRY]), undefined);
  const after = tap('2026-10-20', 'red', [GYM_ENTRY]);
  assert.equal(after, 'red');
  assert.equal(describeDay('2026-10-20', after, [GYM_ENTRY]).unresolved, true);
});

test('a normal tap does not auto-fix a mismatch: legacy green + no Gym is left as it is', () => {
  assert.equal(nextTapStatus('2026-10-20', 'green', []), undefined);
  const after = tap('2026-10-20', 'green', []);
  assert.equal(after, 'green');
  assert.equal(describeDay('2026-10-20', after, []).unresolved, true);
});

test('tap rules before tracking start: same cycle, leftover greens and Gym days ignore taps', () => {
  assert.equal(tap('2026-10-05', undefined, []), 'red');
  assert.equal(tap('2026-10-05', 'red', []), undefined);
  assert.equal(nextTapStatus('2026-10-05', 'green', []), undefined);
  assert.equal(nextTapStatus('2026-10-05', undefined, [GYM_ENTRY]), undefined);
  assert.equal(nextTapStatus('2026-10-05', 'red', [GYM_ENTRY]), undefined);
});

// --- Gym save on a red day ---

test('a Gym save is refused on a red day, with a clear message', () => {
  const message = gymSaveRefusal('red');
  assert.equal(typeof message, 'string');
  assert.match(message, /marked red/);
  assert.match(message, /Remove the red mark/);
});

test('a Gym save is allowed on an unmarked day or a day with a stored green', () => {
  assert.equal(gymSaveRefusal(undefined), null);
  assert.equal(gymSaveRefusal(null), null);
  assert.equal(gymSaveRefusal('green'), null);
});

test('after the red mark is removed by a tap, the Gym save is allowed', () => {
  const afterTap = tap('2026-10-20', 'red', []);
  assert.equal(afterTap, undefined);
  assert.equal(gymSaveRefusal(afterTap), null);
  assert.equal(describeDay('2026-10-20', afterTap, [GYM_ENTRY]).color, 'green');
});

// --- "?" integrity warning ---

test('Gym data + red produces "?" (old or imported data)', () => {
  const d = describeDay('2026-10-20', 'red', [GYM_ENTRY]);
  assert.equal(d.unresolved, true);
  assert.equal(d.color, 'red');
});

test('legacy green + no Gym data produces "?"', () => {
  const d = describeDay('2026-10-20', 'green', []);
  assert.equal(d.unresolved, true);
  assert.equal(d.color, 'green');
});

test('a mismatch clears once the data itself is corrected', () => {
  // Legacy green + no Gym: logging the Gym session resolves it.
  assert.equal(describeDay('2026-10-20', 'green', [GYM_ENTRY]).unresolved, false);
  // Gym + red: deleting the Gym data resolves it (a valid red no-Gym day).
  assert.equal(describeDay('2026-10-20', 'red', []).unresolved, false);
});

test('no Stage 4 "?" before Oct 18, 2026 (legacy marks show as before)', () => {
  assert.deepEqual(describeDay('2026-10-17', 'green', []), { resultDay: false, gold: false, color: 'green', reading: false, unresolved: false });
  assert.equal(describeDay('2026-10-17', 'red', [GYM_ENTRY]).unresolved, false);
  assert.equal(describeDay('2026-09-02', 'green', []).unresolved, false);
  assert.equal(describeDay('2026-10-18', 'green', []).unresolved, true);
});

// --- Month-end result day ---

test('result days: Oct 31, Nov 30, Dec 31, Feb 28 (normal year), Feb 29 (leap year)', () => {
  for (const key of ['2026-10-31', '2026-11-30', '2026-12-31', '2027-02-28', '2028-02-29']) {
    assert.equal(isExclusiveResultDay(key), true, key);
    assert.equal(entriesAllowed(key), false, key);
  }
  for (const key of ['2026-10-30', '2026-11-29', '2027-02-27', '2028-02-28', '2027-03-01']) {
    assert.equal(isExclusiveResultDay(key), false, key);
    assert.equal(entriesAllowed(key), true, key);
  }
});

test('month-ends before tracking start stay normal historical dates', () => {
  assert.equal(isExclusiveResultDay('2026-09-30'), false);
  assert.equal(entriesAllowed('2026-09-30'), true);
  assert.equal(describeDay('2026-09-30', 'green', []).color, 'green');
  assert.equal(describeDay('2026-09-30', undefined, []).gold, false);
});

test('the final day is always gold, including before the date arrives', () => {
  // describeDay doesn't depend on today: a future result day (e.g. Dec 31 or Feb 29, 2028
  // seen in October 2026) already shows gold.
  for (const key of ['2026-10-31', '2026-11-30', '2026-12-31', '2027-02-28', '2028-02-29']) {
    assert.deepEqual(describeDay(key, undefined, []), RESULT_DAY_LOOK, key);
  }
  assert.equal(describeDay('2028-02-28', undefined, []).gold, false); // not a result day in 2028
  assert.equal(describeDay('2026-10-30', undefined, []).gold, false);
});

test('the final day never shows green/red or a normal activity "?", whatever is stored', () => {
  const cases = [['green', []], ['red', [GYM_ENTRY]], [undefined, [GYM_ENTRY, READING_ENTRY]], ['red', []], ['green', [GYM_ENTRY]]];
  for (const [status, entries] of cases) {
    assert.deepEqual(describeDay('2026-10-31', status, entries), RESULT_DAY_LOOK);
  }
});

test('the final day ignores taps', () => {
  for (const status of [undefined, 'red', 'green']) {
    for (const entries of [[], [GYM_ENTRY], [READING_ENTRY]]) {
      assert.equal(nextTapStatus('2026-10-31', status, entries), undefined);
    }
  }
});

test('the final day cannot accept Gym or Reading entries', () => {
  for (const key of ['2026-10-31', '2026-11-30', '2027-02-28', '2028-02-29']) {
    assert.equal(entriesAllowed(key), false, key);
  }
});

test('the final day is not scored, even with activity stored there', () => {
  const s = computeSummary({
    days: [{ date: '2026-10-31', status: 'green' }],
    entries: [
      { ...GYM_ENTRY, date: '2026-10-31' },
      { ...READING_ENTRY, date: '2026-10-31' },
      { ...READING_ENTRY, id: 3, date: '2026-10-30' },
    ],
    todayKey: '2026-10-31',
  });
  assert.equal(s.dates['2026-10-31'].scored, false);
  assert.equal(s.months[0].consistency, 0.5);
  assert.equal(s.months[0].gym.days, 0);
  assert.deepEqual(s.months[0].unresolvedDates, []);
});
