#!/usr/bin/env node
// critique.mjs — inspect a generated page in concrete language and turn each
// critique into a RULE the next generation must obey (plan U9, R9). Vague
// findings ("make it cooler") are rejected. Rules append to critique-rules.json,
// which generate.mjs injects on its next run, closing the loop.
//
// Screenshots are passed in (capture them with the dev browser): this keeps the
// script dependency-light. Provide desktop + mobile shots for the page.
//
// Usage:
//   node critique.mjs --slug <id>-001                      # finds desktop.png + mobile.png in the slug dir
//   node critique.mjs --direction <id> --shots a.png,b.png # or pass shot paths explicitly

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { extname } from 'path';
import { getBoard, MODELS, loadEnv } from './config.mjs';
import { readManifest, writeManifest } from './manifest.mjs';
import { resolveDirection } from './generate.mjs';

const VAGUE = /\b(cooler|nicer|prettier|more modern|pop|cleaner|better|sleek|fresh|polished)\b/i;

function parseArgs(argv) {
  const args = { board: 'demo', direction: null, slug: null, shots: [], model: MODELS.critique };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--board') args.board = argv[++i];
    else if (argv[i] === '--direction') args.direction = argv[++i];
    else if (argv[i] === '--slug') args.slug = argv[++i];
    else if (argv[i] === '--shots') args.shots = argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
    else if (argv[i] === '--model') args.model = argv[++i];
  }
  return args;
}

export function buildCritiquePrompt(resolved) {
  return [
    `Critique this generated webpage against its intended direction "${resolved.name}". You are shown desktop and mobile screenshots.`,
    'Be concrete and testable. Name the element, the problem, and the fix as a rule. Do NOT say "make it cooler/cleaner/more modern".',
    '',
    'Intended recipe:',
    ...resolved.recipes.map((r) => `- ${r.name}: ${Object.entries(r.recipe).map(([k, v]) => `${k}: ${v}`).join('; ')}`),
    '',
    'Forbidden moves it must respect:',
    ...resolved.forbidden.map((f) => `- ${f}`),
    '',
    'Check: overflow/clipping, mobile legibility (type sizes), grid alignment, accent overuse, contrast, blank gaps, and any forbidden-move violations.',
    'Return ONLY JSON: { "rules": ["<concrete, testable instruction the next generation must obey>", ...] }.',
    'Each rule must reference a specific element or measurable property. 3-8 rules.',
  ].join('\n');
}

// Pure: validate critique output. Drops vague/non-testable rules. Throws if none survive.
export function parseCritiqueResponse(raw) {
  const match = String(raw).match(/\{[\s\S]*\}/);
  if (!match) throw new Error('no JSON object in critique response');
  let obj;
  try {
    obj = JSON.parse(match[0]);
  } catch (err) {
    throw new Error(`malformed JSON: ${err.message}`);
  }
  const rules = Array.isArray(obj.rules) ? obj.rules : [];
  const clean = [...new Set(rules.map((r) => String(r).trim()))].filter(
    (r) => r.length >= 15 && !VAGUE.test(r),
  );
  if (clean.length === 0) throw new Error('no concrete rules in critique (all vague or empty)');
  return clean;
}

// Pure: append rules for a direction, deduped. Returns updated doc + added count.
export function appendRules(rulesDoc, direction, newRules) {
  const doc = { ...rulesDoc };
  const existing = doc[direction] || [];
  const set = new Set(existing);
  let added = 0;
  for (const r of newRules) {
    if (!set.has(r)) {
      set.add(r);
      added++;
    }
  }
  doc[direction] = [...set];
  return { doc, added };
}

function mediaType(path) {
  const e = extname(path).toLowerCase();
  if (e === '.png') return 'image/png';
  if (e === '.jpg' || e === '.jpeg') return 'image/jpeg';
  if (e === '.webp') return 'image/webp';
  throw new Error(`unsupported screenshot type: ${e}`);
}

// Multi-image vision call (critique needs desktop + mobile in one message).
async function callVisionMulti({ model, apiKey, images, prompt }) {
  const content = images.map((img) => ({
    type: 'image',
    source: { type: 'base64', media_type: img.mediaType, data: img.data },
  }));
  content.push({ type: 'text', text: prompt });
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model, max_tokens: 1500, messages: [{ role: 'user', content }] }),
  });
  if (!res.ok) throw new Error(`anthropic ${res.status}: ${await res.text()}`);
  const j = await res.json();
  return (j.content || []).map((c) => c.text || '').join('');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  loadEnv();
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set (.env)');

  const board = getBoard(args.board);
  const channelsDoc = readManifest(join(board.absDir, 'channels.json'));
  const directionsDoc = readManifest(join(board.absDir, 'directions.json'));
  // Infer the direction from the slug (<direction>-NNN) when not given, else use the first.
  if (!args.direction) {
    args.direction = (args.slug && args.slug.replace(/-\d+$/, '')) || Object.keys(directionsDoc?.directions || {})[0];
  }
  const resolved = resolveDirection(directionsDoc, channelsDoc, args.direction);

  let shots = args.shots;
  if (!shots.length && args.slug) {
    const dir = join(board.absDir, 'generated', args.slug);
    shots = ['desktop.png', 'mobile.png'].map((f) => join(dir, f)).filter(existsSync);
  }
  if (!shots.length) throw new Error('no screenshots: pass --shots a,b or --slug with desktop.png/mobile.png');

  const images = shots.map((p) => ({ data: readFileSync(p).toString('base64'), mediaType: mediaType(p) }));
  const raw = await callVisionMulti({ model: args.model, apiKey, images, prompt: buildCritiquePrompt(resolved) });
  const rules = parseCritiqueResponse(raw);

  const rulesPath = join(board.absDir, 'critique-rules.json');
  const { doc, added } = appendRules(readManifest(rulesPath) || {}, args.direction, rules);
  writeManifest(rulesPath, doc);

  console.log(`[critique] ${rules.length} concrete rules (${added} new) -> ${rulesPath}`);
  for (const r of rules) console.log(`  - ${r}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
