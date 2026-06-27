#!/usr/bin/env node
// run-pipeline.mjs — run the derive stages in order on a board, forwarding any
// args (e.g. --board myboard) to each stage. This is the "drop a folder of
// images, run one command" entry point. It covers the local + synthesis half:
// import -> measure -> tag -> cluster -> directions -> thesis -> atlas.
// generate and critique are interactive choices and stay separate.
//
// Usage:
//   npm run pipeline                       # the bundled demo board
//   npm run pipeline -- --board myboard    # your own folder under boards/myboard/

import { execFileSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '../src');
const STAGES = ['import', 'measure', 'tag', 'cluster', 'directions', 'thesis', 'atlas'];
const passthru = process.argv.slice(2);

for (const stage of STAGES) {
  console.log(`\n=== ${stage} ===`);
  execFileSync('node', [join(SRC, `${stage}.mjs`), ...passthru], { stdio: 'inherit' });
}

const boardArg = passthru.includes('--board') ? ` ${passthru.join(' ')}` : '';
console.log(`\n[pipeline] done. Next: list directions, then  npm run generate --${boardArg} --direction <id>`);
