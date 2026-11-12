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
  dualVerdict,
  flooredAxes,
  gateLines,
  loadClassManifests,
  pooledSpreads,
  runHarness,
  separationGate,
  tagsAblatedGate,
  BARS,
  GATE_LABEL,
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

test('runHarness: every gate carries dual-bar verdicts and its registered bar values for report.json', () => {
  const report = runHarness(fixtureSpec(), fixtureManifests());
  for (const key of ['separation', 'tagsAblated', 'degeneracy', 'characterization']) {
    const g = report.gates[key];
    assert.equal(typeof g.passOriginal, 'boolean');
    assert.equal(typeof g.passAmended, 'boolean');
    assert.ok(g.bars, `${key} gate records its bar values`);
    assert.equal(g.pass, g.passAmended, `${key} gate is judged on the amended bar`);
  }
  assert.deepEqual(report.gates.separation.bars, BARS.separation);
  assert.equal(report.gates.separation.bars.amended.overall, 0.75);
  assert.equal(report.gates.separation.bars.original.overall, 0.8);
  assert.equal(report.gates.tagsAblated.bars.amended, 0.5);
  assert.equal(report.gates.tagsAblated.bars.original, 0.6);
  // Gate 3 is single-bar: the two verdicts always coincide.
  assert.equal(report.gates.degeneracy.passOriginal, report.gates.degeneracy.passAmended);
});

test('separationGate: 76.7% overall / 50% min class passes amended, would fail original', () => {
  const g = separationGate(23 / 30, 0.5, true, 'n/a');
  assert.equal(g.passAmended, true);
  assert.equal(g.passOriginal, false);
  assert.equal(g.pass, true); // judged on the amended bar
  const both = separationGate(0.9, 0.8, true, 'n/a');
  assert.equal(both.passOriginal, true);
  assert.equal(both.passAmended, true);
  assert.equal(separationGate(0.7, 0.5, true, 'n/a').passAmended, false); // overall below both
  const lowClass = separationGate(0.9, 0.45, true, 'n/a'); // min class below even the amended 50%
  assert.equal(lowClass.passAmended, false);
  assert.equal(lowClass.passOriginal, false);
});

test('separationGate: strand mutual confusion rule is single-bar and binds BOTH verdicts', () => {
  const g = separationGate(0.95, 0.9, false, { 'brutalism-minimal->brutalism-maximal': 0.6 });
  assert.equal(g.passOriginal, false);
  assert.equal(g.passAmended, false);
  assert.equal(g.pass, false);
});

test('tagsAblatedGate: 53.3% passes amended and would fail original; 60% both; 45% neither', () => {
  const mid = tagsAblatedGate(16 / 30, 0.2);
  assert.equal(mid.passAmended, true);
  assert.equal(mid.passOriginal, false);
  assert.equal(mid.pass, true);
  const both = tagsAblatedGate(0.6, 0.2);
  assert.equal(both.passOriginal, true);
  assert.equal(both.passAmended, true);
  const low = tagsAblatedGate(0.45, 0.2);
  assert.equal(low.passAmended, false);
  assert.equal(low.passOriginal, false);
});

test('dualVerdict: prints both verdicts in every combination', () => {
  assert.equal(dualVerdict(true, true, 'A', 'O'), 'PASS both bars (amended A; original O)');
  assert.equal(
    dualVerdict(true, false, '>=75%/50%', '>=80%/60%'),
    'PASS amended (>=75%/50%); would FAIL original (>=80%/60%)',
  );
  assert.equal(dualVerdict(false, false, 'A', 'O'), 'FAIL both bars (amended A; original O)');
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

test('checkInstrument: a knife-edge tag miss is exactly one exemplar short of the detection threshold', () => {
  const refs = (tagsList) => tagsList.map((tags) => ({ tags }));
  const threeOfSix = checkInstrument({ type: 'tag', id: 'x' }, refs([['x'], ['x'], ['x'], [], [], []]), 0.667);
  assert.equal(threeOfSix.pass, false);
  assert.equal(threeOfSix.required, 4); // 4/6 -> 0.667 clears the threshold
  assert.equal(threeOfSix.knifeEdge, true);
  const twoOfSix = checkInstrument({ type: 'tag', id: 'x' }, refs([['x'], ['x'], [], [], [], []]), 0.667);
  assert.equal(twoOfSix.knifeEdge, false); // two short: an ordinary miss
  const oneOfThree = checkInstrument({ type: 'tag', id: 'x' }, refs([['x'], [], []]), 0.667);
  assert.equal(oneOfThree.required, 2); // 2/3 required
  assert.equal(oneOfThree.knifeEdge, true);
  const fourOfSix = checkInstrument({ type: 'tag', id: 'x' }, refs([['x'], ['x'], ['x'], ['x'], [], []]), 0.667);
  assert.equal(fourOfSix.pass, true);
  assert.equal(fourOfSix.knifeEdge, false); // a pass is never a knife-edge miss
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

// Six-exemplar class where tag `edge` sits at 3/6 (one short of the 4/6
// detection threshold): the canonical knife-edge miss.
function knifeEdgeRefs() {
  return {
    w1: { tags: ['grid', 'edge'] },
    w2: { tags: ['grid', 'edge'] },
    w3: { tags: ['grid', 'edge'] },
    w4: { tags: ['grid'] },
    w5: { tags: ['grid'] },
    w6: { tags: ['grid'] },
  };
}

test('characterization: exactly one knife-edge tag miss passes amended, fails original, and names the tolerated miss', () => {
  const fps = { a: { refs: knifeEdgeRefs() } };
  const spec = {
    tagDetectionThreshold: 0.667,
    classes: {
      a: {
        defining: [
          { determinant: 'grid', instrument: { type: 'tag', id: 'grid' } }, // 6/6 pass
          { determinant: 'edge-case', instrument: { type: 'tag', id: 'edge' } }, // 3/6 vs 4/6: knife-edge miss
        ],
      },
    },
  };
  const res = characterization(spec, fps);
  assert.equal(res.passOriginal, false);
  assert.equal(res.passAmended, true);
  assert.equal(res.pass, true); // judged on the amended bar
  assert.equal(res.misses.length, 1);
  assert.equal(res.toleratedMiss.class, 'a');
  assert.equal(res.toleratedMiss.determinant, 'edge-case');
  assert.equal(res.toleratedMiss.knifeEdge, true);
  assert.equal(res.toleratedMiss.count, 3);
  assert.equal(res.toleratedMiss.required, 4);
});

test('characterization: two knife-edge misses (even across classes) fail the amended bar', () => {
  const fps = { a: { refs: knifeEdgeRefs() }, b: { refs: knifeEdgeRefs() } };
  const det = [{ determinant: 'edge-case', instrument: { type: 'tag', id: 'edge' } }];
  const spec = { tagDetectionThreshold: 0.667, classes: { a: { defining: det }, b: { defining: det } } };
  const res = characterization(spec, fps);
  assert.equal(res.misses.length, 2);
  assert.ok(res.misses.every((m) => m.knifeEdge));
  assert.equal(res.passAmended, false);
  assert.equal(res.pass, false);
  assert.equal(res.toleratedMiss, null);
});

test('characterization: a single non-knife-edge miss fails both bars (no tolerance for ordinary misses)', () => {
  const fps = { a: { refs: { w1: { tags: [], contrast: 0.3 }, w2: { tags: [], contrast: 0.3 } } } };
  const scalarSpec = {
    tagDetectionThreshold: 0.667,
    classes: {
      a: { defining: [{ determinant: 'calm', instrument: { type: 'scalar', id: 'contrast', range: [0.05, 0.15] } }] },
    },
  };
  const scalarRes = characterization(scalarSpec, fps);
  assert.equal(scalarRes.passOriginal, false);
  assert.equal(scalarRes.passAmended, false); // a scalar miss is never knife-edge
  const tagSpec = {
    tagDetectionThreshold: 0.667,
    classes: { a: { defining: [{ determinant: 'ghost', instrument: { type: 'tag', id: 'nope' } }] } },
  };
  const tagRes = characterization(tagSpec, fps); // 0/2 vs 2/2 required: two short
  assert.equal(tagRes.passAmended, false);
});

test('characterization: a knife-edge miss alongside an ordinary miss still fails amended', () => {
  const fps = { a: { refs: knifeEdgeRefs() } };
  const spec = {
    tagDetectionThreshold: 0.667,
    classes: {
      a: {
        defining: [
          { determinant: 'edge-case', instrument: { type: 'tag', id: 'edge' } }, // knife-edge miss
          { determinant: 'ghost', instrument: { type: 'tag', id: 'nope' } }, // ordinary miss
        ],
      },
    },
  };
  const res = characterization(spec, fps);
  assert.equal(res.misses.length, 2);
  assert.equal(res.passAmended, false);
});

test('gateLines: every gate line prints both verdicts under the gate label; tolerated miss carries class + determinant', () => {
  const gates = {
    separation: separationGate(23 / 30, 0.5, true, 'n/a (brutalism strand pair not registered)'),
    tagsAblated: tagsAblatedGate(16 / 30, 0.2),
    degeneracy: {
      label: 'degeneracy',
      pass: true,
      passOriginal: true,
      passAmended: true,
      bars: BARS.degeneracy,
      fraction: 0.1,
      totalCells: 30,
      cellsBelowFloor: [{}, {}, {}],
      clippedScalarDs: 0,
    },
    characterization: {
      label: 'characterization',
      pass: true,
      passOriginal: false,
      passAmended: true,
      toleratedMiss: { class: 'beta', determinant: 'dark', type: 'tag', id: 'dark-b', count: 3, n: 6, required: 4, knifeEdge: true },
      classes: { alpha: { passed: 2, checkable: 2 }, beta: { passed: 1, checkable: 2 } },
    },
  };
  const lines = gateLines(gates);
  assert.equal(lines.length, 4);
  for (const line of lines) assert.ok(line.startsWith(GATE_LABEL));
  assert.match(lines[0], /PASS amended \(>=75% overall \/ >=50% per class\); would FAIL original \(>=80% overall \/ >=60% per class\)/);
  assert.match(lines[0], /overall 76\.7%, min class 50\.0%/);
  assert.match(lines[1], /PASS amended \(>=50%\); would FAIL original \(>=60%\)/);
  assert.match(lines[2], /single bar, unchanged/);
  assert.match(lines[3], /tolerated knife-edge miss: class beta, determinant dark/);
  assert.match(lines[3], /3\/6 observed vs 4\/6 required/);

  // A clean run prints PASS both bars and no tolerated miss.
  const clean = gateLines({
    ...gates,
    separation: separationGate(1, 1, true, 'n/a'),
    tagsAblated: tagsAblatedGate(1, 0.2),
    characterization: { ...gates.characterization, passOriginal: true, toleratedMiss: null },
  });
  assert.match(clean[0], /PASS both bars/);
  assert.match(clean[3], /PASS both bars/);
  assert.ok(!clean[3].includes('tolerated'));
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
