// features.test.mjs — run: node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CONSTANTS,
  accentCountOf,
  aggregateAxes,
  aggregatePalette,
  aggregateScalar,
  alignmentScore,
  buildFingerprint,
  canonicalStringify,
  chromaOf,
  contributions,
  deltaE76,
  fingerprintCanonical,
  groundLightnessOf,
  hexToRgb,
  luminance601,
  madSpread,
  median,
  medianAspect,
  normalizeScalar,
  paletteDistance,
  paletteSelfAgreement,
  rgbToHsl,
  rgbToLab,
  scalarDistance,
  scopeRefIds,
  tagDistance,
  tagFreq,
  tagSelfAgreement,
} from './features.mjs';

// --- color helpers ---

test('hexToRgb parses and rejects', () => {
  assert.deepEqual(hexToRgb('#ff0000'), { r: 255, g: 0, b: 0 });
  assert.deepEqual(hexToRgb('00ff00'), { r: 0, g: 255, b: 0 });
  assert.equal(hexToRgb('#fff'), null);
  assert.equal(hexToRgb('nope'), null);
});

test('rgbToHsl: red is fully saturated, gray is not', () => {
  assert.equal(rgbToHsl({ r: 255, g: 0, b: 0 }).s, 1);
  assert.equal(rgbToHsl({ r: 128, g: 128, b: 128 }).s, 0);
});

test('luminance601 endpoints', () => {
  assert.equal(luminance601({ r: 255, g: 255, b: 255 }), 1);
  assert.equal(luminance601({ r: 0, g: 0, b: 0 }), 0);
});

test('deltaE76 is zero for identical colors and large for black/white', () => {
  const white = rgbToLab({ r: 255, g: 255, b: 255 });
  const black = rgbToLab({ r: 0, g: 0, b: 0 });
  assert.equal(deltaE76(white, white), 0);
  assert.ok(deltaE76(white, black) > 99);
});

// --- palette-derived scalars ---

test('chromaOf: saturated palette high, gray palette zero, empty null', () => {
  assert.equal(chromaOf([{ hex: '#ff0000', pct: 100 }]), 1);
  assert.equal(chromaOf([{ hex: '#808080', pct: 100 }]), 0);
  assert.equal(chromaOf([]), null);
});

test('groundLightnessOf uses the dominant entry', () => {
  const pal = [
    { hex: '#000000', pct: 20 },
    { hex: '#ffffff', pct: 80 },
  ];
  assert.equal(groundLightnessOf(pal), 1); // white dominates by coverage
});

test('accentCountOf: chromatic hue-distinct entries beyond the ground', () => {
  // white ground: any chromatic entry counts
  assert.equal(
    accentCountOf([
      { hex: '#ffffff', pct: 70 },
      { hex: '#ff0000', pct: 20 },
      { hex: '#0000ff', pct: 10 },
    ]),
    2,
  );
  // achromatic extras don't count
  assert.equal(
    accentCountOf([
      { hex: '#ffffff', pct: 70 },
      { hex: '#cccccc', pct: 30 },
    ]),
    0,
  );
  // chromatic ground: same-hue entries are family, not accents
  assert.equal(
    accentCountOf([
      { hex: '#ff0000', pct: 70 },
      { hex: '#ee1100', pct: 20 }, // hue ~4deg from ground
      { hex: '#0000ff', pct: 10 },
    ]),
    1,
  );
  assert.equal(accentCountOf([]), null);
});

// --- normalization & robust stats ---

test('normalizeScalar scales per axis and clamps', () => {
  assert.equal(normalizeScalar('contrast', 0.5), 1); // realizable max
  assert.equal(normalizeScalar('density', 0.3), 1); // clamped past practical max
  assert.equal(normalizeScalar('accentCount', 2), 0.5);
  assert.equal(normalizeScalar('chroma', null), null);
  assert.throws(() => normalizeScalar('nope', 0.1), /unknown axis/);
});

test('median handles odd and even n', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([1, 2, 3, 4]), 2.5);
  assert.equal(median([]), null);
});

test('madSpread collapses to 0 when 7 of 8 refs agree (outlier robustness)', () => {
  const values = [0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.9];
  assert.equal(madSpread(values), 0);
});

test('aggregateScalar: nulls lower confidence, identical values give salience 1', () => {
  const agg = aggregateScalar([0.4, 0.4, 0.4, null], 4);
  assert.equal(agg.n, 3);
  assert.equal(agg.confidence, 0.75);
  assert.equal(agg.center, 0.4);
  assert.equal(agg.spread, 0);
  assert.equal(agg.salience, 1);
});

test('aggregateScalar: n=0 and n=1 carry no salience', () => {
  assert.equal(aggregateScalar([null, null], 2).salience, 0);
  assert.equal(aggregateScalar([null, null], 2).confidence, 0);
  assert.equal(aggregateScalar([0.5, null], 2).salience, 0);
});

test('aggregateScalar: uniform-like spread maps salience toward 0', () => {
  // spread beyond the 0.371 reference clamps to salience 0
  const agg = aggregateScalar([0, 1, 0, 1, 0, 1], 6);
  assert.equal(agg.salience, 0);
});

// --- palette axis ---

test('aggregatePalette: coverage-weighted union, top-K, weights sum to ~1', () => {
  const pals = [
    [{ hex: '#ffffff', pct: 80 }, { hex: '#ff0000', pct: 20 }],
    [{ hex: '#ffffff', pct: 60 }, { hex: '#0000ff', pct: 40 }],
  ];
  const entries = aggregatePalette(pals);
  assert.equal(entries[0].hex, '#ffffff');
  const total = entries.reduce((a, e) => a + e.weight, 0);
  assert.ok(Math.abs(total - 1) < 0.01);
});

test('paletteDistance: subset of the board palette scores 0, alien color scores high', () => {
  const entries = [
    { hex: '#ffffff', weight: 0.7 },
    { hex: '#000000', weight: 0.3 },
  ];
  const subset = paletteDistance([{ hex: '#ffffff', pct: 100 }], entries);
  assert.equal(subset.d, 0);
  const alien = paletteDistance([{ hex: '#ff00ff', pct: 100 }], entries);
  assert.ok(alien.d > 0.5);
  assert.equal(paletteDistance([], entries), null);
});

test('paletteDistance clips per-color distance at 1 (deltaE past the normalizer)', () => {
  // magenta vs white is deltaE ~122 > DELTA_E_NORM, so the clip must hold d at exactly 1
  const res = paletteDistance([{ hex: '#ff00ff', pct: 100 }], [{ hex: '#ffffff', weight: 1 }]);
  assert.equal(res.d, 1);
});

test('coverage weighting: a genuine 0% palette entry carries zero weight', () => {
  // pct: 0 exists in real manifests (sub-rounding coverage); it must not be
  // promoted to weight 1 by a falsy-coalescing fallback
  assert.equal(chromaOf([{ hex: '#ffffff', pct: 99 }, { hex: '#ff0000', pct: 0 }]), 0);
  const entries = aggregatePalette([[{ hex: '#ffffff', pct: 99 }, { hex: '#ff0000', pct: 0 }]]);
  const red = entries.find((e) => e.hex === '#ff0000');
  assert.equal(red.weight, 0);
});

test('paletteSelfAgreement: identical palettes agree fully, n<2 is 0', () => {
  const pal = [{ hex: '#ffffff', pct: 100 }];
  assert.equal(paletteSelfAgreement([pal, pal, pal]), 1);
  assert.equal(paletteSelfAgreement([pal]), 0);
});

// --- tags axis ---

test('tagFreq counts across refs', () => {
  const freq = tagFreq([['a', 'b'], ['a'], ['a', 'c']]);
  assert.equal(freq.a, 1);
  assert.ok(Math.abs(freq.b - 1 / 3) < 0.001);
});

test('tagDistance: carrying every expected tag and nothing alien scores 0', () => {
  const freq = { 'swiss-index': 0.75, 'mono-meta': 0.63, 'low-density': 0.38 };
  const res = tagDistance(['swiss-index', 'mono-meta'], freq);
  assert.equal(res.d, 0);
  assert.equal(res.missing.length, 0);
  assert.equal(res.alien.length, 0);
});

test('tagDistance: missing expected tags cost proportionally to frequency', () => {
  const freq = { 'swiss-index': 1, 'mono-meta': 0.5 };
  const res = tagDistance(['mono-meta'], freq);
  assert.equal(res.missing.length, 1);
  assert.equal(res.missing[0].tag, 'swiss-index');
  // missing cost = 1/1.5; d = that / 2
  assert.ok(Math.abs(res.d - 1 / 3) < 0.001);
});

test('tagDistance: an alien tag the board never uses costs the full alien share', () => {
  const freq = { 'swiss-index': 1 };
  const res = tagDistance(['swiss-index', '3d-playful'], freq);
  assert.equal(res.alien.length, 1);
  assert.equal(res.d, 0.5); // missing 0, alien 1 -> (0+1)/2
});

test('tagDistance: mid-frequency tags are free in both directions', () => {
  const freq = { 'swiss-index': 1, 'editorial-serif': 0.4 };
  assert.equal(tagDistance(['swiss-index'], freq).d, 0);
  assert.equal(tagDistance(['swiss-index', 'editorial-serif'], freq).d, 0);
});

test('tagDistance: empty expected set means no missing cost', () => {
  const res = tagDistance(['anything'], { rare: 0.2 });
  assert.equal(res.missing.length, 0);
  assert.ok(res.d > 0); // but 'anything' is alien
});

test('tagSelfAgreement: identical tag sets agree fully', () => {
  assert.equal(tagSelfAgreement([['a', 'b'], ['a', 'b'], ['a', 'b']]), 1);
  assert.equal(tagSelfAgreement([['a']]), 0);
});

// --- scope aggregation & fingerprint assembly ---

function syntheticManifest() {
  const mk = (id, hex, contrast, tags, channels) => ({
    id,
    file: `${id}.png`,
    title: id,
    source: { local: `boards/x/${id}.png` },
    measured: {
      w: 1440,
      h: 1200,
      aspect: 1.2,
      palette: [
        { hex, pct: 80 },
        { hex: '#ff3300', pct: 20 },
      ],
      contrast,
      density: 0.02,
    },
    tags,
    channels,
    notes: {},
  });
  return {
    board: 'x',
    kind: 'visual-ui',
    generated: '2026-01-01T00:00:00.000Z',
    items: [
      mk('w001', '#ffffff', 0.1, ['swiss-index', 'low-density'], ['swiss-index']),
      mk('w002', '#f5f5f5', 0.12, ['swiss-index', 'mono-meta'], ['swiss-index', 'mono-meta']),
      mk('w003', '#111111', 0.3, ['dark-field'], ['dark-editorial']),
    ],
  };
}

test('buildFingerprint: refs table + all seven axes, exclude works', () => {
  const fp = buildFingerprint(syntheticManifest());
  assert.deepEqual(Object.keys(fp.refs), ['w001', 'w002', 'w003']);
  assert.deepEqual(
    Object.keys(fp.axes).sort(),
    ['accentCount', 'chroma', 'contrast', 'density', 'groundLightness', 'palette', 'tags'],
  );
  assert.equal(fp.axes.contrast.n, 3);
  const loo = buildFingerprint(syntheticManifest(), { exclude: ['w003'] });
  assert.deepEqual(Object.keys(loo.refs), ['w001', 'w002']);
  assert.equal(loo.axes.tags.freq['dark-field'], undefined);
});

test('scopeRefIds: union of member refs across channels', () => {
  const fp = buildFingerprint(syntheticManifest());
  assert.deepEqual(scopeRefIds(fp.refs, ['swiss-index', 'mono-meta']), ['w001', 'w002']);
  assert.deepEqual(scopeRefIds(fp.refs, ['dark-editorial']), ['w003']);
});

test('medianAspect reads ref aspect metadata', () => {
  const fp = buildFingerprint(syntheticManifest());
  assert.equal(medianAspect(fp.refs, ['w001', 'w002']), 1.2);
});

test('aggregateAxes on a subset differs from the board aggregate', () => {
  const fp = buildFingerprint(syntheticManifest());
  const scoped = aggregateAxes(fp.refs, ['w001', 'w002']);
  assert.ok(scoped.tags.freq['swiss-index'] === 1);
  assert.ok(fp.axes.tags.freq['swiss-index'] < 1);
});

test('aggregateAxes wires set-axis salience to leave-one-out self-agreement', () => {
  const fp = buildFingerprint(syntheticManifest());
  const ids = Object.keys(fp.refs);
  const refs = ids.map((id) => fp.refs[id]);
  const axes = aggregateAxes(fp.refs, ids);
  assert.equal(axes.palette.salience, paletteSelfAgreement(refs.map((r) => r.palette)));
  assert.equal(axes.tags.salience, tagSelfAgreement(refs.map((r) => r.tags)));
  assert.equal(axes.palette.salience, axes.palette.selfAgreement);
});

test('an untagged ref lowers tags confidence without deflating frequencies', () => {
  const m = syntheticManifest();
  m.items.push({
    id: 'w004',
    file: 'w004.png',
    title: 'w004',
    source: { local: 'boards/x/w004.png' },
    measured: m.items[0].measured,
    tags: [], // tag pass failed for this ref
    channels: ['swiss-index'],
    notes: {},
  });
  const fp = buildFingerprint(m);
  // swiss-index is in 2 of the 3 TAGGED refs, not 2 of 4
  assert.ok(Math.abs(fp.axes.tags.freq['swiss-index'] - 2 / 3) < 0.001);
  assert.equal(fp.axes.tags.confidence, 0.75);
  assert.equal(fp.axes.tags.n, 3);
});

test('canonicalStringify is stable across key order', () => {
  assert.equal(canonicalStringify({ b: 1, a: [{ y: 2, x: 1 }] }), canonicalStringify({ a: [{ x: 1, y: 2 }], b: 1 }));
});

test('fingerprintCanonical ignores version/generated/source/hash', () => {
  const fp = buildFingerprint(syntheticManifest());
  const a = fingerprintCanonical({ ...fp, version: 1, generated: 'now', hash: 'x', source: { manifestStamp: 't1' } });
  const b = fingerprintCanonical({ ...fp, version: 9, generated: 'later', hash: 'y', source: { manifestStamp: 't2' } });
  assert.equal(a, b);
});

// --- distance & alignment ---

test('scalarDistance matches the design doc worked example', () => {
  const res = scalarDistance(0.27, { center: 0.6, spread: 0.16 });
  assert.equal(res.delta, -0.33);
  assert.equal(res.d, 1); // min(1, 0.33/0.32)
});

test('scalarDistance applies the spread floor', () => {
  // spread 0.02 -> denominator uses the 0.05 floor: 0.01 / 0.1 = 0.1
  const res = scalarDistance(0.06, { center: 0.05, spread: 0.02 });
  assert.equal(res.d, 0.1);
});

test('scalarDistance handles nulls', () => {
  assert.equal(scalarDistance(null, { center: 0.5, spread: 0.1 }), null);
  assert.equal(scalarDistance(0.5, { center: null, spread: null }), null);
});

test('alignmentScore: weighted mean, degenerate zero-weight scope is null', () => {
  const rows = [
    { distance: 0, weight: 1 },
    { distance: 1, weight: 1 },
  ];
  assert.equal(alignmentScore(rows), 50);
  assert.equal(alignmentScore([{ distance: 0.5, weight: 0 }]), null);
  assert.equal(alignmentScore([]), null);
});

test('contributions sum to 1 and reflect weighted distance shares', () => {
  const rows = [
    { id: 'a', distance: 0.5, weight: 1 },
    { id: 'b', distance: 0.5, weight: 1 },
    { id: 'c', distance: 0, weight: 1 },
  ];
  const c = contributions(rows);
  assert.equal(c.a, 0.5);
  assert.equal(c.b, 0.5);
  assert.equal(c.c, 0);
});

test('frozen constants are what the design doc registered (moving one voids the demo)', () => {
  assert.deepEqual(CONSTANTS.AXIS_SCALE, {
    contrast: 0.5,
    density: 0.15,
    chroma: 1,
    groundLightness: 1,
    accentCount: 4,
  });
  assert.equal(CONSTANTS.SPREAD_FLOOR, 0.05);
  assert.equal(CONSTANTS.DISTANCE_SPREADS, 2);
  assert.equal(CONSTANTS.SALIENCE_REF_SPREAD, 0.371);
  assert.equal(CONSTANTS.DELTA_E_NORM, 100);
  assert.equal(CONSTANTS.TAG_EXPECTED_FREQ, 0.5);
  assert.equal(CONSTANTS.TAG_ALIEN_FREQ, 0.25);
  assert.equal(CONSTANTS.ACCENT_SATURATION, 0.25);
  assert.equal(CONSTANTS.ACCENT_HUE_DELTA, 30);
  assert.equal(CONSTANTS.PALETTE_TOP_K, 8);
});
