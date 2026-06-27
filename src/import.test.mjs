// import.test.mjs — run: node --test  (from scripts/taste/)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyManifest } from './manifest.mjs';
import { buildImport } from './import.mjs';

const board = { name: 'website', kind: 'visual-ui', dir: 'taste/website' };

test('fresh import: one record per image, grouped titles, non-images ignored', () => {
  const m = emptyManifest('website', 'visual-ui');
  const r = buildImport(board, m, ['grafik1.png', 'grafik2.png', 'agne1.png', 'notes.txt']);
  assert.equal(r.added, 3);
  assert.equal(m.items.length, 3);
  const agne = m.items.find((i) => i.file === 'agne1.png');
  assert.equal(agne.id, 'w001'); // sorted: agne1 < grafik1 < grafik2
  assert.equal(agne.title, 'Agne');
  assert.equal(agne.source.local, 'taste/website/agne1.png');
});

test('re-import same set adds nothing, preserves enriched fields (idempotent)', () => {
  const m = emptyManifest('website', 'visual-ui');
  buildImport(board, m, ['a1.png']);
  m.items[0].tags = ['dark-field'];
  m.items[0].notes.why = 'kept';
  const r = buildImport(board, m, ['a1.png']);
  assert.equal(r.added, 0);
  assert.equal(m.items.length, 1);
  assert.deepEqual(m.items[0].tags, ['dark-field']);
  assert.equal(m.items[0].notes.why, 'kept');
});

test('adding one image adds exactly one record and keeps existing ids stable', () => {
  const m = emptyManifest('website', 'visual-ui');
  buildImport(board, m, ['b1.png', 'd1.png']); // b->w001, d->w002
  const bId = m.items.find((i) => i.file === 'b1.png').id;
  const dId = m.items.find((i) => i.file === 'd1.png').id;
  const r = buildImport(board, m, ['b1.png', 'c1.png', 'd1.png']);
  assert.equal(r.added, 1);
  assert.equal(m.items.length, 3);
  // c1 sorts between b1 and d1 but must NOT renumber existing records
  assert.equal(m.items.find((i) => i.file === 'b1.png').id, bId);
  assert.equal(m.items.find((i) => i.file === 'd1.png').id, dId);
  assert.equal(m.items.find((i) => i.file === 'c1.png').id, 'w003');
});

test('sources.txt populates urls; missing key -> null', () => {
  const m = emptyManifest('website', 'visual-ui');
  const sources = new Map([['grafik', 'https://grafik.example']]);
  buildImport(board, m, ['grafik1.png', 'agne1.png'], sources);
  assert.equal(m.items.find((i) => i.file === 'grafik1.png').source.url, 'https://grafik.example');
  assert.equal(m.items.find((i) => i.file === 'agne1.png').source.url, null);
});

test('sources backfills urls for previously-imported records missing one', () => {
  const m = emptyManifest('website', 'visual-ui');
  buildImport(board, m, ['grafik1.png']); // url null
  const r = buildImport(board, m, ['grafik1.png'], new Map([['grafik', 'https://g.example']]));
  assert.equal(r.enriched, 1);
  assert.equal(m.items[0].source.url, 'https://g.example');
});
