#!/usr/bin/env node
// measure.mjs — populate each manifest record's `measured` block with
// generator-usable numbers (plan U3, R3): dimensions, aspect, dominant palette
// with coverage %, a contrast proxy, and a density proxy.
//
// One measurement path owns the numbers (plan KTD3): existing palettes.json is
// used only as a fallback when an image can't be read locally; otherwise every
// item is recomputed uniformly via Sharp. Idempotent — skips already-measured
// items unless --force (plan R11).
//
// Usage:
//   node measure.mjs
//   node measure.mjs --board website --force

import { existsSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import { getBoard, REPO_ROOT } from './config.mjs';
import { readManifest, writeManifest, mergeItemField } from './manifest.mjs';

export const SAMPLE = 120; // longest-edge downsample for measurement (shared with score.mjs)
const LEVELS = 51; // palette quantization step (6 levels/channel -> 216 buckets)

function parseArgs(argv) {
  const args = { board: 'demo', force: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--board') args.board = argv[++i];
    else if (argv[i] === '--force') args.force = true;
  }
  return args;
}

function toHex(r, g, b) {
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}

// Pure: derive palette/contrast/density from a raw RGB(A) pixel buffer.
// Exported for tests — no I/O, no Sharp.
export function computeFeatures(data, info) {
  const ch = info.channels;
  const px = info.width * info.height;
  const L = new Float64Array(px);
  const buckets = new Map();
  let sumL = 0;
  let sumL2 = 0;
  let opaque = 0;
  for (let i = 0, p = 0; p < px; i += ch, p++) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (ch === 4 && data[i + 3] === 0) {
      L[p] = 0;
      continue; // skip fully transparent pixels
    }
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    L[p] = lum;
    sumL += lum;
    sumL2 += lum * lum;
    opaque++;
    const key =
      ((Math.round(r / LEVELS) * LEVELS) << 16) |
      ((Math.round(g / LEVELS) * LEVELS) << 8) |
      (Math.round(b / LEVELS) * LEVELS);
    buckets.set(key, (buckets.get(key) || 0) + 1);
  }
  const n = opaque || 1;
  const mean = sumL / n;
  const variance = Math.max(0, sumL2 / n - mean * mean);
  const contrast = +(Math.sqrt(variance) / 255).toFixed(3);

  // density: mean absolute luminance difference between adjacent pixels.
  let diff = 0;
  let cnt = 0;
  const W = info.width;
  const H = info.height;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p = y * W + x;
      if (x + 1 < W) {
        diff += Math.abs(L[p] - L[p + 1]);
        cnt++;
      }
      if (y + 1 < H) {
        diff += Math.abs(L[p] - L[p + W]);
        cnt++;
      }
    }
  }
  const density = cnt ? +(diff / cnt / 255).toFixed(3) : 0;

  const total = [...buckets.values()].reduce((a, b) => a + b, 0) || 1;
  const palette = [...buckets.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([key, c]) => ({
      hex: toHex((key >> 16) & 0xff, (key >> 8) & 0xff, key & 0xff),
      pct: Math.round((c / total) * 100),
    }));

  return { palette, contrast, density };
}

export async function measureFile(absPath) {
  const meta = await sharp(absPath).metadata();
  const { data, info } = await sharp(absPath)
    .resize(SAMPLE, SAMPLE, { fit: 'inside' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const features = computeFeatures(data, info);
  return {
    w: meta.width,
    h: meta.height,
    aspect: +(meta.width / meta.height).toFixed(3),
    ...features,
  };
}

// Legacy palettes.json (keyed by site name, each with a .file) -> file->palette,
// used only as a fallback for unreadable images.
function loadPalettesFallback(absDir) {
  const p = join(absDir, 'palettes.json');
  const map = new Map();
  if (!existsSync(p)) return map;
  try {
    const data = readManifest(p) || {};
    for (const v of Object.values(data)) {
      if (v && v.file && v.palette) map.set(v.file, v);
    }
  } catch {
    /* ignore malformed legacy file */
  }
  return map;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const board = getBoard(args.board);
  const manifestPath = join(board.absDir, 'manifest.json');
  const manifest = readManifest(manifestPath);
  if (!manifest) throw new Error(`No manifest at ${manifestPath} — run import.mjs first`);
  const fallback = loadPalettesFallback(board.absDir);

  let measured = 0;
  let skipped = 0;
  let failed = 0;
  for (const item of manifest.items) {
    if (item.measured && !args.force) {
      skipped++;
      continue;
    }
    const absPath = join(REPO_ROOT, item.source.local);
    try {
      const m = await measureFile(absPath);
      mergeItemField(manifest, item.id, 'measured', m);
      measured++;
    } catch (err) {
      const fb = fallback.get(item.file);
      if (fb) {
        mergeItemField(manifest, item.id, 'measured', {
          w: fb.w ?? null,
          h: fb.h ?? null,
          aspect: fb.w && fb.h ? +(fb.w / fb.h).toFixed(3) : null,
          palette: fb.palette,
          contrast: null,
          density: null,
          fallback: 'palettes.json',
        });
        measured++;
      } else {
        failed++;
        console.warn(`[measure] FAILED ${item.file}: ${err.message}`);
      }
    }
  }

  writeManifest(manifestPath, manifest, { stamp: new Date().toISOString() });
  console.log(
    `[measure] board=${board.name} measured=${measured} skipped=${skipped} failed=${failed} -> ${manifestPath}`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
