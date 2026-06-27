// thesis.test.mjs — run: node --test  (from scripts/taste/)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyManifest, upsertItem } from './manifest.mjs';
import {
  hasEmDash,
  stripEmDash,
  claimedTasteHits,
  buildThesisInput,
  assembleThesis,
} from './thesis.mjs';

const board = { name: 'website' };

function fixture() {
  const m = emptyManifest('website', 'visual-ui');
  upsertItem(m, { id: 'w001', tags: ['dark-field', 'mono-meta'], measured: { palette: [{ hex: '#000', pct: 50 }] } });
  upsertItem(m, { id: 'w002', tags: ['dark-field'], measured: { palette: [{ hex: '#000', pct: 40 }, { hex: '#fff', pct: 20 }] } });
  const channels = [
    { id: 'dark', name: 'Dark Editorial', recipe: { ground: 'near-black', accent: 'single muted' }, forbidden: ['gradients', 'drop shadow'], members: ['w001', 'w002'] },
    { id: 'warm', name: 'Warm Editorial', recipe: { ground: 'cream', accent: 'oxblood' }, forbidden: ['neon'], members: ['w001'] },
  ];
  return { m, channels };
}

test('hasEmDash / stripEmDash', () => {
  assert.equal(hasEmDash('a — b'), true);
  assert.equal(hasEmDash('a – b'), true); // en dash too
  assert.equal(hasEmDash('a, b'), false);
  assert.equal(stripEmDash('type is hero — everything quiet'), 'type is hero, everything quiet');
  assert.equal(hasEmDash(stripEmDash('a — b – c')), false);
});

test('claimedTasteHits flags credential phrasing', () => {
  assert.deepEqual(claimedTasteHits('We have an eye for detail'), ['an eye for']);
  assert.deepEqual(claimedTasteHits('clean grids and bold type'), []);
});

test('buildThesisInput aggregates tags, palette, channel weight', () => {
  const { m, channels } = fixture();
  const agg = buildThesisInput(m, channels);
  assert.equal(agg.itemCount, 2);
  assert.equal(agg.topTags[0][0], 'dark-field'); // most frequent
  assert.ok(agg.topHex.includes('#000'));
  assert.equal(agg.channelsByWeight[0].id, 'dark'); // 2 members > 1
});

test('assembleThesis has one table row per channel and a forbidden section', () => {
  const { m, channels } = fixture();
  const agg = buildThesisInput(m, channels);
  const doc = assembleThesis(board, agg, channels, '### Values\n- type is hero', '2026-01-01');
  // table rows: one per channel (count "| Dark"/"| Warm")
  assert.ok(doc.includes('| Dark Editorial | 2 |'));
  assert.ok(doc.includes('| Warm Editorial | 1 |'));
  assert.ok(/Forbidden/i.test(doc));
  assert.ok(doc.includes('near-black'));
});

test('assembleThesis output is em-dash clean even if prose contains them', () => {
  const { m, channels } = fixture();
  const agg = buildThesisInput(m, channels);
  const doc = assembleThesis(board, agg, channels, 'type is hero — everything else quiet', '2026-01-01');
  assert.equal(hasEmDash(doc), false);
});

test('assembleThesis is deterministic for fixed inputs', () => {
  const { m, channels } = fixture();
  const agg = buildThesisInput(m, channels);
  const a = assembleThesis(board, agg, channels, '### Values\n- x', '2026-01-01');
  const b = assembleThesis(board, agg, channels, '### Values\n- x', '2026-01-01');
  assert.equal(a, b);
});
