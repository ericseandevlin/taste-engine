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
  tag: 'gemini-3.1-flash-image', // high-volume per-image vision
  cluster: 'gemini-3.5-flash', // analysis
  directions: 'gemini-3.5-flash', // deriving candidate directions from channels
  thesis: 'gemini-3.5-flash', // writing
  generate: 'gemini-3.1-flash-image', // poster generation
  critique: 'gemini-3.1-flash-image', // multi-image vision
  score: 'gemini-3.1-flash-image', // re-tag pass on generated output (same tier as tag)
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
  // Poster kind: taste extracted from poster references (not websites).
  // The measure strategy stays `visual` (palette/contrast/density via Sharp
  // runs on any image); the kind selects a poster-specific tag vocabulary and
  // channel seeds. The vocabulary below is derived from the swiss-focus
  // board's actual 44 references — see issue #3 for provenance — not invented.
  poster: {
    measure: 'visual',
    // Poster taste axes: composition, type, color, image, density, surface/print.
    // tag.mjs rejects anything outside this list, same discipline as visual-ui.
    tagVocabulary: [
      // Composition (asymmetric vs grid vs centered)
      'asymmetric-bleed',
      'grid-locked',
      'single-focal-asymmetric',
      'centered-forbidden',
      // Type (one voice, hierarchy by scale, display vs body)
      'one-grotesk-voice',
      'hierarchy-by-scale',
      'display-dominant',
      'wordmark-as-art',
      'typographic-grid',
      // Color (ink-first, dark as home key, accent scarce and earned)
      'ink-first',
      'dark-home-key',
      'warm-ground',
      'spot-accent-on-neutral',
      'full-field-color',
      // Image
      'documentary-photo',
      'full-bleed',
      'duotone-treated',
      'illustration',
      'no-image',
      // Density (generous margin vs tabular index vs collage)
      'generous-margin',
      'tabular-index',
      'dense-collage',
      'single-element',
      // Surface / print conventions
      'flat-no-effects',
      'hairline-structure',
      'exposed-construction',
      'bleed-to-edge',
    ],
    // Channel seeds from the swiss-focus channels.json (9 channels, real).
    // cluster.mjs seeds with these and lets the data revise them.
    channelSeeds: [
      'ink-grid-editorial',
      'warm-editorial',
      'dark-editorial',
      'grid-index-process',
      'oversized-wordmark',
      'type-as-image',
      'bold-primary-block',
      'dimensional-playful',
      'raw-list-interface',
    ],
  },
};

// --- Board registry: maps a board name to its folder + kind ---
// Add your own board by dropping images in boards/<name>/ and registering it here.
export const BOARDS = {
    demo: { kind: 'visual-ui', dir: 'boards/demo' },
    'swiss-focus': { kind: 'poster', dir: 'boards/swiss-focus' },
    'flat-layering': { kind: 'poster', dir: 'boards/flat-layering' },
  };

// --- Dependency graph: each stage's prerequisite output files ---
// Used by status.mjs and by run-pipeline.mjs for flow control.
const STAGE_DEPS = {
  import:       { files: [] },
  measure:      { files: ['manifest.json'] },
  tag:          { files: ['manifest.json'] },
  cluster:      { files: ['manifest.json'] },
  directions:   { files: ['channels.json'] },
  thesis:       { files: ['channels.json'] },
  atlas:        { files: ['manifest.json'] },
  fingerprint:  { files: ['channels.json'] },
  generate:     { files: ['directions.json'] },
  critique:     { files: ['directions.json'] },
  score:        { files: ['directions.json'] },
};

// File-level dependency: a file that must exist in the board directory for the
// stage to have anything meaningful to do. Returns { ok: boolean, missing: string[] }.
// The prereqs array in STAGE_DEPS is for dependency chains (e.g. cluster needs
// tag to have run); the files array is the actual output files to check.
export function checkDeps(stage, boardDir) {
  const cfg = STAGE_DEPS[stage];
  if (!cfg) return { ok: true, missing: [] };
  const missing = cfg.files.filter((f) => !existsSync(join(boardDir, f)));
  return missing.length > 0 ? { ok: false, missing } : { ok: true, missing: [] };
}

export function depsHint(stage, boardDir) {
  const result = checkDeps(stage, boardDir);
  if (result.ok) return null;
  return `Missing input file(s): ${result.missing.join(', ')}. Run \`npm run status\` for the full picture.`;
}
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
