#!/usr/bin/env node
// link.mjs — join real site identity (name + url) onto manifest records by
// matching each image to its site group (plan R1 source-proof; addresses the
// "multiple images per site" gap). Site identity comes from a local sites.json
// (a one-time pull of the Notion gallery's Name + url), keyed by filename stem.
//
// Sets item.site (slug), item.title (real name), and item.source.{name,url,note}.
// The engine never touches Notion at runtime — sites.json is the local snapshot.
//
// Usage:
//   node link.mjs
//   node link.mjs --board demo

import { join } from 'path';
import { fileURLToPath } from 'url';
import { getBoard } from './config.mjs';
import { readManifest, writeManifest, sourceKey } from './manifest.mjs';

function parseArgs(argv) {
  const args = { board: 'demo' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--board') args.board = argv[++i];
  }
  return args;
}

// Pure: join `sites` (stem -> {name,url,note}) onto manifest items by filename
// stem. Idempotent. Returns counts + any unmatched files.
export function linkManifest(manifest, sites) {
  let linked = 0;
  const unmatched = [];
  for (const it of manifest.items) {
    const stem = sourceKey(it.file);
    const s = sites[stem];
    if (!s) {
      unmatched.push(it.file);
      continue;
    }
    it.site = stem;
    it.title = s.name;
    it.source = { ...it.source, name: s.name, url: s.url || null, note: s.note || '' };
    linked++;
  }
  return { linked, unmatched };
}

// Count distinct sites represented in the manifest.
export function siteCounts(manifest) {
  const counts = {};
  for (const it of manifest.items) {
    if (it.site) counts[it.site] = (counts[it.site] || 0) + 1;
  }
  return counts;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const board = getBoard(args.board);
  const manifestPath = join(board.absDir, 'manifest.json');
  const sitesPath = join(board.absDir, 'sites.json');
  const manifest = readManifest(manifestPath);
  if (!manifest) throw new Error(`No manifest at ${manifestPath} — run import first`);
  const sitesDoc = readManifest(sitesPath);
  if (!sitesDoc?.sites) throw new Error(`No sites map at ${sitesPath}`);

  const { linked, unmatched } = linkManifest(manifest, sitesDoc.sites);
  writeManifest(manifestPath, manifest, { stamp: new Date().toISOString() });

  const counts = siteCounts(manifest);
  console.log(`[link] linked=${linked} sites=${Object.keys(counts).length} unmatched=${unmatched.length} -> ${manifestPath}`);
  if (unmatched.length) console.warn(`[link] unmatched files (no sites.json entry): ${unmatched.join(', ')}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
