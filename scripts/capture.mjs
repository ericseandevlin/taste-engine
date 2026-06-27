#!/usr/bin/env node
// capture.mjs — convenience helper: screenshot a generated page at desktop and
// mobile widths into its slug folder, so `critique` has shots to read.
//
// Kept OUT of src/ on purpose: the engine itself has no browser dependency. This
// shells out to a system Chrome/Chromium (nothing to npm install) and uses a tall
// viewport plus a virtual-time budget, so scroll-reveal animations are already
// settled when the frame is captured (a short viewport captures them mid-fade).
//
// Usage:
//   node scripts/capture.mjs --slug swiss-mono-index-001
//   node scripts/capture.mjs --slug <slug> --board demo

import { existsSync } from 'fs';
import { execFileSync, execSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getBoard } from '../src/config.mjs';

const CHROME_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
];

function findChrome() {
  for (const p of CHROME_CANDIDATES) if (existsSync(p)) return p;
  for (const name of ['google-chrome', 'chromium', 'chromium-browser', 'chrome']) {
    try {
      const r = execSync(`command -v ${name}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
      if (r) return r;
    } catch {
      /* not on PATH */
    }
  }
  return null;
}

function parseArgs(argv) {
  const args = { board: 'demo', slug: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--board') args.board = argv[++i];
    else if (argv[i] === '--slug') args.slug = argv[++i];
  }
  return args;
}

function shoot(chrome, url, out, width, height) {
  execFileSync(
    chrome,
    [
      '--headless=new', '--disable-gpu', '--hide-scrollbars',
      '--force-device-scale-factor=1', `--window-size=${width},${height}`,
      '--virtual-time-budget=2500', `--screenshot=${out}`, url,
    ],
    { stdio: 'ignore' },
  );
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.slug) throw new Error('pass --slug <direction>-NNN (the folder under generated/)');

  const board = getBoard(args.board);
  const slugDir = join(board.absDir, 'generated', args.slug);
  const page = join(slugDir, 'index.html');
  if (!existsSync(page)) throw new Error(`no page at ${page} — run generate first`);

  const chrome = findChrome();
  if (!chrome) {
    throw new Error(
      'No Chrome/Chromium found. Install Google Chrome, or capture desktop.png + mobile.png yourself into ' +
        slugDir,
    );
  }

  const url = `file://${page}`;
  shoot(chrome, url, join(slugDir, 'desktop.png'), 1440, 3600);
  shoot(chrome, url, join(slugDir, 'mobile.png'), 390, 6000);
  console.log(`[capture] wrote desktop.png + mobile.png -> ${slugDir}`);
  console.log(`[capture] next: npm run critique -- --slug ${args.slug}` + (args.board !== 'demo' ? ` --board ${args.board}` : ''));
}

main();
