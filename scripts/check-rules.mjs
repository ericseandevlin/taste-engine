#!/usr/bin/env node
// check-rules.mjs: judge one generated page against its direction's critique
// rules, rule by rule, PASS or FAIL with a one-line reason. critique writes
// rules; this checks whether a later page actually obeys them. A vision call,
// so treat the verdicts as a second opinion, not ground truth.
//
// Usage:
//   node scripts/check-rules.mjs --board gallery-run --slug swiss-case-index-002 --model claude-cli:sonnet
// Writes generated/<slug>/rule-check.json.

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { getBoard, MODELS, loadEnv } from '../src/config.mjs';
import { resolveMultiImageCaller } from '../src/models.mjs';

function parseArgs(argv) {
  const args = { board: 'demo', slug: null, direction: null, model: MODELS.critique };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--board') args.board = argv[++i];
    else if (argv[i] === '--slug') args.slug = argv[++i];
    else if (argv[i] === '--direction') args.direction = argv[++i];
    else if (argv[i] === '--model') args.model = argv[++i];
  }
  if (!args.slug) throw new Error('pass --slug <direction>-NNN');
  if (!args.direction) args.direction = args.slug.replace(/-\d+$/, '');
  return args;
}

export function parseVerdicts(raw, n) {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('no JSON in response');
  const v = JSON.parse(m[0]).verdicts;
  if (!Array.isArray(v) || v.length !== n) throw new Error(`expected ${n} verdicts`);
  return v.map((x) => ({ pass: x.verdict === 'PASS', reason: String(x.reason || '').trim() }));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  loadEnv();
  const { caller } = resolveMultiImageCaller(args.model, process.env);
  const board = getBoard(args.board);
  const rules = (JSON.parse(readFileSync(join(board.absDir, 'critique-rules.json'), 'utf8'))[args.direction]) || [];
  if (!rules.length) throw new Error(`no critique rules for ${args.direction}`);
  const dir = join(board.absDir, 'generated', args.slug);
  const shots = ['desktop.png', 'mobile.png'].map((f) => join(dir, f)).filter(existsSync);
  const images = shots.map((p) => ({ data: readFileSync(p).toString('base64'), mediaType: 'image/png' }));
  const prompt =
    `The images are full-page screenshots of one web page: desktop (1440 wide) then mobile (390 wide).\n` +
    `Judge the page against each rule below. PASS only if the screenshots show the rule is obeyed; FAIL otherwise. ` +
    `Judge strictly from what is visible. Reason: one short sentence naming what you see.\n\n` +
    rules.map((r, i) => `${i + 1}. ${r}`).join('\n') +
    `\n\nReturn only JSON: {"verdicts":[{"verdict":"PASS"|"FAIL","reason":"..."}]} with exactly ${rules.length} entries in order.`;
  const verdicts = parseVerdicts(await caller({ images, prompt }), rules.length);
  const out = {
    slug: args.slug,
    direction: args.direction,
    model: args.model,
    checked: new Date().toISOString(),
    results: rules.map((rule, i) => ({ rule, ...verdicts[i] })),
  };
  writeFileSync(join(dir, 'rule-check.json'), JSON.stringify(out, null, 2) + '\n');
  const passed = out.results.filter((r) => r.pass).length;
  console.log(`[check-rules] ${args.slug}: ${passed}/${rules.length} pass`);
  for (const r of out.results) console.log(`  ${r.pass ? 'PASS' : 'FAIL'}  ${r.reason}`);
}

main();
