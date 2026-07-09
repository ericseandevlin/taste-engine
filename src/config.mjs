#!/usr/bin/env node
// config.mjs
// Central config for the taste engine: repo paths, env loading, model routing,
// and the board + kind registries that keep the pipeline board-agnostic.
//
// A "board" is a folder of reference images (e.g. website). A "kind" is the
// shape of taste being extracted (e.g. visual-ui) and selects the measure
// strategy + tag rubric. Adding a second board later is a registry entry here,
// not a pipeline rewrite (see plan KTD5, R10).

import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Engine modules live in src/; the repo root is one level up.
export const REPO_ROOT = join(__dirname, '../');

// --- Env (mirrors the scripts/instagram convention) ---
export function loadEnv() {
  const envPath = join(REPO_ROOT, '.env');
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  }
}

// --- Model routing by stage (overridable per-script via --model) ---
export const MODELS = {
  tag: 'claude-haiku-4-5-20251001', // high-volume per-image vision
  cluster: 'claude-sonnet-4-6', // analysis
  directions: 'claude-sonnet-4-6', // deriving candidate directions from channels
  thesis: 'claude-sonnet-4-6', // writing
  generate: 'claude-opus-4-8', // hardest synthesis
  critique: 'claude-sonnet-4-6',
  score: 'claude-haiku-4-5-20251001', // re-tag pass on generated output (same tier as tag)
};

// --- Kind registry: a kind selects the measure strategy + tag rubric ---
export const KINDS = {
  'visual-ui': {
    measure: 'visual', // measure.mjs strategy key
    // Controlled tag vocabulary (rules, not vibes). tag.mjs rejects anything
    // outside this list so taste stays inspectable, not freeform adjectives.
    tagVocabulary: [
      'dark-field',
      'warm-ground',
      'bold-primary',
      'monolith-wordmark',
      'swiss-index',
      'mono-meta',
      'experimental-type',
      'case-study',
      'editorial-serif',
      'grotesk-display',
      'high-chroma',
      'muted-chroma',
      'high-density',
      'low-density',
      'art-directed-photo',
      'sculptural-object',
      '3d-playful',
      'animated',
    ],
    // Prior channels from the draft THESIS.md; cluster.mjs seeds with these
    // but lets the data revise them.
    channelSeeds: [
      'monolith-wordmark',
      'dark-editorial',
      'warm-editorial',
      'bold-primary-brutalist',
      'swiss-index',
      'case-study-functional',
      'experimental-type',
      'playful-3d',
    ],
  },
};

// --- Board registry: maps a board name to its folder + kind ---
// Add your own board by dropping images in boards/<name>/ and registering it here.
export const BOARDS = {
  demo: { kind: 'visual-ui', dir: 'boards/demo' },
};

// Resolve a board to its full config (board + kind merged + absolute dir).
// Throws a clear error on an unknown board or a board with an unknown kind.
export function getBoard(name) {
  let board = BOARDS[name];
  if (!board) {
    // Convention over config: an unregistered folder at boards/<name> is treated
    // as a visual-ui board, so dropping images in a folder and naming it is
    // enough. Registering in BOARDS is only needed for a different kind or path.
    const dir = join('boards', name);
    if (existsSync(join(REPO_ROOT, dir))) {
      board = { kind: 'visual-ui', dir };
    } else {
      throw new Error(
        `Unknown board "${name}". Known boards: ${Object.keys(BOARDS).join(', ')}. ` +
          `Or create boards/${name}/ and drop reference images in it.`,
      );
    }
  }
  const kind = KINDS[board.kind];
  if (!kind) {
    throw new Error(`Board "${name}" has unknown kind "${board.kind}".`);
  }
  return { name, ...board, ...kind, absDir: join(REPO_ROOT, board.dir) };
}
