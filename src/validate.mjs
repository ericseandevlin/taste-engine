#!/usr/bin/env node
// validate.mjs: v2 style validation harness (v2 design doc, section 5).
// Five registered validation classes (docs/styles/classes.json), each a normal
// mini-board under boards/validation-t1/<class>, are cross-classified by
// leave-one-out alignment: every exemplar is scored against its own class's
// ruler built WITHOUT itself plus every other class's full ruler; predicted
// class = argmax alignment; a tie counts as a misclassification.
//
// Everything here is a BUILD GATE with ZERO evidential weight: the harness
// runs during development and gets iterated until it passes, so by the freeze
// it passes with probability ~1. It gates whether the build is done and then
// serves as a standing regression harness. It is never evidence the metric
// works; reading a clean confusion matrix as proof is the exact mistake this
// project exists to stop making.
//
// Gates (design doc section 5, pinned):
//   1 separation: overall own-class accuracy >= 80% AND every class >= 60%
//     AND brutalism-minimal/brutalism-maximal mutual confusion <= 40%.
//   2 tags-ablated separation >= 60% (chance 20%): same procedure with the
//     tags row dropped before alignment (surface + palette families only).
//   3 degeneracy: < 20% of (scalar axis, class) cells with raw pre-floor
//     spread below CONSTANTS.SPREAD_FLOOR; d values clipped at 1.00 counted.
//   4 characterization: per class, every checkable defining determinant in
//     classes.json passes its instrument check (tag presence >= the registered
//     detection threshold; scalar class median inside the registered raw
//     range, inclusive). Determinants with no instrument are excluded ex ante
//     and the per-class denominator is recomputed and printed.
//
// Small-n spread handling (doc gate 6): every scalar axis spread in every
// ruler is floored at the cross-class pooled scaled-MAD for that axis (pooled
// over ALL exemplars of ALL classes, normalized scale), never below
// SPREAD_FLOOR. An axis whose class spread is exactly 0 AND whose pooled
// spread is 0 drops out of that ruler's distance with a printed notice,
// never a constant d=1.00 (the Phase 1 saturation pathology).
//
// Usage: npm run validate
// Output: human report to stdout + machine report to
// boards/validation-t1/report.json. Exits nonzero when a build gate fails
// (the build is not done), which still carries zero evidential weight.

import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { REPO_ROOT } from './config.mjs';
import { readManifest } from './manifest.mjs';
import { buildRows } from './score.mjs';
import {
  CONSTANTS,
  SCALAR_AXES,
  alignmentScore,
  buildFingerprint,
  madSpread,
  median,
  normalizeScalar,
} from './features.mjs';

export const HEADER =
  'BUILD GATES: iterated-to-pass during development; zero evidential weight in any run verdict.';
export const GATE_LABEL = 'BUILD GATE (zero evidential weight)';

const BRUTAL_PAIR = ['brutalism-minimal', 'brutalism-maximal'];
const AXIS_IDS = [...SCALAR_AXES, 'palette', 'tags'];

// --- Pure mechanics ---

// Cross-class pooled scaled-MAD per scalar axis, on the normalized scale,
// over every exemplar of every class (full set, never leave-one-out).
export function pooledSpreads(fingerprints) {
  const pooled = {};
  for (const axis of SCALAR_AXES) {
    const values = [];
    for (const fp of fingerprints) {
      for (const id of Object.keys(fp.refs)) {
        const v = normalizeScalar(axis, fp.refs[id][axis]);
        if (v != null) values.push(v);
      }
    }
    pooled[axis] = values.length ? madSpread(values) : null;
  }
  return pooled;
}

// Clone a ruler's axes with each scalar spread floored at
// max(class spread, pooled MAD, SPREAD_FLOOR). A class spread of exactly 0
// with a pooled spread of 0 means the axis carries no information in this
// dataset: it drops out of the ruler (with a notice) instead of scoring a
// constant d=1.00. Salience/confidence stay as aggregated (pre-floor).
export function flooredAxes(axes, pooled) {
  const out = { ...axes };
  const dropped = [];
  const notices = [];
  for (const axis of SCALAR_AXES) {
    const a = axes[axis];
    if (!a || a.spread == null) continue; // center null: distance is null anyway
    const p = pooled[axis] ?? 0;
    if (a.spread === 0 && p === 0) {
      dropped.push(axis);
      notices.push(
        `axis ${axis}: class spread 0 and pooled spread 0; dropped from this ruler's distance (never a constant d=1.00)`,
      );
      continue;
    }
    out[axis] = { ...a, rawSpread: a.spread, spread: +Math.max(a.spread, p, CONSTANTS.SPREAD_FLOOR).toFixed(4) };
  }
  return { axes: out, dropped, notices };
}

// Gate 2 ablation: identical rows minus the tags row, so alignment runs on
// the surface + palette families only.
export function dropTagsRow(rows) {
  return rows.filter((r) => r.id !== 'tags');
}

// argmax over per-class alignments. A shared maximum is a tie and counts as
// a misclassification; all-null alignments predict nothing.
export function argmaxPredict(alignments) {
  let best = -Infinity;
  let bestIds = [];
  for (const [cid, a] of Object.entries(alignments)) {
    const v = a == null ? -Infinity : a;
    if (v > best) {
      best = v;
      bestIds = [cid];
    } else if (v === best) {
      bestIds.push(cid);
    }
  }
  if (best === -Infinity) return { predicted: null, tie: false };
  if (bestIds.length > 1) return { predicted: null, tie: true };
  return { predicted: bestIds[0], tie: false };
}

// records: [{ actual, predicted, tie }]. Ties and unscorable exemplars land
// in their own cells and count as misclassifications.
export function buildConfusion(records, classIds) {
  const matrix = {};
  for (const a of classIds) {
    matrix[a] = {};
    for (const p of classIds) matrix[a][p] = 0;
    matrix[a].tie = 0;
    matrix[a].none = 0;
  }
  let correct = 0;
  for (const r of records) {
    if (r.tie) matrix[r.actual].tie++;
    else if (r.predicted == null) matrix[r.actual].none++;
    else matrix[r.actual][r.predicted]++;
    if (r.predicted === r.actual && r.predicted != null) correct++;
  }
  const perClass = {};
  for (const c of classIds) {
    const n = records.filter((r) => r.actual === c).length;
    perClass[c] = { n, correct: matrix[c][c], accuracy: n ? matrix[c][c] / n : 0 };
  }
  return { matrix, overall: records.length ? correct / records.length : 0, total: records.length, perClass };
}

// Gate 3: (scalar axis, class) cells whose raw PRE-FLOOR spread sits below
// SPREAD_FLOOR (a null spread also counts: no signal at all).
export function degeneracyCells(fingerprintsById) {
  const cells = [];
  for (const [cid, fp] of Object.entries(fingerprintsById)) {
    for (const axis of SCALAR_AXES) {
      const spread = fp.axes[axis]?.spread ?? null;
      cells.push({ class: cid, axis, spread, degenerate: spread == null || spread < CONSTANTS.SPREAD_FLOOR });
    }
  }
  const below = cells.filter((c) => c.degenerate);
  return { cells, below, fraction: cells.length ? below.length / cells.length : 0 };
}

// One instrument check against a class's exemplar features (fingerprint refs).
// Tag: detection frequency over ALL class exemplars. The registered 0.667
// threshold is the 3-decimal rendering of the design's "present in >= 2/3 of
// exemplars", so the comparison happens at the threshold's own precision
// (frequency rounded to 3 decimals); on exact fractions, 4/6 is 0.66667 and
// would otherwise fail a threshold that means 2/3.
// Scalar: class median of the RAW measured value, range inclusive.
export function checkInstrument(inst, refs, threshold) {
  const n = refs.length;
  if (inst.type === 'tag') {
    const count = refs.filter((r) => (r.tags || []).includes(inst.id)).length;
    const freq = n ? +(count / n).toFixed(4) : 0;
    const pass = (n ? +(count / n).toFixed(3) : 0) >= threshold;
    return { type: 'tag', id: inst.id, count, n, observed: freq, pass };
  }
  if (inst.type === 'scalar') {
    const values = refs.map((r) => r[inst.id]).filter((v) => v != null);
    const med = median(values);
    const pass = med != null && med >= inst.range[0] && med <= inst.range[1];
    return { type: 'scalar', id: inst.id, n: values.length, observed: med, range: inst.range, pass };
  }
  return { type: inst.type, id: inst.id, observed: null, pass: false, note: 'unknown instrument type' };
}

// Gate 4: per class, EVERY checkable defining determinant must pass its
// (primary) instrument check. Determinants with no instrument are excluded ex
// ante as named blind spots and the denominator is recomputed. A registered
// "secondary" instrument is checked and reported as corroboration, non-gating.
export function characterization(spec, fingerprintsById) {
  const threshold = spec.tagDetectionThreshold ?? 0.667;
  const classes = {};
  let allPass = true;
  for (const [cid, cls] of Object.entries(spec.classes)) {
    const refs = Object.values(fingerprintsById[cid]?.refs || {});
    const rows = [];
    const excluded = [];
    let checkable = 0;
    let passed = 0;
    for (const det of cls.defining || []) {
      if (!det.instrument) {
        excluded.push(det.determinant);
        rows.push({ determinant: det.determinant, excluded: true });
        continue;
      }
      checkable++;
      const res = checkInstrument(det.instrument, refs, threshold);
      const secondary = det.secondary ? checkInstrument(det.secondary, refs, threshold) : null;
      if (res.pass) passed++;
      rows.push({ determinant: det.determinant, ...res, secondary, blindSpotNote: det.blindSpotNote || null });
    }
    const pass = passed === checkable;
    if (!pass) allPass = false;
    classes[cid] = { n: refs.length, checkable, passed, excluded, pass, rows };
  }
  return { pass: allPass, threshold, classes };
}

function summarize(ds) {
  if (!ds.length) return { n: 0, min: null, median: null, max: null, clipped: 0 };
  return {
    n: ds.length,
    min: +Math.min(...ds).toFixed(4),
    median: +median(ds).toFixed(4),
    max: +Math.max(...ds).toFixed(4),
    clipped: ds.filter((d) => d === 1).length,
  };
}

// The whole harness as a pure function of (class spec, manifests by class id),
// so tests drive it with synthetic fixtures and never touch disk or network.
export function runHarness(spec, manifests) {
  const classIds = Object.keys(spec.classes);
  const fps = {};
  for (const cid of classIds) {
    if (!manifests[cid]?.items?.length) throw new Error(`runHarness: no manifest items for class "${cid}"`);
    fps[cid] = buildFingerprint(manifests[cid]);
  }
  const pooled = pooledSpreads(Object.values(fps));
  const fullRulers = {};
  // Drop notices aggregate per (class, axis): one line covering the full
  // ruler and however many leave-one-out rulers dropped the axis.
  const dropEvents = new Map();
  const recordDrop = (cid, axis, kind) => {
    const key = `${cid}|${axis}`;
    const e = dropEvents.get(key) || { cid, axis, full: false, loo: 0 };
    if (kind === 'full') e.full = true;
    else e.loo++;
    dropEvents.set(key, e);
  };
  for (const cid of classIds) {
    fullRulers[cid] = flooredAxes(fps[cid].axes, pooled);
    for (const axis of fullRulers[cid].dropped) recordDrop(cid, axis, 'full');
  }

  const perAxis = {};
  for (const a of AXIS_IDS) perAxis[a] = { own: [], cross: [], dropped: 0 };
  const fullRecords = [];
  const ablatedRecords = [];
  const predictions = [];
  let clippedScalarDs = 0;

  for (const cid of classIds) {
    for (const id of Object.keys(fps[cid].refs)) {
      const features = fps[cid].refs[id];
      // Own-class ruler EXCLUDES the exemplar (leave-one-out); every other
      // class keeps its full fingerprint. Same pooled floors everywhere.
      const loo = flooredAxes(buildFingerprint(manifests[cid], { exclude: [id] }).axes, pooled);
      for (const axis of loo.dropped) recordDrop(cid, axis, 'loo');
      const alignments = {};
      const ablated = {};
      for (const rc of classIds) {
        const ruler = rc === cid ? loo : fullRulers[rc];
        let rows = buildRows(features, ruler.axes);
        if (ruler.dropped.length) {
          for (const d of ruler.dropped) perAxis[d].dropped++;
          rows = rows.filter((r) => !ruler.dropped.includes(r.id));
        }
        alignments[rc] = alignmentScore(rows);
        ablated[rc] = alignmentScore(dropTagsRow(rows));
        const bucket = rc === cid ? 'own' : 'cross';
        for (const r of rows) {
          if (r.distance == null) continue;
          perAxis[r.id][bucket].push(r.distance);
          if (r.kind === 'scalar' && r.distance === 1) clippedScalarDs++;
        }
      }
      const p = argmaxPredict(alignments);
      const pa = argmaxPredict(ablated);
      fullRecords.push({ actual: cid, id, predicted: p.predicted, tie: p.tie });
      ablatedRecords.push({ actual: cid, id, predicted: pa.predicted, tie: pa.tie });
      predictions.push({
        class: cid,
        id,
        alignments,
        predicted: p.predicted,
        tie: p.tie,
        ablatedAlignments: ablated,
        ablatedPredicted: pa.predicted,
        ablatedTie: pa.tie,
      });
    }
  }

  const full = buildConfusion(fullRecords, classIds);
  const abl = buildConfusion(ablatedRecords, classIds);

  // Gate 1: separation, including the brutalism-strand mutual-confusion check
  // when both strands are registered (n/a on synthetic fixtures without them).
  const minClassAccuracy = Math.min(...classIds.map((c) => full.perClass[c].accuracy));
  const havePair = BRUTAL_PAIR.every((p) => classIds.includes(p));
  let pairConfusion = null;
  if (havePair) {
    const [a, b] = BRUTAL_PAIR;
    pairConfusion = {
      [`${a}->${b}`]: full.perClass[a].n ? full.matrix[a][b] / full.perClass[a].n : 0,
      [`${b}->${a}`]: full.perClass[b].n ? full.matrix[b][a] / full.perClass[b].n : 0,
    };
  }
  const pairOk = !havePair || Object.values(pairConfusion).every((v) => v <= 0.4);
  const separation = {
    label: 'separation',
    pass: full.overall >= 0.8 && minClassAccuracy >= 0.6 && pairOk,
    overall: full.overall,
    minClassAccuracy,
    pairConfusion: havePair ? pairConfusion : 'n/a (brutalism strand pair not registered)',
  };
  const tagsAblated = {
    label: 'tags-ablated separation',
    pass: abl.overall >= 0.6,
    overall: abl.overall,
    chance: 1 / classIds.length,
  };
  const deg = degeneracyCells(fps);
  const degeneracy = {
    label: 'degeneracy',
    pass: deg.fraction < 0.2,
    fraction: deg.fraction,
    totalCells: deg.cells.length,
    cellsBelowFloor: deg.below.map(({ class: cid, axis, spread }) => ({ class: cid, axis, spread })),
    clippedScalarDs,
  };
  const charac = { label: 'characterization', ...characterization(spec, fps) };

  const perAxisSummary = {};
  for (const a of AXIS_IDS) {
    perAxisSummary[a] = { own: summarize(perAxis[a].own), cross: summarize(perAxis[a].cross), dropped: perAxis[a].dropped };
  }

  const notices = [...dropEvents.values()].map((e) => {
    const where = [e.full ? 'full ruler' : null, e.loo ? `${e.loo} leave-one-out ruler(s)` : null].filter(Boolean).join(' + ');
    return `class ${e.cid}: axis ${e.axis}: class spread 0 and pooled spread 0; dropped from this ruler's distance, never a constant d=1.00 (${where})`;
  });

  const counts = {};
  for (const cid of classIds) counts[cid] = Object.keys(fps[cid].refs).length;
  const pooledRounded = {};
  for (const a of SCALAR_AXES) pooledRounded[a] = pooled[a] == null ? null : +pooled[a].toFixed(4);

  return {
    header: HEADER,
    classIds,
    counts,
    pooled: pooledRounded,
    matrices: { full, ablated: abl },
    gates: { separation, tagsAblated, degeneracy, characterization: charac },
    perAxis: perAxisSummary,
    predictions,
    notices,
  };
}

// --- I/O ---

// Each class dir is a normal mini-board: its manifest.json comes from the
// ordinary import/measure/tag pipeline. A missing or empty manifest fails
// loudly with the exact commands to produce it.
export function loadClassManifests(spec) {
  const manifests = {};
  for (const [cid, cls] of Object.entries(spec.classes)) {
    const path = join(REPO_ROOT, cls.exemplarDir, 'manifest.json');
    const manifest = readManifest(path);
    if (!manifest?.items?.length) {
      const boardName = cls.exemplarDir.replace(/^boards\//, '');
      throw new Error(
        `No manifest for class "${cid}" at ${path}. Each class dir is a normal mini-board: ` +
          `render its exemplars into ${cls.exemplarDir}/ and run the pipeline first ` +
          `(npm run import -- --board ${boardName}; npm run measure -- --board ${boardName}; ` +
          `npm run tag -- --board ${boardName}).`,
      );
    }
    manifests[cid] = manifest;
  }
  return manifests;
}

function pct(x) {
  return `${(100 * x).toFixed(1)}%`;
}

function num(v) {
  return v == null ? '-' : String(v);
}

function printReport(report) {
  const ids = report.classIds;
  console.log(report.header);
  const total = ids.reduce((a, c) => a + report.counts[c], 0);
  console.log(`[validate] classes=${ids.length} exemplars=${total} (${ids.map((c) => `${c}=${report.counts[c]}`).join(', ')})`);
  console.log(`  pooled scaled-MAD spread floors (normalized): ${SCALAR_AXES.map((a) => `${a}=${num(report.pooled[a])}`).join(' ')}`);
  console.log(`  legend: ${ids.map((c, i) => `C${i + 1}=${c}`).join('  ')}`);

  const colHdr = ids.map((_, i) => `C${i + 1}`.padStart(5)).join('') + 'x'.padStart(4) + 'acc'.padStart(8);
  console.log('  confusion (rows=actual, cols=predicted; x = tie or unscorable, counted as misclassified):');
  console.log(`  ${''.padEnd(8)}${'FULL'.padEnd(colHdr.length)}   |  TAGS-ABLATED`);
  console.log(`  ${'actual'.padEnd(8)}${colHdr}   |${colHdr}`);
  const side = (conf, a) =>
    ids.map((p) => String(conf.matrix[a][p]).padStart(5)).join('') +
    String(conf.matrix[a].tie + conf.matrix[a].none).padStart(4) +
    pct(conf.perClass[a].accuracy).padStart(8);
  ids.forEach((a, i) => {
    console.log(`  ${`C${i + 1}`.padEnd(8)}${side(report.matrices.full, a)}   |${side(report.matrices.ablated, a)}`);
  });
  console.log(
    `  ${'overall'.padEnd(8)}${pct(report.matrices.full.overall).padStart(colHdr.length)}   |${pct(report.matrices.ablated.overall).padStart(colHdr.length)}`,
  );

  console.log('  per-axis distance distributions (post-floor; the Phase 1 diagnosis view):');
  console.log(`  ${'axis'.padEnd(18)}${'own med'.padStart(9)}${'cross med'.padStart(11)}${'cross max'.padStart(11)}${'d=1.00'.padStart(8)}${'dropped'.padStart(9)}`);
  for (const [axis, s] of Object.entries(report.perAxis)) {
    console.log(
      `  ${axis.padEnd(18)}${num(s.own.median).padStart(9)}${num(s.cross.median).padStart(11)}${num(s.cross.max).padStart(11)}${String(s.own.clipped + s.cross.clipped).padStart(8)}${String(s.dropped).padStart(9)}`,
    );
  }

  for (const n of report.notices) console.log(`  notice: ${n}`);

  const ch = report.gates.characterization;
  console.log(`  characterization: determinant-to-instrument table (tag detection threshold ${ch.threshold}; secondary instruments are corroboration, non-gating):`);
  for (const [cid, cls] of Object.entries(ch.classes)) {
    const bar = cls.checkable ? `bar: all ${cls.checkable} checkable` : 'no checkable determinants';
    const excl = cls.excluded.length ? `; excluded ex ante: ${cls.excluded.join(', ')}` : '';
    console.log(`  ${cid} (n=${cls.n}, ${bar}, ${cls.passed}/${cls.checkable} passed${excl}):`);
    for (const row of cls.rows) {
      if (row.excluded) {
        console.log(`    ${row.determinant.padEnd(38)} excluded ex ante (no instrument)`);
        continue;
      }
      const obs =
        row.type === 'tag'
          ? `${row.count}/${row.n} exemplars (${row.observed})`
          : `median ${num(row.observed)} in [${row.range[0]}, ${row.range[1]}]`;
      console.log(`    ${row.determinant.padEnd(38)} ${`${row.type}:${row.id}`.padEnd(32)} ${obs.padEnd(28)} ${row.pass ? 'PASS' : 'FAIL'}`);
      if (row.secondary) {
        const s = row.secondary;
        const sobs =
          s.type === 'tag'
            ? `${s.count}/${s.n} exemplars (${s.observed})`
            : `median ${num(s.observed)} in [${s.range[0]}, ${s.range[1]}]`;
        console.log(`      + secondary ${s.type}:${s.id} ${sobs} ${s.pass ? 'PASS' : 'FAIL'} (corroboration, non-gating)`);
      }
      if (row.blindSpotNote) console.log(`      blind spot: ${row.blindSpotNote}`);
    }
  }

  const g = report.gates;
  const pairStr =
    typeof g.separation.pairConfusion === 'string'
      ? g.separation.pairConfusion
      : Object.entries(g.separation.pairConfusion)
          .map(([k, v]) => `${k} ${pct(v)}`)
          .join(', ');
  console.log(
    `${GATE_LABEL} 1 separation: ${g.separation.pass ? 'PASS' : 'FAIL'} (overall ${pct(g.separation.overall)} vs >= 80%; min class ${pct(g.separation.minClassAccuracy)} vs >= 60%; strand mutual confusion ${pairStr} vs <= 40%)`,
  );
  console.log(
    `${GATE_LABEL} 2 tags-ablated separation: ${g.tagsAblated.pass ? 'PASS' : 'FAIL'} (overall ${pct(g.tagsAblated.overall)} vs >= 60%, chance ${pct(g.tagsAblated.chance)})`,
  );
  console.log(
    `${GATE_LABEL} 3 degeneracy: ${g.degeneracy.pass ? 'PASS' : 'FAIL'} (${g.degeneracy.cellsBelowFloor.length}/${g.degeneracy.totalCells} scalar-axis cells (${pct(g.degeneracy.fraction)}) below the raw spread floor vs < 20%; ${g.degeneracy.clippedScalarDs} pairwise scalar d values clipped at exactly 1.00)`,
  );
  console.log(
    `${GATE_LABEL} 4 characterization: ${g.characterization.pass ? 'PASS' : 'FAIL'} (${Object.entries(g.characterization.classes)
      .map(([cid, c]) => `${cid} ${c.passed}/${c.checkable}`)
      .join('; ')})`,
  );
}

function main() {
  const classesPath = join(REPO_ROOT, 'docs', 'styles', 'classes.json');
  const spec = readManifest(classesPath);
  if (!spec?.classes) throw new Error(`No class registry at ${classesPath}`);
  const manifests = loadClassManifests(spec);
  const report = runHarness(spec, manifests);
  report.generated = new Date().toISOString();
  printReport(report);

  const outPath = join(REPO_ROOT, 'boards', 'validation-t1', 'report.json');
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n');
  console.log(`  -> ${outPath}`);

  const failing = Object.values(report.gates).filter((g) => !g.pass).map((g) => g.label);
  if (failing.length) {
    console.log(`  build gates failing: ${failing.join(', ')} (build not done; zero evidential weight either way)`);
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
