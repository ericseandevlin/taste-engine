// typeset.mjs: set the poster's copy in code, over artwork the image model drew
// without text. Image models misspell and repeat words; a typesetter does not.
//
//   const out = await typeset(artPng, ['Open Studio', '20 Nov 2026', 'Doors 7pm'], { dos });
//
// The copy goes in the calm field the artwork left at the top or bottom: the run
// of flat rows found by scanning the image. If neither edge has one, a flat panel
// goes behind the type in the top third so it stays readable.

import sharp from 'sharp';

const BAND = 0.32; // panel height when the art left no calm field
const MIN_FIELD = 0.15; // a calm field shorter than this does not count
const CALM = 18; // a row is calm when its pixels vary less than this (mean channel stdev)
const SANS = 'Helvetica Neue,Arial,Liberation Sans,sans-serif';
const SERIF = 'Georgia,Times New Roman,Liberation Serif,serif';

// Pure: a serif face only when the board's type rules ask for one and never a sans.
export function pickFont(dos = []) {
  const type = dos.filter((r) => r.aspect === 'type').map((r) => r.rule.toLowerCase());
  const serif = type.some((t) => /serif/.test(t.replace(/sans[- ]serif/g, ''))) && !type.some((t) => /sans|grotesk|grotesque/.test(t));
  return serif ? SERIF : SANS;
}

// Pure: how many rows from one edge stay calm, given each row's variation.
// A few noisy rows at the very edge (a frame line) are skipped, not counted.
export function calmRun(rowBusy, fromEnd = false) {
  const rows = fromEnd ? [...rowBusy].reverse() : rowBusy;
  const skip = Math.max(0, rows.findIndex((b) => b < CALM));
  if (skip > rows.length * 0.04) return { skip: 0, rows: 0 };
  let n = 0;
  while (skip + n < rows.length && rows[skip + n] < CALM) n++;
  return { skip, rows: n };
}

// Each row's variation and color, on a small copy of the image (inner 90% of the width).
async function rowProfile(img, h) {
  const W = 120;
  const H = Math.max(60, Math.round((h / (await img.metadata()).width) * W));
  const { data, info } = await img.clone().removeAlpha().resize(W, H, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
  const x0 = Math.round(W * 0.05), x1 = W - x0;
  const rows = [];
  for (let y = 0; y < info.height; y++) {
    const sum = [0, 0, 0], sq = [0, 0, 0];
    for (let x = x0; x < x1; x++) for (let c = 0; c < 3; c++) { const v = data[(y * W + x) * 3 + c]; sum[c] += v; sq[c] += v * v; }
    const n = x1 - x0;
    const mean = sum.map((v) => v / n);
    rows.push({ busy: sq.reduce((a, v, c) => a + Math.sqrt(Math.max(0, v / n - mean[c] ** 2)), 0) / 3, mean });
  }
  return { rows, scale: h / info.height };
}

// Pure: black or white, whichever reads against the band's mean color.
export function inkFor([r, g, b]) {
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 140 ? '#000000' : '#ffffff';
}

// Pure: where the title and the smaller lines go inside the band. Margins and sizes come from the
// band's own height, so a short band shrinks the type instead of stacking the date on the title.
export function layoutType(bandTop, bandHeight, width, hasRest) {
  const padX = Math.round(width * 0.06);
  const padY = Math.round(Math.min(padX, bandHeight * 0.12));
  const avail = Math.max(1, bandHeight - padY * 2);
  const gap = hasRest ? Math.max(4, Math.round(avail * 0.06)) : 0;
  const titleH = hasRest ? Math.round((avail - gap) * 0.62) : avail;
  const restH = hasRest ? avail - gap - titleH : 0;
  const titleTop = bandTop + padY;
  return { padX, inner: width - padX * 2, titleTop, titleH, gap, restTop: titleTop + titleH + gap, restH };
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Text as an image, auto-fitted to the box: sharp sizes the type so it fills width x height.
async function textBlock(lines, font, ink, width, height, weight) {
  const markup = `<span foreground="${ink}" font_weight="${weight}">${lines.map(esc).join('\n')}</span>`;
  return sharp({ text: { text: markup, font, width, height, rgba: true, align: 'left', spacing: 0 } }).png().toBuffer({ resolveWithObject: true });
}

export async function typeset(art, copy, { dos = [] } = {}) {
  const img = sharp(art);
  const { width: w, height: h } = await img.metadata();
  const { rows, scale } = await rowProfile(img, h);
  const busyRows = rows.map((r) => r.busy);
  const top = calmRun(busyRows), bottom = calmRun(busyRows, true);
  const pick = top.rows >= bottom.rows ? { at: 'top', ...top } : { at: 'bottom', ...bottom };
  const busy = pick.rows * scale < h * MIN_FIELD;
  let band;
  if (busy) band = { at: 'top', top: 0, height: Math.round(h * BAND) };
  else {
    const height = Math.round(pick.rows * scale);
    const start = Math.round(pick.skip * scale);
    band = { at: pick.at, top: pick.at === 'top' ? start : h - start - height, height };
  }
  const slice = pick.at === 'top' ? rows.slice(pick.skip, pick.skip + pick.rows) : rows.slice(rows.length - pick.skip - pick.rows, rows.length - pick.skip);
  const mean = [0, 1, 2].map((c) => slice.reduce((a, r) => a + r.mean[c], 0) / Math.max(1, slice.length));
  const font = pickFont(dos);
  const ink = busy ? '#000000' : inkFor(mean);
  const [title, ...rest] = copy;
  const L = layoutType(band.top, band.height, w, rest.length > 0);
  const t = await textBlock([title], font, ink, L.inner, L.titleH, 'heavy');
  const layers = [];
  if (busy) {
    const panel = Buffer.from(`<svg width="${w}" height="${band.height}"><rect width="100%" height="100%" fill="#ffffff"/></svg>`);
    layers.push({ input: panel, left: 0, top: band.top });
  }
  layers.push({ input: t.data, left: L.padX, top: L.titleTop });
  const boxes = [{ top: L.titleTop, height: t.info.height }];
  if (rest.length) {
    const r = await textBlock(rest, font, ink, L.inner, L.restH, 'bold');
    // Right under the title as set (never above its bottom edge), so the lines read as one block.
    const top = L.titleTop + t.info.height + L.gap;
    layers.push({ input: r.data, left: L.padX, top });
    boxes.push({ top, height: r.info.height });
  }
  const data = await img.composite(layers).png().toBuffer();
  return { data, band: band.at, font, panel: busy, boxes, bandBox: { top: band.top, height: band.height } };
}
