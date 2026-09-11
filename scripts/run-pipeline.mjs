#!/usr/bin/env node
// run-pipeline.mjs — run the derive stages in order on a board, forwarding any
// args (e.g. --board myboard) to each stage. This is the "drop a folder of
// images, run one command" entry point. It covers the local + synthesis half:
// import -> measure -> tag -> cluster -> directions -> thesis -> atlas -> fingerprint.
// generate and critique are interactive choices and stay separate.
//
// Each stage checks for its prerequisite output files before running and aborts
// with a clear message if something's missing. Run `npm run status` to see
// the full pipeline state for any board.
//
// Usage:
//   npm run pipeline                       # the bundled demo board
//   npm run pipeline -- --board myboard    # your own folder under boards/myboard/

import { execFileSync } from 'child_process';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getBoard, checkDeps, REPO_ROOT } from '../src/config.mjs';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '../src');
const STAGES = ['import', 'measure', 'tag', 'cluster', 'directions', 'thesis', 'atlas', 'fingerprint'];
const passthru = process.argv.slice(2);

// Resolve board name from args
function parseBoard(argv) {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--board') return argv[i + 1];
  }
  return 'demo';
}

const boardName = parseBoard(passthru);
const board = getBoard(boardName);

for (const stage of STAGES) {
  // Check for prerequisite output files before each stage
  const deps = checkDeps(stage, board.absDir);
  if (!deps.ok) {
    const hint = `Missing output file(s): ${deps.missing.join(', ')}`;
    console.log(`\n=== ${stage} ===`);
    console.log(`  \x1b[33m⏸  SKIPPED — ${hint}\x1b[0m`);
    console.log(`  \x1b[33m   Run \`npm run status -- --board ${boardName}\` for the full picture.\x1b[0m`);
    // Still run remaining stages that have their own gating — they'll also
    // skip themselves if their deps are missing.
    continue;
  }

  console.log(`\n=== ${stage} ===`);
  execFileSync('node', [join(SRC, `${stage}.mjs`), ...passthru], { stdio: 'inherit' });
}

console.log(`\n[pipeline] done for board "${boardName}". Next steps:`);
console.log(`  npm run status -- --board ${boardName}      # full pipeline state`);
console.log(`  npm run generate -- --board ${boardName}     # generate from a direction`);
console.log(`  node src/generate-poster.mjs --board ${boardName}  # poster kind only`);