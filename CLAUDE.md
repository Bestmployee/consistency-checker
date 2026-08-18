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

- **Stage 1 — done:** Calendar of all days; tap a day to mark it green (did the activity) or red (didn't).
- **Stage 2:** Detail screen, opened by long-pressing a marked day. Two activity types with different fields — Gym (sets, reps, equipment used) and Reading (book name, pages read).
- **Stage 3:** Equipment photos on the Gym detail screen, automatically shrunk before storing.
- **Stage 4:** Every 30 days (counted from the first entry ever made), a summary showing (1) Consistency — days shown up out of 30, streaks, where they broke, and (2) Growth — whether sets/reps per equipment and pages read trended up or down over the period.

Full Stage 1 spec, including verification checklist: `docs/plan-stage1.md`.

## Architecture decisions (locked in, apply to all future stages)

- **No build step.** Plain HTML/CSS/JS only — no framework, no bundler. Deployed by uploading files directly to GitHub Pages via GitHub's web UI (no git/command line required).
- **Storage: IndexedDB**, not localStorage — chosen from Stage 1 because Stage 3's equipment photos need blob storage. Database `consistencyCheckerDB`, object store `days` keyed by local `"YYYY-MM-DD"` date strings (not UTC-shifted `Date.toISOString()`). Future stores (per-day activity logs, photos) should key off the same date-string convention so they can be added as additive IndexedDB migrations, not rewrites.
- **Persistent storage:** `navigator.storage.persist()` is requested on load so Android is less likely to evict data under storage pressure.
- **Export & Import** both ship as real, working features (not deferred): Export downloads a JSON backup (`{ schemaVersion, exportedAt, days }`); Import replaces all current data with a chosen backup file, after a confirmation prompt. Buttons are deliberately plain/unstyled until a styling pass is explicitly requested.
- **Marking interaction:** tap cycles a day unmarked → green → red → unmarked. Long-press is reserved for opening the detail screen (Stage 2+); in Stage 1, with no detail screen yet, long-press just shows a placeholder message and must not also trigger the tap-cycle or Android's native text-selection menu.
- **Legibility rule (hard constraint):** the day number must always be visible as text — bright green/red fills use **black bold** numbers, never a colored block with no number.
- **Service worker caching:** `CACHE_NAME` in `sw.js` must be bumped on every deploy, or updates won't reach the phone (stale cache is the standard PWA gotcha here).
- **Local testing:** Node.js is available — use `npx serve` from the project folder to test on `localhost` before uploading to GitHub Pages.
