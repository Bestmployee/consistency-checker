# Consistency Checker

A single-user habit-tracking web app for Gym and Reading consistency, designed as an installable Android PWA. No server, no login, no multi-user system. All real activity data lives in the browser's local storage and must never be committed to this public repository.

## How to work on this project

- Before building anything new, confirm in plain English what the owner wants and wait for explicit approval.
- Once a scope is approved, stay strictly inside it. Do not add unrequested features.
- Never decide an open product question on the owner's behalf.
- Raise serious architectural or data-safety risks clearly and wait for the owner's decision.
- Explain implementation choices in plain English when communicating with the owner.
- Prefer self-contained solutions over unnecessary third-party tools.
- Never commit personal activity data, backup exports, private Linear content, secrets, personal identifiers, or local filesystem paths.

## Build history

- **Stage 1 — complete:** month calendar, local persistence, offline PWA behavior, export/import, and GitHub Pages deployment. Its original manual green tap behavior was superseded later.
- **Stage 2 — complete:** per-day detail page, Gym entries (equipment/sets/reps), Reading entries (book/pages), shared saved equipment/books, edit/delete/archive lifecycle, and IndexedDB v2.
- **Calendar redesign — complete:** Reading stripe derived from Reading entries; Stage 4 later made Gym green data-driven and left normal no-Gym taps as unmarked ↔ red.
- **Stage 3 — complete:** optional equipment photos in Saved Equipment and Gym pickers; resized to JPEG with longest side 640px before IndexedDB storage; backup schema v4.
- **Stage 4 — complete (NIC-17 / PR #11):** calendar-month Consistency, Gym, and Reading results shown on each month's gold result day. Deployed and verified on the production phone app.
- **Post-Stage-4 usability — NIC-19:** public documentation cleanup and a read-only in-app scoring/streak reference.

Public references:
- `README.md`
- `docs/development-history.md`
- `docs/scoring-and-streaks.md`
- `docs/plan-stage1.md`
- `docs/plan-stage2.md`

## Stage 4 rules (owner-approved; do not regress)

The code is the detailed executable reference:
- `js/summary-calc.js` — scoring/calculation engine.
- `js/day-state.js` — calendar-day display, taps, and Gym-save guard.
- `js/month-result-view.js` — monthly result presentation.

Results are recalculated from stored source data rather than persisted as summary records, so historical corrections propagate automatically.

- **Tracking starts 2026-10-18.** Earlier dates are outside Stage 4: never scored, never break a streak, never get a `?`.
- **Calendar months.** The final calendar day of every month is the exclusive gold result day: always gold (future months too), not scored, no effect on streaks or the half-day count, and no Gym/Reading entry or edit.
- A normal tap on a gold day opens its result. Before the month closes, the page only says the result is not available yet; there is no live monthly score elsewhere.
- **Gym green is data-driven** from valid Gym entries. The app never writes green from normal taps. The only normal no-Gym tap cycle is **unmarked → red → unmarked**.
- **Red means no Gym.** Red + Reading is a valid Reading-only half-day. A Gym save (add or edit) on a red day is refused until red is removed.
- **Reading is data-driven** from Reading entries and is shown as a calendar stripe.
- **Integrity `?`** on tracked dates: Gym data + red, or stored green + no Gym. Unresolved dates are excluded from scoring/streak progression until corrected. A completed month containing unresolved dates displays **Unresolved month**.
- **Consistency per date:** Gym + Reading = 1, one activity = 0.5, neither = 0 (immediate break).
- Up to 3 consecutive half-days survive; the 4th breaks the streak and is not counted.
- A full day resets the half-day counter. After a break, the next qualifying activity starts a new streak.
- Only the streak surviving to the month's last scored day contributes to that month's result.
- The carried streak can cross result days, months, and year boundaries.
- **Gym metric:** daily value is the single highest sets × reps row. Monthly Gym Contribution sums daily maxima on qualifying Gym dates in the surviving streak; Average Gym Performance = contribution ÷ Gym active days.
- **Reading metric:** daily units are distinct books engaged that date. Pages are not used for Stage 4 growth. Monthly Reading Contribution sums daily distinct-book units on qualifying Reading dates in the surviving streak; Average Reading Breadth = contribution ÷ Reading active days.
- **Comparisons/history:** same calendar year only; January does not compare against December. Carried streak continuity is independent of the year-history reset.
- **No separate Summary page/button.** The gold result day is the monthly-summary entry point.
- **No DB or backup schema change** for Stage 4: IndexedDB v2, backup schema v4.

## Architecture decisions

- **No build step.** Plain HTML/CSS/JS only — no framework or bundler.
- **Storage:** IndexedDB, using local `YYYY-MM-DD` date keys rather than UTC-shifted ISO timestamps.
- **Persistent storage:** `navigator.storage.persist()` is requested so Android is less likely to evict data under storage pressure.
- **Export & Import:** production features. Backup schema v4 is `{ schemaVersion, exportedAt, days, entries, savedItems }`; equipment photos are included inline. Older supported backup versions remain importable.
- **Marking interaction:** eligible no-Gym dates toggle unmarked ↔ red. A gold result day opens its result. Long-press opens the detail page and must not also trigger a normal tap.
- **Legibility:** the day number must always remain visible as text.
- **Service worker caching:** bump `CACHE_NAME` for every deployed runtime change so installed phones receive the new app shell.
- **Deployment:** GitHub Pages deploys the public app from `main`.
- **Local testing:** Node.js is available; `npx serve` can be used for localhost browser checks.
- **Automated tests:** run `node --test` from the project folder.
