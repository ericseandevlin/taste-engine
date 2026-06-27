// link.test.mjs — run: node --test  (from scripts/taste/)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyManifest, upsertItem } from './manifest.mjs';
import { linkManifest, siteCounts } from './link.mjs';

const SITES = {
  agne: { name: 'Agne Agency', url: 'https://agneagency.com/', note: '' },
  typo: { name: 'Typo72', url: 'https://www.t72t.com/', note: '' },
  Marinkurir: { name: 'Marin Kurir', url: 'https://www.marinkurir.com/', note: '' },
};

function fixture() {
  const m = emptyManifest('website', 'visual-ui');
  upsertItem(m, { id: 'w001', file: 'agne1.png', title: 'Agne', source: { local: 'taste/website/agne1.png', url: null } });
  upsertItem(m, { id: 'w002', file: 'agne5.png', title: 'Agne', source: { local: 'taste/website/agne5.png', url: null } });
  upsertItem(m, { id: 'w003', file: 'typo721.png', title: 'Typo', source: { local: 'taste/website/typo721.png', url: null } });
  upsertItem(m, { id: 'w004', file: 'Marinkurir.png', title: 'Marinkurir', source: { local: 'taste/website/Marinkurir.png', url: null } });
  return m;
}

test('all images in a site group get the real name + url', () => {
  const m = fixture();
  const r = linkManifest(m, SITES);
  assert.equal(r.linked, 4);
  const agne = m.items.filter((i) => i.site === 'agne');
  assert.equal(agne.length, 2); // both agne images grouped
  assert.equal(agne[0].title, 'Agne Agency');
  assert.equal(agne[0].source.url, 'https://agneagency.com/');
});

test('stem with trailing index (typo721) maps to the right site (typo -> Typo72)', () => {
  const m = fixture();
  linkManifest(m, SITES);
  const t = m.items.find((i) => i.id === 'w003');
  assert.equal(t.site, 'typo');
  assert.equal(t.title, 'Typo72');
  assert.equal(t.source.url, 'https://www.t72t.com/');
});

test('no-trailing-digit stem (Marinkurir) still matches', () => {
  const m = fixture();
  linkManifest(m, SITES);
  const mk = m.items.find((i) => i.id === 'w004');
  assert.equal(mk.title, 'Marin Kurir');
});

test('unmatched files are reported, not crashed on', () => {
  const m = emptyManifest('website', 'visual-ui');
  upsertItem(m, { id: 'w001', file: 'unknown1.png', source: { url: null } });
  const r = linkManifest(m, SITES);
  assert.equal(r.linked, 0);
  assert.deepEqual(r.unmatched, ['unknown1.png']);
});

test('linking preserves other source fields and is idempotent', () => {
  const m = fixture();
  linkManifest(m, SITES);
  const before = JSON.stringify(m.items);
  linkManifest(m, SITES);
  assert.equal(JSON.stringify(m.items), before);
  assert.equal(m.items[0].source.local, 'taste/website/agne1.png'); // preserved
});

test('siteCounts tallies images per site', () => {
  const m = fixture();
  linkManifest(m, SITES);
  const counts = siteCounts(m);
  assert.equal(counts.agne, 2);
  assert.equal(counts.typo, 1);
});
