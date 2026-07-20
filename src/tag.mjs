#!/usr/bin/env node
// tag.mjs — vision tagging pass (plan U4, R4). For each image, a vision model
// assigns rules-not-vibes tags (from a controlled vocabulary), candidate DNA
// channels, and short WHY/AVOID/KEEP notes. Results merge into the manifest.
//
// Tags outside the kind's vocabulary are dropped — taste stays inspectable data,
// not freeform adjectives. Malformed model output is retried, then fails loudly
// without corrupting the manifest (plan R11). Idempotent: skips tagged items
// unless --force; resumable after interruption.
//
// Usage:
//   node tag.mjs
//   node tag.mjs --board website --force --concurrency 4

import { join } from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import { getBoard, REPO_ROOT, MODELS, loadEnv, vocabIds } from './config.mjs';
import { majorityTags } from './features.mjs';
import { readManifest, writeManifest, mergeItemField } from './manifest.mjs';

const MAX_RETRIES = 2;

function parseArgs(argv) {
  const args = { board: 'demo', force: false, concurrency: 4, model: MODELS.tag, limit: 0, votes: 1 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--board') args.board = argv[++i];
    else if (argv[i] === '--force') args.force = true;
    else if (argv[i] === '--concurrency') args.concurrency = Number(argv[++i]);
    else if (argv[i] === '--model') args.model = argv[++i];
    else if (argv[i] === '--limit') args.limit = Number(argv[++i]);
    else if (argv[i] === '--votes') {
      const n = Number(argv[++i]);
      if (!Number.isInteger(n) || n < 1) throw new Error('--votes must be a positive integer');
      args.votes = n;
    }
  }
  return args;
}

// v2: every vocabulary entry carries a one-sentence testable definition that
// goes INTO the prompt. v1 sent bare ids, so the id string was the entire
// semantic instruction; a brand-flavored id contaminated measurement with the
// model's prior on the word. Apply a tag only when its DEFINITION holds.
// Legacy string vocabularies (BYO boards) still render as bare ids.
export function buildTagPrompt(vocabulary, channelSeeds) {
  const vocabLines = vocabulary.map((v) =>
    typeof v === 'string' ? `  ${v}` : `  ${v.id}: ${v.definition}`,
  );
  return [
    'You are analyzing a website / UI screenshot to extract its design DNA as inspectable data.',
    'Describe what the design DOES, in rules, not vibe words.',
    '',
    'Return ONLY a JSON object with exactly these keys:',
    '  "tags":    array of ids chosen ONLY from the controlled vocabulary below.',
    '             Apply an id only when its definition holds for this screenshot;',
    '             judge by the definition, never by associations with the id text.',
    ...vocabLines,
    '  "channels": array of 1-3 candidate channel ids chosen ONLY from:',
    `             ${channelSeeds.join(', ')}`,
    '  "notes":   { "why": "...", "avoid": "...", "keep": "..." }',
    '             why = what makes this composition work (1 sentence);',
    '             avoid = what would be a mistake to copy (1 sentence);',
    '             keep = the one move worth keeping (1 sentence).',
    '',
    'Do not invent tags or channels outside the lists. Return JSON only, no prose.',
  ].join('\n');
}

// Pure: validate + normalize a model response. Throws on unparseable output so
// the caller can retry. Unknown tags/channels are dropped, not persisted.
export function parseTagResponse(raw, vocabulary, channelSeeds) {
  const match = String(raw).match(/\{[\s\S]*\}/);
  if (!match) throw new Error('no JSON object in model response');
  let obj;
  try {
    obj = JSON.parse(match[0]);
  } catch (err) {
    throw new Error(`malformed JSON: ${err.message}`);
  }
  const vocab = new Set(vocabIds(vocabulary));
  const seeds = new Set(channelSeeds);
  const tags = Array.isArray(obj.tags)
    ? [...new Set(obj.tags.filter((t) => vocab.has(t)))]
    : [];
  const channels = Array.isArray(obj.channels)
    ? [...new Set(obj.channels.filter((c) => seeds.has(c)))]
    : [];
  const n = obj.notes && typeof obj.notes === 'object' ? obj.notes : {};
  const str = (v) => (typeof v === 'string' ? v.trim() : '');
  const notes = { why: str(n.why), avoid: str(n.avoid), keep: str(n.keep) };
  if (tags.length === 0 && channels.length === 0 && !notes.why) {
    throw new Error('response had no valid tags, channels, or notes');
  }
  return { tags, channels, notes };
}

// tagImage(absPath, board, callModel): callModel is injected so tests never hit
// the network. callModel({ image, mediaType, prompt }) -> raw string.
export async function tagImage(absPath, board, callModel) {
  const buf = await sharp(absPath)
    .resize(512, 512, { fit: 'inside' })
    .jpeg({ quality: 80 })
    .toBuffer();
  const prompt = buildTagPrompt(board.tagVocabulary, board.channelSeeds);
  let lastErr;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const raw = await callModel({
        image: buf.toString('base64'),
        mediaType: 'image/jpeg',
        prompt,
      });
      return parseTagResponse(raw, board.tagVocabulary, board.channelSeeds);
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(`tagImage failed after retries: ${lastErr.message}`);
}

// Real Anthropic Messages API call (only used by main).
function makeAnthropicCaller(model, apiKey) {
  return async ({ image, mediaType, prompt }) => {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 600,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
              { type: 'text', text: prompt },
            ],
          },
        ],
      }),
    });
    if (!res.ok) throw new Error(`anthropic ${res.status}: ${await res.text()}`);
    const j = await res.json();
    return (j.content || []).map((c) => c.text || '').join('');
  };
}

// Bounded-concurrency map.
async function pool(items, size, worker) {
  const results = [];
  let i = 0;
  const runners = Array.from({ length: Math.max(1, size) }, async () => {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await worker(items[idx], idx);
    }
  });
  await Promise.all(runners);
  return results;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  loadEnv();
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set (.env)');

  const board = getBoard(args.board);
  const manifestPath = join(board.absDir, 'manifest.json');
  const manifest = readManifest(manifestPath);
  if (!manifest) throw new Error(`No manifest at ${manifestPath} — run import.mjs first`);

  const callModel = makeAnthropicCaller(args.model, apiKey);
  let todo = manifest.items.filter((it) => args.force || !it.tags?.length);
  if (args.limit > 0) todo = todo.slice(0, args.limit);
  console.log(
    `[tag] board=${board.name} model=${args.model} to-tag=${todo.length} (skip ${manifest.items.length - todo.length})`,
  );

  let done = 0;
  let failed = 0;
  await pool(todo, args.concurrency, async (item) => {
    const absPath = join(REPO_ROOT, item.source.local);
    try {
      // --votes N: N independent passes, majority tags (stabilizes ids that
      // sit on a judgment knife edge); channels/notes come from the first pass.
      const results = [];
      for (let v = 0; v < args.votes; v++) results.push(await tagImage(absPath, board, callModel));
      const tags = args.votes > 1 ? majorityTags(results.map((r) => r.tags)) : results[0].tags;
      mergeItemField(manifest, item.id, 'tags', tags);
      mergeItemField(manifest, item.id, 'channels', results[0].channels);
      mergeItemField(manifest, item.id, 'notes', results[0].notes);
      done++;
      if (done % 10 === 0) {
        writeManifest(manifestPath, manifest, { stamp: new Date().toISOString() });
        console.log(`[tag] ${done}/${todo.length} (checkpoint saved)`);
      }
    } catch (err) {
      failed++;
      console.warn(`[tag] FAILED ${item.file}: ${err.message}`);
    }
  });

  writeManifest(manifestPath, manifest, { stamp: new Date().toISOString() });
  console.log(`[tag] done=${done} failed=${failed} -> ${manifestPath}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
