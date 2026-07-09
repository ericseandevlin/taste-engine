#!/usr/bin/env node
// score.mjs — re-measure a generated page on the SAME extractors the board's
// references went through, then report per-axis deltas against the Taste
// Fingerprint plus one weighted alignment number.
//
// DIAGNOSTIC ONLY: the score informs selection, it never rejects an output,
// never gates, never exits nonzero on a low score. The human stays the
// fitness function.
//
// Scope: outputs are generated from a direction (a 1-3 channel lane), so by
// default the page is scored against the union of its direction's member
// references, with the board-level number always computed alongside.
//
// Usage:
//   node score.mjs --slug swiss-mono-index-001
//   node score.mjs --slug <slug> --fingerprint v2
//   node score.mjs --shots path.png --channels swiss-index,mono-meta
//   node score.mjs --slug <slug> --direction monolith-grid --scope board

import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { basename, dirname, extname, join } from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import { getBoard, MODELS, loadEnv } from './config.mjs';
import { readManifest } from './manifest.mjs';
import { makeVisionCaller } from './anthropic.mjs';
import { computeFeatures, SAMPLE } from './measure.mjs';
import { tagImage } from './tag.mjs';
import { latestVersion } from './fingerprint.mjs';
import {
  SCALAR_AXES,
  aggregateAxes,
  alignmentScore,
  chromaOf,
  contributions,
  groundLightnessOf,
  accentCountOf,
  medianAspect,
  normalizeScalar,
  paletteDistance,
  scalarDistance,
  scopeRefIds,
  tagDistance,
} from './features.mjs';

function parseArgs(argv) {
  const args = {
    board: 'demo',
    slug: null,
    shots: [],
    direction: null,
    channels: null,
    scope: null, // 'board' forces centroid-only
    fingerprint: null,
    model: MODELS.score,
    tagVotes: 1,
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--board') args.board = argv[++i];
    else if (argv[i] === '--slug') args.slug = argv[++i];
    else if (argv[i] === '--shots') args.shots = argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
    else if (argv[i] === '--direction') args.direction = argv[++i];
    else if (argv[i] === '--channels') args.channels = argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
    else if (argv[i] === '--scope') args.scope = argv[++i];
    else if (argv[i] === '--fingerprint') args.fingerprint = argv[++i];
    else if (argv[i] === '--model') args.model = argv[++i];
    else if (argv[i] === '--tag-votes') {
      const n = Number(argv[++i]);
      if (!Number.isInteger(n) || n < 1) throw new Error('--tag-votes must be a positive integer');
      args.tagVotes = n;
    }
  }
  return args;
}

// Pure: scope resolution order — explicit channels, then direction, then the
// slug's meta.json, then board-only (with a notice from the caller).
export function resolveScope(args, meta, directionsDoc) {
  if (args.scope === 'board') return { type: 'board', channels: null };
  if (args.channels?.length) return { type: 'channels', channels: args.channels };
  if (args.direction) {
    const dir = directionsDoc?.directions?.[args.direction];
    if (!dir) {
      const known = Object.keys(directionsDoc?.directions || {}).join(', ');
      throw new Error(`Unknown direction "${args.direction}". Known: ${known}`);
    }
    return { type: 'direction', channels: dir.channels };
  }
  if (meta?.channels?.length) return { type: 'direction', channels: meta.channels };
  return { type: 'board', channels: null };
}

// Pure: top-crop geometry. The output screenshot is cropped to the scope
// references' median aspect so area-weighted axes compare like with like.
export function cropGeometry(width, height, targetAspect) {
  if (!targetAspect) return { width, height, cropped: false };
  const targetH = Math.round(width / targetAspect);
  if (targetH >= height) return { width, height, cropped: false };
  return { width, height: targetH, cropped: true };
}

// Pure: majority vote across tag passes (votes=1 passes tags through).
export function majorityTags(voteLists) {
  const need = Math.floor(voteLists.length / 2) + 1;
  const counts = new Map();
  for (const tags of voteLists) {
    for (const t of new Set(tags || [])) counts.set(t, (counts.get(t) || 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, c]) => c >= need)
    .map(([t]) => t)
    .sort();
}

// Pure: assemble the per-axis rows for one scope's axes object.
export function buildRows(output, axes) {
  const rows = [];
  for (const id of SCALAR_AXES) {
    const axis = axes[id];
    const outNorm = normalizeScalar(id, output[id]);
    const res = scalarDistance(outNorm, axis);
    rows.push({
      id,
      kind: 'scalar',
      center: axis.center,
      spread: axis.spread,
      out: output[id],
      outNorm: outNorm != null ? +outNorm.toFixed(4) : null,
      delta: res ? res.delta : null,
      distance: res ? res.d : null,
      salience: axis.salience,
      confidence: axis.confidence,
      weight: +(axis.salience * axis.confidence).toFixed(4),
    });
  }
  const pal = paletteDistance(output.palette, axes.palette.entries);
  rows.push({
    id: 'palette',
    kind: 'palette',
    out: null,
    delta: null,
    distance: pal ? pal.d : null,
    detail: pal ? pal.nearest : [],
    salience: axes.palette.salience,
    confidence: axes.palette.confidence,
    weight: +(axes.palette.salience * axes.palette.confidence).toFixed(4),
  });
  const tags = tagDistance(output.tags, axes.tags.freq);
  rows.push({
    id: 'tags',
    kind: 'tags',
    out: null,
    delta: null,
    distance: tags.d,
    detail: { missing: tags.missing, alien: tags.alien },
    salience: axes.tags.salience,
    confidence: axes.tags.confidence,
    weight: +(axes.tags.salience * axes.tags.confidence).toFixed(4),
  });
  return rows;
}

// Pure: resolve a --fingerprint reference to candidate paths. "v3" maps to the
// zero-padded version file; anything else is tried as given, under the board
// dir, and under fingerprints/ (where experiments/<name>.json lives).
export function fingerprintCandidates(ref, boardAbsDir) {
  const vMatch = /^v(\d+)$/.exec(ref);
  if (vMatch) {
    const file = `v${String(Number(vMatch[1])).padStart(3, '0')}.json`;
    return [join(boardAbsDir, 'fingerprints', file)];
  }
  return [ref, join(boardAbsDir, ref), join(boardAbsDir, 'fingerprints', ref)];
}

function loadFingerprint(board, ref) {
  const fpRoot = join(board.absDir, 'fingerprints');
  if (!ref) {
    const latest = latestVersion(existsSync(fpRoot) ? readdirSync(fpRoot) : []);
    if (!latest) throw new Error(`No fingerprint in ${board.dir}/fingerprints — run fingerprint first`);
    return { fp: readManifest(join(fpRoot, latest.file)), label: latest.file.replace('.json', '') };
  }
  for (const p of fingerprintCandidates(ref, board.absDir)) {
    if (existsSync(p)) {
      const fp = readManifest(p);
      return { fp, label: fp.experiment || basename(p, '.json') };
    }
  }
  throw new Error(`Fingerprint not found: ${ref}`);
}

function fmt(v, w = 7) {
  return String(v == null ? '-' : v).padEnd(w);
}

function printReport({ label, fpLabel, scope, crop, rowsScope, rowsBoard, alignScope, alignBoard, contribScope }) {
  const scopeDesc = scope.channels ? `${scope.type}(${scope.channels.join('+')}, n=${scope.n})` : `board(n=${scope.n})`;
  console.log(`[score] ${label} fingerprint=${fpLabel} scope=${scopeDesc} crop=${crop.width}x${crop.height}${crop.cropped ? '' : ' (uncropped)'}`);
  console.log(`  ${'axis'.padEnd(16)} ${'scope(norm)'.padEnd(16)} ${'output'.padEnd(8)} ${'delta'.padEnd(8)} ${'dist'.padEnd(6)} ${'weight'.padEnd(7)} contrib`);
  for (const r of rowsScope) {
    const scopeCol = r.kind === 'scalar' ? `${r.center} +/- ${r.spread}` : r.kind;
    const contrib = contribScope[r.id] != null ? `${Math.round(contribScope[r.id] * 100)}%` : '-';
    console.log(
      `  ${r.id.padEnd(16)} ${fmt(scopeCol, 16)} ${fmt(r.outNorm ?? '-', 8)} ${fmt(r.delta ?? '', 8)} ${fmt(r.distance, 6)} ${fmt(r.weight, 7)} ${contrib}`,
    );
  }
  const tagRow = rowsScope.find((r) => r.id === 'tags');
  const miss = tagRow.detail.missing.map((m) => `${m.tag} (${Math.round(m.freq * 100)}%)`).join(', ') || 'none';
  const alien = tagRow.detail.alien.map((a) => `${a.tag} (${Math.round(a.freq * 100)}%)`).join(', ') || 'none';
  console.log(`  tags: missing: ${miss}; alien: ${alien}`);
  const palRow = rowsScope.find((r) => r.id === 'palette');
  const worst = [...(palRow.detail || [])].sort((a, b) => b.deltaE - a.deltaE)[0];
  if (worst) console.log(`  palette: farthest color ${worst.hex} (nearest board entry ${worst.nearest}, deltaE ${worst.deltaE})`);
  const alignLine = alignScope == null ? 'no coherent axes, alignment undefined' : `${alignScope}/100`;
  const boardLine = scope.channels ? ` (board scope: ${alignBoard == null ? 'undefined' : `${alignBoard}/100`})` : '';
  console.log(`  alignment: ${alignLine}${boardLine}`);
  console.log('  diagnostic only: the score informs selection, it never rejects an output.');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  loadEnv();
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set (.env)');

  const board = getBoard(args.board);
  const { fp, label: fpLabel } = loadFingerprint(board, args.fingerprint);

  // Resolve the page to score: a generated slug, or explicit shot paths.
  let shotPath;
  let meta = null;
  let outDir;
  let outPrefix;
  if (args.slug) {
    const slugDir = join(board.absDir, 'generated', args.slug);
    shotPath = join(slugDir, 'desktop.png');
    if (!existsSync(shotPath)) {
      throw new Error(`No desktop.png in ${slugDir} — run: npm run capture -- --slug ${args.slug}`);
    }
    meta = readManifest(join(slugDir, 'meta.json'));
    outDir = slugDir;
    outPrefix = 'score';
  } else if (args.shots.length) {
    shotPath = args.shots[0];
    if (args.shots.length > 1) console.warn('[score] multiple shots given; scoring the first (desktop analog) only');
    if (!existsSync(shotPath)) throw new Error(`No shot at ${shotPath}`);
    // A shot has no meta.json, so its scope cannot be inferred; require it
    // explicitly rather than silently falling back to board scope.
    if (args.scope !== 'board' && !args.channels?.length && !args.direction) {
      throw new Error('--shots needs an explicit scope: pass --channels a,b, --direction <id>, or --scope board');
    }
    outDir = dirname(shotPath);
    outPrefix = `${basename(shotPath, extname(shotPath))}.score`;
  } else {
    throw new Error('pass --slug <direction>-NNN or --shots <path>');
  }

  const directionsDoc = readManifest(join(board.absDir, 'directions.json'));
  const scope = resolveScope(args, meta, directionsDoc);
  if (scope.type === 'board' && !args.scope && !meta?.channels?.length) {
    console.warn('[score] no direction scope resolvable (no meta.json channels, no --direction/--channels); board scope only');
  }

  const boardIds = Object.keys(fp.refs);
  const scopeIds = scope.channels ? scopeRefIds(fp.refs, scope.channels) : boardIds;
  if (!scopeIds.length) throw new Error(`Scope channels [${scope.channels}] match no fingerprint refs`);
  scope.n = scopeIds.length;
  const scopeAxes = scope.channels ? aggregateAxes(fp.refs, scopeIds) : fp.axes;

  // Top-crop to the scope references' median aspect (like-for-like geometry).
  const srcMeta = await sharp(shotPath).metadata();
  const aspect = medianAspect(fp.refs, scopeIds);
  const crop = cropGeometry(srcMeta.width, srcMeta.height, aspect);
  const suffix = fp.experiment ? `.${fp.experiment}` : '';
  // The crop artifact must never land where import.mjs scans for references
  // (a crop PNG in boards/<board>/ would be imported as a new reference on the
  // next pipeline run). Slug folders are safe and keep the crop inspectable;
  // --shots mode uses the OS temp dir. Uncropped shots are measured in place.
  let cropPath = null;
  if (crop.cropped) {
    cropPath = args.slug
      ? join(outDir, `${outPrefix}-crop${suffix}.png`)
      : join(tmpdir(), `taste-score-${basename(shotPath, extname(shotPath))}${suffix}.png`);
    await sharp(shotPath)
      .extract({ left: 0, top: 0, width: crop.width, height: crop.height })
      .png()
      .toFile(cropPath);
  }
  const measurePath = cropPath || shotPath;

  // Same extractors as the references: computeFeatures at the same downsample,
  // the same derived scalars, the same tag prompt/vocabulary/model tier.
  const { data, info } = await sharp(measurePath)
    .resize(SAMPLE, SAMPLE, { fit: 'inside' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const measured = computeFeatures(data, info);

  const callModel = makeVisionCaller(args.model, apiKey);
  const votes = [];
  for (let v = 0; v < args.tagVotes; v++) {
    votes.push((await tagImage(measurePath, board, callModel)).tags);
  }
  const tags = majorityTags(votes);

  const output = {
    contrast: measured.contrast,
    density: measured.density,
    chroma: chromaOf(measured.palette) != null ? +chromaOf(measured.palette).toFixed(4) : null,
    groundLightness: groundLightnessOf(measured.palette) != null ? +groundLightnessOf(measured.palette).toFixed(4) : null,
    accentCount: accentCountOf(measured.palette),
    palette: measured.palette,
    tags,
  };

  const rowsScope = buildRows(output, scopeAxes);
  const rowsBoard = scope.channels ? buildRows(output, fp.axes) : rowsScope;
  const alignScope = alignmentScore(rowsScope);
  const alignBoard = alignmentScore(rowsBoard);
  const contribScope = contributions(rowsScope);
  const contribBoard = contributions(rowsBoard);

  printReport({
    label: args.slug || basename(shotPath),
    fpLabel,
    scope,
    crop,
    rowsScope,
    rowsBoard,
    alignScope,
    alignBoard,
    contribScope,
  });

  const scorePath = join(outDir, `${outPrefix}${suffix}.json`);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    scorePath,
    JSON.stringify(
      {
        target: args.slug || shotPath,
        board: board.name,
        fingerprint: { label: fpLabel, hash: fp.hash || null, experiment: fp.experiment || null },
        scope: { type: scope.type, channels: scope.channels, refIds: scopeIds, n: scope.n },
        crop: { source: { width: srcMeta.width, height: srcMeta.height }, width: crop.width, height: crop.height, aspect, file: cropPath },
        model: args.model,
        tagVotes: args.tagVotes,
        tagVoteDetail: votes,
        output,
        axes: { scope: rowsScope, board: rowsBoard },
        alignment: { scope: alignScope, board: alignBoard },
        contributions: { scope: contribScope, board: contribBoard },
        generated: new Date().toISOString(),
      },
      null,
      2,
    ) + '\n',
  );
  console.log(`  -> ${scorePath}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
