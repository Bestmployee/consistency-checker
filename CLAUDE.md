# Consistency Checker

A personal habit-tracking web app (gym + reading consistency), used solely on one Android phone via "Add to Home Screen." No server, no login, no other users. All data lives in the phone's browser storage.

## How I want you to work with me

- Before building anything new, confirm in plain English what you understand I want, and wait for my approval.
- Once I approve a scope, stay strictly on it. Build it, verify it works, and finish it. Do not add features I did not ask for — not even small, obviously-safe ones. If something seems worth adding beyond the agreed scope, ask first.
- Never decide an open question on my behalf. Ask me. I stay in control of every decision.
- Only interrupt me proactively if there's a serious architectural problem or meaningful risk — explain it in plain English and get my approval before proceeding.
- I have no coding background. Explain choices in plain English, and tell me exactly what I need to do to see changes running on my phone.
- Prefer self-contained solutions over sending me to third-party sites/tools (e.g. generate placeholder assets with a script rather than pointing me to a generator website).

## Build order (strictly sequential — do not combine or jump ahead)

- **Stage 1 — complete:** Month calendar of all days. (Its original green/red tap cycle was replaced in Stage 4; see below.)
- **Stage 2 — complete:** Per-day detail page (`detail.html?date=…`, opened by long-press). Gym (equipment rows with sets and reps) and Reading (book and pages), with shared saved equipment/books.
- **Stage 3 — complete (NIC-16):** Equipment photos on Saved Equipment and in the equipment picker (JPEG, longest side 640px).
- **Stage 4 — implemented on branch `bestmployee/nic-17-stage-4-calculation-engine` (NIC-17), pending owner review/merge:** monthly Consistency, Gym and Reading results shown on each month's gold result day. Rules below.

Specs: `docs/plan-stage1.md`, `docs/plan-stage2.md`.

## Stage 4 rules (owner-approved; do not regress)

The code is the detailed reference: `js/summary-calc.js` (all scoring), `js/day-state.js` (calendar-day display, taps, Gym-save guard), `js/month-result-view.js` (result display). Results are always recalculated from stored data, never saved, so historical corrections propagate automatically.

- **Tracking starts Oct 18, 2026.** Earlier dates are outside Stage 4: never scored, never break a streak, never get a "?".
- **Calendar months.** The **final calendar day of every month is the exclusive result day**: always gold (future months too), not scored, no effect on streaks or the half-day count, and no Gym or Reading entry or edit. A normal tap on a gold day opens its result (detail page); it never changes a mark. Before the month closes the page only says the result isn't available yet; there is no live monthly score anywhere.
- **Gym green is data-driven** from valid Gym entries; the app never writes green, and deleting a day's last Gym row clears any stored green. **Taps never create green.** The only tap cycle is **unmarked → red → unmarked**, on days with no Gym data and no stored green; other days ignore taps (no tap-to-repair of "?").
- **Red means no Gym.** Red + Reading is a valid Reading-only half-day. A **Gym save (add or edit) on a red day is refused**; the owner removes red first.
- **Reading is data-driven** from Reading entries (the calendar stripe); there is no manual Reading mark.
- **Integrity "?"** (from Oct 18 on): Gym data on a red day, or a stored green with no Gym data. Such dates are excluded from everything (no count, no streak advance or break) until the data is corrected. A month containing one is shown as **"Unresolved month"**, never as a final number.
- **Consistency per date:** Gym + Reading = 1, one of them = 0.5, neither = 0 (an immediate break). Up to 3 consecutive half-days survive; the 4th breaks. Only the streak surviving to the month's last scored day counts toward that month; the carried streak continues across months and across years.
- **Gym:** a date's value is its single highest sets × reps row (never summed). **Reading:** distinct books that date (pages are not used). Each has a Contribution, an average per active day, and an active-day count; no activity = 0.
- **Comparisons and history stay within a calendar year:** each month compares with the previous month (higher / lower / unchanged) except January; history shows that year's months up to the selected one. No grades, thresholds or combined scores.
- **No separate Summary page or button** — the gold day is the only monthly-summary entry point.
- **No IndexedDB schema or backup schema change** for Stage 4 (DB version 2, backup version 4).

## Architecture decisions (locked in, apply to all future stages)

- **No build step.** Plain HTML/CSS/JS only — no framework, no bundler. Deployed by uploading files directly to GitHub Pages via GitHub's web UI (no git/command line required).
- **Storage: IndexedDB**, not localStorage — chosen from Stage 1 because Stage 3's equipment photos need blob storage. Database `consistencyCheckerDB`, object store `days` keyed by local `"YYYY-MM-DD"` date strings (not UTC-shifted `Date.toISOString()`). Future stores (per-day activity logs, photos) should key off the same date-string convention so they can be added as additive IndexedDB migrations, not rewrites.
- **Persistent storage:** `navigator.storage.persist()` is requested on load so Android is less likely to evict data under storage pressure.
- **Export & Import** both ship as real, working features (not deferred): Export downloads a JSON backup (schema version 4: `{ schemaVersion, exportedAt, days, entries, savedItems }`, with equipment photos included inline in the same file; versions 1–3 still import); Import replaces all current data with a chosen backup file, after a confirmation prompt. Buttons are deliberately plain/unstyled until a styling pass is explicitly requested.
- **Marking interaction:** a tap marks a no-Gym day red or unmarks it (see Stage 4 rules); a tap on a gold result day opens it. Long-press opens the detail page and must not also trigger a tap or Android's native text-selection menu.
- **Legibility rule (hard constraint):** the day number must always be visible as text — bright green/red fills use **black bold** numbers, never a colored block with no number.
- **Service worker caching:** `CACHE_NAME` in `sw.js` must be bumped on every deploy, or updates won't reach the phone (stale cache is the standard PWA gotcha here).
- **Local testing:** Node.js is available — use `npx serve` from the project folder to test on `localhost` before uploading to GitHub Pages.
- **Automated tests:** run `node --test` from the project folder (Node's built-in runner, nothing to install). The `tests/` folder is not needed on GitHub Pages.
