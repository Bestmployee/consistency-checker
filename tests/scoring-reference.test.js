// Automated checks for the read-only Scoring reference on the calendar page (index.html,
// opened and closed by js/app.js).
// Run from the project folder with:  node --test

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

// The reference's visible text, with tags and extra spaces removed.
function dialogText() {
  const match = /<dialog id="scoring-dialog"[\s\S]*?<\/dialog>/.exec(html);
  assert.ok(match, 'scoring dialog exists');
  return match[0].replace(/<[^>]+>/g, ' ').replace(/&times;/g, '×').replace(/\s+/g, ' ');
}

test('the Scoring button exists in the header, immediately before Export, then Import', () => {
  const header = /<header id="app-header">[\s\S]*?<\/header>/.exec(html)[0];
  const buttons = [...header.matchAll(/<button id="([^"]+)"[^>]*>([^<]*)<\/button>/g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(buttons, [['scoring-btn', 'Scoring'], ['export-btn', 'Export'], ['import-btn', 'Import']]);
});

test('the reference has a title, a Close control, and is a dialog linked to the button', () => {
  assert.match(html, /<dialog id="scoring-dialog" aria-labelledby="scoring-title">/);
  assert.match(html, /<h2 id="scoring-title">Scoring and streaks<\/h2>/);
  assert.match(html, /<button type="button" id="scoring-close" aria-label="Close">&times;<\/button>/);
  assert.match(html, /id="scoring-btn" aria-haspopup="dialog" aria-controls="scoring-dialog"/);
});

test('the reference covers every required scoring and streak rule', () => {
  const text = dialogText();
  const required = [
    // Tracking
    'Tracking starts on October 18, 2026',
    'Earlier dates are outside scoring',
    // Daily Consistency
    'Gym + Reading = 1',
    'Gym only = 0.5',
    'Reading only = 0.5',
    'No activity = 0, and it breaks the live streak immediately',
    'A red day with Reading is a valid Reading-only 0.5 day',
    // Streak
    'Up to 3 consecutive half-days are allowed',
    'The 4th consecutive half-day breaks the streak and is not counted',
    'A full 1-point day resets the half-day count',
    'After a break, the next qualifying activity starts a new streak',
    'carries across gold result days, from month to month, and from December into January',
    // Monthly result
    'The final calendar day of every month is the gold result day',
    'No Gym or Reading can be added on the gold day',
    'The gold day is not scored and does not change the streak or the half-day count',
    'Only the streak still alive at the month\'s last scored day counts',
    'the part before the break does not count',
    // Calendar
    'Green = Gym data exists. Green is automatic',
    'Red = no Gym',
    'unmarked ↔ red',
    'Black stripe = Reading data exists',
    '? = the day\'s calendar mark conflicts with its Gym data',
    'left out of everything until corrected',
    // Gym growth
    'Each Gym row = sets × reps',
    'single highest row. Rows are never added together',
    'Gym Contribution = the sum of those daily values on Gym days in the surviving streak',
    'Average Gym Performance = Gym Contribution ÷ Gym days',
    // Reading growth
    'number of different books read that day',
    'The same book entered several times counts once',
    'Pages are saved but are not used for scoring',
    'Reading Contribution = the sum of those daily values on Reading days in the surviving streak',
    'Average Reading Breadth = Reading Contribution ÷ Reading days',
    // History and corrections
    'stay within one calendar year',
    'January does not compare with December',
    'The carried streak still continues from December into January',
    'Correcting past data recalculates every result it affects',
    'Unresolved month',
  ];
  for (const phrase of required) assert.ok(text.includes(phrase), `reference says: ${phrase}`);
});

test('the reference matches the engine: tracking start date and half-day limit', () => {
  const { TRACKING_START } = require('../js/summary-calc.js');
  assert.equal(TRACKING_START, '2026-10-18');
  const calc = fs.readFileSync(path.join(root, 'js', 'summary-calc.js'), 'utf8');
  assert.match(calc, /const MAX_CONSECUTIVE_HALF_DAYS = 3;/);
});

// Runs js/app.js against stand-in page objects, recording every storage, backup and
// network call, so opening and closing the reference can be checked for side effects.
function loadApp() {
  const calls = [];
  const elements = new Map();
  function element(id) {
    if (!elements.has(id)) {
      const listeners = {};
      elements.set(id, {
        id,
        listeners,
        hidden: true,
        open: false,
        textContent: '',
        value: '',
        files: [],
        addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
        dispatch(type, event = {}) { for (const fn of listeners[type] || []) fn({ target: this, ...event }); },
        click() { this.dispatch('click'); },
        showModal() { calls.push(`showModal:${id}`); this.open = true; },
        close() { calls.push(`close:${id}`); this.open = false; },
      });
    }
    return elements.get(id);
  }
  const record = (name) => new Proxy({}, {
    get: (_, prop) => (...args) => { calls.push(`${name}.${String(prop)}`); return Promise.resolve(); },
  });
  const sandbox = {
    document: { getElementById: element },
    window: { addEventListener() {}, location: { href: '' } },
    navigator: {},
    ConsistencyDB: record('ConsistencyDB'),
    Backup: record('Backup'),
    DayState: record('DayState'),
    StoragePermission: { requestPersistentStorage() {} },
    Calendar: { create: () => ({ refresh: () => { calls.push('calendar.refresh'); return Promise.resolve(); } }) },
    fetch: () => { calls.push('fetch'); return Promise.resolve(); },
    alert: () => calls.push('alert'),
    setTimeout,
    clearTimeout,
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8'), sandbox, { filename: 'app.js' });
  return { calls, element };
}

test('Scoring opens the reference; Close and a tap outside close it; no app data is touched', () => {
  const { calls, element } = loadApp();
  const dialog = element('scoring-dialog');

  element('scoring-btn').click();
  assert.equal(dialog.open, true);
  element('scoring-close').click();
  assert.equal(dialog.open, false);

  element('scoring-btn').click();
  assert.equal(dialog.open, true);
  dialog.dispatch('click', { target: { id: 'a-rule-inside-the-panel' } }); // a tap inside the panel
  assert.equal(dialog.open, true);
  dialog.dispatch('click', { target: dialog });                             // a tap on the backdrop
  assert.equal(dialog.open, false);

  assert.deepEqual(calls, ['showModal:scoring-dialog', 'close:scoring-dialog', 'showModal:scoring-dialog', 'close:scoring-dialog']);
  assert.ok(!calls.some((c) => /^(ConsistencyDB|Backup|DayState|fetch|calendar)/.test(c)), 'no storage, backup, scoring or network calls');
});

test('only one Scoring panel can be open: a second tap while open does nothing', () => {
  const { calls, element } = loadApp();
  element('scoring-btn').click();
  element('scoring-btn').click();
  assert.deepEqual(calls, ['showModal:scoring-dialog']);
  assert.equal((html.match(/<dialog id="scoring-dialog"/g) || []).length, 1);
});

test('Export and Import are still wired as before', () => {
  const { calls, element } = loadApp();
  element('export-btn').click();
  assert.deepEqual(calls, ['Backup.exportToFile']);
  let picked = false;
  element('import-input').click = () => { picked = true; };
  element('import-btn').click();
  assert.equal(picked, true);
});

test('the reference needs nothing beyond the cached calendar page (works offline)', () => {
  const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  for (const file of ['./index.html', './js/app.js', './css/style.css']) assert.ok(sw.includes(`'${file}'`), file);
  const dialog = /<dialog id="scoring-dialog"[\s\S]*?<\/dialog>/.exec(html)[0];
  assert.doesNotMatch(dialog, /https?:\/\/|<script|<link|<img|<iframe/);
});
