#!/usr/bin/env node
// calibrate.mjs: pre-freeze tag-jitter calibration (v2 design doc, section 5,
// gate 7). Every exemplar across all registered validation-class manifests is
// tagged 3 times with the same prompt/vocabulary/model tier as the pipeline;
// vocabulary ids that flip run-to-run are prune-listed.
//
// REGISTERED PRUNE RULE (printed and written into the report): an id is
// prune-listed when it flips on MORE THAN ONE distinct exemplar, where a flip
// is minority presence, the id appearing in 1 or 2 of the 3 passes on one
// exemplar. Operationalization note: the design doc sentence "flip in more
// than 1 of 3 passes on any exemplar" cannot bind per-exemplar with 3 passes
// (minority presence is the only observable flip), so the threshold is
// applied ACROSS exemplars; the report says so.
//
// This script only REPORTS: it writes boards/validation-t1/calibration.json
// (per-id flip counts + the prune list) and NEVER edits config.mjs. The human
// applies the prune by hand, keeping it visibly consistency-only, never
// score-based. No score or alignment computation lives here.
//
// Usage: npm run calibrate [-- --board-root boards/validation-t1]

import { writeFileSync } from 'fs';
import { basename, join, relative } from 'path';
import { fileURLToPath } from 'url';
import { getBoard, loadEnv, MODELS, REPO_ROOT, vocabIds } from './config.mjs';
import { readManifest } from './manifest.mjs';
import { tagImage } from './tag.mjs';
import { makeVisionCaller } from './anthropic.mjs';

export const PASSES = 3;

export const PRUNE_RULE =
  'An id is prune-listed when it flips on MORE THAN ONE distinct exemplar; a flip is minority presence, ' +
  `the id appearing in 1 or 2 of the ${PASSES} passes on one exemplar.`;

export const OPERATIONALIZATION_NOTE =
  'The design doc sentence "flip in more than 1 of 3 passes on any exemplar" cannot bind per-exemplar ' +
  'with 3 passes (minority presence is the only observable flip), so the threshold is operationalized ' +
  'ACROSS exemplars: at most one flip event per (id, exemplar), prune when the events span more than ' +
  'one distinct exemplar.';

// --- Pure mechanics (unit-tested, no network) ---

// Presence count per id across one exemplar's passes (a duplicate within a
// single pass counts once).
export function presenceCounts(passes) {
  const counts = new Map();
  for (const tags of passes) {
    for (const t of new Set(tags || [])) counts.set(t, (counts.get(t) || 0) + 1);
  }
  return counts;
}

// Ids that flip on this exemplar: present in some passes but not all
// (minority presence, 1 or 2 of 3).
export function flipIds(passes) {
  const total = passes.length;
  return [...presenceCounts(passes).entries()]
    .filter(([, c]) => c > 0 && c < total)
    .map(([t]) => t)
    .sort();
}

// votes: [{ exemplar, passes: [tags, tags, tags] }]. Returns per-id flip
// counts over distinct exemplars. Seeded with the full vocabulary so
// zero-flip ids appear in the report; off-vocabulary ids are tolerated.
export function flipTable(votes, ids = []) {
  const table = {};
  for (const id of ids) table[id] = { flips: 0, exemplars: [] };
  for (const v of votes) {
    for (const id of flipIds(v.passes)) {
      table[id] ||= { flips: 0, exemplars: [] };
      table[id].flips++;
      table[id].exemplars.push(v.exemplar);
    }
  }
  return table;
}

// The registered rule: flips on more than one distinct exemplar.
export function pruneList(table) {
  return Object.entries(table)
    .filter(([, r]) => r.flips > 1)
    .map(([id]) => id)
    .sort();
}

// --- I/O + API loop (main-only) ---

function parseArgs(argv) {
  const args = { boardRoot: 'boards/validation-t1', model: MODELS.tag, concurrency: 2 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--board-root') args.boardRoot = argv[++i];
    else if (argv[i] === '--model') args.model = argv[++i];
    else if (argv[i] === '--concurrency') args.concurrency = Number(argv[++i]);
  }
  return args;
}

// Bounded-concurrency map (mirrors tag.mjs, which does not export its pool).
async function pool(items, size, worker) {
  let i = 0;
  const runners = Array.from({ length: Math.max(1, size) }, async () => {
    while (i < items.length) {
      const idx = i++;
      await worker(items[idx], idx);
    }
  });
  await Promise.all(runners);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  loadEnv();
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set (.env)');

  const spec = readManifest(join(REPO_ROOT, 'docs', 'styles', 'classes.json'));
  if (!spec?.classes) throw new Error('No class registry at docs/styles/classes.json');

  // Class dirs live under --board-root (default matches the registered
  // exemplarDirs). Each is a normal mini-board resolved through the boards/
  // convention, so the tag pass uses the exact pipeline vocabulary + prompt.
  const jobs = [];
  let board = null;
  for (const [cid, cls] of Object.entries(spec.classes)) {
    const dirRel = join(args.boardRoot, basename(cls.exemplarDir));
    const boardName = relative(join(REPO_ROOT, 'boards'), join(REPO_ROOT, dirRel));
    if (boardName.startsWith('..')) throw new Error(`--board-root must live under boards/ (got ${args.boardRoot})`);
    const manifest = readManifest(join(REPO_ROOT, dirRel, 'manifest.json'));
    if (!manifest?.items?.length) {
      throw new Error(
        `No manifest for class "${cid}" at ${dirRel}/manifest.json. Render its exemplars and run ` +
          `import/measure/tag (npm run import -- --board ${boardName}, etc.) before calibrating.`,
      );
    }
    const clsBoard = getBoard(boardName);
    board ||= clsBoard;
    for (const item of manifest.items) jobs.push({ cid, item, board: clsBoard });
  }

  console.log(
    `[calibrate] board-root=${args.boardRoot} classes=${Object.keys(spec.classes).length} exemplars=${jobs.length} passes=${PASSES} model=${args.model}`,
  );
  console.log(`  REGISTERED PRUNE RULE: ${PRUNE_RULE}`);
  console.log(`  ${OPERATIONALIZATION_NOTE}`);

  const callModel = makeVisionCaller(args.model, apiKey);
  const votes = [];
  await pool(jobs, args.concurrency, async (job) => {
    const absPath = join(REPO_ROOT, job.item.source.local);
    const passes = [];
    for (let p = 0; p < PASSES; p++) {
      passes.push((await tagImage(absPath, job.board, callModel)).tags);
    }
    const exemplar = `${job.cid}/${job.item.id}`;
    votes.push({ exemplar, passes });
    const flips = flipIds(passes);
    console.log(`  ${exemplar}: ${flips.length ? `flips ${flips.join(', ')}` : 'stable'}`);
  });
  votes.sort((a, b) => (a.exemplar < b.exemplar ? -1 : 1));

  const ids = vocabIds(board.tagVocabulary);
  const table = flipTable(votes, ids);
  const prune = pruneList(table);

  const flipped = Object.entries(table)
    .filter(([, r]) => r.flips > 0)
    .sort((a, b) => b[1].flips - a[1].flips);
  console.log(`  flip events by id (a flip = present in 1 or 2 of ${PASSES} passes on one exemplar):`);
  if (!flipped.length) console.log('    none');
  for (const [id, r] of flipped) {
    console.log(`    ${id.padEnd(38)} ${r.flips} exemplar(s): ${r.exemplars.join(', ')}`);
  }
  console.log(`  prune list (${prune.length}): ${prune.join(', ') || 'empty'}`);
  console.log('  report only: this script never edits config.mjs; the human applies the prune (consistency-only, never score-based).');

  const outPath = join(REPO_ROOT, args.boardRoot, 'calibration.json');
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        pruneRule: PRUNE_RULE,
        operationalization: OPERATIONALIZATION_NOTE,
        note: 'Report only: config.mjs is never edited by this script; the human applies the prune.',
        generated: new Date().toISOString(),
        model: args.model,
        passes: PASSES,
        boardRoot: args.boardRoot,
        exemplars: votes.length,
        flips: table,
        pruneList: prune,
        voteDetail: votes,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(`  -> ${outPath}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
