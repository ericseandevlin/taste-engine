#!/usr/bin/env node
// generate.mjs — generate a live interface from the engine's own taste data
// (plan U8, R8). Blends the channels of a named direction into one prompt,
// injects the union of their forbidden moves (plus the direction's notes and any
// critique rules from prior rounds), and asks the model for a self-contained,
// openable HTML page. Output is a live interface, not a flat image.
//
// Usage:
//   node generate.mjs                       # uses the board's first derived direction
//   node generate.mjs --direction <id> --variants 2

import { mkdirSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { getBoard, MODELS, loadEnv } from './config.mjs';
import { readManifest } from './manifest.mjs';
import { makeTextCaller } from './anthropic.mjs';
import { stripEmDash } from './thesis.mjs';

function parseArgs(argv) {
  const args = { board: 'demo', direction: null, variants: 1, model: MODELS.generate };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--board') args.board = argv[++i];
    else if (argv[i] === '--direction') args.direction = argv[++i];
    else if (argv[i] === '--variants') args.variants = Number(argv[++i]);
    else if (argv[i] === '--model') args.model = argv[++i];
  }
  return args;
}

// Pure: resolve a direction to its blended recipes + union of forbidden moves.
export function resolveDirection(directionsDoc, channelsDoc, id) {
  const dir = directionsDoc?.directions?.[id];
  if (!dir) {
    const known = Object.keys(directionsDoc?.directions || {}).join(', ');
    throw new Error(`Unknown direction "${id}". Known: ${known}`);
  }
  const byId = new Map((channelsDoc?.channels || []).map((c) => [c.id, c]));
  const recipes = [];
  const forbidden = new Set();
  for (const cid of dir.channels) {
    const c = byId.get(cid);
    if (!c) throw new Error(`direction "${id}" references unknown channel "${cid}"`);
    recipes.push({ id: c.id, name: c.name, recipe: c.recipe });
    (c.forbidden || []).forEach((f) => forbidden.add(f));
  }
  (dir.notes || []).forEach((n) => forbidden.add(n));
  return { id, name: dir.name, brief: dir.brief, palette: dir.palette, recipes, forbidden: [...forbidden] };
}

// Pure: build the generation prompt. extraRules are critique rules from prior
// rounds; profile (if present) is the user's real content, kept separate from taste.
export function buildGeneratePrompt(resolved, extraRules = [], profile = null) {
  const lines = [
    'Build a complete, production-quality single-page website (a homepage) as ONE self-contained HTML file with inline <style>.',
    'No external assets, no frameworks, no CDN links, no web fonts that require network. It must open directly from disk and be responsive (desktop and mobile).',
    '',
    `BRIEF: ${resolved.brief}`,
    '',
    `PALETTE: ${resolved.palette}`,
    '',
    'DESIGN RECIPES (blend these; together they define the taste):',
    ...resolved.recipes.map(
      (r) => `- ${r.name}: ${Object.entries(r.recipe).map(([k, v]) => `${k}: ${v}`).join('; ')}`,
    ),
    '',
    'FORBIDDEN (hard constraints, do not violate any):',
    ...resolved.forbidden.map((f) => `- ${f}`),
  ];
  if (extraRules.length) {
    lines.push('', 'CRITIQUE RULES FROM PRIOR ROUNDS (must obey):', ...extraRules.map((r) => `- ${r}`));
  }
  lines.push(
    '',
    'At the very top of the file, include an HTML comment block (the lineage) listing: the direction name, the channel ids blended, the key params, and the content source (profile or placeholder).',
  );
  if (profile) {
    const { _note, ...content } = profile;
    lines.push(
      '',
      'CONTENT: build the page around THIS real person and their work. Use these exact details. Do NOT invent names, projects, employers, clients, or metrics. If a field is absent, omit that section rather than fabricating it:',
      JSON.stringify(content, null, 2),
    );
  } else {
    lines.push(
      '',
      'CONTENT: no real content was provided. Use OBVIOUS placeholder copy the user will replace: the literal name "[Your Name]", role "[Your Role]", project titles like "[Project One]", and "you@example.com". Do NOT invent a believable persona, fake clients, or fake metrics. The page is a template to be filled in.',
    );
  }
  lines.push(
    '',
    'Dry copy, no buzzwords, no em dashes.',
    'Return ONLY the HTML document, starting with <!doctype html>. No markdown fences, no commentary.',
  );
  return lines.join('\n');
}

// Pure: pull a clean HTML document out of a model response.
export function extractHtml(raw) {
  let s = String(raw).trim();
  const fence = s.match(/```(?:html)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const i = s.search(/<!doctype html|<html[\s>]/i);
  if (i >= 0) s = s.slice(i);
  if (!/<html|<!doctype/i.test(s)) throw new Error('no HTML document in model output');
  return s.trim();
}

function pad(n) {
  return String(n).padStart(3, '0');
}

// Next free <direction>-NNN index so re-running preserves prior rounds for comparison.
function nextIndex(genRoot, direction) {
  let max = 0;
  if (existsSync(genRoot)) {
    const re = new RegExp(`^${direction}-(\\d+)$`);
    for (const d of readdirSync(genRoot)) {
      const m = re.exec(d);
      if (m) max = Math.max(max, Number(m[1]));
    }
  }
  return max + 1;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  loadEnv();
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set (.env)');

  const board = getBoard(args.board);
  const channelsDoc = readManifest(join(board.absDir, 'channels.json'));
  const directionsDoc = readManifest(join(board.absDir, 'directions.json'));
  if (!channelsDoc || !directionsDoc) throw new Error('Missing channels.json / directions.json');
  // Default to the board's first (heaviest) derived direction when none is named.
  if (!args.direction) args.direction = Object.keys(directionsDoc.directions || {})[0];
  if (!args.direction) throw new Error('No directions found — run `directions` first');
  const rulesDoc = readManifest(join(board.absDir, 'critique-rules.json')) || {};
  const extraRules = rulesDoc[args.direction] || [];

  const resolved = resolveDirection(directionsDoc, channelsDoc, args.direction);
  const profile = readManifest(join(board.absDir, 'profile.json'));
  if (!profile) {
    console.warn(
      `[generate] no profile.json in ${board.dir} — using labeled placeholder content. Add ${board.dir}/profile.json to put your own name and work on the page.`,
    );
  }
  const prompt = buildGeneratePrompt(resolved, extraRules, profile);
  const call = makeTextCaller(args.model, apiKey);

  const genRoot = join(board.absDir, 'generated');
  mkdirSync(genRoot, { recursive: true });
  const start = nextIndex(genRoot, args.direction);

  for (let v = 0; v < args.variants; v++) {
    const raw = await call({ prompt, maxTokens: 16000 });
    const html = stripEmDash(extractHtml(raw)); // no AI tells in published copy
    const slug = `${args.direction}-${pad(start + v)}`;
    const dir = join(genRoot, slug);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'index.html'), html);
    writeFileSync(
      join(dir, 'meta.json'),
      JSON.stringify(
        {
          direction: resolved.id,
          name: resolved.name,
          channels: resolved.recipes.map((r) => r.id),
          model: args.model,
          rulesApplied: extraRules.length,
          content: profile ? 'profile.json' : 'placeholder',
          generated: new Date().toISOString(),
        },
        null,
        2,
      ) + '\n',
    );
    console.log(`[generate] ${slug} (${resolved.name}, ${resolved.recipes.length} channels, ${extraRules.length} critique rules) -> ${join(dir, 'index.html')}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
