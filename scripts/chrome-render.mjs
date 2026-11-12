#!/usr/bin/env node
// chrome-render.mjs — headless Chrome as a plain function, for fit measurement.
// Kept out of src/ so the engine modules stay dependency-free and testable.

import { execFileSync } from 'child_process';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

export const CHROME =
  process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// Renders HTML at an exact viewport and returns the post-JS DOM.
export function chromeRender(html, canvas) {
  const dir = mkdtempSync(join(tmpdir(), 'taste-fit-'));
  const file = join(dir, 'probe.html');
  try {
    writeFileSync(file, html);
    return execFileSync(
      CHROME,
      [
        '--headless=new',
        '--disable-gpu',
        '--hide-scrollbars',
        `--window-size=${canvas.w},${canvas.h}`,
        '--virtual-time-budget=2500',
        '--dump-dom',
        `file://${file}`,
      ],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] },
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
