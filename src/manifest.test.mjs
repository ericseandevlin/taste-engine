// manifest.test.mjs — run: node --test  (from scripts/taste/)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdtempSync, rmSync } from 'fs';
import {
  assignIds,
  titleFromFile,
  sourceKey,
  emptyManifest,
  readManifest,
  writeManifest,
  upsertItem,
  mergeItemField,
  isImageFile,
} from './manifest.mjs';
import { getBoard } from './config.mjs';

test('assignIds is stable regardless of input order', () => {
  const a = assignIds(['b.png', 'a.png', 'c.jpg']);
  const b = assignIds(['c.jpg', 'a.png', 'b.png']);
  assert.deepEqual([...a.entries()], [...b.entries()]);
  assert.equal(a.get('a.png'), 'w001');
  assert.equal(a.get('b.png'), 'w002');
  assert.equal(a.get('c.jpg'), 'w003');
});

test('assignIds ignores non-image files', () => {
  const m = assignIds(['a.png', 'notes.txt', 'b.jpg']);
  assert.equal(m.has('notes.txt'), false);
  assert.equal(m.size, 2);
});

test('titleFromFile groups and humanizes', () => {
  assert.equal(titleFromFile('grafik1.png'), 'Grafik');
  assert.equal(titleFromFile('harry-george2.png'), 'Harry George');
  assert.equal(titleFromFile('even-odd6.png'), 'Even Odd');
});

test('sourceKey strips trailing index', () => {
  assert.equal(sourceKey('agne5.png'), 'agne');
  assert.equal(sourceKey('david-rodriguez2.png'), 'david-rodriguez');
});

test('upsertItem preserves prior fields, overwrites only patched keys', () => {
  const m = emptyManifest('website', 'visual-ui');
  upsertItem(m, { id: 'w001', file: 'a.png', notes: { why: 'x' } });
  upsertItem(m, { id: 'w001', measured: { w: 10 } });
  assert.equal(m.items.length, 1);
  assert.equal(m.items[0].file, 'a.png');
  assert.deepEqual(m.items[0].notes, { why: 'x' });
  assert.deepEqual(m.items[0].measured, { w: 10 });
});

test('upsertItem is idempotent on record count', () => {
  const m = emptyManifest('website', 'visual-ui');
  upsertItem(m, { id: 'w001', file: 'a.png' });
  upsertItem(m, { id: 'w001', file: 'a.png' });
  assert.equal(m.items.length, 1);
});

test('upsertItem requires an id', () => {
  const m = emptyManifest('website', 'visual-ui');
  assert.throws(() => upsertItem(m, { file: 'a.png' }), /id is required/);
});

test('mergeItemField overwrites only that block', () => {
  const m = emptyManifest('website', 'visual-ui');
  upsertItem(m, { id: 'w001', file: 'a.png', tags: ['x'] });
  mergeItemField(m, 'w001', 'measured', { w: 5 });
  assert.deepEqual(m.items[0].tags, ['x']);
  assert.deepEqual(m.items[0].measured, { w: 5 });
});

test('mergeItemField throws on unknown id', () => {
  const m = emptyManifest('website', 'visual-ui');
  assert.throws(() => mergeItemField(m, 'nope', 'measured', {}), /no item with id/);
});

test('read/write round-trips and stamps generated', () => {
  const dir = mkdtempSync(join(tmpdir(), 'taste-'));
  const p = join(dir, 'manifest.json');
  try {
    const m = emptyManifest('website', 'visual-ui');
    upsertItem(m, { id: 'w001', file: 'a.png' });
    writeManifest(p, m, { stamp: '2026-01-01' });
    const back = readManifest(p);
    assert.equal(back.generated, '2026-01-01');
    assert.equal(back.items[0].id, 'w001');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('readManifest returns null when the file is missing', () => {
  assert.equal(readManifest(join(tmpdir(), 'taste-does-not-exist-xyz.json')), null);
});

test('getBoard returns merged config for the demo board', () => {
  const b = getBoard('demo');
  assert.equal(b.kind, 'visual-ui');
  assert.ok(Array.isArray(b.tagVocabulary));
  assert.ok(b.absDir.endsWith('boards/demo') || b.absDir.endsWith('boards/demo/'));
});

test('getBoard throws clearly on an unknown board', () => {
  assert.throws(() => getBoard('nope'), /Unknown board "nope"/);
});

test('isImageFile is case-insensitive', () => {
  assert.equal(isImageFile('a.PNG'), true);
  assert.equal(isImageFile('a.txt'), false);
});
