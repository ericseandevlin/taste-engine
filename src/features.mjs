#!/usr/bin/env node
// features.mjs — shared pure functions for the fingerprint and score stages:
// per-axis normalization, palette-derived scalars, robust aggregation
// (median + scaled MAD), salience-from-self-agreement, and the per-axis
// distance functions. No I/O, no network; everything here is unit-testable.
//
// Design doc: taste/product/phase0-score-design.md (Life-OS). The constants
// below are FROZEN before any demonstration scoring; moving one after seeing
// demo numbers voids the demo run.

// --- Frozen tuning constants (one block, per the design doc) ---
export const CONSTANTS = {
  // Per-axis normalization divisors: raw extractor value / divisor -> [0,1].
  // contrast (std luminance / 255) mathematically maxes at 0.5; density
  // (mean adjacent-pixel delta / 255) stays under ~0.15 on real pages.
  AXIS_SCALE: { contrast: 0.5, density: 0.15, chroma: 1, groundLightness: 1, accentCount: 4 },
  SPREAD_FLOOR: 0.05, // min spread in the scalar distance denominator (normalized scale)
  DISTANCE_SPREADS: 2, // two spreads off = fully off
  SALIENCE_REF_SPREAD: 0.371, // scaled-MAD spread of a uniform [0,1] distribution
  DELTA_E_NORM: 100, // per-color deltaE76 normalizer (clipped at 1)
  TAG_EXPECTED_FREQ: 0.5, // tags at/above this scope frequency are expected
  TAG_ALIEN_FREQ: 0.25, // output tags below this scope frequency are alien
  ACCENT_SATURATION: 0.25, // HSL saturation above this = chromatic
  ACCENT_HUE_DELTA: 30, // degrees of hue separation from the ground to count as an accent
  PALETTE_TOP_K: 8, // entries kept in an aggregate palette
};

export const SCALAR_AXES = ['contrast', 'density', 'chroma', 'groundLightness', 'accentCount'];

// --- Color helpers ---

export function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

export function rgbToHsl({ r, g, b }) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
  else if (max === gn) h = ((bn - rn) / d + 2) * 60;
  else h = ((rn - gn) / d + 4) * 60;
  return { h, s, l };
}

// Same luminance weights as measure.mjs, scaled to [0,1].
export function luminance601({ r, g, b }) {
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

// sRGB (D65) -> CIELAB. Standard conversion, kept dependency-free.
export function rgbToLab({ r, g, b }) {
  const lin = (v) => {
    const c = v / 255;
    return c > 0.04045 ? ((c + 0.055) / 1.055) ** 2.4 : c / 12.92;
  };
  const rl = lin(r);
  const gl = lin(g);
  const bl = lin(b);
  // sRGB -> XYZ (D65), normalized to the D65 white point.
  const x = (0.4124564 * rl + 0.3575761 * gl + 0.1804375 * bl) / 0.95047;
  const y = 0.2126729 * rl + 0.7151522 * gl + 0.072175 * bl;
  const z = (0.0193339 * rl + 0.119192 * gl + 0.9503041 * bl) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

export function deltaE76(lab1, lab2) {
  return Math.hypot(lab1.L - lab2.L, lab1.a - lab2.a, lab1.b - lab2.b);
}

function hueDelta(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

// --- Palette-derived scalars (raw scale; null on empty palette) ---

function sortedPalette(palette) {
  return [...(palette || [])].filter((p) => hexToRgb(p.hex)).sort((a, b) => (b.pct || 0) - (a.pct || 0));
}

// Coverage-weighted mean HSL saturation. pct ?? 1 treats only a MISSING pct
// as unknown; a genuine 0% entry (sub-rounding coverage) keeps zero weight.
export function chromaOf(palette) {
  const pal = sortedPalette(palette);
  if (!pal.length) return null;
  let sum = 0;
  let wsum = 0;
  for (const p of pal) {
    const w = p.pct ?? 1;
    sum += rgbToHsl(hexToRgb(p.hex)).s * w;
    wsum += w;
  }
  return wsum ? sum / wsum : 0;
}

// Luminance of the dominant (highest-coverage) entry.
export function groundLightnessOf(palette) {
  const pal = sortedPalette(palette);
  if (!pal.length) return null;
  return luminance601(hexToRgb(pal[0].hex));
}

// Non-ground entries that are chromatic and hue-distinct from the ground.
// If the ground itself is achromatic, any chromatic entry counts.
export function accentCountOf(palette) {
  const pal = sortedPalette(palette);
  if (!pal.length) return null;
  const ground = rgbToHsl(hexToRgb(pal[0].hex));
  const groundAchromatic = ground.s <= CONSTANTS.ACCENT_SATURATION;
  let count = 0;
  for (const p of pal.slice(1)) {
    const hsl = rgbToHsl(hexToRgb(p.hex));
    if (hsl.s <= CONSTANTS.ACCENT_SATURATION) continue;
    if (groundAchromatic || hueDelta(hsl.h, ground.h) >= CONSTANTS.ACCENT_HUE_DELTA) count++;
  }
  return count;
}

// --- Normalization & robust stats (all stats live on the normalized scale) ---

export function normalizeScalar(axis, raw) {
  if (raw == null) return null;
  const scale = CONSTANTS.AXIS_SCALE[axis];
  if (!scale) throw new Error(`normalizeScalar: unknown axis "${axis}"`);
  return Math.min(1, Math.max(0, raw / scale));
}

export function median(values) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// Population std (denominator n). Informational only; distance uses MAD spread.
export function stdDev(values) {
  if (!values.length) return null;
  const m = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((a, v) => a + (v - m) ** 2, 0) / values.length);
}

// Scaled MAD: 1.4826 * median(|v - median|). Robust to one wild reference.
export function madSpread(values) {
  const med = median(values);
  if (med == null) return null;
  return 1.4826 * median(values.map((v) => Math.abs(v - med)));
}

// Aggregate one scalar axis over a scope. `normValues` may contain nulls
// (refs that fell back to palettes.json have null contrast/density); those
// lower confidence instead of polluting the stats. Salience needs at least
// two measured refs to mean anything.
export function aggregateScalar(normValues, scopeSize) {
  const values = normValues.filter((v) => v != null);
  const n = values.length;
  if (n === 0) {
    return { kind: 'scalar', mean: null, std: null, center: null, spread: null, range: null, n: 0, confidence: 0, salience: 0 };
  }
  const spread = madSpread(values);
  return {
    kind: 'scalar',
    mean: +(values.reduce((a, b) => a + b, 0) / n).toFixed(4),
    std: +stdDev(values).toFixed(4),
    center: +median(values).toFixed(4),
    spread: +spread.toFixed(4),
    range: [+Math.min(...values).toFixed(4), +Math.max(...values).toFixed(4)],
    n,
    confidence: +(n / scopeSize).toFixed(4),
    salience: n >= 2 ? +(1 - Math.min(1, spread / CONSTANTS.SALIENCE_REF_SPREAD)).toFixed(4) : 0,
  };
}

// --- Palette axis ---

// Coverage-weighted union of the refs' palettes, top K, weights sum to 1.
export function aggregatePalette(refPalettes) {
  const weights = new Map();
  for (const pal of refPalettes) {
    for (const p of pal || []) {
      if (!hexToRgb(p.hex)) continue;
      weights.set(p.hex, (weights.get(p.hex) || 0) + (p.pct ?? 1));
    }
  }
  const entries = [...weights.entries()].sort((a, b) => b[1] - a[1]).slice(0, CONSTANTS.PALETTE_TOP_K);
  const total = entries.reduce((a, [, w]) => a + w, 0) || 1;
  return entries.map(([hex, w]) => ({ hex, weight: +(w / total).toFixed(4) }));
}

// One-sided: coverage-weighted mean of each output color's clipped distance to
// its nearest aggregate entry. Using a subset of the board's palette is free;
// introducing colors the board never uses is what scores as distance.
export function paletteDistance(outPalette, entries) {
  const pal = sortedPalette(outPalette);
  if (!pal.length || !entries.length) return null;
  const labs = entries.map((e) => rgbToLab(hexToRgb(e.hex)));
  let sum = 0;
  let wsum = 0;
  const nearest = [];
  for (const p of pal) {
    const lab = rgbToLab(hexToRgb(p.hex));
    let best = Infinity;
    let bestHex = null;
    labs.forEach((l, i) => {
      const d = deltaE76(lab, l);
      if (d < best) {
        best = d;
        bestHex = entries[i].hex;
      }
    });
    const w = p.pct ?? 1;
    sum += Math.min(1, best / CONSTANTS.DELTA_E_NORM) * w;
    wsum += w;
    nearest.push({ hex: p.hex, nearest: bestHex, deltaE: +best.toFixed(1) });
  }
  if (!wsum) return null;
  return { d: +(sum / wsum).toFixed(4), nearest };
}

// Leave-one-out self-agreement: each ref's palette against the aggregate of
// the others. Self-inclusion would inflate agreement exactly where scopes are
// thinnest.
export function paletteSelfAgreement(refPalettes) {
  const pals = refPalettes.filter((p) => (p || []).length);
  if (pals.length < 2) return 0;
  let sum = 0;
  for (let i = 0; i < pals.length; i++) {
    const others = aggregatePalette(pals.filter((_, j) => j !== i));
    const res = paletteDistance(pals[i], others);
    sum += 1 - (res ? res.d : 1);
  }
  return +(sum / pals.length).toFixed(4);
}

// --- Tags axis ---

export function tagFreq(refTagLists) {
  const n = refTagLists.length || 1;
  const counts = new Map();
  for (const tags of refTagLists) {
    for (const t of tags || []) counts.set(t, (counts.get(t) || 0) + 1);
  }
  const freq = {};
  for (const [t, c] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
    freq[t] = +(c / n).toFixed(4);
  }
  return freq;
}

// Asymmetric expected/alien penalty. d = 0 is achievable: carry every
// expected tag (freq >= TAG_EXPECTED_FREQ) and nothing alien
// (freq < TAG_ALIEN_FREQ). Mid-frequency tags are free in both directions.
export function tagDistance(outputTags, freq) {
  const out = new Set(outputTags || []);
  const expected = Object.entries(freq).filter(([, f]) => f >= CONSTANTS.TAG_EXPECTED_FREQ);
  const missing = expected.filter(([t]) => !out.has(t));
  const expectedSum = expected.reduce((a, [, f]) => a + f, 0);
  const missingCost = expectedSum ? missing.reduce((a, [, f]) => a + f, 0) / expectedSum : 0;
  const alien = [...out]
    .map((t) => [t, freq[t] || 0])
    .filter(([, f]) => f < CONSTANTS.TAG_ALIEN_FREQ);
  const alienCost = alien.length
    ? alien.reduce((a, [, f]) => a + (CONSTANTS.TAG_ALIEN_FREQ - f) / CONSTANTS.TAG_ALIEN_FREQ, 0) / alien.length
    : 0;
  return {
    d: +((missingCost + alienCost) / 2).toFixed(4),
    missing: missing.map(([tag, f]) => ({ tag, freq: f })),
    alien: alien.map(([tag, f]) => ({ tag, freq: f })),
  };
}

// Leave-one-out self-agreement on tags.
export function tagSelfAgreement(refTagLists) {
  const lists = refTagLists.filter((t) => (t || []).length);
  if (lists.length < 2) return 0;
  let sum = 0;
  for (let i = 0; i < lists.length; i++) {
    const others = tagFreq(lists.filter((_, j) => j !== i));
    sum += 1 - tagDistance(lists[i], others).d;
  }
  return +(sum / lists.length).toFixed(4);
}

// --- Per-reference feature extraction (from a manifest item; raw scale) ---

export function refFeatures(item) {
  const palette = item.measured?.palette || [];
  return {
    contrast: item.measured?.contrast ?? null,
    density: item.measured?.density ?? null,
    chroma: chromaOf(palette) != null ? +chromaOf(palette).toFixed(4) : null,
    groundLightness: groundLightnessOf(palette) != null ? +groundLightnessOf(palette).toFixed(4) : null,
    accentCount: accentCountOf(palette),
    aspect: item.measured?.aspect ?? null, // metadata for score-time cropping, not an axis
    palette,
    tags: item.tags || [],
    channels: item.channels || [],
  };
}

// --- Scope aggregation: refs table subset -> axes object ---

export function aggregateAxes(refsTable, ids) {
  const refs = ids.map((id) => refsTable[id]).filter(Boolean);
  const scopeSize = refs.length;
  const axes = {};
  for (const axis of SCALAR_AXES) {
    axes[axis] = aggregateScalar(refs.map((r) => normalizeScalar(axis, r[axis])), scopeSize);
  }
  const palettes = refs.map((r) => r.palette);
  const withPalette = palettes.filter((p) => (p || []).length).length;
  const paletteAgreement = paletteSelfAgreement(palettes);
  axes.palette = {
    kind: 'palette',
    entries: aggregatePalette(palettes),
    selfAgreement: paletteAgreement,
    n: withPalette,
    confidence: scopeSize ? +(withPalette / scopeSize).toFixed(4) : 0,
    salience: paletteAgreement,
  };
  const tagLists = refs.map((r) => r.tags);
  // Frequencies are computed over TAGGED refs only: a ref whose tag pass
  // failed lowers confidence, it does not deflate every frequency (which
  // could flip tags across the frozen expected/alien thresholds).
  const taggedLists = tagLists.filter((t) => (t || []).length);
  const withTags = taggedLists.length;
  const tagAgreement = tagSelfAgreement(tagLists);
  axes.tags = {
    kind: 'tags',
    freq: tagFreq(taggedLists),
    selfAgreement: tagAgreement,
    n: withTags,
    confidence: scopeSize ? +(withTags / scopeSize).toFixed(4) : 0,
    salience: tagAgreement,
  };
  return axes;
}

// Union-of-members scope: refs whose channel membership intersects the given
// channel ids. Membership in refsTable mirrors channels.json (cluster.mjs
// reconciles item.channels from the channel member lists).
export function scopeRefIds(refsTable, channelIds) {
  const wanted = new Set(channelIds);
  return Object.keys(refsTable).filter((id) => (refsTable[id].channels || []).some((c) => wanted.has(c)));
}

export function medianAspect(refsTable, ids) {
  return median(ids.map((id) => refsTable[id]?.aspect).filter((a) => a != null));
}

// --- Fingerprint assembly + canonical hashing ---

export function buildFingerprint(manifest, { exclude = [] } = {}) {
  const skip = new Set(exclude);
  const refs = {};
  for (const item of manifest.items) {
    if (skip.has(item.id)) continue;
    refs[item.id] = refFeatures(item);
  }
  const axes = aggregateAxes(refs, Object.keys(refs));
  return { board: manifest.board, kind: manifest.kind, refs, axes };
}

// Key-sorted stringify so the hash is stable across property order.
export function canonicalStringify(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalStringify(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

// Canonical content = refs + axes ONLY. version/generated/hash/source stamps
// are excluded so a pipeline re-run on an unchanged board mints no new version
// (the pipeline re-stamps manifest.generated even when nothing changed).
export function fingerprintCanonical(fp) {
  return canonicalStringify({ refs: fp.refs, axes: fp.axes });
}

// --- Distance & alignment ---

export function scalarDistance(outNorm, axis) {
  if (outNorm == null || axis.center == null) return null;
  const delta = outNorm - axis.center;
  const denom = CONSTANTS.DISTANCE_SPREADS * Math.max(axis.spread, CONSTANTS.SPREAD_FLOOR);
  return { delta: +delta.toFixed(4), d: +Math.min(1, Math.abs(delta) / denom).toFixed(4) };
}

// Weighted alignment. Returns null when no axis carries weight (a scope so
// incoherent the number would be meaningless).
export function alignmentScore(rows) {
  const usable = rows.filter((r) => r.distance != null && r.weight > 0);
  const wsum = usable.reduce((a, r) => a + r.weight, 0);
  if (!wsum) return null;
  const weighted = usable.reduce((a, r) => a + r.weight * r.distance, 0);
  return +(100 * (1 - weighted / wsum)).toFixed(1);
}

// Each axis's share of the total weighted distance (the alignment deficit).
export function contributions(rows) {
  const usable = rows.filter((r) => r.distance != null && r.weight > 0);
  const total = usable.reduce((a, r) => a + r.weight * r.distance, 0);
  const out = {};
  for (const r of usable) {
    out[r.id] = total ? +((r.weight * r.distance) / total).toFixed(4) : 0;
  }
  return out;
}
