// validate.test.mjs: run with node --test
// Pure mechanics of the v2 style validation harness on synthetic fixtures:
// leave-one-out confusion assembly, tie handling, pooled-spread flooring,
// degeneracy counting, characterization checks, tags ablation. No network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  argmaxPredict,
  buildConfusion,
  characterization,
  checkInstrument,
  degeneracyCells,
  dropTagsRow,
  flooredAxes,
  loadClassManifests,
  pooledSpreads,
  runHarness,
  HEADER,
} from './validate.mjs';
import { buildFingerprint, CONSTANTS } from './features.mjs';
import { buildRows } from './score.mjs';

function mkItem(id, { contrast, density, palette, accentCoverage, accentHueCount, tags }) {
  return {
    id,
    file: `${id}.png`,
    title: id,
    source: { local: `boards/v/${id}.png` },
    measured: { w: 1440, h: 1200, aspect: 1.2, palette, contrast, density, accentCoverage, accentHueCount },
    tags,
    channels: [],
    notes: {},
  };
}

function mkManifest(board, items) {
  return { board, kind: 'visual-ui', generated: 't', items };
}

// Three obviously separable classes, three exemplars each. accentCoverage is
// identical across ALL exemplars (class spread 0, pooled 0) to exercise the
// drop-with-notice path; accentHueCount is identical WITHIN each class but
// differs across classes to exercise the pooled floor path.
function fixtureManifests() {
  const alphaPal = [{ hex: '#ffffff', pct: 92 }, { hex: '#111111', pct: 8 }];
  const betaPal = [{ hex: '#000000', pct: 80 }, { hex: '#ff2200', pct: 20 }];
  const gammaPal = [{ hex: '#ff66cc', pct: 50 }, { hex: '#66ffcc', pct: 30 }, { hex: '#ffee00', pct: 20 }];
  const alpha = mkManifest('alpha', [
    mkItem('a1', { contrast: 0.1, density: 0.01, palette: alphaPal, accentCoverage: 0.1, accentHueCount: 0, tags: ['grid-a', 'sans-a'] }),
    mkItem('a2', { contrast: 0.11, density: 0.012, palette: alphaPal, accentCoverage: 0.1, accentHueCount: 0, tags: ['grid-a', 'sans-a'] }),
    mkItem('a3', { contrast: 0.12, density: 0.014, palette: alphaPal, accentCoverage: 0.1, accentHueCount: 0, tags: ['grid-a', 'sans-a'] }),
  ]);
  const beta = mkManifest('beta', [
    mkItem('b1', { contrast: 0.4, density: 0.06, palette: betaPal, accentCoverage: 0.1, accentHueCount: 1, tags: ['dark-b', 'rule-b'] }),
    mkItem('b2', { contrast: 0.42, density: 0.065, palette: betaPal, accentCoverage: 0.1, accentHueCount: 1, tags: ['dark-b', 'rule-b'] }),
    mkItem('b3', { contrast: 0.44, density: 0.07, palette: betaPal, accentCoverage: 0.1, accentHueCount: 1, tags: ['dark-b', 'rule-b'] }),
  ]);
  const gamma = mkManifest('gamma', [
    mkItem('g1', { contrast: 0.25, density: 0.1, palette: gammaPal, accentCoverage: 0.1, accentHueCount: 3, tags: ['squiggle-c', 'scatter-c'] }),
    mkItem('g2', { contrast: 0.26, density: 0.11, palette: gammaPal, accentCoverage: 0.1, accentHueCount: 3, tags: ['squiggle-c', 'scatter-c'] }),
    mkItem('g3', { contrast: 0.27, density: 0.12, palette: gammaPal, accentCoverage: 0.1, accentHueCount: 3, tags: ['squiggle-c', 'scatter-c'] }),
  ]);
  return { alpha, beta, gamma };
}

function fixtureSpec() {
  return {
    tagDetectionThreshold: 0.667,
    classes: {
      alpha: {
        exemplarDir: 'boards/validation-t1/alpha',
        defining: [
          { determinant: 'grid', instrument: { type: 'tag', id: 'grid-a' } },
          { determinant: 'calm-contrast', instrument: { type: 'scalar', id: 'contrast', range: [0.05, 0.15] } },
        ],
      },
      beta: {
        exemplarDir: 'boards/validation-t1/beta',
        defining: [
          { determinant: 'dark', instrument: { type: 'tag', id: 'dark-b' } },
          { determinant: 'hot-contrast', instrument: { type: 'scalar', id: 'contrast', range: [0.35, 0.5] } },
        ],
      },
      gamma: {
        exemplarDir: 'boards/validation-t1/gamma',
        defining: [
          { determinant: 'squiggle', instrument: { type: 'tag', id: 'squiggle-c' } },
          { determinant: 'many-hues', instrument: { type: 'scalar', id: 'accentHueCount', range: [2, 8] } },
        ],
      },
    },
  };
}

test('runHarness: separable 3-class fixture classifies 100% own-class, full and tags-ablated', () => {
  const report = runHarness(fixtureSpec(), fixtureManifests());
  assert.equal(report.header, HEADER);
  assert.equal(report.predictions.length, 9);
  assert.equal(report.matrices.full.overall, 1);
  assert.equal(report.matrices.ablated.overall, 1);
  for (const c of report.classIds) {
    assert.equal(report.matrices.full.perClass[c].accuracy, 1);
    assert.equal(report.matrices.full.matrix[c][c], 3);
  }
  assert.equal(report.gates.separation.pass, true);
  assert.equal(report.gates.separation.pairConfusion, 'n/a (brutalism strand pair not registered)');
  assert.equal(report.gates.tagsAblated.pass, true);
  assert.equal(report.gates.characterization.pass, true);
});

test('runHarness: zero-spread axis with zero pooled spread drops with a notice, never d=1.00', () => {
  const report = runHarness(fixtureSpec(), fixtureManifests());
  // accentCoverage is identical everywhere: pooled 0, every class spread 0.
  assert.ok(report.notices.some((n) => n.includes('accentCoverage') && n.includes('never a constant d=1.00')));
  assert.ok(report.perAxis.accentCoverage.dropped > 0);
  assert.equal(report.perAxis.accentCoverage.own.n, 0);
  assert.equal(report.perAxis.accentCoverage.cross.n, 0);
});

test('runHarness: per-axis d distributions separate own from cross rulers', () => {
  const report = runHarness(fixtureSpec(), fixtureManifests());
  assert.ok(report.perAxis.contrast.own.median < report.perAxis.contrast.cross.median);
  assert.ok(report.perAxis.tags.own.median < report.perAxis.tags.cross.median);
});

test('runHarness: degeneracy counts (scalar axis, class) cells with raw pre-floor spread below the floor', () => {
  const report = runHarness(fixtureSpec(), fixtureManifests());
  // 3 classes x 6 axes = 18 cells; only beta's contrast spread (0.0593) and
  // gamma's density spread (0.0989) clear the 0.05 floor in this
  // deliberately tight fixture.
  assert.equal(report.gates.degeneracy.totalCells, 18);
  assert.equal(report.gates.degeneracy.cellsBelowFloor.length, 16);
  assert.equal(report.gates.degeneracy.pass, false);
  assert.ok(Math.abs(report.gates.degeneracy.fraction - 16 / 18) < 1e-9);
  assert.ok(report.gates.degeneracy.clippedScalarDs >= 0);
});

test('argmaxPredict: a shared maximum is a tie (misclassification); all-null predicts nothing', () => {
  assert.deepEqual(argmaxPredict({ a: 50, b: 50, c: 10 }), { predicted: null, tie: true });
  assert.deepEqual(argmaxPredict({ a: 60, b: 50 }), { predicted: 'a', tie: false });
  assert.deepEqual(argmaxPredict({ a: null, b: null }), { predicted: null, tie: false });
});

test('buildConfusion: ties count against accuracy and land in their own cell', () => {
  const records = [
    { actual: 'a', predicted: 'a', tie: false },
    { actual: 'a', predicted: null, tie: true },
    { actual: 'b', predicted: 'a', tie: false },
    { actual: 'b', predicted: 'b', tie: false },
  ];
  const conf = buildConfusion(records, ['a', 'b']);
  assert.equal(conf.overall, 0.5);
  assert.equal(conf.matrix.a.tie, 1);
  assert.equal(conf.matrix.b.a, 1);
  assert.equal(conf.perClass.a.accuracy, 0.5);
});

// Fixture for the flooring unit tests: contrast has spread exactly 0, every
// other axis varies.
function zeroSpreadFingerprint() {
  return buildFingerprint(
    mkManifest('z', [
      mkItem('i1', { contrast: 0.1, density: 0.01, palette: [{ hex: '#ffffff', pct: 60 }, { hex: '#ff0000', pct: 40 }], accentCoverage: 0.1, accentHueCount: 1, tags: ['t'] }),
      mkItem('i2', { contrast: 0.1, density: 0.02, palette: [{ hex: '#eeeeee', pct: 80 }, { hex: '#00ff00', pct: 20 }], accentCoverage: 0.2, accentHueCount: 2, tags: ['t'] }),
      mkItem('i3', { contrast: 0.1, density: 0.03, palette: [{ hex: '#dddddd', pct: 70 }, { hex: '#0000ff', pct: 30 }], accentCoverage: 0.3, accentHueCount: 3, tags: ['t'] }),
    ]),
  );
}

test('flooredAxes: a zero-spread class axis gets the pooled floor and yields d < 1', () => {
  const fp = zeroSpreadFingerprint();
  assert.equal(fp.axes.contrast.spread, 0);
  const floored = flooredAxes(fp.axes, { contrast: 0.15 });
  assert.deepEqual(floored.dropped, []);
  assert.equal(floored.axes.contrast.spread, 0.15);
  assert.equal(floored.axes.contrast.rawSpread, 0);

  // Output 0.16 raw (norm 0.32) vs center 0.2: pre-floor the denominator is
  // 2 x SPREAD_FLOOR = 0.1 and the distance clips at 1.00; the pooled floor
  // widens it to 0.3 and d = 0.12 / 0.3 = 0.4.
  const features = { ...fp.refs.i1, contrast: 0.16 };
  const rawRow = buildRows(features, fp.axes).find((r) => r.id === 'contrast');
  assert.equal(rawRow.distance, 1);
  const flooredRow = buildRows(features, floored.axes).find((r) => r.id === 'contrast');
  assert.equal(flooredRow.distance, 0.4);
  assert.ok(flooredRow.distance < 1);
});

test('flooredAxes: class spread 0 AND pooled 0 drops the axis with a notice', () => {
  const fp = zeroSpreadFingerprint();
  const floored = flooredAxes(fp.axes, { contrast: 0 });
  assert.deepEqual(floored.dropped, ['contrast']);
  assert.equal(floored.notices.length, 1);
  assert.match(floored.notices[0], /contrast/);
  assert.match(floored.notices[0], /never a constant d=1\.00/);
});

test('pooledSpreads: pools normalized values across every exemplar of every class', () => {
  const { alpha, beta, gamma } = fixtureManifests();
  const pooled = pooledSpreads([buildFingerprint(alpha), buildFingerprint(beta), buildFingerprint(gamma)]);
  assert.equal(pooled.accentCoverage, 0); // identical everywhere
  assert.ok(pooled.contrast > CONSTANTS.SPREAD_FLOOR); // classes far apart
  assert.ok(pooled.accentHueCount > 0); // identical within class, spread across
});

test('degeneracyCells: counts below-floor and missing spreads per (axis, class) cell', () => {
  const axes = (spreads) => {
    const out = {};
    for (const [axis, spread] of Object.entries(spreads)) out[axis] = { spread };
    return out;
  };
  const fps = {
    a: { axes: axes({ contrast: 0.01, density: 0.2, chroma: 0.1, groundLightness: 0.1, accentCoverage: 0.1, accentHueCount: 0.1 }) },
    b: { axes: axes({ contrast: 0.2, density: 0.049, chroma: 0.1, groundLightness: 0.1, accentCoverage: 0.1, accentHueCount: 0.1 }) },
  };
  const deg = degeneracyCells(fps);
  assert.equal(deg.cells.length, 12);
  assert.equal(deg.below.length, 2);
  assert.deepEqual(
    deg.below.map((c) => `${c.class}/${c.axis}`),
    ['a/contrast', 'b/density'],
  );
  assert.ok(Math.abs(deg.fraction - 2 / 12) < 1e-9);
});

test('checkInstrument: tag threshold at the registered 2/3 knife edge (4/6 passes at 0.667)', () => {
  const refs = (tagsList) => tagsList.map((tags) => ({ tags }));
  const six = refs([['x'], ['x'], ['x'], ['x'], [], []]);
  const pass = checkInstrument({ type: 'tag', id: 'x' }, six, 0.667);
  assert.equal(pass.observed, 0.6667);
  assert.equal(pass.pass, true);
  const three = refs([['x'], [], []]);
  assert.equal(checkInstrument({ type: 'tag', id: 'x' }, three, 0.667).pass, false);
});

test('checkInstrument: scalar uses the class median of RAW values, range inclusive', () => {
  const refs = [{ contrast: 0.1 }, { contrast: 0.12 }, { contrast: 0.3 }];
  const onEdge = checkInstrument({ type: 'scalar', id: 'contrast', range: [0.05, 0.12] }, refs, 0.667);
  assert.equal(onEdge.observed, 0.12);
  assert.equal(onEdge.pass, true);
  const outside = checkInstrument({ type: 'scalar', id: 'contrast', range: [0.4, 0.9] }, refs, 0.667);
  assert.equal(outside.pass, false);
});

test('characterization: gates on checkable determinants only, excludes no-instrument ones ex ante', () => {
  const fps = {
    a: {
      refs: {
        w1: { tags: ['grid'], contrast: 0.1 },
        w2: { tags: ['grid'], contrast: 0.12 },
        w3: { tags: [], contrast: 0.3 },
      },
    },
  };
  const spec = {
    tagDetectionThreshold: 0.667,
    classes: {
      a: {
        defining: [
          { determinant: 'grid', instrument: { type: 'tag', id: 'grid' } }, // 2/3 -> 0.6667 pass
          { determinant: 'calm', instrument: { type: 'scalar', id: 'contrast', range: [0.05, 0.12] } }, // median 0.12 pass
          { determinant: 'ghost', instrument: { type: 'tag', id: 'nope' } }, // 0/3 fail
          { determinant: 'hot', instrument: { type: 'scalar', id: 'contrast', range: [0.4, 0.9] } }, // fail
          { determinant: 'true-grid-geometry' }, // no instrument: excluded ex ante
        ],
      },
    },
  };
  const res = characterization(spec, fps);
  assert.equal(res.pass, false);
  assert.equal(res.classes.a.checkable, 4);
  assert.equal(res.classes.a.passed, 2);
  assert.deepEqual(res.classes.a.excluded, ['true-grid-geometry']);
  const byDet = Object.fromEntries(res.classes.a.rows.map((r) => [r.determinant, r]));
  assert.equal(byDet.grid.pass, true);
  assert.equal(byDet.calm.pass, true);
  assert.equal(byDet.ghost.pass, false);
  assert.equal(byDet.hot.pass, false);
  assert.equal(byDet['true-grid-geometry'].excluded, true);
});

test('characterization: a secondary instrument is reported but never gates', () => {
  const fps = { a: { refs: { w1: { tags: ['x'], accentHueCount: 9 }, w2: { tags: ['x'], accentHueCount: 9 } } } };
  const spec = {
    tagDetectionThreshold: 0.667,
    classes: {
      a: {
        defining: [
          {
            determinant: 'primary-triad',
            instrument: { type: 'tag', id: 'x' },
            secondary: { type: 'scalar', id: 'accentHueCount', range: [1, 3] },
          },
        ],
      },
    },
  };
  const res = characterization(spec, fps);
  assert.equal(res.pass, true); // primary passes; failing secondary does not gate
  assert.equal(res.classes.a.rows[0].secondary.pass, false);
});

test('dropTagsRow: tags-ablated scoring removes exactly the tags row', () => {
  const fp = buildFingerprint(fixtureManifests().alpha);
  const rows = buildRows(fp.refs.a1, fp.axes);
  const ablated = dropTagsRow(rows);
  assert.equal(rows.length, 8);
  assert.equal(ablated.length, 7);
  assert.ok(!ablated.some((r) => r.id === 'tags'));
  assert.ok(ablated.some((r) => r.id === 'palette'));
});

test('loadClassManifests: a class dir with no manifest fails with a clear message', () => {
  const spec = { classes: { ghost: { exemplarDir: 'boards/validation-t1/ghost-class-that-does-not-exist' } } };
  assert.throws(() => loadClassManifests(spec), /No manifest for class "ghost"/);
  assert.throws(() => loadClassManifests(spec), /npm run import/);
});
