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
//
// v2 vocabulary rules (see docs/styles/ and the v2 design doc):
// - Every id is BEHAVIOR language: what the page does, checkable from a
//   screenshot. Never a style, movement, or brand name (v1's "swiss-index"
//   contaminated measurement with the model's prior on the word "swiss").
// - Every id carries a one-sentence testable definition. The definition goes
//   INTO the tag prompt; the id string alone is never the semantic instruction.
// - Grounded in the determinants research (docs/styles/*.md, literature-cited).
//   53 ids pre-calibration; the pre-freeze jitter calibration prunes ids that
//   flip run-to-run (consistency-only pruning, never score-based).
export const KINDS = {
  'visual-ui': {
    measure: 'visual', // measure.mjs strategy key
    // Controlled tag vocabulary (rules, not vibes). tag.mjs rejects anything
    // outside this list so taste stays inspectable, not freeform adjectives.
    tagVocabulary: [
      // structure & layout
      { id: 'strict-column-grid', definition: 'Content blocks align to a repeating column grid with uniform gutters, so the left and right edges of unrelated elements fall on a small shared set of vertical lines.' },
      { id: 'flush-left-ragged-right', definition: 'Running text and multi-line headings are set flush left with a ragged right edge, with no centered body text or centered multi-line headlines.' },
      { id: 'asymmetric-composition', definition: 'Masses of text, image, and empty space balance unequally around the vertical center line; mirroring the page would visibly change it and no centered axial arrangement dominates.' },
      { id: 'active-negative-space', definition: 'Large empty regions are deliberate and shaped, with edges that align to the layout lines, and a substantial share of the canvas carries no content.' },
      { id: 'hairline-dividers', definition: 'Sections or rows are separated by very thin rules, roughly one pixel, used repeatedly as the page dividing device rather than boxes, cards, or heavy bars.' },
      { id: 'heavy-rule-scaffolding', definition: 'Thick solid rules or bars, horizontal or vertical, divide zones, underline emphasis, or anchor the composition.' },
      { id: 'full-bleed-imagery', definition: 'At least one image runs to the canvas edge on one or more sides instead of sitting inset within margins.' },
      { id: 'index-table-listing', definition: 'The dominant content structure is a tabular index or catalog: three or more rows of aligned fields such as titles, dates, and categories. Apply only when the listing is the main content, not for a small table on an otherwise compositional page.' },
      { id: 'dense-utilitarian-lists', definition: 'Content is packed into dense text lists or tables with minimal padding and little or no imagery, prioritizing information transfer over visual comfort.' },
      { id: 'monolithic-block-massing', definition: 'The layout reads as a few heavy, hard-edged, often full-width rectangular slabs stacked or interlocked, not as many small floating cards.' },
      { id: 'deliberate-misalignment-or-overlap', definition: 'Elements visibly overlap, collide, or sit off-grid on purpose: rotated or offset blocks, type crossing other elements, colliding edges, while craft elsewhere shows the roughness is chosen.' },
      { id: 'tilted-rotated-elements', definition: 'One or more shapes, pattern blocks, or lines of type are rotated off the horizontal axis, deliberately breaking orthogonal alignment.' },
      { id: 'process-documentation', definition: 'The page documents work or process (steps, specs, artifacts, annotations) in a documentary register rather than marketing prose.' },
      // typography
      { id: 'single-sans-family', definition: 'All text is set in one neutral grotesque or neo-grotesque sans-serif family, varied only by size and weight, with at most one auxiliary family.' },
      { id: 'geometric-sans-display', definition: 'Display type is a geometric sans-serif: perfectly circular bowls on o and e, a single-story a, pointed apexes on A and N, compass-drawn feel. When display type is a neutral workhorse grotesque instead, do not apply.' },
      { id: 'grotesk-display', definition: 'Display or headline type is a grotesque or neo-grotesque sans with even, unshowy letterforms.' },
      { id: 'editorial-serif', definition: 'A serif family carries body or display text in an editorial register.' },
      { id: 'monospace-metadata', definition: 'Metadata such as dates, indices, captions, or labels is set in a monospace face distinct from the main text family.' },
      { id: 'oversized-wordmark', definition: 'A single word or name is set so large it acts as the page dominant visual mass.' },
      { id: 'oversized-load-bearing-type', definition: 'Display type is set at monumental scale, filling a large fraction of the viewport width or cropped by container or viewport edges, functioning as raw visual mass rather than a polished headline.' },
      { id: 'size-weight-position-hierarchy', definition: 'Information hierarchy is carried only by type size, weight, and position on the page, with no decorative devices such as banners, badge boxes, drop caps, or flourish underlines.' },
      { id: 'extreme-type-scale-contrast', definition: 'Display type is roughly four times body size or larger, producing a stepped scale with few intermediate sizes rather than a smooth ramp.' },
      { id: 'type-as-image', definition: 'Letterforms are the composition primary graphic material: single letters or short words scaled, cropped, layered, or arranged as shapes.' },
      { id: 'broken-grid-type', definition: 'Type is deliberately set off any grid: warped, scattered, overlapped, or on colliding baselines.' },
      { id: 'system-or-monospace-typography', definition: 'Body and interface text use system stacks, default serif, or monospace faces rather than a display face chosen for polish.' },
      { id: 'chunky-playful-display-type', definition: 'Headlines use bold rounded or toy-like display letterforms, often multicolored per letter, outlined, or set on a bouncing or tilted baseline.' },
      // imagery
      { id: 'art-directed-photo', definition: 'Photography is deliberately staged, lit, or graded as the page aesthetic centerpiece.' },
      { id: 'objective-documentary-imagery', definition: 'Any imagery present is objective documentary photography, often black-and-white, or flat constructed geometric abstraction. Apply when ALL imagery on the page fits; pages whose only imagery is flat geometric abstraction qualify.' },
      { id: 'sculptural-object', definition: 'A photographed or rendered three-dimensional object is the page hero element.' },
      { id: 'dimensional-render', definition: 'Soft-shaded 3D renders with visible depth and lighting appear as content.' },
      // graphic devices & ornament
      { id: 'flat-geometric-primitives', definition: 'Flat, hard-edged circles, squares, triangles, or bars act as compositional elements, not icons or data marks, constructible with ruler and compass.' },
      { id: 'scattered-geometric-primitives', definition: 'Elementary shapes are strewn across or behind the content as pure ornament rather than as functional icons or data marks.' },
      { id: 'squiggle-motif', definition: 'Freeform wavy or squiggly lines appear as decoration anywhere on the page: single wiggly strokes, zigzag runs, or a dense squiggle field filling a surface.' },
      { id: 'speckle-chip-pattern', definition: 'A terrazzo-like or confetti-like field of small irregular multicolor chips fills a background, band, or shape interior.' },
      { id: 'black-white-counterchange-pattern', definition: 'High-contrast black-and-white stripes, checkerboards, grids, or dot fields appear as pattern blocks.' },
      { id: 'pattern-clash-adjacency', definition: 'Two or more unrelated pattern fields (stripes, checkerboards, speckle, squiggle fields) sit directly adjacent or nearly adjacent with hard edges and no transitional element.' },
      { id: 'ornament-without-function', definition: 'Decorative elements (shapes, patterns, motifs) are scattered on or around the content purely for visual energy: they convey no information and are not navigation, icons, or data. If removing them would leave the content and layout intact, apply this tag.' },
      { id: 'black-keyline-outlines', definition: 'Shapes, cards, or buttons carry solid black outline strokes of uniform weight, reading as drawn contours.' },
      { id: 'hard-offset-shadows', definition: 'Elements cast flat, zero-blur shadow copies offset diagonally in solid black or a clashing color.' },
      { id: 'playful-geometry', definition: 'Rounded, toy-like geometric shapes act as interface or content elements, giving the page a deliberately playful register.' },
      // construction & surface
      { id: 'flat-unmodulated-color-fields', definition: 'Every fill on the page, colored or not (including whites, greys, and blacks), is a single flat unmodulated tone: no gradients, drop shadows, bevels, glows, or simulated depth anywhere. Black-and-white pages qualify when all their fills are flat.' },
      { id: 'hard-edged-zero-effects', definition: 'Every box or region on the page has square corners and flat fills, with no soft shadows, blurs, glass effects, rounded corners, or layered elevation anywhere. Plain unstyled pages with default square boxes qualify.' },
      { id: 'undisguised-construction', definition: 'Structural seams (borders, table rules, dividers, native form widgets, visible grid edges) are left exposed as part of the design rather than hidden behind padding, whitespace, or decorative chrome. Apply only when exposed structure is a visible feature of the page, not merely because rules exist.' },
      { id: 'browser-default-styling', definition: 'Text, links, and controls look close to unstyled HTML: default or system fonts, underlined links, native buttons and inputs.' },
      { id: 'restricted-palette-single-accent', definition: 'The page is built from black, white, and greys plus AT MOST two saturated accent hues. Pages with zero accents qualify; a third saturated hue disqualifies.' },
      // color & field behavior (kept from v1, definitions added)
      { id: 'dark-field', definition: 'The dominant ground is near-black or very dark.' },
      { id: 'warm-ground', definition: 'The dominant ground is a warm off-white, cream, or beige.' },
      { id: 'bold-primary', definition: 'Saturated primary color fields (red, yellow, or blue) act as major compositional elements: blocks, bars, or shapes that carry real area on the page, not small accents or link colors.' },
      { id: 'high-chroma', definition: 'Saturated color covers a large share of the canvas, roughly a quarter or more of the visible page.' },
      { id: 'muted-chroma', definition: 'Color presence is desaturated or restrained overall.' },
      { id: 'high-density', definition: 'The canvas is busy: many elements, little breathing room.' },
      { id: 'low-density', definition: 'The canvas is sparse: few elements, lots of breathing room.' },
      { id: 'animated', definition: 'Visible motion or animation artifacts are present, such as carousels mid-transition, marquee text, or motion blur.' },
    ],
    // Prior channels; cluster.mjs seeds with these but lets the data revise
    // them. Behavior names only (display-layer metadata, never style brands).
    channelSeeds: [
      'oversized-wordmark',
      'dark-editorial',
      'warm-editorial',
      'bold-primary-block',
      'grid-index',
      'process-documentation',
      'type-as-image',
      'dimensional-playful',
    ],
  },
};

// Vocabulary ids, tolerant of both v2 entries ({ id, definition }) and legacy
// v1 string vocabularies (public repo: BYO boards may still register strings).
export function vocabIds(vocabulary) {
  return (vocabulary || []).map((v) => (typeof v === 'string' ? v : v.id));
}

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
