// Stage 4 monthly result, as shown on a month's gold result day: the calendar cell's
// compact result and the full result on the result day's detail page. Both are built here
// from the same SummaryCalc.computeSummary output (js/summary-calc.js), so they always agree.
// buildMonthView and calendarResult are pure (tested in tests/month-result-view.test.js);
// render turns a view into page elements.
// Wrapped in a function so its helpers don't become page-wide globals.
(function () {
  const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  // Up to 2 decimals, no forced trailing zeros: 2, 2.5, 2.33. Display only; comparisons
  // are made on exact values in SummaryCalc.
  function formatNumber(value) {
    return String(Number(value.toFixed(2)));
  }

  function parts(key) {
    return key.split('-').map(Number);
  }

  // "2026-10" -> "October 2026"
  function monthYearLabel(monthKey) {
    const [year, month] = parts(monthKey);
    return `${MONTH_NAMES[month - 1]} ${year}`;
  }

  function monthName(monthKey) {
    return MONTH_NAMES[parts(monthKey)[1] - 1];
  }

  // "2026-10-21" -> "Oct 21"
  function shortDateLabel(dateKey) {
    const [, month, day] = parts(dateKey);
    return `${MONTH_NAMES[month - 1].slice(0, 3)} ${day}`;
  }

  function dayCount(count, kind) {
    return `${count} ${kind} ${count === 1 ? 'day' : 'days'}`;
  }

  // The view for one month's result day (dateKey is that month's final day). States:
  // - 'notReady': the result day hasn't arrived; no result is shown before the month closes.
  // - 'noResult': the month closed but has no Stage 4 result (results start with the first
  //   month that has scored activity).
  // - 'complete': the month's full result; unresolved is true when some of its dates have
  //   a mark that disagrees with their Gym data (left out until corrected), so the result
  //   is not final.
  function buildMonthView(summary, dateKey, todayKey) {
    const monthKey = dateKey.slice(0, 7);
    const base = { monthKey, monthLabel: monthYearLabel(monthKey), resultDayLabel: `${monthName(monthKey)} ${parts(dateKey)[2]}` };
    if (dateKey > todayKey) return { ...base, state: 'notReady' };

    const index = summary.months.findIndex((m) => m.month === monthKey);
    if (index === -1) {
      return {
        ...base,
        state: 'noResult',
        unresolvedDates: summary.unresolvedDates.filter((d) => d.startsWith(monthKey)).map(shortDateLabel),
      };
    }

    const m = summary.months[index];
    const previous = m.previousMonth ? summary.months[index - 1] : null;
    let comparison;
    if (m.isBaseline) {
      comparison = { kind: 'baseline' };
    } else if (!previous) {
      comparison = { kind: 'newYear' };
    } else {
      comparison = {
        kind: 'previous',
        previousName: monthName(previous.month),
        previousUnresolved: previous.hasUnresolved,
        rows: [
          { metric: 'Gym Contribution', previous: formatNumber(previous.gym.contribution), verdict: m.vsPrevious.gymContribution },
          { metric: 'Average Gym Performance', previous: formatNumber(previous.gym.average), verdict: m.vsPrevious.gymAverage },
          { metric: 'Reading Contribution', previous: formatNumber(previous.reading.contribution), verdict: m.vsPrevious.readingContribution },
          { metric: 'Average Reading Breadth', previous: formatNumber(previous.reading.average), verdict: m.vsPrevious.readingAverage },
        ],
      };
    }

    return {
      ...base,
      state: 'complete',
      scoredRangeLabel: `${shortDateLabel(m.scoredStart)}–${parts(m.scoredEnd)[2]}`,
      unresolved: m.hasUnresolved,
      unresolvedDates: m.unresolvedDates.map(shortDateLabel),
      consistency: formatNumber(m.consistency),
      streak: {
        total: formatNumber(m.carriedStreak.total),
        parts: m.carriedStreak.parts.map((p) => ({ name: monthName(p.month), value: formatNumber(p.consistency) })),
      },
      breaks: m.breaks.map((b) => ({ dateLabel: shortDateLabel(b.date), reason: b.reason })),
      gym: {
        contribution: formatNumber(m.gym.contribution),
        average: formatNumber(m.gym.average),
        daysLabel: dayCount(m.gym.days, 'Gym'),
      },
      reading: {
        contribution: formatNumber(m.reading.contribution),
        average: formatNumber(m.reading.average),
        daysLabel: dayCount(m.reading.days, 'Reading'),
      },
      comparison,
      history: m.history.map((h) => ({
        name: monthName(h.month),
        unresolved: h.hasUnresolved,
        consistency: formatNumber(h.consistency),
        gymContribution: formatNumber(h.gymContribution),
        gymAverage: formatNumber(h.gymAverage),
        readingContribution: formatNumber(h.readingContribution),
        readingAverage: formatNumber(h.readingAverage),
      })),
    };
  }

  // The compact result shown in a completed month's gold calendar cell, under the day
  // number: { text, unresolved }, or null when there is nothing to show (the month hasn't
  // closed, or has no result). An unresolved month never shows its number as if final.
  function calendarResult(summary, dateKey, todayKey) {
    if (dateKey > todayKey) return null;
    const m = summary.months.find((month) => month.month === dateKey.slice(0, 7));
    if (!m) return null;
    return m.hasUnresolved
      ? { text: 'Unres.', label: 'Unresolved', unresolved: true }
      : { text: formatNumber(m.consistency), label: `Consistency ${formatNumber(m.consistency)}`, unresolved: false };
  }

  // --- Rendering (browser only) ---

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function section(title) {
    const s = el('section', 'detail-section month-result-section');
    s.appendChild(el('h2', null, title));
    return s;
  }

  function line(label, value, note) {
    const p = el('p', 'month-result-line');
    p.appendChild(el('span', 'month-result-label', `${label}: `));
    p.appendChild(el('strong', null, value));
    if (note) p.appendChild(el('span', 'month-result-note', ` ${note}`));
    return p;
  }

  function comparisonText(row, comparison) {
    return `(${comparison.previousName}: ${row.previous} — ${row.verdict})`;
  }

  // Returns the element for a view from buildMonthView.
  function render(view) {
    const root = el('div', 'month-result');
    const header = el('div', 'month-result-header');
    header.appendChild(el('h2', null, `${view.monthLabel} result`));
    root.appendChild(header);

    if (view.state === 'notReady') {
      header.appendChild(el('p', null, `The monthly result will be available when ${view.monthLabel} closes, on ${view.resultDayLabel}.`));
      return root;
    }
    if (view.state === 'noResult') {
      header.appendChild(el('p', null, `There is no monthly result for ${view.monthLabel}: results start with the first month that has Gym or Reading activity.`));
      if (view.unresolvedDates.length > 0) {
        header.appendChild(el('p', null, `Unresolved dates in this month: ${view.unresolvedDates.join(', ')}.`));
      }
      return root;
    }

    header.appendChild(el('p', null, `Completed month · scored ${view.scoredRangeLabel} · ${view.resultDayLabel} is the result day (not scored).`));

    if (view.unresolved) {
      const warning = el('div', 'month-result-unresolved');
      warning.appendChild(el('p', null, 'Unresolved — this result is not final.'));
      warning.appendChild(el('p', null,
        `These dates have a calendar mark that doesn't match their Gym data, so they are left out until corrected: ${view.unresolvedDates.join(', ')}. ` +
        'Correct them (they show "?" on the calendar) for the result to be final.'));
      root.appendChild(warning);
    }

    const consistency = section('Consistency');
    consistency.appendChild(line('Consistency', view.consistency));
    if (view.streak.parts.length > 1) {
      const sum = view.streak.parts.map((p) => `${p.name} ${p.value}`).join(' + ');
      consistency.appendChild(line('Streak at month end', view.streak.total, `(${sum})`));
    } else if (view.streak.parts.length === 1) {
      consistency.appendChild(line('Streak at month end', view.streak.total));
    } else {
      consistency.appendChild(line('Streak at month end', '0', '(no streak running at month end)'));
    }
    if (view.breaks.length === 0) {
      consistency.appendChild(line('Breaks', 'none'));
    } else {
      consistency.appendChild(el('p', 'month-result-label', 'Breaks:'));
      const list = el('ul', 'month-result-list');
      for (const b of view.breaks) list.appendChild(el('li', null, `${b.dateLabel} — ${b.reason}`));
      consistency.appendChild(list);
    }
    root.appendChild(consistency);

    const c = view.comparison;
    const rows = c.kind === 'previous' ? c.rows : [];
    const gym = section('Gym');
    gym.appendChild(line('Gym Contribution', view.gym.contribution, rows[0] && comparisonText(rows[0], c)));
    gym.appendChild(line('Average Gym Performance', view.gym.average, `across ${view.gym.daysLabel}${rows[1] ? ` ${comparisonText(rows[1], c)}` : ''}`));
    root.appendChild(gym);

    const reading = section('Reading');
    reading.appendChild(line('Reading Contribution', view.reading.contribution, rows[2] && comparisonText(rows[2], c)));
    reading.appendChild(line('Average Reading Breadth', view.reading.average, `across ${view.reading.daysLabel}${rows[3] ? ` ${comparisonText(rows[3], c)}` : ''}`));
    root.appendChild(reading);

    if (c.kind === 'baseline') {
      root.appendChild(el('p', 'month-result-note', 'First tracked month — no previous month to compare.'));
    } else if (c.kind === 'newYear') {
      root.appendChild(el('p', 'month-result-note', `No previous-month comparison: ${monthName(view.monthKey)} starts a new year.`));
    } else if (c.previousUnresolved) {
      root.appendChild(el('p', 'month-result-note', `${c.previousName}'s result is unresolved, so this comparison may change.`));
    }

    const history = section(`${view.monthKey.slice(0, 4)} so far`);
    const list = el('ul', 'month-result-list month-result-history');
    for (const h of view.history) {
      const item = el('li');
      item.appendChild(el('strong', null, `${h.name}${h.unresolved ? ' (unresolved)' : ''}`));
      item.appendChild(el('span', null,
        ` — Consistency ${h.consistency} · Gym ${h.gymContribution} (avg ${h.gymAverage}) · Reading ${h.readingContribution} (avg ${h.readingAverage})`));
      list.appendChild(item);
    }
    history.appendChild(list);
    root.appendChild(history);
    return root;
  }

  const api = { formatNumber, buildMonthView, calendarResult, render };
  if (typeof window !== 'undefined') window.MonthResultView = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
