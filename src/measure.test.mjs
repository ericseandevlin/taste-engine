// measure.test.mjs — run: node --test  (from scripts/taste/)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeFeatures } from './measure.mjs';

test('solid color -> single palette entry at ~100%, zero contrast/density', () => {
  // 2x2 solid red, 3 channels
  const data = Buffer.from([255, 0, 0, 255, 0, 0, 255, 0, 0, 255, 0, 0]);
  const f = computeFeatures(data, { width: 2, height: 2, channels: 3 });
  assert.equal(f.palette[0].hex, '#ff0000');
  assert.equal(f.palette[0].pct, 100);
  assert.equal(f.contrast, 0);
  assert.equal(f.density, 0);
});

test('black/white split -> high contrast and density', () => {
  // 2x1: black then white
  const data = Buffer.from([0, 0, 0, 255, 255, 255]);
  const f = computeFeatures(data, { width: 2, height: 1, channels: 3 });
  assert.equal(f.contrast, 0.5); // std(0,255)/255
  assert.equal(f.density, 1); // |0-255|/255
  assert.equal(f.palette.length, 2);
});

test('fully transparent pixels are excluded from stats', () => {
  // 2x1 RGBA: opaque red, transparent anything
  const data = Buffer.from([255, 0, 0, 255, 9, 9, 9, 0]);
  const f = computeFeatures(data, { width: 2, height: 1, channels: 4 });
  // only the red pixel counts toward luminance stats
  assert.equal(f.contrast, 0);
  assert.ok(f.palette.some((p) => p.hex === '#ff0000'));
});

test('palette is sorted by coverage descending', () => {
  // 4px: 3 red, 1 green
  const data = Buffer.from([
    255, 0, 0, 255, 0, 0, 255, 0, 0, 0, 255, 0,
  ]);
  const f = computeFeatures(data, { width: 4, height: 1, channels: 3 });
  assert.equal(f.palette[0].hex, '#ff0000');
  assert.equal(f.palette[0].pct, 75);
  assert.equal(f.palette[1].hex, '#00ff00');
  assert.equal(f.palette[1].pct, 25);
});
