#!/usr/bin/env node
// build-gallery.mjs: snapshot one finished run into a static, openable gallery.
//
// Reads a board folder after the pipeline (and any generate/capture/critique/score
// rounds) has run, copies the raw artifacts into <out>/run/ untouched, writes
// web-sized images into <out>/assets/, and emits <out>/data.js so index.html
// renders over file:// or GitHub Pages with no server and no fetch.
//
// Usage:
//   node scripts/build-gallery.mjs --board gallery-run --out docs/gallery

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import sharp from 'sharp';
import { getBoard, REPO_ROOT } from '../src/config.mjs';

function parseArgs(argv) {
  const args = { board: 'gallery-run', out: 'docs/gallery' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--board') args.board = argv[++i];
    else if (argv[i] === '--out') args.out = argv[++i];
  }
  return args;
}

// Absolute local paths (score.json records its crop file) become repo-relative,
// so a snapshot never carries the machine it was built on.
const ROOT = REPO_ROOT.endsWith('/') ? REPO_ROOT : REPO_ROOT + '/';
const relPaths = (text) => text.split(ROOT).join('');
const readJson = (p) => (existsSync(p) ? JSON.parse(relPaths(readFileSync(p, 'utf8'))) : null);
const copyText = (src, dest) => writeFileSync(dest, relPaths(readFileSync(src, 'utf8')));

async function webImage(src, dest, { width, maxHeight }) {
  let img = sharp(src);
  const meta = await img.metadata();
  if (maxHeight && meta.height > maxHeight) {
    img = img.extract({ left: 0, top: 0, width: meta.width, height: maxHeight });
  }
  await img.resize({ width, withoutEnlargement: true }).jpeg({ quality: 82, mozjpeg: true }).toFile(dest);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const board = getBoard(args.board);
  const out = join(REPO_ROOT, args.out);
  const runDir = join(out, 'run');
  const boardAssets = join(out, 'assets', 'board');
  const genAssets = join(out, 'assets', 'generated');
  for (const d of [runDir, boardAssets, genAssets]) mkdirSync(d, { recursive: true });

  // 1. Raw artifacts, copied as-is so the gallery can be audited against them.
  for (const f of ['manifest.json', 'channels.json', 'directions.json', 'THESIS.md', 'critique-rules.json', 'profile.json']) {
    const p = join(board.absDir, f);
    if (existsSync(p)) copyText(p, join(runDir, f));
  }
  if (existsSync(join(board.absDir, 'fingerprints'))) {
    cpSync(join(board.absDir, 'fingerprints'), join(runDir, 'fingerprints'), { recursive: true });
  }

  const manifest = readJson(join(board.absDir, 'manifest.json'));
  const channels = readJson(join(board.absDir, 'channels.json'));
  const directions = readJson(join(board.absDir, 'directions.json'));
  const rules = readJson(join(board.absDir, 'critique-rules.json')) || {};
  const fpDir = join(board.absDir, 'fingerprints');
  const fpFiles = existsSync(fpDir) ? readdirSync(fpDir).filter((f) => f.endsWith('.json')).sort() : [];
  const fingerprint = fpFiles.length ? readJson(join(fpDir, fpFiles[fpFiles.length - 1])) : null;

  // 2. Board images, web sized.
  const items = [];
  for (const it of manifest.items) {
    const name = it.file.replace(/\.\w+$/, '.jpg');
    await webImage(join(REPO_ROOT, it.source.local), join(boardAssets, name), { width: 960 });
    items.push({
      id: it.id,
      title: it.title,
      file: it.file,
      img: `assets/board/${name}`,
      measure: it.measured,
      tags: it.tags,
      channels: it.channels,
      notes: it.notes,
    });
  }

  // 3. Generated pages: source, meta, score, screenshots.
  const generated = [];
  const genRoot = join(board.absDir, 'generated');
  for (const slug of existsSync(genRoot) ? readdirSync(genRoot).sort() : []) {
    const dir = join(genRoot, slug);
    if (!existsSync(join(dir, 'index.html'))) continue;
    const dest = join(runDir, 'generated', slug);
    mkdirSync(dest, { recursive: true });
    for (const f of readdirSync(dir)) {
      if (f.endsWith('.html') || f.endsWith('.json')) copyText(join(dir, f), join(dest, f));
    }
    const shots = {};
    for (const [key, width, maxHeight] of [['desktop', 1440, 4000], ['mobile', 390, 5200]]) {
      const src = join(dir, `${key}.png`);
      if (!existsSync(src)) continue;
      const name = `${slug}-${key}.jpg`;
      await webImage(src, join(genAssets, name), { width: key === 'desktop' ? 960 : 390, maxHeight });
      shots[key] = `assets/generated/${name}`;
    }
    const scoreFiles = readdirSync(dir).filter((f) => /^score.*\.json$/.test(f));
    generated.push({
      slug,
      meta: readJson(join(dir, 'meta.json')),
      scores: Object.fromEntries(scoreFiles.map((f) => [f, readJson(join(dir, f))])),
      check: readJson(join(dir, 'rule-check.json')),
      page: `run/generated/${slug}/index.html`,
      shots,
    });
  }

  const runInfo = readJson(join(out, 'run-info.json'));
  const data = { board: args.board, items, channels, directions, rules, fingerprint, generated, runInfo };
  writeFileSync(join(out, 'data.js'), `window.GALLERY = ${JSON.stringify(data, null, 1)};\n`);
  console.log(`[gallery] ${items.length} refs, ${generated.length} generated pages -> ${join(out, 'index.html')}`);
}

main();
