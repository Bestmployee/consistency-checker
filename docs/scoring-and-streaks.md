# Scoring and Streak Rules

This is the public reference for the current Stage 4 scoring model.

## Tracking window

- Stage 4 tracking starts on **2026-10-18**.
- Earlier dates are outside Stage 4 scoring.
- Earlier dates do not create misses, breaks, or integrity warnings.

## Gold result day

The final calendar day of every month is an exclusive **gold result day**.

- It is never an activity/scoring day.
- Gym and Reading cannot be added there.
- It does not advance or break the streak.
- It does not reset the half-day counter.
- A normal tap opens the monthly result.
- Future result days are already displayed in gold.
- Before the month closes, the result page says the result is not yet available.

## Daily Consistency units

For each resolved scored date:

| Activity | Consistency units |
| --- | ---: |
| Gym + Reading | 1.0 |
| Gym only | 0.5 |
| Reading only | 0.5 |
| No activity | 0 |

A red day with Reading is a valid Reading-only **0.5** day.

## Streak breaks

### Zero day

A resolved scored day with no Gym and no Reading contributes 0 and breaks the live streak immediately.

### Consecutive half-days

- 1st consecutive half-day: allowed.
- 2nd: allowed.
- 3rd: allowed.
- 4th: breaks the streak and is **not counted**.

A full 1.0 day resets the consecutive-half-day counter.

After any break, the next qualifying activity starts a new streak.

## Monthly surviving streak

The monthly result does not add every good day from the month.

Only the portion of the streak that is still alive at the month's scoring cutoff contributes to that month's final consistency result.

Consequences:

- If the streak breaks during the month, the earlier pre-break portion does not contribute to the final month result.
- Activity after the break can start a new streak.
- If the last scored day breaks the streak, the month's surviving contribution is 0.
- Empty days after a streak has already broken are not repeatedly listed as new break events.

## Carried streak

A live streak can carry:

- across a gold result day,
- from one calendar month into the next,
- from December into January.

The calendar-year reset used for history/comparisons does **not** reset the carried streak.

## Calendar state

### Gym

- Valid Gym data makes the day green automatically.
- Normal taps never create green.
- On an eligible day with no Gym, tap cycles `unmarked ↔ red`.
- Red means no Gym.
- A Gym save on a red day is refused until the red mark is removed.

### Reading

- Reading presence comes from Reading entries.
- The calendar shows a Reading stripe when Reading exists.
- There is no separate manual Reading marker.

## Integrity warning: `?`

A tracked scored date is unresolved when its stored calendar state contradicts its Gym data.

Examples:

- Gym data + red mark.
- Stored green + no Gym data.

While unresolved:

- the date contributes no Consistency, Gym, or Reading value;
- it does not advance the streak;
- it does not break the streak;
- it does not reset the half-day counter.

Correcting the underlying data removes the `?` and recalculates affected results.

A completed month that still contains unresolved dates displays **Unresolved month** instead of presenting a numeric result as final.

## Gym growth metric

For each Gym row:

`sets × reps`

For each date:

- calculate sets × reps for every valid Gym row;
- keep only the **single highest row**;
- do not sum the rows.

For the monthly surviving streak:

- **Gym Contribution** = sum of those daily maxima on qualifying Gym dates;
- **Average Gym Performance** = Gym Contribution ÷ Gym active days;
- Reading-only days are excluded from the Gym average;
- no Gym activity produces 0.

## Reading growth metric

For each date:

- count **distinct books** engaged that date;
- multiple entries for the same book count as one;
- pages are stored but are not part of the Stage 4 growth metric.

For the monthly surviving streak:

- **Reading Contribution** = sum of daily distinct-book counts on qualifying Reading dates;
- **Average Reading Breadth** = Reading Contribution ÷ Reading active days;
- Gym-only days are excluded from the Reading average;
- no Reading activity produces 0.

## Comparison and history

Monthly comparison uses:

- Gym Contribution
- Average Gym Performance
- Reading Contribution
- Average Reading Breadth

Each comparison is higher, lower, or unchanged.

Rules:

- comparisons stay within the same calendar year;
- January does not compare against December;
- history shows only the selected calendar year's completed months up to the selected month;
- the carried streak may still cross the year boundary.

## Recalculation

Monthly summaries are calculated from the underlying stored activity data rather than saved as permanent summary records. Historical corrections therefore recalculate the affected month and any later connected carried-streak values.
