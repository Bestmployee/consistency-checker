# Consistency Checker

Consistency Checker is a small, single-user Android PWA for tracking Gym and Reading consistency and growth. It is built with plain HTML, CSS, and JavaScript, stores data locally in IndexedDB, works offline, and is deployed with GitHub Pages.

This public repository contains application code, tests, and public-safe technical documentation only. It does **not** contain personal activity data, private backup files, secrets, or private project-management content.

## What the app does

- Monthly calendar with day-by-day Gym and Reading state.
- Per-day Gym logging with saved equipment, sets, reps, edit/delete, and optional equipment photos.
- Per-day Reading logging with saved books and pages.
- Data-driven Gym green state and Reading stripe.
- Manual red state for "no Gym".
- Monthly gold result day on the final calendar day.
- Consistency/streak calculation with break reasons.
- Separate Gym and Reading growth metrics.
- Same-year monthly comparison/history.
- Integrity warning (`?`) for contradictory stored state.
- Offline PWA operation.
- JSON export/import backups.

## Current scoring model

Stage 4 tracking starts on **2026-10-18**.

- Gym + Reading = **1.0** consistency unit.
- Gym only = **0.5**.
- Reading only = **0.5**.
- No activity = **0** and breaks the live streak.
- Up to **3 consecutive half-days** are allowed.
- The **4th consecutive half-day breaks** the streak and is not counted.
- A full day resets the half-day counter.
- The final day of each month is an exclusive **gold result day**: no activity is entered or scored there.
- Only the streak that survives to the monthly cutoff contributes to that month's result.
- A carried streak can continue across months and across year boundaries.

For the complete rule reference, see [docs/scoring-and-streaks.md](docs/scoring-and-streaks.md).

## Growth metrics

**Gym**
- Each Gym row is `sets × reps`.
- The daily Gym value is the single highest row for that date.
- Monthly Gym Contribution is the sum of those daily maxima on qualifying Gym dates in the surviving streak.
- Average Gym Performance = contribution ÷ Gym active days.

**Reading**
- Daily Reading units are the number of distinct books engaged that date.
- Pages are stored but are not part of the Stage 4 growth metric.
- Monthly Reading Contribution is the sum of daily distinct-book units on qualifying Reading dates in the surviving streak.
- Average Reading Breadth = contribution ÷ Reading active days.

## Architecture

- Plain HTML/CSS/JavaScript; no framework or build step.
- IndexedDB version **2**.
- Backup schema version **4**.
- Service worker app-shell caching for offline use.
- GitHub Pages deployment from `main`.
- Node built-in test runner: `node --test`.

## Development history

The application was built in sequential milestones rather than as one large rewrite:

1. Stage 1 — Calendar and offline/local-storage baseline.
2. Stage 2 — Per-day Gym/Reading detail logging and saved items.
3. Calendar redesign — Reading marker and later data-driven Gym state.
4. Stage 3 — Equipment photos and photo-safe backups.
5. Stage 4 — Calendar-month consistency/growth engine and gold monthly result day.

See [docs/development-history.md](docs/development-history.md) for the public-safe high-level history.

## Repository map

- `index.html` — main calendar page.
- `detail.html` — per-day detail and monthly result page.
- `saved-items.html` — saved equipment/books management.
- `js/summary-calc.js` — Stage 4 scoring engine.
- `js/day-state.js` — calendar display/tap rules.
- `js/month-result-view.js` — monthly result presentation.
- `js/db.js` — IndexedDB access.
- `js/export.js` — backup export/import.
- `tests/` — automated regression tests.
- `docs/` — public-safe plans and technical history.

## Privacy

All real user data remains outside the repository. Do not commit exported backups, activity logs, photos from real usage, personal names, private Linear content, local filesystem paths, or secrets.
