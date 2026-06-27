#!/usr/bin/env node
// cluster.mjs — cluster the tagged manifest into 6-12 DNA channels (plan U5, R5).
// A channel is a *generative recipe* ("what a canvas should draw"), not a label:
// each carries a recipe, forbidden moves, representatives, and members.
// Writes channels.json and reconciles each item's channels[] back-reference.
//
// Operates on the extracted DATA (tags + palette + candidates), not the images —
// the whole point is that taste is now inspectable data we can cluster.
//
// Usage:
//   node cluster.mjs
//   node cluster.mjs --board website --model claude-sonnet-4-6

import { join } from 'path';
import { fileURLToPath } from 'url';
import { getBoard, MODELS, loadEnv } from './config.mjs';
import { readManifest, writeManifest } from './manifest.mjs';
import { makeTextCaller } from './anthropic.mjs';

const MIN_CHANNELS = 6;
const MAX_CHANNELS = 12;
const MAX_RETRIES = 2;

function parseArgs(argv) {
  const args = { board: 'demo', model: MODELS.cluster };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--board') args.board = argv[++i];
    else if (argv[i] === '--model') args.model = argv[++i];
  }
  return args;
}

// Compact per-item summary fed to the model (no images).
export function buildClusterInput(manifest) {
  return manifest.items.map((i) => ({
    id: i.id,
    title: i.title,
    tags: i.tags || [],
    candidates: i.channels || [],
    palette: (i.measured?.palette || []).slice(0, 3).map((p) => p.hex),
  }));
}

function buildClusterPrompt(input, channelSeeds) {
  return [
    `You are clustering ${input.length} website/UI references into visual DNA channels.`,
    'Group by shared BEHAVIOR (how they compose), not by subject. Aim for 6-12 channels.',
    'Each channel is a generative recipe an agent can build from — not an adjective.',
    '',
    `Prior channel ideas to use as seeds (revise freely based on the data): ${channelSeeds.join(', ')}.`,
    '',
    'Return ONLY JSON: { "channels": [ {',
    '  "id": kebab-case id,',
    '  "name": short human name,',
    '  "recipe": { "ground": "", "type": "", "accent": "", "photo": "", "space": "", "motion": "" },',
    '  "forbidden": [3-6 concrete moves to avoid],',
    '  "representatives": [2-3 item ids that best embody it],',
    '  "members": [all item ids in this channel]',
    '} ] }',
    '',
    'Every id in representatives/members MUST be an item id from the data below.',
    'An item may belong to more than one channel. Return JSON only.',
    '',
    'DATA:',
    JSON.stringify(input),
  ].join('\n');
}

// Pure: validate the model response. Drops unknown member/representative ids;
// requires 6-12 channels each with >=1 valid representative and a recipe.
export function parseClusterResponse(raw, validIds) {
  const match = String(raw).match(/\{[\s\S]*\}/);
  if (!match) throw new Error('no JSON object in cluster response');
  let obj;
  try {
    obj = JSON.parse(match[0]);
  } catch (err) {
    throw new Error(`malformed JSON: ${err.message}`);
  }
  const ids = new Set(validIds);
  const channels = Array.isArray(obj.channels) ? obj.channels : [];
  if (channels.length < MIN_CHANNELS || channels.length > MAX_CHANNELS) {
    throw new Error(`expected ${MIN_CHANNELS}-${MAX_CHANNELS} channels, got ${channels.length}`);
  }
  const cleaned = channels.map((c) => {
    const members = [...new Set((c.members || []).filter((id) => ids.has(id)))];
    const representatives = [...new Set((c.representatives || []).filter((id) => ids.has(id)))];
    if (representatives.length === 0) {
      throw new Error(`channel "${c.id || c.name}" has no valid representatives`);
    }
    if (!c.recipe || typeof c.recipe !== 'object') {
      throw new Error(`channel "${c.id || c.name}" has no recipe`);
    }
    return {
      id: c.id,
      name: c.name,
      recipe: c.recipe,
      forbidden: Array.isArray(c.forbidden) ? c.forbidden : [],
      representatives,
      members,
    };
  });
  return cleaned;
}

// Reconcile each item's channels[] to the final channel ids it belongs to.
export function reconcileMembership(manifest, channels) {
  const byItem = new Map(manifest.items.map((i) => [i.id, []]));
  for (const ch of channels) {
    for (const id of ch.members) {
      if (byItem.has(id)) byItem.get(id).push(ch.id);
    }
  }
  for (const item of manifest.items) item.channels = byItem.get(item.id) || [];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  loadEnv();
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set (.env)');

  const board = getBoard(args.board);
  const manifestPath = join(board.absDir, 'manifest.json');
  const channelsPath = join(board.absDir, 'channels.json');
  const manifest = readManifest(manifestPath);
  if (!manifest) throw new Error(`No manifest at ${manifestPath} — run import/measure/tag first`);

  const input = buildClusterInput(manifest);
  const validIds = input.map((i) => i.id);
  const prompt = buildClusterPrompt(input, board.channelSeeds);
  const call = makeTextCaller(args.model, apiKey);

  let channels;
  let lastErr;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const raw = await call({ prompt, maxTokens: 4000 });
      channels = parseClusterResponse(raw, validIds);
      break;
    } catch (err) {
      lastErr = err;
      console.warn(`[cluster] attempt ${attempt + 1} failed: ${err.message}`);
    }
  }
  if (!channels) throw new Error(`clustering failed after retries: ${lastErr.message}`);

  reconcileMembership(manifest, channels);
  writeManifest(manifestPath, manifest, { stamp: new Date().toISOString() });
  writeManifest(channelsPath, { board: board.name, generated: new Date().toISOString(), channels });

  console.log(
    `[cluster] ${channels.length} channels -> ${channelsPath}`,
  );
  for (const c of channels) console.log(`  ${c.id} (${c.members.length} members): ${c.name}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
