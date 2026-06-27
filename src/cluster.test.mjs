// cluster.test.mjs — run: node --test  (from scripts/taste/)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyManifest, upsertItem } from './manifest.mjs';
import {
  buildClusterInput,
  parseClusterResponse,
  reconcileMembership,
} from './cluster.mjs';

const IDS = ['w001', 'w002', 'w003', 'w004', 'w005', 'w006', 'w007'];

function validChannels(n = 6) {
  return {
    channels: Array.from({ length: n }, (_, i) => ({
      id: `ch-${i}`,
      name: `Channel ${i}`,
      recipe: { ground: 'x', type: 'y', accent: 'z' },
      forbidden: ['no gradients'],
      representatives: [IDS[i % IDS.length]],
      members: [IDS[i % IDS.length]],
    })),
  };
}

test('buildClusterInput produces compact summaries with palette hexes', () => {
  const m = emptyManifest('website', 'visual-ui');
  upsertItem(m, {
    id: 'w001', title: 'Grafik', tags: ['swiss-index'], channels: ['warm-editorial'],
    measured: { palette: [{ hex: '#fff', pct: 50 }, { hex: '#000', pct: 30 }, { hex: '#f00', pct: 10 }, { hex: '#0f0', pct: 5 }] },
  });
  const input = buildClusterInput(m);
  assert.equal(input[0].id, 'w001');
  assert.deepEqual(input[0].tags, ['swiss-index']);
  assert.deepEqual(input[0].candidates, ['warm-editorial']);
  assert.deepEqual(input[0].palette, ['#fff', '#000', '#f00']); // top 3 only
});

test('valid response with 6-12 channels parses', () => {
  const channels = parseClusterResponse(JSON.stringify(validChannels(6)), IDS);
  assert.equal(channels.length, 6);
  assert.ok(channels[0].recipe);
  assert.ok(channels[0].representatives.length >= 1);
});

test('channel count outside 6-12 throws', () => {
  assert.throws(() => parseClusterResponse(JSON.stringify(validChannels(3)), IDS), /6-12 channels/);
  assert.throws(() => parseClusterResponse(JSON.stringify(validChannels(13)), IDS), /6-12 channels/);
});

test('unknown member/representative ids are dropped (referential integrity)', () => {
  const data = validChannels(6);
  data.channels[0].members = ['w001', 'ghost', 'w002'];
  data.channels[0].representatives = ['w001', 'ghost'];
  const channels = parseClusterResponse(JSON.stringify(data), IDS);
  assert.deepEqual(channels[0].members, ['w001', 'w002']);
  assert.deepEqual(channels[0].representatives, ['w001']);
});

test('a channel with no valid representatives throws', () => {
  const data = validChannels(6);
  data.channels[0].representatives = ['ghost'];
  assert.throws(() => parseClusterResponse(JSON.stringify(data), IDS), /no valid representatives/);
});

test('a channel without a recipe throws', () => {
  const data = validChannels(6);
  delete data.channels[0].recipe;
  assert.throws(() => parseClusterResponse(JSON.stringify(data), IDS), /no recipe/);
});

test('reconcileMembership writes back item.channels from membership', () => {
  const m = emptyManifest('website', 'visual-ui');
  upsertItem(m, { id: 'w001', channels: ['stale'] });
  upsertItem(m, { id: 'w002', channels: ['stale'] });
  const channels = [
    { id: 'a', recipe: {}, representatives: ['w001'], members: ['w001', 'w002'] },
    { id: 'b', recipe: {}, representatives: ['w002'], members: ['w002'] },
  ];
  reconcileMembership(m, channels);
  assert.deepEqual(m.items.find((i) => i.id === 'w001').channels, ['a']);
  assert.deepEqual(m.items.find((i) => i.id === 'w002').channels, ['a', 'b']);
});

test('malformed JSON throws', () => {
  assert.throws(() => parseClusterResponse('nope', IDS), /no JSON object/);
});
