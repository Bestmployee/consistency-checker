# Stage 2 — Detail Logging

## Purpose

Stage 2 replaces the current long-press placeholder with a real per-day detail screen for logging Gym and Reading activity while preserving all Stage 1 behavior.

This specification was reconstructed from the complete project dossier and approved by the owner on 2026-09-28.

## Scope boundaries

Stage 2 includes the detail page, Gym/Reading data entry, saved equipment/book items, edit/delete, IndexedDB schema v2, export/import v2 with backward compatibility, and offline/PWA integration.

Stage 2 does **not** include equipment photos, the 30-day summary, or the reading marker/calendar redesign. The calendar appearance remains unchanged during Stage 2.

## Approved product decisions

1. **Sets and reps are per equipment item.** A Gym entry contains equipment rows, each with its own item, sets, and reps.
2. **Unlimited entries per day.** A date may contain any mix of Gym and Reading entries.
3. **The detail screen is a separate page.** Use `detail.html?date=YYYY-MM-DD`, so Android hardware/gesture Back naturally returns to the calendar.
4. **Both activity types support edit and delete.** Deletion requires confirmation.
5. **Reopening a date appends equipment to the existing visible Gym entry.** Existing equipment rows are shown with an action to add another equipment row.
6. **No UI for starting a second separate Gym session.** The data model may support it, but Stage 2 exposes only the existing visible Gym session for that day.
7. **Saving is immediate per row/entry.** Each equipment row or Reading entry saves using its own Add/Save action. There is no top-level Save button.
8. **Equipment and books share one saved-item system.** One `savedItems` store is tagged by type (`equipment` or `book`) so names are reused consistently.
9. **New names require explicit creation.** Typing an unknown name must show an explicit `+ Add 'X' as new item` action; unknown names are not silently saved.
10. **Archiving a saved item affects future suggestions only.** Past entries remain intact. Before archive confirmation, show how many existing entries reference the item.
11. **Renaming a saved item updates its displayed name everywhere.** Entries reference items by ID, so past and future displays use the renamed value.
12. **Numeric fields are required positive integers.** Sets, reps, and pages cannot be blank, zero, negative, or fractional.
13. **Saving Gym data can auto-mark the day green only when currently unmarked.** Never overwrite an explicitly set green/red state. Deleting the last Gym detail row does not automatically remove green.
14. **Calendar appearance remains unchanged in Stage 2.** No entry dot, no Reading marker, and no relabeling of green/red in this stage.
15. **Import remains backward compatible.** A schemaVersion 1 days-only backup must import successfully as zero entries and zero saved items. Before replacement, show counts for days, entries, and saved items.
16. **Import replaces, not merges.** Replacement must be atomic across the Stage 2 data stores.

## Detail page behavior

- Long-pressing a calendar date opens `detail.html?date=YYYY-MM-DD`.
- Parse the date using local numeric date components, not `new Date(dateString)`, to avoid UTC date shifting.
- Header shows a `‹ Back` control to `index.html` plus the formatted selected date.
- Two sections: **Gym** and **Reading**.
- Each section lists current entries and exposes Add/Edit/Delete actions.
- Android hardware/gesture Back should naturally return to the calendar.

## Gym behavior

- Gym entry common fields: id, date, type=`gym`, createdAt, updatedAt.
- Gym-specific field: `equipment: [{ itemId, sets, reps }, ...]`.
- At least one equipment row is required.
- Reopening the same day shows the existing Gym rows and adds new equipment to that same visible entry.
- Editing existing rows is supported.
- Deleting an equipment row requires confirmation.
- Deleting the final equipment row deletes the Gym entry.
- Saving Gym data marks an unmarked calendar day green, but never overrides a manually set status.

## Reading behavior

- Reading entry common fields: id, date, type=`reading`, createdAt, updatedAt.
- Reading-specific fields: `bookItemId`, `pages`.
- Multiple Reading entries per day are allowed.
- Add, edit, and delete are supported.
- Pages are required positive integers.
- Reading does not modify the calendar display in Stage 2.

## Saved-item system

One IndexedDB store holds both equipment and books:

`{ id, type: 'equipment' | 'book', name, archived: boolean, photo: null, createdAt, updatedAt }`

- Picker suggestions filter while typing.
- Selecting a suggestion links the entry by item ID.
- Unknown names require explicit `+ Add 'X' as new item` confirmation.
- Rename updates the saved item name; all entries displaying that ID reflect the new name.
- Archive hides the item from future suggestions but preserves history.
- Archive confirmation reports the number of referencing entries.
- `photo` remains `null` in Stage 2 and is reserved for Stage 3.

## IndexedDB v2

Bump `DB_VERSION` from 1 to 2.

Keep the existing `days` store structurally unchanged.

Add inside the existing `onupgradeneeded` handler, guarded by `objectStoreNames.contains` checks:

- `entries`: keyPath `id`, autoIncrement, index on `date`.
- `savedItems`: keyPath `id`, autoIncrement, index on `type`.

Existing Stage 1 green/red day records must survive unchanged.

Planned database operations include:

- `getDay(dateKey)`
- `getEntriesForDate(dateKey)`
- `addEntry`
- `updateEntry`
- `deleteEntry`
- `getAllEntries()`
- `getSavedItems(type, { includeArchived })`
- `addSavedItem(type, name)`
- `updateSavedItem(id, { name })`
- `archiveSavedItem(id)`
- `getEntryCountForItem(itemId)`
- `getAllSavedItems()`
- `replaceAllData({ days, entries, savedItems })` as one read/write transaction across all three stores.

## Backup format and import

Stage 2 export payload:

`{ schemaVersion: 2, exportedAt, days, entries, savedItems }`

Import requirements:

- Accept schemaVersion 1 and 2.
- Validate record shapes.
- Validate that Gym `itemId` and Reading `bookItemId` references exist in imported `savedItems` for schemaVersion 2.
- Show the exact counts of days, entries, and saved items before replacement.
- schemaVersion 1 imports as existing days plus zero entries and zero saved items.
- Replacement is atomic across `days`, `entries`, and `savedItems`.

## Planned files

### New

- `detail.html`
- `js/detail-screen.js`
- `js/saved-items.js`
- `js/toast.js`
- `docs/plan-stage2.md`

### Modified

- `js/app.js` — long-press navigates to `detail.html?date=...`.
- `js/export.js` — schema v2 export/import, validation, confirm-before-replace.
- `index.html` — add shared toast script.
- `sw.js` — bump cache name to `consistency-checker-v2`; cache new Stage 2 app-shell files.
- `CLAUDE.md` — after Stage 2 is complete, record Stage 2 completion and the separate calendar-redesign stage.

## Verification checklist

1. Stage 1 regressions: tap-cycle, day-number legibility, persistent-storage banner behavior, and Stage-1-shaped export/import still work.
2. Long-press opens `detail.html` and shows the correct date.
3. Add a Gym entry using `+ Add 'X' as new item`; an unmarked day auto-turns green, but an already-set status is not overridden.
4. Reopen the same date, add a second equipment row, and verify it appends to the existing visible Gym entry.
5. Edit and delete equipment rows, including deleting the only row and confirming the Gym entry disappears.
6. Add, edit, and delete multiple Reading entries on one date for two different books.
7. Saved-item picker filters while typing; rename updates past display; archive removes future suggestions without changing history and shows the correct usage count before confirmation.
8. In-app Back and Android hardware/gesture Back both return correctly to the calendar.
9. Export produces schemaVersion 2 with entries and savedItems; re-import round-trips exactly.
10. Import a schemaVersion 1 backup; confirm it reports zero entries and zero saved items and restores day colors.
11. Offline: after loading `detail.html` once, enable airplane mode and confirm the detail page still opens and works from cache.
12. Confirm the service-worker cache bump purges the old cache.

## Approval

Approved by the owner on 2026-09-28. Implementation may proceed strictly within this specification. Any new product decision or scope change requires owner approval before implementation.
