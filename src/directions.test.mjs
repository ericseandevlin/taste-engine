// directions.test.mjs — run: node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDirectionsInput,
  boardPalette,
  parseDirectionsResponse,
  toKeyed,
} from './directions.mjs';

const channelsDoc = {
  channels: [
    { id: 'swiss-index', name: 'Swiss Index', members: ['a', 'b', 'c'], recipe: { ground: 'white' }, forbidden: ['gradients'] },
    { id: 'mono-meta', name: 'Mono Meta', members: ['a', 'b'], recipe: { type: 'mono' }, forbidden: ['serif'] },
    { id: 'playful-3d', name: 'Playful 3D', members: ['d'], recipe: { ground: 'high-chroma' }, forbidden: ['monochrome'] },
  ],
};

test('buildDirectionsInput carries channel weight from member count', () => {
  const input = buildDirectionsInput(channelsDoc);
  assert.equal(input.length, 3);
  assert.equal(input.find((c) => c.id === 'swiss-index').weight, 3);
  assert.equal(input.find((c) => c.id === 'playful-3d').weight, 1);
});

test('boardPalette ranks hexes by covered area, capped at k', () => {
  const manifest = {
    items: [
      { measured: { palette: [{ hex: '#fff', pct: 60 }, { hex: '#000', pct: 30 }] } },
      { measured: { palette: [{ hex: '#000', pct: 50 }, { hex: '#f00', pct: 10 }] } },
    ],
  };
  const pal = boardPalette(manifest, 2);
  assert.deepEqual(pal, ['#000', '#fff']); // #000: 80, #fff: 60, #f00: 10
});

test('parseDirectionsResponse drops directions referencing unknown channels', () => {
  const raw = JSON.stringify({
    directions: [
      { id: 'structured', name: 'Structured', channels: ['swiss-index', 'mono-meta'], brief: 'b', palette: 'p', notes: ['n'] },
      { id: 'index', name: 'Index', channels: ['swiss-index'], brief: 'b', palette: 'p' },
      { id: 'mono', name: 'Mono', channels: ['mono-meta'], brief: 'b', palette: 'p' },
      { id: 'ghost', name: 'Ghost', channels: ['does-not-exist'], brief: 'b', palette: 'p' },
    ],
  });
  const out = parseDirectionsResponse(raw, ['swiss-index', 'mono-meta', 'playful-3d']);
  assert.equal(out.length, 3); // ghost dropped (no valid channel)
  assert.ok(!out.some((d) => d.id === 'ghost'));
  assert.deepEqual(out[0].channels, ['swiss-index', 'mono-meta']);
});

test('parseDirectionsResponse throws when fewer than 3 valid directions survive', () => {
  const raw = JSON.stringify({
    directions: [
      { id: 'a', channels: ['swiss-index'], brief: 'b' },
      { id: 'b', channels: ['nope'], brief: 'b' },
    ],
  });
  assert.throws(() => parseDirectionsResponse(raw, ['swiss-index']), /expected >= 3/);
});

test('parseDirectionsResponse throws on non-JSON', () => {
  assert.throws(() => parseDirectionsResponse('no json here', ['swiss-index']), /no JSON object/);
});

test('toKeyed produces the id-keyed shape generate.mjs consumes', () => {
  const keyed = toKeyed([
    { id: 'structured', name: 'Structured', channels: ['swiss-index'], brief: 'b', palette: 'p', notes: ['n'] },
  ]);
  assert.deepEqual(Object.keys(keyed), ['structured']);
  assert.equal(keyed.structured.name, 'Structured');
  assert.deepEqual(keyed.structured.channels, ['swiss-index']);
});
