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
//   node src/poster.mjs --board demo --type drawn   # let the image model draw the words too
//   node src/poster.mjs --board demo --refs 0       # text prompt only, no reference images
//
// The image agent also sees up to --refs (default 3) of the board's own
// images, picked from the mode's evidence, so it matches what the board
// actually shows (its subject, its photography) and not only the rule text.
//
// By default the image model draws the artwork with no text and the copy is set
// in code (typeset.mjs), because image models misspell and repeat words.
//
// Writes boards/<board>/posters/<mode>-NNN/{round-1.png,...,poster.json}.

import { runMain } from './run.mjs';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'fs';
import sharp from 'sharp';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { getBoard, MODELS, loadEnv } from './config.mjs';
import { readManifest } from './manifest.mjs';
import { rulesForMode } from './brief.mjs';
import { makeImageAgent } from './image-agent.mjs';
import { resolveVisionCaller } from './models.mjs';
import { typeset } from './typeset.mjs';

export const DEFAULT_COPY = ['Open Studio', '20 Nov 2026', 'Doors 7pm'];
const COPY_RULE = 'The copy is rendered exactly as given: every word spelled correctly, nothing added, nothing missing.';

function parseArgs(argv) {
  const args = { board: 'demo', mode: null, copy: null, rounds: 2, refs: 3, type: 'set', aspect: '3:4', model: MODELS.image, judge: MODELS.critique };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--board') args.board = argv[++i];
    else if (argv[i] === '--mode') args.mode = argv[++i];
    else if (argv[i] === '--copy') args.copy = argv[++i];
    else if (argv[i] === '--rounds') args.rounds = Math.max(1, Number(argv[++i]));
    else if (argv[i] === '--refs') args.refs = Math.max(0, Number(argv[++i]) || 0);
    else if (argv[i] === '--aspect') args.aspect = argv[++i];
    else if (argv[i] === '--type') args.type = argv[++i] === 'drawn' ? 'drawn' : 'set';
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

// Pure: which board images to show the image agent. Each rule carries the
// reference ids its lane was drawn from; the ids cited most across the mode's
// lanes win, ties in order of first citation. Returns manifest items.
export function pickReferences(brief, mode, manifest, n = 3) {
  if (!n || !manifest?.items?.length) return [];
  const counts = new Map();
  const seenLane = new Set();
  for (const r of brief.rules || []) {
    if (!mode.lanes.includes(r.lane) || seenLane.has(r.lane)) continue;
    seenLane.add(r.lane);
    for (const id of r.evidence?.refs || []) counts.set(id, (counts.get(id) || 0) + 1);
  }
  const byId = new Map(manifest.items.map((it) => [it.id, it]));
  const ranked = [...counts.entries()].filter(([id]) => byId.has(id)).sort((a, b) => b[1] - a[1]).map(([id]) => byId.get(id));
  return (ranked.length ? ranked : manifest.items).slice(0, n);
}

// Pure: the prompt the image agent draws from. `broken` holds the rules the
// last round failed, so the repair is specific instead of "try again".
export function buildPosterPrompt({ mode, dos, donts, palette, copy, broken = [], type = 'drawn', refs = 0 }) {
  const hexes = (mode.palette.length ? mode.palette : palette.map((p) => p.hex)).slice(0, 5);
  const out = [
    'Design one printed poster, portrait format. Return the image only.',
    '',
    ...(type === 'set'
      ? [
          'NO TEXT. Draw no letters, words, numbers or anything that reads as writing. The words are set on the poster later.',
          'Leave the top third calm: mostly one flat palette color, so a title can sit there. The rest of the poster carries the artwork.',
        ]
      : [
          'COPY. Set exactly these lines:',
          ...copy.map((l) => `  ${l}`),
          'These lines are the only text on the poster. No labels, no captions, no numbers, no grid coordinates, no color codes, no invented words.',
        ]),
    '',
    `STYLE: ${mode.name}. ${mode.summary}`,
    '',
    ...(refs
      ? [
          `REFERENCES. The ${refs} attached image${refs > 1 ? 's are' : ' is'} from the board this style was read from. They outrank the written style.`,
          'SUBJECT: if the references share a subject (a face, a figure, an object), make that the subject of this poster, large and photographic, not a pattern or an icon of it.',
          'Match their visual language: how the photograph is treated (sliced into strips or offset blocks, cut out, halftoned, collaged, re-colored), the scale of the subject, the amount of empty space, and how sparingly small graphic accents are placed (a few tiny shapes of a contrasting color, never a pattern of them).',
          'Do not copy any reference or any person in them: make a new image with a new subject. Ignore any text in the references.',
          'The references are photos of printed posters. Ignore their paper margins, borders and backgrounds: your image is the print itself, edge to edge.',
          '',
        ]
      : []),
    `PALETTE. Use only these colors: ${hexes.join(', ')}.${refs ? ' Render the photograph in them too (black and white, duotone, halftone), not in its natural colors.' : ''} The codes tell you the colors. Never print a color code on the poster.`,
    '',
    'DO:',
    ...dos.map((r) => `- ${r.rule}`),
    '',
    'DO NOT. Each of these is a hard rule:',
    ...donts.map((r) => `- ${r.rule}`),
    '',
    'This is a poster, not a web page: no navigation, no buttons, no browser frame, no device mockup.',
    'The image IS the poster. The artwork runs to all four edges of the image. No paper sheet on a background, no border around it, no shadow under it.',
  ];
  if (broken.length) {
    out.push('', 'YOUR LAST ATTEMPT BROKE THESE RULES. Fix each one:', ...broken.map((b) => `- ${b.rule} (seen: ${b.reason})`));
  }
  return out.join('\n');
}

// Pure: a Don't rule names the forbidden thing ("Gradient backgrounds"). A judge
// asked to PASS or FAIL that bare phrase answers whether the thing is present,
// which inverts the verdict. State it as a claim that is true when obeyed.
export function asClaim(dont) {
  return `The poster does not use this: ${String(dont).replace(/\.$/, '')}.`;
}

// Pure: the prompt for the check, and the parser for its answer.
export function buildCheckPrompt(rules, copy) {
  return (
    `The image is a poster. Its copy was meant to be exactly these lines:\n${copy.map((l) => `  ${l}`).join('\n')}\n\n` +
    `Judge the poster against each statement. PASS if the statement is true of the image, FAIL if it is false. ` +
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

// Reference images go to the model as JPEG at most 1024px on the long side:
// any board format works and the request stays small.
async function loadReferences(dir, items) {
  const out = [];
  for (const it of items) {
    const file = join(dir, it.file);
    if (!existsSync(file)) continue;
    const buf = await sharp(file).resize(1024, 1024, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
    out.push({ data: buf.toString('base64'), mimeType: 'image/jpeg' });
  }
  return out;
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
  const refItems = pickReferences(brief, mode, readManifest(join(board.absDir, 'manifest.json')), args.refs);
  const images = await loadReferences(board.absDir, refItems);
  const { caller: look } = resolveVisionCaller(args.judge, process.env);

  const root = join(board.absDir, 'posters');
  const slug = `${mode.id}-${String(nextIndex(root, mode.id)).padStart(3, '0')}`;
  const dir = join(root, slug);
  const checked = [...donts.map((r) => asClaim(r.rule)), COPY_RULE];
  console.log(`[poster] ${board.name} / ${mode.name}: ${dos.length} do, ${donts.length} don't, copy "${copy.join(' | ')}"`);
  if (images.length) console.log(`[poster] references: ${refItems.map((it) => it.file).join(', ')}`);

  const rounds = [];
  let broken = [];
  for (let n = 1; n <= args.rounds; n++) {
    const art = await draw({ prompt: buildPosterPrompt({ mode, dos, donts, palette: brief.palette, copy, broken, type: args.type, refs: images.length }), aspect: args.aspect, images });
    mkdirSync(dir, { recursive: true });
    let img = art;
    let file = `round-${n}.${extOf(art.mimeType)}`;
    if (args.type === 'set') {
      writeFileSync(join(dir, `art-${n}.${extOf(art.mimeType)}`), Buffer.from(art.data, 'base64'));
      const set = await typeset(Buffer.from(art.data, 'base64'), copy, { dos });
      img = { data: set.data.toString('base64'), mimeType: 'image/png' };
      file = `round-${n}.png`;
      console.log(`[poster]   round ${n}: copy set in the ${set.band} band${set.panel ? ' on a panel' : ''}`);
    }
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
    JSON.stringify({ slug, board: board.name, mode: mode.id, modeName: mode.name, copy, type: args.type, model: args.model, judge: args.judge, made: new Date().toISOString(), references: refItems.map((it) => it.file), best: best.file, rounds }, null, 2) + '\n',
  );
  console.log(`[poster] done: ${board.dir}/posters/${slug}/${best.file}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) runMain(main);
