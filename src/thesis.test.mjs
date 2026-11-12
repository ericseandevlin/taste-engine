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

test('numeric ranges keep their en dash: a date range is typography, not an AI tell', () => {
  // Found by the poster run: "14–15 Nov 2025" was being mangled to "14, 15 Nov 2025".
  assert.equal(stripEmDash('14–15 Nov 2025'), '14–15 Nov 2025');
  assert.equal(stripEmDash('2024–2025'), '2024–2025');
  assert.equal(stripEmDash('pp. 30–42'), 'pp. 30–42');
  assert.equal(stripEmDash('09:00–16:30'), '09:00–16:30');
  // Spaced ranges normalize to a tight en dash rather than a comma.
  assert.equal(stripEmDash('14 – 15 Nov'), '14–15 Nov');
  // And a protected range must not trip the lint gate.
  assert.equal(hasEmDash('14–15 Nov 2025'), false);
  assert.equal(hasEmDash('Sessions run 09:00–16:30 daily'), false);
});

test('a dash used as a sentence break is still stripped, even near numbers', () => {
  assert.equal(stripEmDash('six sessions — all in Hall B'), 'six sessions, all in Hall B');
  // Number on one side only is not a range.
  assert.equal(stripEmDash('2025 — the year of'), '2025, the year of');
  assert.equal(stripEmDash('a — 15 minutes later'), 'a, 15 minutes later');
  assert.equal(hasEmDash('six sessions — all in Hall B'), true);
  // An em dash between digits is still an em dash, never a range.
  assert.equal(stripEmDash('14—15'), '14, 15');
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
