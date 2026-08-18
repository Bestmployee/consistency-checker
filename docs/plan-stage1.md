# Stage 1: Calendar with Tap-to-Mark

## Context

You're building a personal, phone-only habit tracker (gym + reading consistency) that lives entirely on your Android phone with no server and no login. The full app will eventually include a detail-logging screen, equipment photos, and 30-day consistency/growth summaries — but those come in later stages. Stage 1's goal is narrow and deliberate: get a real, installable calendar working on your phone as fast as possible, marking days green or red, so you have something usable immediately while the rest is built incrementally.

Because later stages (photos, per-day logs, growth trends) will build on top of whatever Stage 1 sets up, the technical foundations chosen now (storage engine, file structure, install mechanism) need to not require breaking changes later — even though Stage 1 itself only implements marking.

## Decisions locked in with you

1. **Hosting:** Static site (plain HTML/CSS/JS, no build step, no framework) published to **GitHub Pages** using GitHub's web upload UI (no git/command line needed). You already have a GitHub account.
2. **Storage:** **IndexedDB** in the phone's browser (not localStorage) — chosen now because Stage 3's photos need blob storage and localStorage can't do that; starting with IndexedDB avoids a painful migration later. Nothing is ever sent off the phone.
3. **Persistent storage:** App requests `navigator.storage.persist()` on load so Android is less likely to evict your data under storage pressure. Silent if granted; shows a small non-blocking note only if denied or unsupported.
4. **Export & Import:** Both ship in Stage 1, as real, working, plain/unstyled buttons (styling decided later). Export downloads a JSON backup. Import loads a JSON backup file and **replaces** whatever is currently stored, after a confirmation prompt (since export-only isn't a real backup, and the data shape — just dates and colors — is simplest to get right now, before photos and logs exist).
5. **Marking interaction:** Tap cycles a day: unmarked → green → red → unmarked. **Long-press** is reserved for opening the detail screen, but that screen is Stage 2 — so in Stage 1, long-press shows a small "coming in a future update" message and explicitly does **not** also trigger the tap-cycle or Android's text-selection menu.
6. **Legibility rule (hard constraint):** the day number is always visible as text. Unmarked = neutral background, normal dark text. Green = bright green fill, **black bold** number. Red = bright red fill, **black bold** number. Never a colored block with no number.

## File structure

```
consistency-checker/
├── index.html
├── manifest.json
├── sw.js
├── css/style.css
├── js/
│   ├── db.js                 (IndexedDB wrapper: open DB, get/set/delete day records)
│   ├── calendar.js           (month grid rendering + navigation)
│   ├── gestures.js           (tap vs long-press handling, mobile-safe)
│   ├── storage-permission.js (navigator.storage.persist() flow)
│   ├── export.js             (JSON export/download)
│   └── app.js                (entry point, wires everything, registers sw)
└── icons/
    ├── icon-192.png
    ├── icon-512.png
    └── icon-512-maskable.png
```

Small single-purpose JS files (not one big file) so Stage 2/3/4 can each add a new file (`detail-screen.js`, `photo-capture.js`, `summary.js`) without touching unrelated logic.

## Key technical pieces

- **`manifest.json`**: installable PWA config — name, icons, `display: "standalone"`, `start_url`/`scope` set to `"."` (relative, so it survives a repo rename). Icons are generated directly as simple solid-color placeholder PNGs (192, 512, and a padded maskable 512) — no external site needed. Easy to swap for something nicer later without touching any code.
- **`sw.js`**: minimal app-shell cache. Caches all Stage 1 files on install, deletes old caches on activate. **You'll need to bump the `CACHE_NAME` version string (v1 → v2 → ...) every time you upload updated files** — this is what makes your phone pick up new versions instead of serving a stale cached copy. This gets called out explicitly in the deploy steps below.
- **IndexedDB** (`consistencyCheckerDB`, store `days`): keyed by local date string `"YYYY-MM-DD"` (not UTC-shifted `Date.toISOString()`, to avoid off-by-one-day bugs near midnight). Each record: `{ date, status: "green"|"red", updatedAt }`. Unmarked days simply have no record — cycling back to unmarked deletes the row. This date-string convention is what Stage 2/3's future stores will key off of.
- **Calendar grid**: CSS Grid month view, `‹`/`›` navigation, faded non-clickable filler cells for adjacent months, today shown via a border/ring (not a fill) so it composes cleanly with green/red states.
- **Gesture handling**: Pointer Events (`pointerdown`/`pointerup`/`pointermove`) with a ~500ms hold timer and a small movement tolerance to distinguish tap from long-press reliably; suppresses the tap firing after a long-press; disables Android's text-selection/context menu and tap-delay on day cells.
- **Export**: reads all `days` records, wraps them with `{ schemaVersion: 1, exportedAt, days: [...] }`, downloads as `consistency-checker-backup-YYYY-MM-DD.json`. Plain unstyled button in a simple header bar, always visible.
- **Import**: plain unstyled button next to Export, opens a file picker for a `.json` backup. After you pick a file, a confirmation prompt ("This will replace all current data with the contents of this backup. Continue?") appears before anything is touched. On confirm: validates the file is well-formed JSON with a recognized `schemaVersion`, clears the `days` store, and writes in the records from the file. On cancel or invalid file: nothing is changed.

## Local testing before deploying

Since you have Node.js installed, run `npx serve` from inside the `consistency-checker` folder to serve the files at `http://localhost:3000` (or similar). This lets you run through the desktop verification checklist below on your own machine — including service worker and IndexedDB checks, which work fine on `localhost` — before uploading anything to GitHub. Only once that all checks out do you move to deploying so it's reachable from your phone.

## Deployment (GitHub Pages, web UI — no terminal)

1. On github.com, create a new **public** repo named `consistency-checker`.
2. Use **Add file → Upload files** to drag in all Stage 1 files/folders, then commit.
3. Repo **Settings → Pages** → Source: **Deploy from a branch**, branch **main**, folder **/ (root)** → Save.
4. Wait ~1-2 min for the live URL (`https://<username>.github.io/consistency-checker/`) to appear.
5. Open that URL on desktop once to confirm it matches what you saw locally, then open the same URL in **Chrome on Android** → **Add to Home screen / Install app**.
6. **For every future update**: re-upload changed files AND bump `CACHE_NAME` in `sw.js` first — otherwise your phone keeps showing the old version.

## Verification checklist

**Desktop Chrome DevTools:**
- Application → Manifest: no errors, icons load, installable.
- Application → Service Workers: registered and active.
- Application → IndexedDB: `days` store updates live as you tap; unmarking deletes the row.
- Network → Offline, then reload: app still loads (proves offline caching works).

**On your Android phone, after install:**
- Icon and name look correct (not a generic globe icon).
- Tap cycles unmarked → green (black number, legible) → red (black number, legible) → unmarked.
- Long-press shows the placeholder message, doesn't also cycle color or open Android's text menu.
- Month navigation works; today's ring only shows in the current month.
- Airplane Mode + reopen from home screen: calendar and marks still load (offline + persistence check).
- Tap Export: a JSON file downloads/shares; open it and confirm it lists your marked days correctly.
- Change a few marks, then tap Import and pick the earlier export: confirm the prompt appears, confirm accepting it restores the calendar to exactly the exported state, and confirm cancelling leaves your changes untouched.
- Reopen the app again later (next day) to confirm marks really persisted.
