# Development History

This document records the public-safe, high-level path used to build Consistency Checker. It intentionally omits private user data, private backups, personal details, private Linear discussions, and local machine paths.

## Stage 1 — Calendar baseline

The first shipped version established the core PWA:

- Month calendar.
- Local date keys in `YYYY-MM-DD` format.
- IndexedDB persistence.
- Offline service worker/app shell.
- Export/import backup support.
- GitHub Pages deployment.
- Android home-screen installation.

The early calendar used manual green/red/unmarked states. Later stages intentionally changed that interaction model.

## Stage 2 — Detail logging

Stage 2 turned each calendar date into a real activity record:

- Per-day detail page.
- Gym entries with equipment, sets, and reps.
- Reading entries with book and pages.
- Shared saved equipment and book lists.
- Rename, archive, restore, and permanent-delete lifecycle.
- Edit/delete flows for historical entries.
- IndexedDB upgraded to version 2.
- Backup/import expanded while remaining backward compatible.

The project kept plain HTML/CSS/JavaScript and avoided a framework or build step.

## Calendar redesign

The calendar was then changed to reflect actual stored activity rather than relying only on manual marks:

- Reading presence became a derived black stripe from Reading entries.
- Gym activity later became data-driven: valid Gym data produces green automatically.
- Manual taps no longer create green.
- Eligible no-Gym days use only `unmarked ↔ red`.
- Red means no Gym.
- Red + Reading remains a valid Reading-only day.

This removed duplicate manual state for activities that already exist as structured data.

## Stage 3 — Equipment photos

Stage 3 added optional visual recognition for saved equipment:

- Equipment photos in Saved Equipment and Gym pickers.
- Images resized before local storage.
- JPEG output with longest side limited to 640px.
- Photos stored locally in IndexedDB.
- Photos included in backup schema version 4.
- Offline behavior preserved.

Stage 3 was deployed and verified on a real phone before work continued.

## Stage 4 — Calendar-month consistency and growth

Stage 4 replaced the original fixed-period concept with a calendar-month model.

### Calendar/result-day model

- Tracking begins on 2026-10-18.
- Dates before the tracking start are outside Stage 4 scoring.
- The final calendar day of every month is an exclusive gold result day.
- No Gym or Reading activity can be added on the result day.
- The result day does not score and does not alter the streak/half-day counter.
- A normal tap on the gold day opens the monthly result.
- Future result days are already shown in gold.

### Consistency engine

Each resolved scored date contributes:

- Gym + Reading = 1.0.
- Gym only = 0.5.
- Reading only = 0.5.
- No activity = 0 and breaks the live streak.

Half-day rule:

- Up to 3 consecutive half-days are allowed.
- The 4th consecutive half-day breaks the streak and is not counted.
- A full day resets the half-day counter.
- A zero day breaks immediately.
- After a break, the next qualifying activity starts a new streak.

Monthly result behavior:

- Only the streak that survives to the monthly scoring cutoff contributes to that month's result.
- A carried streak may continue across month boundaries.
- Gold result days are skipped by the streak.
- A carried streak may cross December into January.
- Historical corrections recalculate affected results rather than relying on stored summaries.

### Integrity handling

Contradictory tracked-day state is not silently guessed.

Examples:

- Gym data + red mark.
- Legacy stored green + no Gym data.

These dates show `?`, contribute nothing, and neither advance nor break the streak until corrected. A completed month containing unresolved dates displays **Unresolved month** instead of presenting a numeric result as final.

### Gym growth

- Each Gym row is sets × reps.
- The daily Gym value is the single highest row on that date.
- Rows are not summed together.
- Monthly Gym Contribution is the sum of daily maxima on qualifying Gym dates in the surviving streak.
- Average Gym Performance = contribution ÷ Gym active days.

### Reading growth

- Daily Reading units = distinct books engaged that date.
- Multiple entries for the same book still count as one book for that date.
- Pages are stored for the activity record but are not part of the Stage 4 growth metric.
- Monthly Reading Contribution is the sum of daily distinct-book units on qualifying Reading dates in the surviving streak.
- Average Reading Breadth = contribution ÷ Reading active days.

### History/comparison

- Month-to-month comparison stays within the same calendar year.
- January does not compare against December.
- History for a selected month contains only that calendar year's months up to the selected month.
- Carried streak continuity is independent of the year-history reset.

## Verification approach

The project used layered verification:

- Pure calculation logic extracted into testable modules.
- Automated Node tests for scoring, day-state rules, result presentation, Gym save rules, and offline caching.
- Local synthetic browser walkthroughs.
- Real-phone deployed walkthroughs.
- Offline reopening tests.
- Fresh JSON backup exported after the live data was cleaned and verified.

At Stage 4 completion, the full automated suite reported 124 passing tests and the deployed phone smoke test passed.

## Current state

Stages 1 through 4 are complete and deployed. No later stage is defined yet. Future work should be driven by real usage or an explicitly approved product decision rather than adding features speculatively.
