#!/usr/bin/env node
// thesis.mjs — regenerate THESIS.md from channels.json (plan U7, R7).
// The thesis is a GENERATED artifact sitting on top of the data, not hand prose:
// the channel table and recipes are built deterministically from the data; a
// model writes only the synthesis prose (values, laws, convergence).
//
// House rules enforced as gates (memory: no AI tells, no claimed taste):
//   - zero em dashes (sanitized before write)
//   - no claimed-taste credential phrasing (warned)
//
// Usage:
//   node thesis.mjs
//   node thesis.mjs --board website --model claude-sonnet-4-6

import { join } from 'path';
import { fileURLToPath } from 'url';
import { writeFileSync } from 'fs';
import { getBoard, MODELS, loadEnv } from './config.mjs';
import { readManifest } from './manifest.mjs';
import { makeTextCaller } from './anthropic.mjs';

const CLAIMED_TASTE = [
  'award-winning', 'passionate', 'an eye for', 'refined taste',
  'impeccable taste', 'tasteful', 'world-class', 'best-in-class',
];

function parseArgs(argv) {
  const args = { board: 'demo', model: MODELS.thesis };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--board') args.board = argv[++i];
    else if (argv[i] === '--model') args.model = argv[++i];
  }
  return args;
}

export function hasEmDash(s) {
  return /[—–]/.test(String(s)); // em dash and en dash
}

export function stripEmDash(s) {
  return String(s)
    .replace(/\s+[—–]\s+/g, ', ')
    .replace(/[—–]/g, ', ');
}

export function claimedTasteHits(s, list = CLAIMED_TASTE) {
  const low = String(s).toLowerCase();
  return list.filter((phrase) => low.includes(phrase));
}

// Aggregate measured/tag data across the board for data-derived sections.
export function buildThesisInput(manifest, channels) {
  const tagFreq = {};
  const hexFreq = {};
  for (const it of manifest.items) {
    for (const t of it.tags || []) tagFreq[t] = (tagFreq[t] || 0) + 1;
    for (const p of it.measured?.palette || []) {
      hexFreq[p.hex] = (hexFreq[p.hex] || 0) + (p.pct || 1);
    }
  }
  const topTags = Object.entries(tagFreq).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const topHex = Object.entries(hexFreq).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([h]) => h);
  const channelsByWeight = [...channels].sort((a, b) => (b.members?.length || 0) - (a.members?.length || 0));
  return { topTags, topHex, channelsByWeight, itemCount: manifest.items.length };
}

function signature(recipe = {}) {
  return [recipe.ground, recipe.accent].filter(Boolean).join('; ').slice(0, 120);
}

// Pure: assemble the full THESIS.md from data + model prose. Deterministic given
// fixed inputs (the table/recipes don't depend on the model).
export function assembleThesis(board, agg, channels, prose, stamp = '') {
  const rows = agg.channelsByWeight
    .map((c) => `| ${c.name} | ${c.members?.length || 0} | ${signature(c.recipe)} |`)
    .join('\n');

  const detail = agg.channelsByWeight
    .map((c) => {
      const recipe = Object.entries(c.recipe || {})
        .map(([k, v]) => `- **${k}:** ${v}`)
        .join('\n');
      const forbidden = (c.forbidden || []).join('; ');
      return `### ${c.name} (${c.members?.length || 0} items)\n${recipe}\n\nForbidden: ${forbidden}`;
    })
    .join('\n\n');

  const tagLine = agg.topTags.map(([t, n]) => `${t} (${n})`).join(', ');
  const hexLine = agg.topHex.join(', ');

  const body = [
    `# Taste DNA: ${board.name}`,
    '',
    `Generated ${stamp} from \`${board.dir}/\` (${agg.itemCount} items, ${channels.length} channels) by \`src/thesis.mjs\`. This is a generated artifact: it sits on top of \`manifest.json\` + \`channels.json\`. Do not hand-edit; re-run to regenerate.`,
    '',
    '## Manifest (channels by weight)',
    '',
    '| Channel | Items | Signature |',
    '|---|---|---|',
    rows,
    '',
    `**Most frequent tags:** ${tagLine}`,
    '',
    `**Dominant palette across the board:** ${hexLine}`,
    '',
    '## DNA channels',
    '',
    detail,
    '',
    '## The thesis',
    '',
    prose.trim(),
    '',
  ].join('\n');

  return stripEmDash(body);
}

function buildProsePrompt(agg, channels) {
  const summary = channels.map((c) => `${c.name} (${c.members?.length || 0}): ${signature(c.recipe)}`).join('\n');
  return [
    'Write the synthesis prose for a website design thesis, derived strictly from the channel data below.',
    'Output GitHub-flavored markdown with exactly these H3 sections, in order:',
    '### Values  — what every channel shares (4-6 bullets)',
    '### Visual laws (do)  — concrete build rules (6-9 bullets)',
    '### Forbidden moves (do not)  — concrete anti-patterns (6-9 bullets)',
    '### Convergence  — 2-3 sentences on where this board clusters and what that means for the site.',
    '',
    'Hard rules:',
    '- NO em dashes or en dashes anywhere. Use commas, periods, or parentheses.',
    '- Do NOT claim taste as a credential (no "an eye", "refined", "tasteful", "award-winning", "world-class").',
    '- Describe what the work does; do not flatter. No buzzwords.',
    '',
    `Top tags: ${agg.topTags.map(([t, n]) => `${t}:${n}`).join(', ')}`,
    `Dominant palette: ${agg.topHex.join(', ')}`,
    '',
    'Channels:',
    summary,
  ].join('\n');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  loadEnv();
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set (.env)');

  const board = getBoard(args.board);
  const manifest = readManifest(join(board.absDir, 'manifest.json'));
  const channelsDoc = readManifest(join(board.absDir, 'channels.json'));
  if (!manifest || !channelsDoc) throw new Error('Missing manifest/channels — run the pipeline first');
  const channels = channelsDoc.channels || [];
  const agg = buildThesisInput(manifest, channels);

  const call = makeTextCaller(args.model, apiKey);
  let prose = await call({ prompt: buildProsePrompt(agg, channels), maxTokens: 2000 });
  // One corrective retry if the model used em dashes.
  if (hasEmDash(prose)) {
    prose = await call({
      prompt: buildProsePrompt(agg, channels) + '\n\nIMPORTANT: your previous draft used dashes. Rewrite with ZERO em/en dashes.',
      maxTokens: 2000,
    });
  }

  const stamp = new Date().toISOString();
  const doc = assembleThesis(board, agg, channels, prose, stamp);

  const hits = claimedTasteHits(doc);
  if (hits.length) console.warn(`[thesis] WARNING claimed-taste phrasing present: ${hits.join(', ')}`);
  if (hasEmDash(doc)) throw new Error('[thesis] em dash survived sanitize — aborting write');

  const outPath = join(board.absDir, 'THESIS.md');
  writeFileSync(outPath, doc);
  console.log(`[thesis] wrote ${outPath} (${channels.length} channels, em-dash-clean)`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
