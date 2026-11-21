import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boardPalette, composeBrief, rulesForMode, renderBrief } from './brief.mjs';

const manifest = { items: [
  { measured: { palette: [{ hex: '#000000', pct: 60 }, { hex: '#ffffff', pct: 40 }] } },
  { measured: { palette: [{ hex: '#000000', pct: 20 }, { hex: '#ff0000', pct: 80 }] } },
] };
const channels = [
  { id: 'grid', name: 'Grid', recipe: { type: 'One grotesk family — no serif' }, forbidden: ['Drop shadows'], members: ['w1', 'w2'] },
  { id: 'pop', name: 'Pop', recipe: { ground: 'Flat color field' }, forbidden: ['Gradients'], members: ['w2'] },
];
const directions = { strict: { name: 'Strict', brief: 'A grid.', palette: '#000, #fff', channels: ['grid'] } };
const make = (prior) => composeBrief({ boardName: 'b', manifest, channels, directions, prior });

test('boardPalette weights by coverage and sums shares from one total', () => {
  assert.deepEqual(boardPalette(manifest.items), [
    { hex: '#000000', share: 40 }, { hex: '#ff0000', share: 40 }, { hex: '#ffffff', share: 20 },
  ]);
});

test('composeBrief traces every rule to a lane and its references', () => {
  const b = make();
  assert.equal(b.rules.length, 4);
  for (const r of b.rules) assert.ok(r.evidence.refs.length > 0 && r.lane);
  assert.equal(b.rules[0].lane, 'grid'); // heaviest lane first
  assert.ok(!/—/.test(b.rules[0].rule));
});

test('rulesForMode gives only the mode lanes and drops rejected rules', () => {
  const b = make();
  b.rules.find((r) => r.kind === 'dont' && r.lane === 'grid').status = 'rejected';
  const { dos, donts } = rulesForMode(b, 'strict');
  assert.deepEqual(dos.map((r) => r.lane), ['grid']);
  assert.equal(donts.length, 0);
});

test('a re-run keeps edited, locked and rejected rules and refreshes the rest', () => {
  const first = make();
  first.rules[0].rule = 'My wording';
  first.rules[0].status = 'edited';
  first.rules[1].rule = 'stale machine text';
  const second = make(first);
  assert.equal(second.rules[0].rule, 'My wording');
  assert.equal(second.rules[1].rule, 'Drop shadows');
});

test('renderBrief lists each mode with Do and Don\'t', () => {
  const md = renderBrief(make());
  assert.match(md, /## Mode: Strict/);
  assert.match(md, /\*\*Don't\*\*\n\n- Drop shadows/);
});

test('a direction with refs adds its own subject, composition and avoid rules, traced to those refs', () => {
  const dirs = {
    strict: { name: 'Strict', brief: 'A grid.', palette: '#000, #fff', channels: ['grid'], refs: ['w1'], subject: 'Face cut into strips', composition: 'Mass low, field above', avoid: ['Painted faces'], lineage: { tradition: 'T', era: 'unclear', place: 'P', cues: ['c'], confidence: 'low' } },
    soft: { name: 'Soft', brief: 'Pop.', palette: ['#f00'], channels: ['pop'], refs: ['w2'], subject: 'Painted face' },
  };
  const b = composeBrief({ boardName: 'b', manifest, channels, directions: dirs });
  const own = b.rules.filter((r) => r.mode === 'strict');
  assert.deepEqual(own.map((r) => r.aspect || r.kind), ['subject', 'composition', 'dont']);
  for (const r of own) assert.deepEqual(r.evidence, { mode: 'strict', refs: ['w1'] });
  const { dos, donts } = rulesForMode(b, 'strict');
  assert.equal(dos[0].rule, 'Face cut into strips'); // own rules lead
  assert.ok(!dos.some((r) => r.rule === 'Painted face')); // never another mode's
  assert.ok(donts.some((r) => r.rule === 'Painted faces'));
  assert.deepEqual(b.modes.find((m) => m.id === 'soft').palette, ['#f00']);
  const md = renderBrief(b);
  assert.match(md, /Palette \(measured from w1\)/);
  assert.match(md, /interpretation, low confidence/);
});
