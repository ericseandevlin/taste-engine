#!/usr/bin/env node
// manifest.mjs
// The taste-engine database layer: schema, stable id assignment, and idempotent
// read / merge / write helpers. One manifest.json per board; one record per image.
//
// Idempotency is the contract (plan R11): re-running any pipeline stage updates
// fields in place and never duplicates or drops records.

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { extname, basename } from 'path';

export const IMAGE_EXTS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.heic',
]);

export function isImageFile(file) {
  return IMAGE_EXTS.has(extname(file).toLowerCase());
}

// Stable id assignment: sort image filenames, assign w001, w002...
// Re-running with the same set yields the same ids; a new file slots in by sort
// order. (Ids only stay fully stable if filenames don't change — acceptable for
// a curated board where files are added, not renamed.)
export function assignIds(files, prefix = 'w') {
  const sorted = [...files].filter(isImageFile).sort();
  const map = new Map();
  sorted.forEach((file, i) => {
    map.set(file, `${prefix}${String(i + 1).padStart(3, '0')}`);
  });
  return map;
}

// Derive a human title from a filename, dropping a trailing index and
// splitting on - or _: grafik1.png -> "Grafik", harry-george2.png -> "Harry George".
export function titleFromFile(file) {
  const stem = basename(file, extname(file)).replace(/\d+$/, '');
  const title = stem
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
  return title || stem;
}

// Group key for sources: the stem without trailing digits, so grafik1/grafik2
// share a source. agne1..agne5 -> "agne".
export function sourceKey(file) {
  return basename(file, extname(file)).replace(/\d+$/, '');
}

export function emptyManifest(board, kind) {
  return { board, kind, generated: null, items: [] };
}

export function readManifest(path) {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function writeManifest(path, manifest, { stamp } = {}) {
  const out = { ...manifest };
  if (stamp) out.generated = stamp;
  writeFileSync(path, JSON.stringify(out, null, 2) + '\n');
  return out;
}

// Idempotent upsert by id. Shallow-merges top-level fields onto an existing
// record; fields not present in `patch` are preserved. Never duplicates.
export function upsertItem(manifest, patch) {
  if (!patch.id) throw new Error('upsertItem: patch.id is required');
  const existing = manifest.items.find((it) => it.id === patch.id);
  if (existing) {
    Object.assign(existing, patch);
    return existing;
  }
  manifest.items.push(patch);
  return patch;
}

// Overwrite a single named block (e.g. "measured", "notes", "tags") on an item,
// leaving sibling fields intact. Throws if the id is unknown.
export function mergeItemField(manifest, id, key, value) {
  const item = manifest.items.find((it) => it.id === id);
  if (!item) throw new Error(`mergeItemField: no item with id "${id}"`);
  item[key] = value;
  return item;
}
