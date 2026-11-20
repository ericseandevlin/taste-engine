#!/usr/bin/env node
// directions.mjs: DERIVE three candidate directions from the board itself.
// A direction is the choose-your-lane unit: 1-3 lanes (channels) the board
// actually contains, plus its own evidence references, palette, composition and
// subject treatment. The brief and the poster build from it.
//
// Directions are a FUNCTION OF THE MOODBOARD, not our opinion. A board with no
// playful imagery yields no playful direction.
//
// They must also be real choices. Earlier versions measured one palette for the
// whole board and asked a text model for "distinct" directions from lane names
// alone; every direction came back in the same greys with the same idea. Now:
//
//   1. A vision model sees the board's images and picks, per direction, the
//      references it stands on, then says how those references compose the page
//      and treat the subject. The three must stretch the board in different ways.
//   2. Each direction's palette is MEASURED from its own references, never the
//      board average.
//   3. Code checks the three are apart (palette gap, shared references, wording
//      overlap) and asks once more, naming the pairs that came out too close.
//   4. A vision model reads each direction's lineage: the tradition, era or
//      place its references seem to draw on. It is stored as an interpretation
//      with a confidence, never as a fact, and no rule is built from it.
//
// Reads manifest.json + channels.json + the board images. Writes directions.json,
// a generated artifact: re-run to regenerate, do not hand-edit.
//
// Usage:
//   node src/directions.mjs --board demo
//   node src/directions.mjs --board demo --count 3

import { runMain } from './run.mjs';
import { existsSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import { getBoard, MODELS, loadEnv } from './config.mjs';
import { readManifest, writeManifest } from './manifest.mjs';
import { resolveMultiImageCaller } from './models.mjs';
import { hexToRgb, rgbToLab, deltaE76 } from './features.mjs';
import { stripEmDash } from './thesis.mjs';

const MIN_DIRECTIONS = 3;
const MAX_RETRIES = 2; // parse failures
export const DIVERGENCE = {
  minPaletteGap: 20, // mean nearest-color distance (CIELAB deltaE) between two modes
  maxSharedRefs: 1, // two directions may stand on at most one common reference
  maxWordOverlap: 0.5, // Jaccard overlap of the subject + composition wording
};
const CONFIDENCE = ['low', 'medium', 'high'];

function parseArgs(argv) {
  const args = { board: 'demo', count: 3, model: MODELS.directions };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--board') args.board = argv[++i];
    else if (argv[i] === '--count') args.count = Math.max(MIN_DIRECTIONS, Number(argv[++i]) || MIN_DIRECTIONS);
    else if (argv[i] === '--model') args.model = argv[++i];
  }
  return args;
}

// Compact lane summary with weight (member count) and members, so the model can
// rank lanes and see which references each one was drawn from.
export function buildDirectionsInput(channelsDoc) {
  return (channelsDoc?.channels || []).map((c) => ({
    id: c.id,
    name: c.name,
    weight: (c.members || []).length,
    members: c.members || [],
    recipe: c.recipe,
    forbidden: c.forbidden || [],
  }));
}

// Dominant palette across the board, weighted by covered area. Kept for the
// board-level swatch; directions no longer draw from it.
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

const labOf = (hex) => rgbToLab(hexToRgb(hex));
const chromaOfHex = (hex) => {
  const { a, b } = labOf(hex);
  return Math.hypot(a, b);
};

// Pure: a direction's palette, measured from its own evidence references.
// Colors are ranked by area across those references; near-duplicates merge.
// At most two neutrals (ground and ink) so the colors that set the references
// apart are not crowded out by the greys every printed poster has.
export function evidencePalette(manifest, refs, k = 5) {
  const want = new Set(refs);
  const sum = new Map();
  for (const it of manifest.items || []) {
    if (!want.has(it.id)) continue;
    for (const p of it.measured?.palette || []) {
      if (!hexToRgb(p.hex)) continue;
      sum.set(p.hex, (sum.get(p.hex) || 0) + (p.pct || 1));
    }
  }
  const ranked = [...sum.entries()].sort((a, b) => b[1] - a[1]).map(([hex]) => hex);
  const picked = [];
  const near = (hex) => picked.some((p) => deltaE76(labOf(p), labOf(hex)) < 12);
  let neutrals = 0;
  for (const hex of ranked) {
    if (picked.length >= k) break;
    if (near(hex)) continue;
    const neutral = chromaOfHex(hex) < 15;
    if (neutral && neutrals >= 2) continue;
    if (neutral) neutrals++;
    picked.push(hex);
  }
  for (const hex of ranked) {
    if (picked.length >= k) break;
    if (!picked.includes(hex) && !near(hex)) picked.push(hex);
  }
  return picked;
}

// Pure: how far apart two palettes are. For each color, the distance to the
// nearest color in the other palette, averaged both ways. 0 = same colors.
export function paletteGap(a, b) {
  if (!a.length || !b.length) return 0;
  const one = (from, to) => from.reduce((s, h) => s + Math.min(...to.map((t) => deltaE76(labOf(h), labOf(t)))), 0) / from.length;
  return +((one(a, b) + one(b, a)) / 2).toFixed(1);
}

const words = (s) => new Set(String(s || '').toLowerCase().match(/[a-z]{4,}/g) || []);
// Pure: Jaccard overlap of two descriptions' content words (4+ letters).
export function wordOverlap(a, b) {
  const A = words(a);
  const B = words(b);
  if (!A.size || !B.size) return 0;
  let both = 0;
  for (const w of A) if (B.has(w)) both++;
  return +(both / (A.size + B.size - both)).toFixed(2);
}

// Pure: every pair of directions that came out too close, with the reason.
// An empty list means the set is a real choice.
export function divergenceProblems(list, limits = DIVERGENCE) {
  const out = [];
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];
      const gap = paletteGap(a.palette, b.palette);
      if (gap < limits.minPaletteGap) out.push({ a: a.id, b: b.id, reason: `palettes too close (gap ${gap}, need ${limits.minPaletteGap})` });
      const shared = a.refs.filter((r) => b.refs.includes(r));
      if (shared.length > limits.maxSharedRefs) out.push({ a: a.id, b: b.id, reason: `stand on the same references (${shared.join(', ')})` });
      const lanesSame = a.channels.length === b.channels.length && a.channels.every((c) => b.channels.includes(c));
      if (lanesSame) out.push({ a: a.id, b: b.id, reason: 'use the same lanes' });
      const overlap = wordOverlap(`${a.subject} ${a.composition}`, `${b.subject} ${b.composition}`);
      if (overlap > limits.maxWordOverlap) out.push({ a: a.id, b: b.id, reason: `describe the same subject treatment and composition (overlap ${overlap})` });
    }
  }
  return out;
}

// Pure: a single score for picking the better of two attempts. Fewer problems
// first, then the smallest palette gap (the pair a viewer notices first).
export function divergenceScore(list) {
  let minGap = Infinity;
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) minGap = Math.min(minGap, paletteGap(list[i].palette, list[j].palette));
  return { problems: divergenceProblems(list).length, minGap: minGap === Infinity ? 0 : minGap };
}

export function buildDirectionsPrompt(input, itemIds, count, { surface = 'website', feedback = [] } = {}) {
  return [
    `You are proposing ${count} candidate DIRECTIONS for a new ${surface}, derived ENTIRELY from one person's moodboard.`,
    `The attached images are the board, in this order: ${itemIds.join(', ')}.`,
    'The board was already clustered into LANES (recurring traits). Each lane lists the references it was drawn from.',
    '',
    `A direction is a real choice a person could pick over the other ${count - 1}. Each one takes the board somewhere different and stretches one of its limits as far as the references allow, while still clearly coming from this board.`,
    '',
    'Rules:',
    `- Exactly ${count} directions, strongest first.`,
    '- refs: 3 or 4 reference ids this direction stands on. Pick references that LOOK alike in the way this direction cares about. Two directions may share at most one reference. Every ref must be a member of at least one of the direction\'s lanes.',
    '- lanes: 2 lane ids (1 to 3 allowed) from the list below. Invent nothing. Do not give two directions the same lanes.',
    '- The directions must differ on ALL of these, judged from the images, not the lane names:',
    '    palette: their references should carry visibly different colors (the palette is measured from the refs you pick, so pick refs whose colors differ from the other directions\' refs);',
    '    composition: how the page is built (where the mass sits, how much empty field, scale, alignment, where type would go);',
    '    subject: how the subject is treated (for example halftone, sliced or offset strips, cut-out silhouette, painted, collaged, re-colored, full photograph). Name what the refs actually do.',
    '- subject and composition: one concrete sentence each, describing only what is visible in this direction\'s refs.',
    '- stretch: one sentence on which limit of the board this direction pushes, and how far.',
    '- avoid: 1 or 2 things this direction\'s refs never do that another direction does. Short noun phrases.',
    '- summary: 1 or 2 sentences, grounded in the refs. No style, movement or brand names.',
    '- Only blend lanes whose forbidden moves do not contradict each other.',
    ...(feedback.length
      ? ['', 'YOUR LAST ANSWER WAS TOO SAMEY. Fix these pairs by choosing different references and descriptions:', ...feedback.map((f) => `- ${f.a} vs ${f.b}: ${f.reason}`)]
      : []),
    '',
    'Return ONLY JSON: { "directions": [ {',
    '  "id": kebab-case id, "name": short human name,',
    '  "refs": [reference ids], "lanes": [lane ids],',
    '  "subject": "...", "composition": "...", "stretch": "...",',
    '  "avoid": ["..."], "summary": "..."',
    '} ] }',
    '',
    'LANES (id, name, weight, members, recipe, forbidden):',
    JSON.stringify(input),
  ].join('\n');
}

// Pure: validate the model response. Drops unknown lanes and refs, drops refs
// that belong to none of the direction's lanes (every rule must trace to its
// evidence), and measures each direction's palette from its refs.
export function parseDirectionsResponse(raw, channels, manifest) {
  const match = String(raw).match(/\{[\s\S]*\}/);
  if (!match) throw new Error('no JSON object in directions response');
  let obj;
  try {
    obj = JSON.parse(match[0]);
  } catch (err) {
    throw new Error(`malformed JSON: ${err.message}`);
  }
  const byLane = new Map(channels.map((c) => [c.id, new Set(c.members || [])]));
  const itemIds = new Set((manifest.items || []).map((i) => i.id));
  const seen = new Set();
  const list = (Array.isArray(obj.directions) ? obj.directions : [])
    .map((d) => {
      const lanes = [...new Set(d.lanes || d.channels || [])].filter((c) => byLane.has(c));
      const refs = [...new Set(d.refs || [])].filter((r) => itemIds.has(r) && lanes.some((l) => byLane.get(l).has(r)));
      const id = String(d.id || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      if (!id || seen.has(id) || !lanes.length || refs.length < 2) return null;
      seen.add(id);
      const clean = (s) => stripEmDash(String(s || '').trim());
      return {
        id,
        name: clean(d.name) || id,
        channels: lanes,
        refs,
        palette: evidencePalette(manifest, refs),
        subject: clean(d.subject),
        composition: clean(d.composition),
        stretch: clean(d.stretch),
        avoid: (Array.isArray(d.avoid) ? d.avoid : []).map(clean).filter(Boolean).slice(0, 2),
        brief: clean(d.summary || d.brief),
      };
    })
    .filter(Boolean);
  if (list.length < MIN_DIRECTIONS) {
    throw new Error(`expected >= ${MIN_DIRECTIONS} valid directions, got ${list.length}`);
  }
  return list;
}

// --- Lineage: an interpretation, never a fact ---

export function buildLineagePrompt(direction) {
  return [
    `These ${direction.refs.length} images are the references behind one design direction: "${direction.name}".`,
    'Which visual tradition, era or place do they seem to draw on? Judge from what is visible: printing method, type, image treatment, color, and any language in the lettering.',
    'This is an interpretation, not a fact. If the evidence is thin or mixed, say so and use low confidence. Never invent a designer or a specific work.',
    '',
    'Return ONLY JSON: {',
    '  "tradition": "short name of the tradition, or \\"unclear\\"",',
    '  "era": "approximate period, or \\"unclear\\"",',
    '  "place": "region or country, or \\"unclear\\"",',
    '  "cues": ["2-4 visible cues that point there"],',
    '  "confidence": "low" | "medium" | "high"',
    '}',
  ].join('\n');
}

// Pure: validate the lineage answer. Returns null when it is unusable, so the
// direction simply carries no lineage.
export function parseLineage(raw) {
  const m = String(raw || '').match(/\{[\s\S]*\}/);
  if (!m) return null;
  let o;
  try {
    o = JSON.parse(m[0]);
  } catch {
    return null;
  }
  const s = (v) => stripEmDash(String(v || '').trim());
  const tradition = s(o.tradition);
  if (!tradition) return null;
  const confidence = CONFIDENCE.includes(String(o.confidence).toLowerCase()) ? String(o.confidence).toLowerCase() : 'low';
  return {
    tradition,
    era: s(o.era) || 'unclear',
    place: s(o.place) || 'unclear',
    cues: (Array.isArray(o.cues) ? o.cues : []).map((c) => s(c).replace(/\.+$/, '')).filter(Boolean).slice(0, 4),
    confidence,
    interpretation: true,
  };
}

// Pure: the one line a person reads. Always says it is an interpretation.
export function lineageLine(l) {
  if (!l) return '';
  const parts = [l.tradition, l.era, l.place].filter((p) => p && p.toLowerCase() !== 'unclear');
  return `Reads as ${parts.join(', ') || 'no clear tradition'} (interpretation, ${l.confidence} confidence)`;
}

// Pure: array -> the id-keyed object brief.mjs / generate.mjs consume.
// palette stays a comma string for the older generate/critique path.
export function toKeyed(list) {
  const directions = {};
  for (const d of list) {
    directions[d.id] = {
      name: d.name,
      brief: d.brief,
      palette: (Array.isArray(d.palette) ? d.palette : [d.palette]).filter(Boolean).join(', '),
      channels: d.channels,
      notes: d.avoid || d.notes || [],
      refs: d.refs || [],
      subject: d.subject || '',
      composition: d.composition || '',
      stretch: d.stretch || '',
      avoid: d.avoid || [],
      lineage: d.lineage || null,
    };
  }
  return directions;
}

async function loadImages(dir, items, size = 512) {
  const out = [];
  for (const it of items) {
    const file = join(dir, it.file);
    if (!existsSync(file)) continue;
    const buf = await sharp(file).resize(size, size, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
    out.push({ id: it.id, data: buf.toString('base64'), mediaType: 'image/jpeg' });
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  loadEnv();
  const board = getBoard(args.board);
  const manifest = readManifest(join(board.absDir, 'manifest.json'));
  const channelsDoc = readManifest(join(board.absDir, 'channels.json'));
  if (!manifest || !channelsDoc) {
    throw new Error('Missing manifest.json / channels.json. Run cluster first.');
  }

  const input = buildDirectionsInput(channelsDoc);
  const images = await loadImages(board.absDir, manifest.items);
  if (!images.length) throw new Error(`No board images found in ${board.dir}.`);
  const { caller: look } = resolveMultiImageCaller(args.model, process.env);
  const surface = board.surface || 'website';

  // One attempt = one parsed set, with parse failures retried.
  const attempt = async (feedback) => {
    const prompt = buildDirectionsPrompt(input, images.map((i) => i.id), args.count, { surface, feedback });
    let lastErr;
    for (let n = 0; n <= MAX_RETRIES; n++) {
      try {
        const raw = await look({ images, prompt, maxTokens: 8000 });
        return parseDirectionsResponse(raw, channelsDoc.channels, manifest).slice(0, args.count);
      } catch (err) {
        lastErr = err;
        console.warn(`[directions] attempt failed: ${err.message}`);
      }
    }
    throw new Error(`directions derivation failed after retries: ${lastErr.message}`);
  };

  let list = await attempt([]);
  let problems = divergenceProblems(list);
  if (problems.length) {
    console.warn(`[directions] too close, asking once more:\n${problems.map((p) => `  ${p.a} vs ${p.b}: ${p.reason}`).join('\n')}`);
    const second = await attempt(problems);
    const [s1, s2] = [divergenceScore(list), divergenceScore(second)];
    if (s2.problems < s1.problems || (s2.problems === s1.problems && s2.minGap > s1.minGap)) list = second;
    problems = divergenceProblems(list);
    if (problems.length) console.warn(`[directions] kept the more divergent set; still close:\n${problems.map((p) => `  ${p.a} vs ${p.b}: ${p.reason}`).join('\n')}`);
  }

  // Lineage per direction, from its own references only.
  const byId = new Map(images.map((i) => [i.id, i]));
  for (const d of list) {
    try {
      const refs = d.refs.map((r) => byId.get(r)).filter(Boolean);
      d.lineage = parseLineage(await look({ images: refs, prompt: buildLineagePrompt(d), maxTokens: 3000 }));
    } catch (err) {
      console.warn(`[directions] lineage for ${d.id} skipped: ${err.message}`);
      d.lineage = null;
    }
  }

  const directionsPath = join(board.absDir, 'directions.json');
  writeManifest(directionsPath, {
    board: board.name,
    generated: new Date().toISOString(),
    divergence: { limits: DIVERGENCE, problems },
    directions: toKeyed(list),
  });

  console.log(`[directions] ${list.length} directions derived -> ${directionsPath}`);
  for (const d of list) {
    console.log(`  ${d.id}: ${d.name}`);
    console.log(`    lanes ${d.channels.join(' + ')} | refs ${d.refs.join(', ')} | palette ${d.palette.join(' ')}`);
    console.log(`    subject: ${d.subject}`);
    console.log(`    composition: ${d.composition}`);
    if (d.lineage) console.log(`    ${lineageLine(d.lineage)}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) runMain(main);
