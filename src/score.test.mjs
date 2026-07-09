// score.test.mjs — run: node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRows, cropGeometry, fingerprintCandidates, majorityTags, resolveScope } from './score.mjs';
import { aggregateAxes, alignmentScore, buildFingerprint } from './features.mjs';

const directionsDoc = {
  directions: {
    'swiss-mono-index': { name: 'Swiss Mono Index', channels: ['swiss-index', 'mono-meta'] },
  },
};

test('resolveScope precedence: --scope board > --channels > --direction > meta', () => {
  assert.deepEqual(resolveScope({ scope: 'board' }, { channels: ['x'] }, directionsDoc), {
    type: 'board',
    channels: null,
  });
  assert.deepEqual(resolveScope({ channels: ['a', 'b'] }, { channels: ['x'] }, directionsDoc).channels, ['a', 'b']);
  assert.deepEqual(resolveScope({ direction: 'swiss-mono-index' }, null, directionsDoc).channels, [
    'swiss-index',
    'mono-meta',
  ]);
  assert.deepEqual(resolveScope({}, { channels: ['swiss-index'] }, directionsDoc).channels, ['swiss-index']);
  assert.deepEqual(resolveScope({}, null, directionsDoc), { type: 'board', channels: null });
});

test('resolveScope throws on an unknown direction', () => {
  assert.throws(() => resolveScope({ direction: 'nope' }, null, directionsDoc), /Unknown direction/);
});

test('cropGeometry: tall capture is top-cropped to the scope aspect', () => {
  // 1440x3600 shot, scope median aspect 1.2 -> 1440x1200 top crop
  assert.deepEqual(cropGeometry(1440, 3600, 1.2), { width: 1440, height: 1200, cropped: true });
});

test('cropGeometry: shots already at or shorter than the target stay uncropped', () => {
  assert.deepEqual(cropGeometry(1440, 1200, 1.2), { width: 1440, height: 1200, cropped: false });
  assert.deepEqual(cropGeometry(1440, 900, 1.2), { width: 1440, height: 900, cropped: false });
  assert.deepEqual(cropGeometry(1440, 3600, null), { width: 1440, height: 3600, cropped: false });
});

test('fingerprintCandidates: vN pads to the version file, paths get three fallbacks', () => {
  assert.deepEqual(fingerprintCandidates('v3', '/b'), ['/b/fingerprints/v003.json']);
  assert.deepEqual(fingerprintCandidates('v12', '/b'), ['/b/fingerprints/v012.json']);
  assert.deepEqual(fingerprintCandidates('experiments/exclude-w004.json', '/b'), [
    'experiments/exclude-w004.json',
    '/b/experiments/exclude-w004.json',
    '/b/fingerprints/experiments/exclude-w004.json',
  ]);
});

test('majorityTags: 2-of-3 majority, single vote passes through', () => {
  assert.deepEqual(majorityTags([['a', 'b'], ['a', 'c'], ['a', 'b']]), ['a', 'b']);
  assert.deepEqual(majorityTags([['b', 'a']]), ['a', 'b']);
  assert.deepEqual(majorityTags([[], [], []]), []);
});

// A tiny synthetic board whose swiss scope is tight and whose board scope
// contains a wild outlier, mirroring the demo board's structure.
function fixtureFingerprint() {
  const mk = (id, hex, contrast, tags, channels) => ({
    id,
    file: `${id}.png`,
    title: id,
    source: { local: `boards/x/${id}.png` },
    measured: {
      w: 1440, h: 1200, aspect: 1.2,
      palette: [{ hex, pct: 85 }, { hex: '#ff3300', pct: 15 }],
      contrast, density: 0.02,
    },
    tags,
    channels,
    notes: {},
  });
  return buildFingerprint({
    board: 'x',
    kind: 'visual-ui',
    generated: 'stamp',
    items: [
      mk('w001', '#ffffff', 0.1, ['swiss-index', 'mono-meta'], ['swiss-index']),
      mk('w002', '#fafafa', 0.11, ['swiss-index', 'mono-meta'], ['swiss-index', 'mono-meta']),
      mk('w003', '#f0f0f0', 0.12, ['swiss-index'], ['mono-meta']),
      mk('w004', '#ff66cc', 0.45, ['3d-playful', 'high-chroma'], ['playful-3d']),
    ],
  });
}

test('buildRows: seven axes with weight = salience x confidence', () => {
  const fp = fixtureFingerprint();
  const output = {
    contrast: 0.1,
    density: 0.02,
    chroma: 0.05,
    groundLightness: 0.98,
    accentCount: 1,
    palette: [{ hex: '#ffffff', pct: 90 }, { hex: '#ff3300', pct: 10 }],
    tags: ['swiss-index', 'mono-meta'],
  };
  const rows = buildRows(output, fp.axes);
  assert.equal(rows.length, 7);
  for (const r of rows) {
    assert.ok(Math.abs(r.weight - +(r.salience * r.confidence).toFixed(4)) < 0.001);
  }
  const tagRow = rows.find((r) => r.id === 'tags');
  assert.ok(Array.isArray(tagRow.detail.missing));
});

test('an on-scope output scores closer under the direction scope than an off-scope one', () => {
  const fp = fixtureFingerprint();
  const scoped = aggregateAxes(fp.refs, ['w001', 'w002', 'w003']);
  // Self-consistent with its palette, sitting inside the scope's cluster
  // (contrast 0.1-0.12 raw, chroma 0.15 from the shared 85/15 palette shape).
  const swissOutput = {
    contrast: 0.11,
    density: 0.02,
    chroma: 0.15,
    groundLightness: 1,
    accentCount: 1,
    palette: [{ hex: '#ffffff', pct: 85 }, { hex: '#ff3300', pct: 15 }],
    tags: ['swiss-index', 'mono-meta'],
  };
  const alienOutput = {
    contrast: 0.45,
    density: 0.1,
    chroma: 0.9,
    groundLightness: 0.5,
    accentCount: 4,
    palette: [{ hex: '#00ff88', pct: 60 }, { hex: '#8800ff', pct: 40 }],
    tags: ['3d-playful', 'high-chroma'],
  };
  const swissAlign = alignmentScore(buildRows(swissOutput, scoped));
  const alienAlign = alignmentScore(buildRows(alienOutput, scoped));
  assert.ok(swissAlign > alienAlign, `expected ${swissAlign} > ${alienAlign}`);
  assert.ok(swissAlign > 80);
  assert.ok(alienAlign < 50);
});
