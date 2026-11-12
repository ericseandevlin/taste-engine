#!/usr/bin/env node
// taste.mjs: the one command. A folder of references in, a result page out.
//
//   npm run taste                                  the bundled demo board
//   npm run taste -- --board myboard               boards/myboard/
//   npm run taste -- --board myboard --copy "Title | 20 Nov | Venue"
//   npm run taste -- --board myboard --no-poster   stop at the rule sheet
//
// Steps: import -> measure -> tag -> cluster -> directions -> brief -> poster -> result.
// A step whose output already exists is skipped, so a second run costs only a
// new poster. --force redoes everything. Flags you pass go to every step.

import { spawnSync } from 'child_process';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getBoard } from '../src/config.mjs';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '../src');
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const value = (name, fallback) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback);

let board;
try {
  board = getBoard(value('--board', 'demo'));
} catch (err) {
  console.error(`\n[taste-engine] ${err.message}`);
  process.exit(1);
}
const has = (f) => existsSync(join(board.absDir, f));
const force = flag('--force');

// [stage, skip-when-this-file-exists]. import, measure and tag skip per item on their own.
const STEPS = [
  ['import', null],
  ['measure', null],
  ['tag', null],
  ['cluster', 'channels.json'],
  ['directions', 'directions.json'],
  ['brief', null],
  ...(flag('--no-poster') ? [] : [['poster', null]]),
  ['result', null],
];

for (const [stage, output] of STEPS) {
  if (output && has(output) && !force) {
    console.log(`\n=== ${stage} === already done (${output}); --force to redo`);
    continue;
  }
  console.log(`\n=== ${stage} ===`);
  // --model picks the text and vision model. The poster's image always comes from
  // the image agent, so there --model becomes the judge that checks the poster.
  const args = argv.filter((a) => a !== '--no-poster').map((a) => (stage === 'poster' && a === '--model' ? '--judge' : a));
  const run = spawnSync('node', [join(SRC, `${stage}.mjs`), ...args], { stdio: 'inherit' });
  if (run.status !== 0) {
    // The rule sheet does not need the poster. Show what exists so far.
    if (stage === 'poster') spawnSync('node', [join(SRC, 'result.mjs'), ...args], { stdio: 'inherit' });
    console.error(`\n[taste-engine] Stopped at "${stage}". Fix the message above, then run the same command again; finished steps are kept.`);
    process.exit(1);
  }
}
console.log(`\nDone. Open ${board.dir}/result.html`);
