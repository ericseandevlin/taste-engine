#!/usr/bin/env node
// brief.mjs: compose the rule sheet. Local, no model.
// The brief is the part a person reads and edits: for each lane the board
// contains, a short list of Do rules and Don't rules, each traced to the
// references it came from, plus the board's measured palette. The poster stage
// builds from this file and nothing else, so an edit here changes the output.
//
//   brief.json   canonical. Edit a rule's text, or set its status:
//                "locked" (keep through re-runs) or "rejected" (never use).
//   brief.md     the readable render. Regenerated; do not edit.
//
// Re-running keeps every rule you edited, locked or rejected.
//
// Usage: node src/brief.mjs [--board demo]

import { runMain } from './run.mjs';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { getBoard } from './config.mjs';
import { readManifest } from './manifest.mjs';
import { stripEmDash } from './thesis.mjs';

const KEPT = new Set(['edited', 'locked', 'rejected']);
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Pure: the board's palette as measured, weighted by how much of each
// reference a color covers. Returns up to `max` hexes with a share out of 100.
export function boardPalette(items, max = 6) {
  const sum = new Map();
  let total = 0;
  for (const it of items) {
    for (const c of it.measured?.palette || []) {
      sum.set(c.hex, (sum.get(c.hex) || 0) + c.pct);
      total += c.pct;
    }
  }
  return [...sum.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([hex, pct]) => ({ hex, share: total ? Math.round((pct / total) * 100) : 0 }));
}

// Pure: channels + directions + manifest -> brief. `prior` is the brief on disk,
// if any; rules a person touched there survive by id.
export function composeBrief({ boardName, manifest, channels, directions, prior = null }) {
  const priorRules = new Map((prior?.rules || []).filter((r) => KEPT.has(r.status)).map((r) => [r.id, r]));
  const rules = [];
  const push = (rule) => rules.push(priorRules.get(rule.id) || rule);
  for (const ch of [...channels].sort((a, b) => (b.members?.length || 0) - (a.members?.length || 0))) {
    const evidence = { lane: ch.id, refs: ch.members || [] };
    for (const [aspect, text] of Object.entries(ch.recipe || {})) {
      push({ id: `${ch.id}.do.${slug(aspect)}`, lane: ch.id, kind: 'do', aspect, rule: stripEmDash(text), evidence, status: 'extracted' });
    }
    for (const text of ch.forbidden || []) {
      push({ id: `${ch.id}.dont.${slug(text).slice(0, 40)}`, lane: ch.id, kind: 'dont', rule: stripEmDash(text), evidence, status: 'extracted' });
    }
  }
  const modes = Object.entries(directions || {}).map(([id, d]) => ({
    id,
    name: d.name || id,
    summary: stripEmDash(d.brief || ''),
    lanes: d.channels || [],
    palette: String(d.palette || '').split(',').map((s) => s.trim()).filter(Boolean),
  }));
  return {
    board: boardName,
    references: manifest.items.length,
    palette: boardPalette(manifest.items),
    lanes: channels.map((c) => ({ id: c.id, name: c.name, refs: c.members?.length || 0 })),
    modes,
    rules,
  };
}

// Pure: the rules one mode generates from. Rejected rules never apply.
export function rulesForMode(brief, modeId) {
  const mode = brief.modes.find((m) => m.id === modeId) || brief.modes[0];
  if (!mode) throw new Error('The brief has no modes. Run the directions stage first.');
  const live = brief.rules.filter((r) => r.status !== 'rejected' && mode.lanes.includes(r.lane));
  return { mode, dos: live.filter((r) => r.kind === 'do'), donts: live.filter((r) => r.kind === 'dont') };
}

// Pure: the readable render.
export function renderBrief(brief) {
  const out = [`# Rule sheet: ${brief.board}`, ''];
  out.push(`Composed from ${brief.references} references. Edit \`brief.json\`, not this file.`, '');
  out.push('## Palette (measured)', '', ...brief.palette.map((p) => `- \`${p.hex}\` ${p.share}%`), '');
  for (const mode of brief.modes) {
    const { dos, donts } = rulesForMode(brief, mode.id);
    out.push(`## Mode: ${mode.name} (\`${mode.id}\`)`, '', mode.summary, '');
    out.push('**Do**', '', ...dos.map((r) => `- ${r.rule}${r.status !== 'extracted' ? ` _(${r.status})_` : ''}`), '');
    out.push("**Don't**", '', ...donts.map((r) => `- ${r.rule}${r.status !== 'extracted' ? ` _(${r.status})_` : ''}`), '');
  }
  const rejected = brief.rules.filter((r) => r.status === 'rejected');
  if (rejected.length) out.push('## Rejected', '', ...rejected.map((r) => `- ~~${r.rule}~~`), '');
  return out.join('\n');
}

function main() {
  const i = process.argv.indexOf('--board');
  const board = getBoard(i > -1 ? process.argv[i + 1] : 'demo');
  const manifest = readManifest(join(board.absDir, 'manifest.json'));
  const channelsDoc = readManifest(join(board.absDir, 'channels.json'));
  const directionsDoc = readManifest(join(board.absDir, 'directions.json'));
  if (!manifest || !channelsDoc || !directionsDoc) {
    throw new Error(`The brief needs manifest.json, channels.json and directions.json in ${board.dir}. Run \`npm run taste -- --board ${board.name}\`.`);
  }
  const path = join(board.absDir, 'brief.json');
  const brief = composeBrief({
    boardName: board.name,
    manifest,
    channels: channelsDoc.channels || [],
    directions: directionsDoc.directions || {},
    prior: readManifest(path),
  });
  writeFileSync(path, JSON.stringify(brief, null, 2) + '\n');
  writeFileSync(join(board.absDir, 'brief.md'), renderBrief(brief) + '\n');
  const kept = brief.rules.filter((r) => KEPT.has(r.status)).length;
  console.log(`[brief] ${board.name}: ${brief.rules.length} rules in ${brief.modes.length} modes (${kept} kept from your edits) -> ${board.dir}/brief.json`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) runMain(main);
