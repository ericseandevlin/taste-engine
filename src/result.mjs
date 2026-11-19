#!/usr/bin/env node
// result.mjs: one page that shows a whole run. Local, no model.
// Board in, rule sheet, posters out with each rule check. This is the thing you
// open after `npm run taste`; every other file in the board folder is data.
//
// Usage: node src/result.mjs [--board demo]   -> boards/<board>/result.html

import { runMain } from './run.mjs';
import { existsSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { getBoard } from './config.mjs';
import { readManifest } from './manifest.mjs';
import { rulesForMode } from './brief.mjs';
import { lineageLine } from './directions.mjs';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const CSS = `
:root{--bg:#f6f5f2;--fg:#111;--mute:#6b6b6b;--line:#d9d7d1;--card:#fff;--pass:#1a7f4b;--fail:#b3261e}
@media (prefers-color-scheme:dark){:root{--bg:#111;--fg:#f2f1ee;--mute:#9a9a9a;--line:#2e2e2e;--card:#1a1a1a;--pass:#5fd39a;--fail:#ff8a80}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 ui-sans-serif,system-ui,-apple-system,"Helvetica Neue",Arial,sans-serif}
main{max-width:1120px;margin:0 auto;padding:40px 16px 96px}
h1{font-size:clamp(32px,6vw,64px);line-height:1;letter-spacing:-.03em;margin:0 0 8px}
h2{font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:var(--mute);margin:56px 0 16px;padding-top:16px;border-top:1px solid var(--line)}
h3{font-size:20px;margin:0 0 4px}p{margin:0 0 12px;max-width:70ch}.mute{color:var(--mute)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px}
.grid img{width:100%;aspect-ratio:4/3;object-fit:cover;object-position:top;border:1px solid var(--line);display:block}
.sw{display:flex;flex-wrap:wrap;gap:8px}.sw span{display:flex;align-items:center;gap:8px;font:12px ui-monospace,Menlo,monospace;border:1px solid var(--line);padding:4px 8px 4px 4px;background:var(--card)}
.sw i{width:20px;height:20px;display:block;border:1px solid var(--line)}
.mode{background:var(--card);border:1px solid var(--line);padding:20px;margin-bottom:16px}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:12px}@media (max-width:640px){.cols{grid-template-columns:1fr}}
ul{margin:0;padding-left:18px}li{margin:2px 0}.cols b{display:block;font-size:12px;letter-spacing:.08em;text-transform:uppercase;margin-bottom:6px}
.poster{background:var(--card);border:1px solid var(--line);padding:20px;margin-bottom:16px}
.poster img{width:100%;display:block;border:1px solid var(--line)}
.rounds{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr));gap:16px;margin-top:12px}.rounds.one{grid-template-columns:minmax(0,520px)}
.rounds figure{margin:0}.rounds figcaption{font-size:12px;color:var(--mute);margin-top:4px}
summary{cursor:pointer}summary h3{display:inline}details.mode[open] summary{margin-bottom:12px}
.tabs{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 16px}.tabs label{cursor:pointer;border:1px solid var(--line);background:var(--card);padding:6px 12px;font-size:13px}
.gen{display:none}.notes{background:var(--card);border:1px solid var(--line);border-left:4px solid var(--fg);padding:16px 20px;margin-bottom:16px}.notes b{display:block;font-size:12px;letter-spacing:.08em;text-transform:uppercase;margin:8px 0 4px}
code{font:13px ui-monospace,Menlo,monospace;background:var(--card);border:1px solid var(--line);padding:1px 5px}
`;

// Pure: put posters into generations. With a generations list (each { id, label, from, feedback, changed }),
// a poster belongs to the latest generation that started at or before it was made. Without one, a gap of
// more than 45 minutes between posters starts a new generation. Newest generation first.
export function groupGenerations(posters, gens = []) {
  const byTime = [...posters].sort((a, b) => String(a.made).localeCompare(String(b.made)));
  if (gens.length) {
    const sorted = [...gens].sort((a, b) => String(a.from).localeCompare(String(b.from)));
    const out = sorted.map((g) => ({ ...g, posters: [] }));
    const earlier = { id: 'earlier', label: 'Earlier', posters: [] };
    for (const p of byTime) {
      let idx = -1;
      for (let i = 0; i < sorted.length; i++) if (String(sorted[i].from) <= String(p.made)) idx = i;
      (idx < 0 ? earlier : out[idx]).posters.push(p);
    }
    return [...(earlier.posters.length ? [earlier] : []), ...out].reverse();
  }
  const out = [];
  let last = null;
  for (const p of byTime) {
    const t = Date.parse(p.made);
    if (!out.length || !(t - last <= 45 * 60 * 1000)) out.push({ id: `g${out.length + 1}`, label: `Generation ${out.length + 1}`, from: p.made, posters: [] });
    out[out.length - 1].posters.push(p);
    last = t;
  }
  return out.reverse();
}

// Pure: the whole page from loaded data. Image paths are relative to the board folder.
export function renderResult({ board, manifest, brief, posters, generations = [] }) {
  const refs = manifest.items.map((it) => `<img src="${esc(it.file)}" alt="${esc(it.title || it.file)}" loading="lazy">`).join('');
  const palette = brief.palette.map((p) => `<span><i style="background:${esc(p.hex)}"></i>${esc(p.hex)} ${p.share}%</span>`).join('');
  const modes = brief.modes.map((m) => {
    const { dos, donts } = rulesForMode(brief, m.id);
    const li = (rs) => rs.map((r) => `<li>${esc(r.rule)}</li>`).join('');
    const sw = (m.palette || []).map((h) => `<span><i style="background:${esc(h)}"></i>${esc(h)}</span>`).join('');
    const meta = [
      sw ? `<div class="sw">${sw}</div>` : '',
      m.refs?.length ? `<p class="mute">From ${m.refs.map(esc).join(', ')}${m.stretch ? `. ${esc(m.stretch)}` : ''}</p>` : '',
      m.lineage ? `<p class="mute"><i>${esc(lineageLine(m.lineage))}.</i></p>` : '',
    ].join('');
    return `<details class="mode"><summary><h3>${esc(m.name)}</h3> <span class="mute">${dos.length + donts.length} rules</span></summary><p class="mute">${esc(m.summary)}</p>${meta}
<div class="cols"><div><b>Do</b><ul>${li(dos)}</ul></div><div><b>Don't</b><ul>${li(donts)}</ul></div></div></details>`;
  }).join('\n');
  // Every round at full size, the kept one first. The rule checks still run and stay in poster.json; the page does not list them.
  const card = (p) => {
    const best = p.rounds.find((r) => r.file === p.best) || p.rounds[p.rounds.length - 1];
    const ordered = [best, ...p.rounds.filter((r) => r !== best)];
    const imgs = ordered.map((r) => `<figure><a href="posters/${esc(p.slug)}/${esc(r.file)}"><img src="posters/${esc(p.slug)}/${esc(r.file)}" alt="${esc(p.copy.join(', '))}, round ${r.round}" loading="lazy"></a>${p.rounds.length > 1 ? `<figcaption>Round ${r.round}${r === best ? ', kept' : ''}</figcaption>` : ''}</figure>`).join('');
    return `<div class="poster"><h3>${esc(p.modeName)}</h3><p class="mute">${esc(p.copy.join(' | '))}</p><div class="rounds${p.rounds.length > 1 ? '' : ' one'}">${imgs}</div></div>`;
  };
  const gens = groupGenerations(posters, generations);
  const when = (iso) => (iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }) : '');
  const posterHtml = gens.length
    ? `${gens.map((g, i) => `<input type="radio" name="gen" id="t-${esc(g.id)}" hidden${i === 0 ? ' checked' : ''}>`).join('')}
<div class="tabs">${gens.map((g) => `<label for="t-${esc(g.id)}">${esc(g.label)}${g.posters.length ? ` (${g.posters.length})` : ''}</label>`).join('')}</div>
${gens.map((g) => {
  const notes = g.feedback || g.changed
    ? `<div class="notes">${g.feedback ? `<b>Your feedback</b><p>${esc(g.feedback)}</p>` : ''}${g.changed ? `<b>What changed in response</b><p>${esc(g.changed)}</p>` : ''}</div>`
    : '';
  const body = g.posters.length ? g.posters.map(card).join('\n') : '<p class="mute">Not run yet.</p>';
  return `<section class="gen" id="gen-${esc(g.id)}"><h3>${esc(g.label)}</h3><p class="mute">${esc(when(g.from))}</p>${notes}${body}</section>`;
}).join('\n')}
<style>${gens.map((g) => `#t-${g.id.replace(/[^a-z0-9_-]/gi, '')}:checked~#gen-${g.id.replace(/[^a-z0-9_-]/gi, '')}{display:block}#t-${g.id.replace(/[^a-z0-9_-]/gi, '')}:checked~.tabs label[for="t-${g.id.replace(/[^a-z0-9_-]/gi, '')}"]{background:var(--fg);color:var(--bg)}`).join('')}</style>`
    : `<p class="mute">No posters yet. Run <code>npm run poster -- --board ${esc(board)}</code>.</p>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(board)}: Taste Engine</title><style>${CSS}</style></head><body><main>
<h1>${esc(board)}</h1>
<p class="mute">${manifest.items.length} references in. ${brief.rules.filter((r) => r.status !== 'rejected').length} rules out, in ${brief.modes.length} modes. ${posters.length} poster${posters.length === 1 ? '' : 's'}.</p>
<h2>1. The board</h2><div class="grid">${refs}</div>
<h2>2. The palette, measured</h2><div class="sw">${palette}</div>
<h2>3. The rule sheet</h2><p class="mute">Open a mode to read its rules. Edit <code>brief.json</code> to change a rule, lock it or reject it. The next poster obeys the edit.</p>${modes}
<h2>4. The posters, by generation</h2><p class="mute">Each tab is one round of posters, newest first, with the feedback that shaped it. Every image is full size. The rule checks still run, and the scores are in each <code>poster.json</code>.</p>${posterHtml}
</main></body></html>
`;
}

export function loadPosters(boardDir) {
  const root = join(boardDir, 'posters');
  if (!existsSync(root)) return [];
  return readdirSync(root).sort().map((d) => readManifest(join(root, d, 'poster.json'))).filter(Boolean).reverse();
}

function main() {
  const i = process.argv.indexOf('--board');
  const board = getBoard(i > -1 ? process.argv[i + 1] : 'demo');
  const manifest = readManifest(join(board.absDir, 'manifest.json'));
  const brief = readManifest(join(board.absDir, 'brief.json'));
  if (!manifest || !brief) throw new Error(`Nothing to show for ${board.name} yet. Run \`npm run taste -- --board ${board.name}\`.`);
  const posters = loadPosters(board.absDir);
  // Optional: boards/<board>/generations.json, a list of { id, label, from (ISO time), feedback, changed }.
  const generations = readManifest(join(board.absDir, 'generations.json')) || [];
  writeFileSync(join(board.absDir, 'result.html'), renderResult({ board: board.name, manifest, brief, posters, generations }));
  console.log(`[result] ${board.dir}/result.html (${posters.length} posters)`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) runMain(main);
