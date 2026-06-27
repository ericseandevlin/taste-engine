#!/usr/bin/env node
// import.mjs — scan a board folder and turn files into manifest records.
// "Turn files into a manifest" (plan U2, R1). One record per image. Idempotent:
// existing ids and enriched fields (tags, notes, measured, source.url) are
// preserved; only genuinely new files are added (plan R11).
//
// Usage:
//   node import.mjs                  # board=website
//   node import.mjs --board website
//   node import.mjs --dry-run        # report the diff, write nothing

import { readdirSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { getBoard } from './config.mjs';
import {
  isImageFile,
  titleFromFile,
  sourceKey,
  emptyManifest,
  readManifest,
  writeManifest,
  upsertItem,
} from './manifest.mjs';

function parseArgs(argv) {
  const args = { board: 'demo', dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--board') args.board = argv[++i];
    else if (argv[i] === '--dry-run') args.dryRun = true;
  }
  return args;
}

// Next free id number — preserves existing file->id pairs so adding a file that
// sorts in the middle does not renumber existing records (downstream refs stay valid).
function nextIdNum(manifest, prefix = 'w') {
  let max = 0;
  const re = new RegExp(`^${prefix}(\\d+)$`);
  for (const it of manifest.items) {
    const m = re.exec(String(it.id));
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max + 1;
}

// Optional sources.txt: "key url" or "key, url" per line (key = filename stem
// without trailing index). Lets the board cite real urls. Absent = no-op.
function loadSources(dir) {
  const p = join(dir, 'sources.txt');
  const map = new Map();
  if (!existsSync(p)) return map;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.trim().match(/^(\S+?)[,\s]+(\S+)/);
    if (m) map.set(m[1].toLowerCase(), m[2]);
  }
  return map;
}

// Pure core: mutate `manifest` to reflect `files`. Returns a diff summary.
// Exported for tests; does no I/O.
export function buildImport(board, manifest, files, sources = new Map()) {
  const existingByFile = new Map(manifest.items.map((it) => [it.file, it]));
  const newFiles = files
    .filter((f) => isImageFile(f) && !existingByFile.has(f))
    .sort();
  let n = nextIdNum(manifest);
  let added = 0;
  for (const file of newFiles) {
    const key = sourceKey(file).toLowerCase();
    upsertItem(manifest, {
      id: `w${String(n++).padStart(3, '0')}`,
      file,
      title: titleFromFile(file),
      source: {
        name: titleFromFile(file),
        url: sources.get(key) || null,
        local: join(board.dir, file),
        arena: null,
      },
      measured: null,
      tags: [],
      channels: [],
      notes: { why: '', avoid: '', keep: '' },
    });
    added++;
  }
  // Backfill urls for existing records still missing one.
  let enriched = 0;
  for (const it of manifest.items) {
    if (it.source && !it.source.url) {
      const url = sources.get(sourceKey(it.file).toLowerCase());
      if (url) {
        it.source.url = url;
        enriched++;
      }
    }
  }
  return { added, enriched };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const board = getBoard(args.board);
  if (!existsSync(board.absDir)) {
    throw new Error(`Board dir not found: ${board.absDir}`);
  }
  const files = readdirSync(board.absDir).filter(isImageFile);
  const manifestPath = join(board.absDir, 'manifest.json');
  const manifest =
    readManifest(manifestPath) || emptyManifest(board.name, board.kind);
  const sources = loadSources(board.absDir);

  const { added, enriched } = buildImport(board, manifest, files, sources);

  console.log(
    `[import] board=${board.name} files=${files.length} records=${manifest.items.length} added=${added} url-enriched=${enriched}`,
  );
  if (args.dryRun) {
    console.log('[import] --dry-run: no write');
    return;
  }
  writeManifest(manifestPath, manifest, { stamp: new Date().toISOString() });
  console.log(`[import] wrote ${manifestPath}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
