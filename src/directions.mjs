#!/usr/bin/env node
// directions.mjs — DERIVE candidate directions from the board's own channels.
// A direction is the choose-your-lane unit: a coherent blend of 1-3 channels the
// board actually contains, weighted toward its heaviest channels, with a brief
// and palette pulled from the board's data. generate.mjs builds from a direction.
//
// The point: directions are a FUNCTION OF THE MOODBOARD, not our opinion. A board
// with no playful imagery yields no playful direction. This is why the step is
// derived (like channels.json and THESIS.md), never hand-authored.
//
// Reads channels.json + manifest (for the board palette). Writes directions.json,
// a generated artifact: re-run to regenerate, do not hand-edit.
//
// Usage:
//   node directions.mjs
//   node directions.mjs --board demo --count 4

import { join } from 'path';
import { fileURLToPath } from 'url';
import { getBoard, MODELS, loadEnv } from './config.mjs';
import { readManifest, writeManifest } from './manifest.mjs';
import { makeTextCaller } from './anthropic.mjs';

const MIN_DIRECTIONS = 3;
const MAX_RETRIES = 2;

function parseArgs(argv) {
  const args = { board: 'demo', count: 4, model: MODELS.directions };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--board') args.board = argv[++i];
    else if (argv[i] === '--count') args.count = Number(argv[++i]);
    else if (argv[i] === '--model') args.model = argv[++i];
  }
  return args;
}

// Compact channel summary with weight (member count) so the model can rank by
// how central each style is to the board.
export function buildDirectionsInput(channelsDoc) {
  return (channelsDoc?.channels || []).map((c) => ({
    id: c.id,
    name: c.name,
    weight: (c.members || []).length,
    recipe: c.recipe,
    forbidden: c.forbidden || [],
  }));
}

// Dominant palette across the board, weighted by how much area each hex covers.
export function boardPalette(manifest, k = 8) {
  const counts = new Map();
  for (const it of manifest.items || []) {
    for (const p of it.measured?.palette || []) {
      counts.set(p.hex, (counts.get(p.hex) || 0) + (p.pct || 1));
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, k)
    .map(([hex]) => hex);
}

export function buildDirectionsPrompt(input, palette, count) {
  return [
    `You are proposing candidate design DIRECTIONS for a website, derived ENTIRELY from one person's moodboard.`,
    'The board has already been clustered into the DNA channels below; each carries a weight (how many board items express it).',
    'A direction is a buildable point of view: a blend of 1 to 3 of THESE channels that genuinely belong together.',
    '',
    'Rules:',
    `- Propose between ${MIN_DIRECTIONS} and ${count} directions, ordered strongest first.`,
    "- Favor the heaviest channels. The board's center of gravity must be represented. A channel with weight 1 is a minor accent, not a headline direction, and should not anchor a direction on its own.",
    '- Only blend channels whose forbidden moves do NOT contradict each other (never blend one that forbids rounded/soft with one that requires it).',
    '- Every channel id you use MUST be from the list below. Invent nothing.',
    "- Each direction needs a brief grounded in THIS board's signature, and a palette drawn from the board's dominant colors below.",
    '- Keep the directions meaningfully distinct from one another; do not propose three variations of the same idea.',
    '',
    `Board dominant palette: ${palette.join(', ')}`,
    '',
    'Return ONLY JSON: { "directions": [ {',
    '  "id": kebab-case id,',
    '  "name": short human name,',
    '  "channels": [1-3 channel ids from the list below],',
    '  "brief": "what this site is, grounded in the board",',
    '  "palette": "specific colors taken from the board palette",',
    '  "notes": [2-3 concrete forbidden-move emphases for this direction]',
    '} ] }',
    '',
    'CHANNELS (id, name, weight, recipe, forbidden):',
    JSON.stringify(input),
  ].join('\n');
}

// Pure: validate the model response. Drops directions referencing unknown
// channels; requires at least MIN_DIRECTIONS survive, each with >=1 valid channel.
export function parseDirectionsResponse(raw, validChannelIds) {
  const match = String(raw).match(/\{[\s\S]*\}/);
  if (!match) throw new Error('no JSON object in directions response');
  let obj;
  try {
    obj = JSON.parse(match[0]);
  } catch (err) {
    throw new Error(`malformed JSON: ${err.message}`);
  }
  const ids = new Set(validChannelIds);
  const list = Array.isArray(obj.directions) ? obj.directions : [];
  const cleaned = list
    .map((d) => {
      const channels = [...new Set((d.channels || []).filter((c) => ids.has(c)))];
      if (!channels.length || !d.id) return null;
      return {
        id: String(d.id),
        name: d.name || d.id,
        channels,
        brief: d.brief || '',
        palette: d.palette || '',
        notes: Array.isArray(d.notes) ? d.notes : [],
      };
    })
    .filter(Boolean);
  if (cleaned.length < MIN_DIRECTIONS) {
    throw new Error(`expected >= ${MIN_DIRECTIONS} valid directions, got ${cleaned.length}`);
  }
  return cleaned;
}

// Pure: array -> the id-keyed object generate.mjs / critique.mjs consume.
export function toKeyed(list) {
  const directions = {};
  for (const d of list) {
    directions[d.id] = {
      name: d.name,
      brief: d.brief,
      palette: d.palette,
      channels: d.channels,
      notes: d.notes,
    };
  }
  return directions;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  loadEnv();
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set (.env)');

  const board = getBoard(args.board);
  const manifest = readManifest(join(board.absDir, 'manifest.json'));
  const channelsDoc = readManifest(join(board.absDir, 'channels.json'));
  if (!manifest || !channelsDoc) {
    throw new Error('Missing manifest.json / channels.json — run cluster first');
  }

  const input = buildDirectionsInput(channelsDoc);
  const validChannelIds = input.map((c) => c.id);
  const palette = boardPalette(manifest);
  const prompt = buildDirectionsPrompt(input, palette, args.count);
  const call = makeTextCaller(args.model, apiKey);

  let list;
  let lastErr;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const raw = await call({ prompt, maxTokens: 4000 });
      list = parseDirectionsResponse(raw, validChannelIds);
      break;
    } catch (err) {
      lastErr = err;
      console.warn(`[directions] attempt ${attempt + 1} failed: ${err.message}`);
    }
  }
  if (!list) throw new Error(`directions derivation failed after retries: ${lastErr.message}`);

  const directionsPath = join(board.absDir, 'directions.json');
  writeManifest(directionsPath, {
    board: board.name,
    generated: new Date().toISOString(),
    directions: toKeyed(list),
  });

  console.log(`[directions] ${list.length} directions derived -> ${directionsPath}`);
  for (const d of list) console.log(`  ${d.id} (${d.channels.join(' + ')}): ${d.name}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
