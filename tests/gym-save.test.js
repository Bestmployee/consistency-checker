// Automated tests for the Gym save guards in js/gym-section.js, run against an in-memory
// stand-in for ConsistencyDB (js/db.js), so the real save functions are exercised in Node.
// Run from the project folder with:  node --test

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Minimal in-memory version of the ConsistencyDB functions the Gym section uses.
function makeFakeDB({ days = {}, entries = [] } = {}) {
  let nextId = entries.reduce((max, e) => Math.max(max, e.id), 0) + 1;
  const store = { days: { ...days }, entries: entries.map((e) => ({ ...e })) };
  return {
    store,
    async getDay(dateKey) {
      return store.days[dateKey] ? { date: dateKey, status: store.days[dateKey] } : null;
    },
    async deleteDay(dateKey) { delete store.days[dateKey]; },
    async getEntriesForDate(dateKey) {
      return store.entries.filter((e) => e.date === dateKey).map((e) => ({ ...e }));
    },
    async addEntry(entry) {
      const record = { ...entry, id: nextId++, createdAt: 1, updatedAt: 1 };
      store.entries.push(record);
      return record.id;
    },
    async updateEntry(entry) {
      store.entries = store.entries.map((e) => (e.id === entry.id ? { ...entry } : e));
    },
    async deleteEntry(id) { store.entries = store.entries.filter((e) => e.id !== id); },
    async getSavedItem(id) { return { id, type: 'equipment', name: 'Bench', archived: false }; },
    isDeletedSavedItem(item) { return item.deletedAt != null; },
  };
}

// Loads the real browser scripts into a sandbox that uses the fake storage.
function loadGymSection(db) {
  const sandbox = { window: {}, ConsistencyDB: db, console };
  vm.createContext(sandbox);
  for (const file of ['summary-calc.js', 'day-state.js', 'entry-utils.js', 'gym-section.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', file), 'utf8'), sandbox, { filename: file });
    // Each script reads the globals the page would have (SummaryCalc, DayState, EntryUtils).
    Object.assign(sandbox, sandbox.window);
  }
  return sandbox;
}

const ROW = { itemId: 1, sets: 3, reps: 10 };

test('a Gym save on a red day is refused with a clear message', async () => {
  const db = makeFakeDB({ days: { '2026-10-20': 'red' } });
  const page = loadGymSection(db);
  await assert.rejects(page.addGymRow('2026-10-20', ROW), /marked red/);
});

test('a refused Gym save creates no Gym data and leaves the red mark as it is', async () => {
  const db = makeFakeDB({ days: { '2026-10-20': 'red' } });
  const page = loadGymSection(db);
  await assert.rejects(page.addGymRow('2026-10-20', ROW));
  assert.deepEqual(db.store.entries, []);
  assert.equal(db.store.days['2026-10-20'], 'red');
});

test('a Gym save on a red + Reading day is refused; the Reading entry stays saved', async () => {
  const reading = { id: 3, date: '2026-10-20', type: 'reading', bookItemId: 2, pages: 12 };
  const db = makeFakeDB({ days: { '2026-10-20': 'red' }, entries: [reading] });
  const page = loadGymSection(db);
  await assert.rejects(page.addGymRow('2026-10-20', ROW), /marked red/);
  assert.deepEqual(db.store.entries, [reading]);
  assert.equal(db.store.days['2026-10-20'], 'red');
});

test('editing a Gym row on a red day (old or imported data) is refused too, and changes nothing', async () => {
  const existing = { id: 5, date: '2026-10-20', type: 'gym', equipment: [{ ...ROW }] };
  const db = makeFakeDB({ days: { '2026-10-20': 'red' }, entries: [existing] });
  const page = loadGymSection(db);
  await assert.rejects(page.updateGymRow('2026-10-20', 5, 0, ROW, { itemId: 1, sets: 9, reps: 9 }), /marked red/);
  assert.deepEqual(db.store.entries, [existing]);
  assert.equal(db.store.days['2026-10-20'], 'red');
});

test('once the red mark is removed, the Gym save goes ahead and does not write green', async () => {
  const db = makeFakeDB({ days: { '2026-10-20': 'red' } });
  const page = loadGymSection(db);
  await db.deleteDay('2026-10-20');
  await page.addGymRow('2026-10-20', ROW);
  assert.equal(db.store.entries.length, 1);
  assert.equal(db.store.days['2026-10-20'], undefined);
});

test('a Gym save on an unmarked day saves normally', async () => {
  const db = makeFakeDB();
  const page = loadGymSection(db);
  await page.addGymRow('2026-10-20', ROW);
  assert.equal(db.store.entries.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(db.store.entries[0].equipment)), [ROW]);
});

test('a Gym save on a month\'s result day is refused and creates nothing', async () => {
  const db = makeFakeDB();
  const page = loadGymSection(db);
  await assert.rejects(page.addGymRow('2026-10-31', ROW), /result day/);
  await assert.rejects(page.addGymRow('2028-02-29', ROW), /result day/);
  assert.deepEqual(db.store.entries, []);
});

test('deleting the last Gym row removes the stored green; a red mark is never touched', async () => {
  const row = { ...ROW };
  const db = makeFakeDB({
    days: { '2026-10-20': 'green' },
    entries: [{ id: 1, date: '2026-10-20', type: 'gym', equipment: [row] }],
  });
  const page = loadGymSection(db);
  await page.deleteGymRow('2026-10-20', 1, 0, row);
  assert.deepEqual(db.store.entries, []);
  assert.equal(db.store.days['2026-10-20'], undefined);

  const redDb = makeFakeDB({
    days: { '2026-10-21': 'red' },
    entries: [{ id: 1, date: '2026-10-21', type: 'gym', equipment: [row] }],
  });
  await loadGymSection(redDb).deleteGymRow('2026-10-21', 1, 0, row);
  assert.equal(redDb.store.days['2026-10-21'], 'red');
});
