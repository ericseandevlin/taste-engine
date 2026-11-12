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
.poster{display:grid;grid-template-columns:minmax(0,340px) 1fr;gap:24px;background:var(--card);border:1px solid var(--line);padding:20px;margin-bottom:16px}
@media (max-width:720px){.poster{grid-template-columns:1fr}}.poster img{width:100%;display:block;border:1px solid var(--line)}
.rounds{display:flex;gap:8px;margin-top:8px}.rounds img{width:72px}
.v{font:12px ui-monospace,Menlo,monospace;font-weight:700}.pass{color:var(--pass)}.fail{color:var(--fail)}
.checks li{list-style:none;margin:6px 0}.checks{padding:0}code{font:13px ui-monospace,Menlo,monospace;background:var(--card);border:1px solid var(--line);padding:1px 5px}
`;

// Pure: the whole page from loaded data. Image paths are relative to the board folder.
export function renderResult({ board, manifest, brief, posters }) {
  const refs = manifest.items.map((it) => `<img src="${esc(it.file)}" alt="${esc(it.title || it.file)}" loading="lazy">`).join('');
  const palette = brief.palette.map((p) => `<span><i style="background:${esc(p.hex)}"></i>${esc(p.hex)} ${p.share}%</span>`).join('');
  const modes = brief.modes.map((m) => {
    const { dos, donts } = rulesForMode(brief, m.id);
    const li = (rs) => rs.map((r) => `<li>${esc(r.rule)}</li>`).join('');
    return `<div class="mode"><h3>${esc(m.name)}</h3><p class="mute">${esc(m.summary)}</p>
<div class="cols"><div><b>Do</b><ul>${li(dos)}</ul></div><div><b>Don't</b><ul>${li(donts)}</ul></div></div></div>`;
  }).join('\n');
  const posterHtml = posters.length
    ? posters.map((p) => {
        const best = p.rounds.find((r) => r.file === p.best) || p.rounds[p.rounds.length - 1];
        const thumbs = p.rounds.length > 1
          ? `<div class="rounds">${p.rounds.map((r) => `<a href="posters/${esc(p.slug)}/${esc(r.file)}" title="Round ${r.round}: ${r.passed}/${r.total}"><img src="posters/${esc(p.slug)}/${esc(r.file)}" alt="Round ${r.round}"></a>`).join('')}</div>`
          : '';
        const trail = p.rounds.map((r) => (r.checked ? `round ${r.round}: ${r.passed}/${r.total}` : `round ${r.round}: not checked`)).join(' &rarr; ');
        const checks = best.results.map((c) => `<li><span class="v ${c.pass ? 'pass' : 'fail'}">${c.pass ? 'PASS' : 'FAIL'}</span> ${esc(c.rule.replace(/^The poster does not use this: /, 'No: '))}<br><span class="mute">${esc(c.reason)}</span></li>`).join('');
        return `<div class="poster"><div><a href="posters/${esc(p.slug)}/${esc(best.file)}"><img src="posters/${esc(p.slug)}/${esc(best.file)}" alt="${esc(p.copy.join(', '))}"></a>${thumbs}</div>
<div><h3>${esc(p.modeName)}</h3><p class="mute">${esc(p.copy.join(' | '))}<br>${trail}</p><ul class="checks">${checks}</ul></div></div>`;
      }).join('\n')
    : `<p class="mute">No posters yet. Run <code>npm run poster -- --board ${esc(board)}</code>.</p>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(board)}: Taste Engine</title><style>${CSS}</style></head><body><main>
<h1>${esc(board)}</h1>
<p class="mute">${manifest.items.length} references in. ${brief.rules.filter((r) => r.status !== 'rejected').length} rules out, in ${brief.modes.length} modes. ${posters.length} poster${posters.length === 1 ? '' : 's'}.</p>
<h2>1. The board</h2><div class="grid">${refs}</div>
<h2>2. The palette, measured</h2><div class="sw">${palette}</div>
<h2>3. The rule sheet</h2><p class="mute">Edit <code>brief.json</code> to change a rule, lock it or reject it. The next poster obeys the edit.</p>${modes}
<h2>4. The posters, checked against the rules</h2><p class="mute">The check is a vision model's second opinion on rules that have a right answer. Whether a poster is good is your call.</p>${posterHtml}
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
  writeFileSync(join(board.absDir, 'result.html'), renderResult({ board: board.name, manifest, brief, posters }));
  console.log(`[result] ${board.dir}/result.html (${posters.length} posters)`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) runMain(main);
