// Stage 4 calculation engine. Turns the stored calendar marks ('days' records) and
// activity entries into each date's scoring state and every completed month's result:
// Consistency, carried streak, breaks, Gym and Reading metrics, previous-month
// comparisons and same-year history.
// Pure: it never reads or writes storage and never touches the page, so every screen
// and the automated tests (tests/summary-calc.test.js, run with `node --test`)
// share exactly the same math. Nothing it produces is stored: results are recalculated
// from the source data each time, so any correction to past data is always reflected.
// Wrapped in a function so its helpers don't become page-wide globals.
(function () {
  // Tracking begins on this date. Earlier dates are outside the tracked period: they
  // are never scored, never missed and never break a streak.
  const TRACKING_START = '2026-10-18';

  const MAX_CONSECUTIVE_HALF_DAYS = 3;
  const BREAK_NO_ACTIVITY = 'no activity';
  const BREAK_FOURTH_HALF_DAY = '4th consecutive half-day';

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  // month is 1-12.
  function makeDateKey(year, month, day) {
    return `${year}-${pad2(month)}-${pad2(day)}`;
  }

  // Reads "YYYY-MM-DD" from its numeric parts (never new Date(string), which is UTC).
  function parseDateKey(dateKey) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey || '');
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
    return { year, month, day };
  }

  // month is 1-12; day 0 of the next month is the last day of this one.
  function daysInMonth(year, month) {
    return new Date(year, month, 0).getDate();
  }

  // The final calendar day of every month is exclusively the month's result day:
  // never scored and never part of streak progression.
  function isResultDay(dateKey) {
    const parts = parseDateKey(dateKey);
    return parts !== null && parts.day === daysInMonth(parts.year, parts.month);
  }

  function isTracked(dateKey) {
    return dateKey >= TRACKING_START;
  }

  function isValidCount(value) {
    return Number.isSafeInteger(value) && value > 0;
  }

  // Classifies one date from its calendar status ('green' | 'red' | undefined) and its entries.
  // Gym: the date's Gym value is the single highest sets × reps row across all its gym
  //   entries (rows are never added). Gym data with no mark or green is valid Gym; red is
  //   manual "no Gym".
  // Reading: units are the number of distinct books (pages are not used). The Reading mark
  //   is drawn from the entries themselves, so it can never disagree with them.
  // Integrity: on a tracked date, Gym data on a red date, or green with no Gym data, is a
  //   mismatch; the date is unresolved and takes no part in scoring until corrected. Dates
  //   before tracking start are outside Stage 4 and never get a mismatch.
  // scored is true only for a tracked, resolved date that is not a result day.
  function classifyDate(dateKey, status, dateEntries) {
    let gymValue = null;
    const books = new Set();
    for (const entry of dateEntries || []) {
      if (entry.type === 'gym' && Array.isArray(entry.equipment)) {
        for (const row of entry.equipment) {
          if (!row || !isValidCount(row.sets) || !isValidCount(row.reps)) continue;
          const value = row.sets * row.reps;
          if (gymValue === null || value > gymValue) gymValue = value;
        }
      } else if (entry.type === 'reading') {
        books.add(entry.bookItemId);
      }
    }
    const hasGym = gymValue !== null;
    const hasReading = books.size > 0;
    const resultDay = isResultDay(dateKey);
    const tracked = isTracked(dateKey);
    const mismatch = tracked && ((hasGym && status === 'red') || (!hasGym && status === 'green'));
    const integrity = mismatch ? 'mismatch' : 'ok';
    return {
      date: dateKey,
      tracked,
      isResultDay: resultDay,
      integrity,
      hasGym,
      hasReading,
      gymValue,
      readingUnits: books.size,
      // 1 full day, 0.5 half-day, 0 no activity; null while unresolved.
      units: mismatch ? null : (hasGym ? 0.5 : 0) + (hasReading ? 0.5 : 0),
      scored: tracked && !resultDay && !mismatch,
    };
  }

  function emptyPart() {
    return { consistency: 0, gymContribution: 0, gymDays: 0, readingContribution: 0, readingDays: 0 };
  }

  function compareNumbers(current, previous) {
    if (current > previous) return 'higher';
    if (current < previous) return 'lower';
    return 'unchanged';
  }

  // Compares two averages (sum ÷ days, or 0 when days is 0) exactly, by cross-multiplying,
  // so rounding can never change the verdict.
  function compareAverages(currentSum, currentDays, previousSum, previousDays) {
    if (currentDays === 0 || previousDays === 0) {
      const current = currentDays === 0 ? 0 : currentSum;
      const previous = previousDays === 0 ? 0 : previousSum;
      // With one side at 0, only the other side's sign matters (sums are never negative).
      return compareNumbers(current > 0 ? 1 : 0, previous > 0 ? 1 : 0);
    }
    const left = BigInt(currentSum) * BigInt(previousDays);
    const right = BigInt(previousSum) * BigInt(currentDays);
    return left > right ? 'higher' : left < right ? 'lower' : 'unchanged';
  }

  function average(sum, days) {
    return days === 0 ? 0 : sum / days;
  }

  function buildMetric(contribution, days) {
    return { contribution, days, average: average(contribution, days) };
  }

  // Calculates everything from the source data.
  //   days:     the 'days' records ({ date, status })
  //   entries:  every entry record
  //   todayKey: today's local "YYYY-MM-DD"; a month is completed from its result day on.
  // Returns {
  //   trackingStart, baselineMonth ('YYYY-MM' or null),
  //   months: completed months from the baseline month on, oldest first (see below),
  //   currentCarriedStreak: the streak alive at the latest completed month's cutoff,
  //   dates: { 'YYYY-MM-DD': classifyDate(...) } for every tracked date up to the latest
  //          completed month's result day,
  //   unresolvedDates: every unresolved scored-range date in those months (including months
  //          before the baseline), oldest first,
  // }
  // Each month: { month, scoredStart, scoredEnd, resultDay, isBaseline, previousMonth,
  //   consistency, breaks: [{ date, reason }], carriedStreak: { total, parts: [{ month, consistency }] },
  //   unresolvedDates, hasUnresolved (the result leaves those dates out until they are corrected,
  //     so it is not a clean final result),
  //   gym: { contribution, days, average }, reading: { contribution, days, average },
  //   vsPrevious: null (baseline, or January) or { gymContribution, gymAverage, readingContribution,
  //     readingAverage } each 'higher' | 'lower' | 'unchanged', against the previous completed
  //     month of the same calendar year,
  //   history: this month and the earlier completed months of the same calendar year, oldest first }
  // The carried streak is not limited by the year: it can continue from December into January.
  function computeSummary({ days = [], entries = [], todayKey }) {
    const today = parseDateKey(todayKey);
    if (!today) throw new Error(`Invalid today date: ${todayKey}`);

    const statusByDate = new Map(days.map((day) => [day.date, day.status]));
    const entriesByDate = new Map();
    for (const entry of entries) {
      if (!entriesByDate.has(entry.date)) entriesByDate.set(entry.date, []);
      entriesByDate.get(entry.date).push(entry);
    }

    const start = parseDateKey(TRACKING_START);
    const dates = {};
    const unresolvedDates = [];
    const completed = [];

    // The live streak: its per-month parts in date order, and the current run of half-days.
    let streak = new Map();
    let halfDayRun = 0;
    let monthBreaks = [];

    // Ends the live streak. A break is recorded only if a streak was actually running, so
    // the empty days that follow a break are not listed again.
    function breakStreak(dateKey, reason) {
      if (streak.size > 0) monthBreaks.push({ date: dateKey, reason });
      streak = new Map();
      halfDayRun = 0;
    }

    function addToStreak(monthKey, info) {
      if (!streak.has(monthKey)) streak.set(monthKey, emptyPart());
      const part = streak.get(monthKey);
      part.consistency += info.units;
      if (info.hasGym) {
        part.gymContribution += info.gymValue;
        part.gymDays += 1;
      }
      if (info.hasReading) {
        part.readingContribution += info.readingUnits;
        part.readingDays += 1;
      }
    }

    // Walk month by month, from the tracking start's month, through every completed month.
    let year = start.year;
    let month = start.month;
    for (;;) {
      const lastDay = daysInMonth(year, month);
      const resultDayKey = makeDateKey(year, month, lastDay);
      if (resultDayKey > todayKey) break;

      const monthKey = `${year}-${pad2(month)}`;
      const firstDay = year === start.year && month === start.month ? start.day : 1;
      let hasActivity = false;
      const monthUnresolved = [];
      monthBreaks = [];

      for (let day = firstDay; day <= lastDay; day++) {
        const dateKey = makeDateKey(year, month, day);
        const info = classifyDate(dateKey, statusByDate.get(dateKey), entriesByDate.get(dateKey));
        dates[dateKey] = info;
        if (info.integrity === 'mismatch' && !info.isResultDay) {
          monthUnresolved.push(dateKey);
          unresolvedDates.push(dateKey);
        }
        // The result day and unresolved dates take no part: they don't add, break, or
        // touch the half-day run.
        if (!info.scored) continue;

        if (info.units === 0) {
          breakStreak(dateKey, BREAK_NO_ACTIVITY);
          continue;
        }
        hasActivity = true;
        if (info.units === 0.5) {
          halfDayRun += 1;
          if (halfDayRun > MAX_CONSECUTIVE_HALF_DAYS) {
            // The 4th consecutive half-day breaks the streak and is not counted itself.
            breakStreak(dateKey, BREAK_FOURTH_HALF_DAY);
            continue;
          }
        } else {
          halfDayRun = 0;
        }
        addToStreak(monthKey, info);
      }

      // Month close: only the part of the streak that survives to the cutoff counts.
      const own = streak.get(monthKey) || emptyPart();
      const parts = [...streak].map(([partMonth, part]) => ({ month: partMonth, consistency: part.consistency }));
      completed.push({
        month: monthKey,
        hasActivity,
        scoredStart: makeDateKey(year, month, firstDay),
        scoredEnd: makeDateKey(year, month, lastDay - 1),
        resultDay: resultDayKey,
        consistency: own.consistency,
        breaks: monthBreaks,
        unresolvedDates: monthUnresolved,
        hasUnresolved: monthUnresolved.length > 0,
        carriedStreak: { total: parts.reduce((sum, part) => sum + part.consistency, 0), parts },
        gym: buildMetric(own.gymContribution, own.gymDays),
        reading: buildMetric(own.readingContribution, own.readingDays),
      });

      month += 1;
      if (month > 12) {
        month = 1;
        year += 1;
      }
    }

    // The baseline is the first completed month with a resolved, scored Gym or Reading date.
    const baselineIndex = completed.findIndex((m) => m.hasActivity);
    const months = baselineIndex === -1 ? [] : completed.slice(baselineIndex);
    months.forEach((m, i) => {
      const monthYear = m.month.slice(0, 4);
      // Comparisons stay within the calendar year: January has no previous month to compare.
      const previous = i > 0 && months[i - 1].month.slice(0, 4) === monthYear ? months[i - 1] : null;
      delete m.hasActivity;
      m.isBaseline = i === 0;
      m.previousMonth = previous ? previous.month : null;
      m.vsPrevious = previous && {
        gymContribution: compareNumbers(m.gym.contribution, previous.gym.contribution),
        gymAverage: compareAverages(m.gym.contribution, m.gym.days, previous.gym.contribution, previous.gym.days),
        readingContribution: compareNumbers(m.reading.contribution, previous.reading.contribution),
        readingAverage: compareAverages(m.reading.contribution, m.reading.days, previous.reading.contribution, previous.reading.days),
      };
      m.history = months.slice(0, i + 1)
        .filter((h) => h.month.slice(0, 4) === monthYear)
        .map((h) => ({
          month: h.month,
          hasUnresolved: h.hasUnresolved,
          consistency: h.consistency,
          gymContribution: h.gym.contribution,
          gymAverage: h.gym.average,
          readingContribution: h.reading.contribution,
          readingAverage: h.reading.average,
        }));
    });

    const latest = months[months.length - 1];
    return {
      trackingStart: TRACKING_START,
      baselineMonth: months.length > 0 ? months[0].month : null,
      months,
      currentCarriedStreak: latest ? latest.carriedStreak : { total: 0, parts: [] },
      dates,
      unresolvedDates,
    };
  }

  const api = {
    TRACKING_START,
    BREAK_NO_ACTIVITY,
    BREAK_FOURTH_HALF_DAY,
    classifyDate,
    isResultDay,
    isTracked,
    computeSummary,
  };
  if (typeof window !== 'undefined') window.SummaryCalc = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
