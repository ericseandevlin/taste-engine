#!/usr/bin/env node
// gemini-tag.mjs — vision tagging using Gemini Flash Image (replaces Anthropic
// tag.mjs for environments where Claude is not available).
//
// Reads each image from a board, sends it to Gemini Vision with the poster tag
// vocabulary, gets back tags + channel assignments, and writes to the manifest.
// Designed as a one-shot replacement for tag.mjs when Anthropic keys are absent.
//
// Usage:
//   node scripts/gemini-tag.mjs --board flat-layering
//   node scripts/gemini-tag.mjs --board flat-layering --force

import { readFileSync, writeFileSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';
import { getBoard, REPO_ROOT, KINDS, loadEnv } from '../src/config.mjs';
import { readManifest, writeManifest } from '../src/manifest.mjs';

const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1/models';

function parseArgs(argv) {
  const args = { board: 'demo', force: false, model: 'gemini-3.1-flash-image', concurrency: 1, limit: 0 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--board') args.board = argv[++i];
    else if (argv[i] === '--force') args.force = true;
    else if (argv[i] === '--model') args.model = argv[++i];
    else if (argv[i] === '--concurrency') args.concurrency = Number(argv[++i]);
    else if (argv[i] === '--limit') args.limit = Number(argv[++i]);
  }
  return args;
}

function imageToBase64(path) {
  const buf = readFileSync(path);
  const ext = extname(path).toLowerCase();
  const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
  return { data: buf.toString('base64'), mimeType: mime };
}

async function tagImage(imagePath, vocabulary, apiKey, model) {
  const img = imageToBase64(imagePath);
  const vocabList = vocabulary.join('\n');
  const prompt = `You are a design critic analyzing reference images for a taste extraction pipeline.

Tag this reference image using the controlled vocabulary below. Each tag describes a specific, observable design rule — not a vague adjective.

CONTROLLED VOCABULARY:
${vocabList}

Assign the most relevant tags (3-8). A tag must be literally observable in the image — not aspirational, not inferred.

Also propose 1-2 candidate "channels" (design DNA strands) this image could belong to. A channel is a coherent combination of tags that describes a design language. Name them descriptively, e.g. "flat-color-layering" or "overlapping-transparency".

Return ONLY valid JSON, no markdown fences, no commentary:
{
  "tags": ["tag1", "tag2", ...],
  "channels": ["channel1", "channel2", ...],
  "why": "One sentence on what this image contributes to the board's taste.",
  "avoid": "One sentence on what NOT to do when designing in this style."
}`;

  const url = `${GEMINI_ENDPOINT}/${model}:generateContent?key=${apiKey}`;
  const body = {
    contents: [{
      parts: [
        { inlineData: { mimeType: img.mimeType, data: img.data } },
        { text: prompt }
      ]
    }]
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini ${res.status} for ${imagePath}: ${err}`);
  }

  const data = await res.json();
  const text = (data.candidates?.[0]?.content?.parts || [])
    .filter(p => p.text)
    .map(p => p.text)
    .join('');

  // Parse JSON from response
  let json;
  try {
    // Remove markdown fences if present
    let cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    json = JSON.parse(cleaned);
  } catch {
    // Try to find JSON in the text
    const m = text.match(/\{[\s\S]*"tags"[\s\S]*\}/);
    if (m) {
      try { json = JSON.parse(m[0]); } catch { json = { tags: [], channels: [], why: text.substring(0, 200), avoid: '' }; }
    } else {
      json = { tags: [], channels: [], why: text.substring(0, 200), avoid: '' };
    }
  }

  // Validate tags against vocabulary
  const vocabSet = new Set(vocabulary);
  json.tags = (json.tags || []).filter(t => vocabSet.has(t));

  return json;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  loadEnv();
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set in .env');

  const board = getBoard(args.board);
  const kind = KINDS[board.kind];
  if (!kind) throw new Error(`Unknown kind "${board.kind}" for board "${args.board}"`);

  const manifestPath = join(board.absDir, 'manifest.json');
  let manifest = readManifest(manifestPath);
  if (!manifest) throw new Error(`No manifest at ${manifestPath} — run import.mjs first`);

  // Filter to untagged items (or all if --force)
  let items = manifest.items;
  if (args.limit) items = items.slice(0, args.limit);
  if (!args.force) {
    items = items.filter(item => !item.tags || !item.tags.length);
  }

  console.log(`[gemini-tag] board=${args.board} items=${items.length} vocabulary=${kind.tagVocabulary.length} tags`);

  let tagged = 0;
  let failed = 0;

  // Process sequentially (Gemini free tier rate limits)
  for (const item of items) {
    const imagePath = join(board.absDir, item.file);
    console.log(`[gemini-tag]  ${item.id} (${item.file})...`);
    try {
      const result = await tagImage(imagePath, kind.tagVocabulary, apiKey, args.model);
      item.tags = result.tags;
      item.channels = result.channels;
      item.notes = {
        why: result.why,
        avoid: result.avoid,
      };
      console.log(`[gemini-tag]    tags=${result.tags.length} channels=${result.channels?.length || 0}: ${result.tags.slice(0, 4).join(', ')}${result.tags.length > 4 ? '...' : ''}`);
      tagged++;
    } catch (err) {
      console.error(`[gemini-tag]    FAILED: ${err.message}`);
      failed++;
    }
  }

  writeManifest(manifestPath, manifest);
  console.log(`[gemini-tag] done: ${tagged} tagged, ${failed} failed, ${items.length - tagged - failed} skipped`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();