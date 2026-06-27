#!/usr/bin/env node
// atlas.mjs — generate a local static atlas viewer (plan U6, R6).
// "Build the atlas before the art": every item visible with preview, metadata,
// palette, tags, notes, and source proof; channels browsable with their recipes.
// No server, no framework: open boards/<board>/atlas/index.html from disk.
//
// Usage:
//   node atlas.mjs
//   node atlas.mjs --board demo

import { mkdirSync, writeFileSync } from 'fs';
import { join, relative } from 'path';
import { fileURLToPath } from 'url';
import { getBoard } from './config.mjs';
import { readManifest } from './manifest.mjs';

function parseArgs(argv) {
  const args = { board: 'demo' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--board') args.board = argv[++i];
  }
  return args;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function swatches(pal) {
  return (pal || [])
    .map((p) => `<span class="sw" style="background:${esc(p.hex)}" title="${esc(p.hex)} ${esc(p.pct)}%"></span>`)
    .join('');
}

function card(it, imgBase) {
  const src = `${imgBase}/${encodeURIComponent(it.file)}`;
  return `<div class="card">
  <div class="thumb"><img loading="lazy" src="${src}" onerror="this.closest('.thumb').classList.add('missing')"></div>
  <div class="meta"><span class="id">${esc(it.id)}</span> <span class="title">${esc(it.title)}</span></div>
  <div class="sws">${swatches(it.measured?.palette)}</div>
  <div class="tags">${(it.tags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>
  <div class="src"><a href="${src}">LOCAL</a>${it.source?.url ? ` · <a href="${esc(it.source.url)}">SOURCE</a>` : ''}</div>
  ${it.notes?.why ? `<div class="why">${esc(it.notes.why)}</div>` : ''}
</div>`;
}

function channelBlock(ch, manifest, imgBase) {
  const reps = (ch.representatives || [])
    .map((id) => manifest.items.find((i) => i.id === id))
    .filter(Boolean);
  const recipe = Object.entries(ch.recipe || {})
    .map(([k, v]) => `<div><b>${esc(k)}</b> ${esc(v)}</div>`)
    .join('');
  return `<section class="channel">
  <h3>${esc(ch.name)} <span class="count">${(ch.members || []).length}</span></h3>
  <div class="recipe">${recipe}</div>
  <div class="forbidden">forbidden: ${(ch.forbidden || []).map(esc).join(' · ')}</div>
  <div class="reps">${reps.map((r) => `<img loading="lazy" src="${imgBase}/${encodeURIComponent(r.file)}" onerror="this.classList.add('missing')">`).join('')}</div>
</section>`;
}

// Pure: render the full atlas HTML from manifest + channels.
export function renderAtlas(manifest, channelsDoc, imgBase = '..') {
  const channels = channelsDoc?.channels || [];
  const items = manifest.items || [];
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Taste Atlas — ${esc(manifest.board)}</title>
<style>
  :root { color-scheme: dark; }
  body { margin:0; background:#0c0c0d; color:#e8e6e1; font:14px/1.5 -apple-system,Helvetica,Arial,sans-serif; }
  header { padding:32px 24px 8px; }
  h1 { font-size:28px; margin:0 0 4px; letter-spacing:-0.02em; }
  .sub { color:#8a8780; font-family:ui-monospace,monospace; font-size:12px; }
  h2 { font-size:12px; text-transform:uppercase; letter-spacing:0.12em; color:#8a8780; margin:32px 24px 12px; font-family:ui-monospace,monospace; }
  .channels { display:grid; grid-template-columns:repeat(auto-fill,minmax(320px,1fr)); gap:16px; padding:0 24px; }
  .channel { border:1px solid #232325; border-radius:10px; padding:16px; background:#141415; }
  .channel h3 { margin:0 0 10px; font-size:16px; display:flex; align-items:center; gap:8px; }
  .count { font-family:ui-monospace,monospace; font-size:11px; color:#0c0c0d; background:#c9b48a; border-radius:10px; padding:1px 8px; }
  .recipe div { font-size:12px; color:#c8c5bd; margin:2px 0; }
  .recipe b { color:#e8e6e1; font-weight:600; text-transform:capitalize; }
  .forbidden { margin-top:8px; font-size:11px; color:#b46a5e; font-family:ui-monospace,monospace; }
  .reps { display:flex; gap:6px; margin-top:10px; }
  .reps img { width:64px; height:64px; object-fit:cover; border-radius:4px; background:#222; }
  .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(240px,1fr)); gap:16px; padding:0 24px 48px; }
  .card { border:1px solid #232325; border-radius:10px; overflow:hidden; background:#141415; }
  .thumb { aspect-ratio:4/3; background:#1a1a1b; overflow:hidden; }
  .thumb img { width:100%; height:100%; object-fit:cover; display:block; }
  .thumb.missing::after { content:"no local image"; display:flex; align-items:center; justify-content:center; height:100%; color:#55534e; font-family:ui-monospace,monospace; font-size:11px; }
  .thumb.missing img { display:none; }
  .missing { opacity:.4; }
  .meta { padding:8px 10px 2px; }
  .id { font-family:ui-monospace,monospace; font-size:11px; color:#8a8780; }
  .title { font-weight:600; }
  .sws { display:flex; gap:0; padding:4px 10px; }
  .sw { width:24px; height:14px; }
  .tags { display:flex; flex-wrap:wrap; gap:4px; padding:6px 10px; }
  .tag { font-family:ui-monospace,monospace; font-size:10px; color:#c8c5bd; border:1px solid #2c2c2e; border-radius:4px; padding:1px 5px; }
  .src { padding:6px 10px; font-family:ui-monospace,monospace; font-size:10px; }
  .src a { color:#c9b48a; text-decoration:none; }
  .why { padding:0 10px 12px; font-size:12px; color:#9a978f; }
</style></head>
<body>
<header><h1>Taste Atlas</h1><div class="sub">board: ${esc(manifest.board)} · ${items.length} items · ${channels.length} channels · generated ${esc(manifest.generated || '')}</div></header>
<h2>DNA Channels</h2>
<div class="channels">${channels.map((c) => channelBlock(c, manifest, imgBase)).join('')}</div>
<h2>Index — every item</h2>
<div class="grid">${items.map((it) => card(it, imgBase)).join('')}</div>
</body></html>`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const board = getBoard(args.board);
  const manifest = readManifest(join(board.absDir, 'manifest.json'));
  if (!manifest) throw new Error('No manifest — run the pipeline first');
  const channelsDoc = readManifest(join(board.absDir, 'channels.json')) || { channels: [] };

  const atlasDir = join(board.absDir, 'atlas');
  mkdirSync(atlasDir, { recursive: true });
  const outPath = join(atlasDir, 'index.html');
  // image path relative from atlas dir to the board dir
  const imgBase = relative(atlasDir, board.absDir) || '.';
  writeFileSync(outPath, renderAtlas(manifest, channelsDoc, imgBase));
  console.log(`[atlas] ${manifest.items.length} items, ${channelsDoc.channels.length} channels -> ${outPath}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
