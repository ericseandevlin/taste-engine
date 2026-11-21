// directions.test.mjs: run with node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDirectionsInput,
  buildDirectionsPrompt,
  boardPalette,
  evidencePalette,
  paletteGap,
  wordOverlap,
  divergenceProblems,
  divergenceScore,
  parseDirectionsResponse,
  parseLineage,
  lineageLine,
  buildLineagePrompt,
  toKeyed,
} from './directions.mjs';

const channels = [
  { id: 'grid', name: 'Grid', members: ['a', 'b', 'c'], recipe: { ground: 'white' }, forbidden: ['gradients'] },
  { id: 'mono', name: 'Mono', members: ['a', 'b'], recipe: { type: 'mono' }, forbidden: ['serif'] },
  { id: 'warm', name: 'Warm', members: ['d', 'e', 'f'], recipe: { ground: 'cream' }, forbidden: ['black'] },
];
const pal = (...hexes) => ({ measured: { palette: hexes.map(([hex, pct]) => ({ hex, pct })) } });
const manifest = {
  items: [
    { id: 'a', ...pal(['#000000', 50], ['#ffffff', 30], ['#ff0000', 20]) },
    { id: 'b', ...pal(['#000000', 60], ['#ff3300', 40]) },
    { id: 'c', ...pal(['#ffffff', 70], ['#0033cc', 30]) },
    { id: 'd', ...pal(['#ffcccc', 60], ['#cc9999', 40]) },
    { id: 'e', ...pal(['#ffffcc', 50], ['#cccc99', 50]) },
    { id: 'f', ...pal(['#cccc33', 70], ['#333333', 30]) },
  ],
};

test('buildDirectionsInput carries lane weight and members', () => {
  const input = buildDirectionsInput({ channels });
  assert.equal(input.find((c) => c.id === 'grid').weight, 3);
  assert.deepEqual(input.find((c) => c.id === 'mono').members, ['a', 'b']);
});

test('boardPalette ranks hexes by covered area, capped at k', () => {
  const m = { items: [pal(['#fff', 60], ['#000', 30]), pal(['#000', 50], ['#f00', 10])] };
  assert.deepEqual(boardPalette(m, 2), ['#000', '#fff']);
});

test('evidencePalette measures only the given refs and keeps at most two neutrals', () => {
  const p = evidencePalette(manifest, ['a', 'b']);
  assert.ok(p.includes('#000000'));
  assert.ok(!p.includes('#ffcccc')); // a color from another ref never leaks in
  const many = { items: [{ id: 'x', ...pal(['#000000', 30], ['#0a0a0a', 25], ['#777777', 20], ['#bbbbbb', 15], ['#cc0000', 10]) }] };
  const out = evidencePalette(many, ['x'], 3);
  assert.deepEqual(out, ['#000000', '#777777', '#cc0000']); // #0a0a0a merges into black, a third grey loses to the red
});

test('evidencePalette merges near-duplicate colors', () => {
  const m = { items: [{ id: 'x', ...pal(['#ff0000', 50], ['#fe0101', 40], ['#0000ff', 10]) }] };
  assert.deepEqual(evidencePalette(m, ['x']), ['#ff0000', '#0000ff']);
});

test('paletteGap is 0 for the same colors and grows as they differ', () => {
  assert.equal(paletteGap(['#000000', '#ffffff'], ['#ffffff', '#000000']), 0);
  const near = paletteGap(['#000000', '#ff0000'], ['#000000', '#ee1100']);
  const far = paletteGap(['#000000', '#ff0000'], ['#ffffcc', '#99cccc']);
  assert.ok(far > near);
  assert.equal(paletteGap([], ['#000000']), 0);
});

test('wordOverlap compares content words', () => {
  assert.equal(wordOverlap('halftone face sliced', 'halftone face sliced'), 1);
  assert.equal(wordOverlap('painted portrait', 'halftone strips'), 0);
});

const dir = (id, extra) => ({ id, channels: ['grid'], refs: ['a', 'b'], palette: ['#000000'], subject: '', composition: '', ...extra });

test('divergenceProblems flags close palettes, shared refs, same lanes and samey wording', () => {
  const close = [dir('one'), dir('two')];
  const reasons = divergenceProblems(close).map((p) => p.reason).join(' | ');
  assert.match(reasons, /palettes too close/);
  assert.match(reasons, /same references/);
  assert.match(reasons, /same lanes/);
  const wordy = [
    dir('one', { subject: 'halftone face sliced into strips', palette: ['#000000'], refs: ['a'] }),
    dir('two', { subject: 'halftone face sliced into strips', palette: ['#ffcccc'], refs: ['d'], channels: ['warm'] }),
  ];
  assert.match(divergenceProblems(wordy).map((p) => p.reason).join(), /same subject treatment/);
});

test('divergenceProblems passes a set that differs on every axis', () => {
  const apart = [
    dir('dark', { refs: ['a', 'b'], channels: ['grid', 'mono'], palette: ['#000000', '#ff0000'], subject: 'face cut into offset strips', composition: 'centered mass on black' }),
    dir('warm', { refs: ['d', 'e'], channels: ['warm'], palette: ['#ffcccc', '#cccc99'], subject: 'painted portrait in soft tones', composition: 'subject pushed to one flank' }),
  ];
  assert.deepEqual(divergenceProblems(apart), []);
  assert.equal(divergenceScore(apart).problems, 0);
  assert.ok(divergenceScore(apart).minGap > 20);
});

test('parseDirectionsResponse keeps only refs that belong to the chosen lanes and measures each palette', () => {
  const raw = 'here: ' + JSON.stringify({
    directions: [
      { id: 'Dark Grid', name: 'Dark', lanes: ['grid', 'ghost'], refs: ['a', 'b', 'd', 'zz'], subject: 's — x', composition: 'c', avoid: ['x', 'y', 'z'], summary: 'S' },
      { id: 'warm', lanes: ['warm'], refs: ['d', 'e'], subject: 's', composition: 'c' },
      { id: 'blue', lanes: ['grid'], refs: ['c', 'a'] },
      { id: 'thin', lanes: ['warm'], refs: ['d'] }, // one ref is not enough evidence
    ],
  });
  const out = parseDirectionsResponse(raw, channels, manifest);
  assert.equal(out.length, 3);
  const dark = out[0];
  assert.equal(dark.id, 'dark-grid');
  assert.deepEqual(dark.channels, ['grid']);
  assert.deepEqual(dark.refs, ['a', 'b']); // d is not a grid member, zz does not exist
  assert.deepEqual(dark.palette, evidencePalette(manifest, ['a', 'b']));
  assert.equal(dark.avoid.length, 2);
  assert.ok(!/—/.test(dark.subject));
  assert.equal(dark.brief, 'S');
});

test('parseDirectionsResponse throws on too few directions or no JSON', () => {
  const raw = JSON.stringify({ directions: [{ id: 'a', lanes: ['grid'], refs: ['a', 'b'] }] });
  assert.throws(() => parseDirectionsResponse(raw, channels, manifest), /expected >= 3/);
  assert.throws(() => parseDirectionsResponse('no json', channels, manifest), /no JSON object/);
});

test('buildDirectionsPrompt names the surface, the image order and any feedback', () => {
  const p = buildDirectionsPrompt(buildDirectionsInput({ channels }), ['a', 'b'], 3, { surface: 'poster', feedback: [{ a: 'x', b: 'y', reason: 'palettes too close' }] });
  assert.match(p, /new poster/);
  assert.match(p, /in this order: a, b/);
  assert.match(p, /x vs y: palettes too close/);
  assert.ok(!/TOO SAMEY/.test(buildDirectionsPrompt([], ['a'], 3)));
});

test('parseLineage keeps it labeled as an interpretation and defaults confidence to low', () => {
  const l = parseLineage('{"tradition":"Hand-printed film posters","era":"1970s","place":"Central Europe","cues":["a.","b"],"confidence":"Medium"}');
  assert.equal(l.confidence, 'medium');
  assert.equal(l.interpretation, true);
  assert.deepEqual(l.cues, ['a', 'b']);
  assert.equal(parseLineage('{"tradition":"x","confidence":"certain"}').confidence, 'low');
  assert.equal(parseLineage('nothing'), null);
  assert.equal(parseLineage('{"era":"1970s"}'), null);
  assert.match(buildLineagePrompt({ name: 'D', refs: ['a', 'b'] }), /interpretation, not a fact/);
});

test('lineageLine always says interpretation and skips unclear parts', () => {
  assert.equal(
    lineageLine({ tradition: 'Film posters', era: 'unclear', place: 'Central Europe', confidence: 'medium' }),
    'Reads as Film posters, Central Europe (interpretation, medium confidence)',
  );
  assert.equal(lineageLine(null), '');
});

test('toKeyed produces the id-keyed shape, palette as a comma string', () => {
  const keyed = toKeyed([{ id: 's', name: 'S', channels: ['grid'], refs: ['a'], palette: ['#000', '#fff'], brief: 'b', avoid: ['n'], lineage: null }]);
  assert.deepEqual(Object.keys(keyed), ['s']);
  assert.equal(keyed.s.palette, '#000, #fff');
  assert.deepEqual(keyed.s.refs, ['a']);
  assert.deepEqual(keyed.s.notes, ['n']);
});
