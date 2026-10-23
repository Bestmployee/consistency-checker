// Automated checks for the offline app shell in sw.js: every file the pages load is cached,
// and the cache name has moved past the earlier Stage 4 caches.
// Run from the project folder with:  node --test

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const cacheName = /const CACHE_NAME = '([^']+)'/.exec(sw)[1];
const appShell = [...sw.matchAll(/^\s+'\.\/([^']*)',$/gm)].map((m) => m[1]);
const PAGES = ['index.html', 'detail.html', 'saved-items.html'];

test('every page and every script and stylesheet the pages load is in the offline list', () => {
  for (const page of PAGES) {
    assert.ok(appShell.includes(page), `${page} cached`);
    const html = fs.readFileSync(path.join(root, page), 'utf8');
    for (const [, src] of html.matchAll(/<(?:script|link)[^>]+(?:src|href)="([^"]+\.(?:js|css))"/g)) {
      assert.ok(appShell.includes(src), `${page} loads ${src}, which must be cached`);
    }
  }
});

test('the Stage 4 runtime files are cached', () => {
  for (const file of ['js/summary-calc.js', 'js/day-state.js', 'js/month-result-view.js']) {
    assert.ok(appShell.includes(file), file);
  }
});

test('every cached file exists', () => {
  for (const file of appShell) {
    if (file === '') continue; // './' is the start page
    assert.ok(fs.existsSync(path.join(root, file)), `${file} exists`);
  }
});

test('the cache name is bumped past the earlier caches', () => {
  assert.ok(cacheName.startsWith('consistency-checker-'));
  for (const old of ['consistency-checker-nic-16', 'consistency-checker-nic-17', 'consistency-checker-nic-17-b']) {
    assert.notEqual(cacheName, old);
  }
});

test('older app caches are deleted when the new one activates', () => {
  assert.match(sw, /n\.startsWith\(CACHE_PREFIX\) && n !== CACHE_NAME/);
});
