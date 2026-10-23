// Stage 4 calendar-day rules: what a day shows (green / red / "?" / gold result day) and
// what a normal tap stores. Built on SummaryCalc.classifyDate (js/summary-calc.js), so the
// calendar and the scoring always agree on what a date's data means.
// Pure: no storage and no page access; tested in tests/day-state.test.js.
// Green is data-driven: a date with a Gym entry shows green unless it is marked red. A tap
// can only mark a date red or unmark it; it never creates green.
// Wrapped in a function so its helpers don't become page-wide globals.
(function () {
  const Calc = typeof window !== 'undefined' && window.SummaryCalc
    ? window.SummaryCalc
    : require('./summary-calc.js');

  // From tracking start on, a month's final calendar day is exclusively its result day:
  // no activity can be entered there and it is never a green/red activity day.
  // (Earlier months stay normal historical dates.)
  function isExclusiveResultDay(dateKey) {
    return Calc.isTracked(dateKey) && Calc.isResultDay(dateKey);
  }

  function entriesAllowed(dateKey) {
    return !isExclusiveResultDay(dateKey);
  }

  // A Gym save is refused on a red day: red means no Gym, so the red mark must be removed
  // first. Returns the refusal message, or null if the save may go ahead.
  function gymSaveRefusal(status) {
    return status === 'red'
      ? 'This day is marked red (no Gym). Remove the red mark on the calendar first, then save Gym.'
      : null;
  }

  // How the calendar shows a date, from its stored status ('green' | 'red' | undefined) and
  // its entries. Returns { resultDay, gold, color: 'green' | 'red' | null, reading, unresolved }.
  // - A result day is always gold (before and after it arrives) and shows no activity at
  //   all; any activity stored there is ignored.
  // - Gym data shows green, or red if the date is marked red (old or imported data only,
  //   since a Gym save is refused on a red day: a mismatch, shown with "?").
  // - Without Gym data the stored mark shows as it is: red, or a legacy green, which from
  //   tracking start on is a mismatch shown with "?".
  function describeDay(dateKey, status, dateEntries) {
    if (isExclusiveResultDay(dateKey)) {
      return { resultDay: true, gold: true, color: null, reading: false, unresolved: false };
    }
    const info = Calc.classifyDate(dateKey, status, dateEntries);
    let color = status || null;
    if (info.hasGym) color = status === 'red' ? 'red' : 'green';
    return {
      resultDay: false,
      gold: false,
      color,
      reading: info.hasReading,
      unresolved: info.integrity === 'mismatch',
    };
  }

  // What a normal tap stores: 'red', null (unmarked), or undefined (no change).
  // The only tap cycle is unmarked -> red -> unmarked, on a day with no Gym data and no
  // stored green. Every other day ignores taps: a result day; a Gym day (the Gym data
  // decides, including old Gym + red data); and a day with a leftover stored green. A tap
  // never creates green and is not a way to repair a "?".
  function nextTapStatus(dateKey, status, dateEntries) {
    if (isExclusiveResultDay(dateKey)) return undefined;
    if (Calc.classifyDate(dateKey, status, dateEntries).hasGym) return undefined;
    if (status === 'red') return null;
    if (status === undefined || status === null) return 'red';
    return undefined;
  }

  const api = { isExclusiveResultDay, entriesAllowed, gymSaveRefusal, describeDay, nextTapStatus };
  if (typeof window !== 'undefined') window.DayState = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
