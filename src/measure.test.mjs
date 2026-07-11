// measure.test.mjs — run: node --test  (from scripts/taste/)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { computeFeatures, SAMPLE } from './measure.mjs';
import { CONSTANTS } from './features.mjs';

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

// --- v2 pixel-level accent metrics ---

test('accentCoverage is the pixel fraction, not a palette-entry count (the v1 bug)', () => {
  // 4px white ground + 1px red: coverage 0.2, one hue family
  const data = Buffer.from([
    255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 0, 0,
  ]);
  const f = computeFeatures(data, { width: 5, height: 1, channels: 3 });
  assert.equal(f.accentCoverage, 0.2);
  assert.equal(f.accentHueCount, 1);
});

test('anchor hue is GROUND-derived: on a chromatic ground, ground-family pixels are not accents', () => {
  // 3px blue ground + 1px red. A modal-chromatic anchor would call blue the
  // accent base; the ground anchor correctly treats blue as family and counts
  // only the hue-distinct red.
  const data = Buffer.from([
    0, 0, 255, 0, 0, 255, 0, 0, 255, 255, 0, 0,
  ]);
  const f = computeFeatures(data, { width: 4, height: 1, channels: 3 });
  assert.equal(f.accentCoverage, 0.25);
  assert.equal(f.accentHueCount, 1);
});

test('a hue family below ACCENT_COVERAGE_FLOOR counts toward coverage but not hue count', () => {
  // 1 red pixel in 1000: coverage 0.001 (< floor 0.002) -> family uncounted
  const px = 1000;
  const data = Buffer.alloc(px * 3, 255);
  data[0] = 255; data[1] = 0; data[2] = 0;
  const f = computeFeatures(data, { width: px, height: 1, channels: 3 });
  assert.equal(f.accentCoverage, 0.001);
  assert.equal(f.accentHueCount, 0);
});

test('achromatic pages carry zero accent metrics', () => {
  const data = Buffer.from([255, 255, 255, 0, 0, 0, 128, 128, 128]);
  const f = computeFeatures(data, { width: 3, height: 1, channels: 3 });
  assert.equal(f.accentCoverage, 0);
  assert.equal(f.accentHueCount, 0);
});

test('pink-chip fixture: a sub-1% accent chip survives the SAMPLE resample and registers', async () => {
  // The design doc pins this: v1's palette-entry counting made a small pink
  // chip invisible (d=1.00 on all six demo pages). Render a 1440x1440 white
  // page with a ~0.7% pink chip, push it through the same resize the real
  // measure path uses, and prove the chip registers in both metrics.
  const pageBuf = await sharp({
    create: { width: 1440, height: 1440, channels: 3, background: '#ffffff' },
  })
    .composite([
      {
        input: await sharp({
          create: { width: 144, height: 100, channels: 3, background: '#ff2d8a' },
        }).png().toBuffer(),
        left: 600,
        top: 600,
      },
    ])
    .png()
    .toBuffer();
  const { data, info } = await sharp(pageBuf)
    .resize(SAMPLE, SAMPLE, { fit: 'inside' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const f = computeFeatures(data, info);
  assert.ok(f.accentCoverage >= CONSTANTS.ACCENT_COVERAGE_FLOOR, `coverage ${f.accentCoverage} under floor`);
  assert.ok(f.accentHueCount >= 1, `hue count ${f.accentHueCount}, chip did not register`);
});
