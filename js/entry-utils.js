// Small generic helpers shared by the Gym and Reading sections of the detail page.

// "1 set", "3 sets"
function countLabel(count, singular, plural) {
  return `${count} ${count === 1 ? singular : plural}`;
}

// Digits only (leading zeros allowed, e.g. "08" -> 8) and greater than 0; anything else
// (blank, 0, negatives, decimals, "1e2", letters) returns null. Numbers too large to be
// stored exactly are also rejected rather than silently rounded.
function parsePositiveWholeNumber(text) {
  const trimmed = String(text == null ? '' : text).trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

// Sorts entries oldest first: by createdAt, then by id as a stable tie-breaker.
function compareOldestFirst(a, b) {
  return (a.createdAt || 0) - (b.createdAt || 0) || a.id - b.id;
}

window.EntryUtils = {
  countLabel,
  parsePositiveWholeNumber,
  compareOldestFirst,
};
