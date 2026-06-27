// atlas.test.mjs — run: node --test  (from scripts/taste/)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyManifest, upsertItem } from './manifest.mjs';
import { renderAtlas } from './atlas.mjs';

function fixture() {
  const m = emptyManifest('website', 'visual-ui');
  upsertItem(m, {
    id: 'w001', file: 'grafik1.png', title: 'Grafik',
    source: { url: 'https://grafik.example', local: 'taste/website/grafik1.png' },
    measured: { palette: [{ hex: '#959697', pct: 41 }] },
    tags: ['swiss-index'], notes: { why: 'huge client index' },
  });
  upsertItem(m, {
    id: 'w002', file: 'agne1.png', title: 'Agne',
    source: { url: null, local: 'taste/website/agne1.png' },
    measured: { palette: [{ hex: '#101010', pct: 60 }] },
    tags: ['dark-field'], notes: { why: '' },
  });
  const channels = { channels: [
    { id: 'dark', name: 'Dark Editorial', recipe: { ground: 'near-black' }, forbidden: ['gradients'], representatives: ['w002'], members: ['w002'] },
  ] };
  return { m, channels };
}

test('renders one card per item', () => {
  const { m, channels } = fixture();
  const html = renderAtlas(m, channels);
  const cards = (html.match(/class="card"/g) || []).length;
  assert.equal(cards, 2);
});

test('renders one section per channel with its recipe', () => {
  const { m, channels } = fixture();
  const html = renderAtlas(m, channels);
  assert.equal((html.match(/class="channel"/g) || []).length, 1);
  assert.ok(html.includes('Dark Editorial'));
  assert.ok(html.includes('near-black'));
  assert.ok(html.includes('forbidden'));
});

test('palette swatches carry the recorded hex', () => {
  const { m, channels } = fixture();
  const html = renderAtlas(m, channels);
  assert.ok(html.includes('#959697'));
  assert.ok(html.includes('#101010'));
});

test('source link shown when url present, omitted when null', () => {
  const { m, channels } = fixture();
  const html = renderAtlas(m, channels);
  assert.ok(html.includes('https://grafik.example'));
  // agne has no url -> only one SOURCE link total
  assert.equal((html.match(/>SOURCE</g) || []).length, 1);
});

test('missing-image handling is wired via onerror', () => {
  const { m, channels } = fixture();
  const html = renderAtlas(m, channels);
  assert.ok(html.includes('onerror'));
  assert.ok(html.includes('missing'));
});

test('escapes HTML in titles/notes', () => {
  const m = emptyManifest('website', 'visual-ui');
  upsertItem(m, { id: 'w001', file: 'x.png', title: '<script>', notes: { why: 'a & b' }, measured: { palette: [] }, tags: [] });
  const html = renderAtlas(m, { channels: [] });
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('a &amp; b'));
  assert.ok(!html.includes('<script>'));
});
