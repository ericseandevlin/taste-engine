#!/usr/bin/env node
// poster.mjs: make one poster from the rule sheet, check it, and repair it.
//
// A poster is the engine's default output because a board can fully specify it:
// one fixed surface, a few words of copy, nothing to navigate. The loop is:
//
//   1. the image agent draws the poster from one mode of the brief
//   2. a vision model checks it against that mode's Don't rules and the copy
//   3. if rules broke, the agent draws again with the broken rules named
//
// The check is a second opinion on things that have a right answer (is the copy
// exact, is there a drop shadow). Whether the poster is good stays with your eye.
//
// Usage:
//   node src/poster.mjs --board demo --copy "Open Studio | 20 Nov 2026 | Doors 7pm"
//   node src/poster.mjs --board demo --mode swiss-mono-index --rounds 3
//
// Writes boards/<board>/posters/<mode>-NNN/{round-1.png,...,poster.json}.

import { runMain } from './run.mjs';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { getBoard, MODELS, loadEnv } from './config.mjs';
import { readManifest } from './manifest.mjs';
import { rulesForMode } from './brief.mjs';
import { makeImageAgent } from './image-agent.mjs';
import { resolveVisionCaller } from './models.mjs';

export const DEFAULT_COPY = ['Open Studio', '20 Nov 2026', 'Doors 7pm'];
const COPY_RULE = 'The copy is rendered exactly as given: every word spelled correctly, nothing added, nothing missing.';

function parseArgs(argv) {
  const args = { board: 'demo', mode: null, copy: null, rounds: 2, aspect: '3:4', model: MODELS.image, judge: MODELS.critique };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--board') args.board = argv[++i];
    else if (argv[i] === '--mode') args.mode = argv[++i];
    else if (argv[i] === '--copy') args.copy = argv[++i];
    else if (argv[i] === '--rounds') args.rounds = Math.max(1, Number(argv[++i]));
    else if (argv[i] === '--aspect') args.aspect = argv[++i];
    else if (argv[i] === '--model') args.model = argv[++i];
    else if (argv[i] === '--judge') args.judge = argv[++i];
  }
  return args;
}

// Pure: "Title | date | venue" -> lines. A poster carries very little copy.
export function parseCopy(text) {
  const lines = String(text || '').split('|').map((s) => s.trim()).filter(Boolean);
  return lines.length ? lines : DEFAULT_COPY;
}

// Pure: the prompt the image agent draws from. `broken` holds the rules the
// last round failed, so the repair is specific instead of "try again".
export function buildPosterPrompt({ mode, dos, donts, palette, copy, broken = [] }) {
  const hexes = (mode.palette.length ? mode.palette : palette.map((p) => p.hex)).slice(0, 5);
  const out = [
    'Design one printed poster, portrait format. Return the image only.',
    '',
    'COPY. Set exactly these lines and no other text:',
    ...copy.map((l) => `  ${l}`),
    '',
    `STYLE: ${mode.name}. ${mode.summary}`,
    '',
    `PALETTE. Use only these colors: ${hexes.join(', ')}.`,
    '',
    'DO:',
    ...dos.map((r) => `- ${r.rule}`),
    '',
    'DO NOT. Each of these is a hard rule:',
    ...donts.map((r) => `- ${r.rule}`),
    '',
    'This is a poster, not a web page: no navigation, no buttons, no browser frame, no device mockup. Flat artwork that fills the frame edge to edge.',
  ];
  if (broken.length) {
    out.push('', 'YOUR LAST ATTEMPT BROKE THESE RULES. Fix each one:', ...broken.map((b) => `- ${b.rule} (seen: ${b.reason})`));
  }
  return out.join('\n');
}

// Pure: the prompt for the check, and the parser for its answer.
export function buildCheckPrompt(rules, copy) {
  return (
    `The image is a poster. Its copy was meant to be exactly these lines:\n${copy.map((l) => `  ${l}`).join('\n')}\n\n` +
    `Judge the poster against each rule. PASS only if the image shows the rule is obeyed. ` +
    `Judge strictly from what is visible. Reason: one short sentence naming what you see.\n\n` +
    rules.map((r, i) => `${i + 1}. ${r}`).join('\n') +
    `\n\nReturn only JSON: {"verdicts":[{"verdict":"PASS"|"FAIL","reason":"..."}]} with exactly ${rules.length} entries in order.`
  );
}

export function parseVerdicts(raw, n) {
  const m = String(raw).match(/\{[\s\S]*\}/);
  if (!m) throw new Error('the check returned no JSON');
  const v = JSON.parse(m[0]).verdicts;
  if (!Array.isArray(v) || v.length !== n) throw new Error(`the check returned ${v?.length} verdicts, expected ${n}`);
  return v.map((x) => ({ pass: x.verdict === 'PASS', reason: String(x.reason || '').trim() }));
}

// Pure: the round to show first. Most rules passed; a tie goes to the later round.
export function bestRound(rounds) {
  return rounds.reduce((best, r) => (!best || r.passed >= best.passed ? r : best), null);
}

function nextIndex(root, prefix) {
  let max = 0;
  if (existsSync(root)) {
    for (const d of readdirSync(root)) {
      const m = new RegExp(`^${prefix}-(\\d+)$`).exec(d);
      if (m) max = Math.max(max, Number(m[1]));
    }
  }
  return max + 1;
}

const extOf = (mime) => (mime.includes('jpeg') || mime.includes('jpg') ? 'jpg' : mime.includes('webp') ? 'webp' : 'png');

async function main() {
  const args = parseArgs(process.argv.slice(2));
  loadEnv();
  const board = getBoard(args.board);
  const brief = readManifest(join(board.absDir, 'brief.json'));
  if (!brief) throw new Error(`No rule sheet at ${board.dir}/brief.json. Run \`npm run taste -- --board ${board.name}\` first.`);
  const picked = rulesForMode(brief, args.mode);
  // A poster does not move. Rules about motion have nothing to act on here.
  const { mode, donts } = picked;
  const dos = picked.dos.filter((r) => r.aspect !== 'motion');
  const copy = parseCopy(args.copy);
  const draw = makeImageAgent(process.env, args.model);
  const { caller: look } = resolveVisionCaller(args.judge, process.env);

  const root = join(board.absDir, 'posters');
  const slug = `${mode.id}-${String(nextIndex(root, mode.id)).padStart(3, '0')}`;
  const dir = join(root, slug);
  mkdirSync(dir, { recursive: true });
  const checked = [...donts.map((r) => r.rule), COPY_RULE];
  console.log(`[poster] ${board.name} / ${mode.name}: ${dos.length} do, ${donts.length} don't, copy "${copy.join(' | ')}"`);

  const rounds = [];
  let broken = [];
  for (let n = 1; n <= args.rounds; n++) {
    const img = await draw({ prompt: buildPosterPrompt({ mode, dos, donts, palette: brief.palette, copy, broken }), aspect: args.aspect });
    const file = `round-${n}.${extOf(img.mimeType)}`;
    writeFileSync(join(dir, file), Buffer.from(img.data, 'base64'));
    let results;
    try {
      const raw = await look({ image: img.data, mediaType: img.mimeType, prompt: buildCheckPrompt(checked, copy), maxTokens: 4000 });
      results = parseVerdicts(raw, checked.length).map((v, i) => ({ rule: checked[i], ...v }));
    } catch (err) {
      console.log(`[poster]   round ${n}: drawn, check failed (${err.message})`);
      rounds.push({ round: n, file, passed: 0, total: checked.length, checked: false, results: [] });
      break;
    }
    broken = results.filter((r) => !r.pass);
    const passed = results.length - broken.length;
    rounds.push({ round: n, file, passed, total: results.length, checked: true, results });
    console.log(`[poster]   round ${n}: ${passed}/${results.length} rules pass -> ${board.dir}/posters/${slug}/${file}`);
    for (const b of broken) console.log(`[poster]     FAIL ${b.rule} (${b.reason})`);
    if (!broken.length) break;
  }
  const best = bestRound(rounds);
  writeFileSync(
    join(dir, 'poster.json'),
    JSON.stringify({ slug, board: board.name, mode: mode.id, modeName: mode.name, copy, model: args.model, judge: args.judge, made: new Date().toISOString(), best: best.file, rounds }, null, 2) + '\n',
  );
  console.log(`[poster] done: ${board.dir}/posters/${slug}/${best.file}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) runMain(main);
