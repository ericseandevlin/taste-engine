#!/usr/bin/env node
// status.mjs — report pipeline state for a board.
// Tells you which derive stages have run, which are pending, what's blocking,
// and what to do next. Run this before the pipeline or any individual stage.
//
// Usage:
//   node src/status.mjs                    # board=demo
//   node src/status.mjs --board swiss-focus

import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { basename, join } from 'path';
import { fileURLToPath } from 'url';
import { getBoard } from './config.mjs';

function parseArgs(argv) {
  const args = { board: 'demo' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--board') args.board = argv[++i];
  }
  return args;
}

// ---------------------------------------------------------------------------
// Stage definitions — known derive stages with their dependency graph
// ---------------------------------------------------------------------------

const STAGES = [
  {
    id: 'import',
    label: 'Import',
    desc: 'Scan board folder and register image files',
    prereqs: [],
    check: (dir) => {
      const p = join(dir, 'manifest.json');
      if (!existsSync(p)) return { ready: false, reason: 'manifest.json not found' };
      try {
        const m = JSON.parse(readFileSync(p, 'utf8'));
        const items = m.items ?? [];
        if (items.length === 0) return { ready: false, reason: 'manifest.json has 0 items' };
        return { ready: true, info: `${items.length} items` };
      } catch {
        return { ready: false, reason: 'manifest.json is invalid JSON' };
      }
    },
  },
  {
    id: 'measure',
    label: 'Measure',
    desc: 'Compute palette, dimensions, density per image',
    prereqs: ['import'],
    check: (dir) => {
      const p = join(dir, 'manifest.json');
      if (!existsSync(p)) return { ready: false, reason: 'import has not run' };
      try {
        const m = JSON.parse(readFileSync(p, 'utf8'));
        const measured = (m.items ?? []).filter((i) => i.measured);
        const total = m.items.length;
        if (measured.length === 0) return { ready: false, reason: '0 items measured' };
        if (measured.length < total) return { ready: true, partial: true, info: `${measured.length}/${total} items measured` };
        return { ready: true, info: `${measured.length}/${total} items measured` };
      } catch {
        return { ready: false, reason: 'manifest.json is invalid JSON' };
      }
    },
  },
  {
    id: 'tag',
    label: 'Tag',
    desc: 'Vision-model tagging pass (controlled vocabulary)',
    prereqs: ['import'],
    check: (dir) => {
      const p = join(dir, 'manifest.json');
      if (!existsSync(p)) return { ready: false, reason: 'import has not run' };
      try {
        const m = JSON.parse(readFileSync(p, 'utf8'));
        const tagged = (m.items ?? []).filter((i) => i.tags && i.tags.length > 0);
        const total = m.items.length;
        if (tagged.length === 0) return { ready: false, reason: '0 items tagged' };
        if (tagged.length < total) return { ready: true, partial: true, info: `${tagged.length}/${total} items tagged` };
        return { ready: true, info: `${tagged.length}/${total} items tagged` };
      } catch {
        return { ready: false, reason: 'manifest.json is invalid JSON' };
      }
    },
  },
  {
    id: 'cluster',
    label: 'Cluster',
    desc: 'Derive DNA channels from tagged data',
    prereqs: ['tag'],
    check: (dir) => {
      const p = join(dir, 'channels.json');
      if (!existsSync(p)) return { ready: false, reason: 'channels.json not found (needs tag + cluster)' };
      try {
        const c = JSON.parse(readFileSync(p, 'utf8'));
        const chs = c.channels ?? [];
        if (chs.length === 0) return { ready: false, reason: 'channels.json has 0 channels' };
        return { ready: true, info: `${chs.length} channels` };
      } catch {
        return { ready: false, reason: 'channels.json is invalid JSON' };
      }
    },
  },
  {
    id: 'directions',
    label: 'Directions',
    desc: 'Derive candidate creative directions from channels',
    prereqs: ['cluster'],
    check: (dir) => {
      const p = join(dir, 'directions.json');
      if (!existsSync(p)) return { ready: false, reason: 'directions.json not found (needs cluster → directions)' };
      try {
        const d = JSON.parse(readFileSync(p, 'utf8'));
        const dirs = d.directions ?? {};
        const count = Array.isArray(dirs) ? dirs.length : Object.keys(dirs).length;
        if (count === 0) return { ready: false, reason: 'directions.json has 0 directions' };
        return { ready: true, info: `${count} directions` };
      } catch {
        return { ready: false, reason: 'directions.json is invalid JSON' };
      }
    },
  },
  {
    id: 'thesis',
    label: 'Thesis',
    desc: 'Generate THESIS.md from channel data',
    prereqs: ['cluster'],
    check: (dir) => {
      const p = join(dir, 'THESIS.md');
      if (!existsSync(p)) return { ready: false, reason: 'THESIS.md not found (needs cluster → thesis)' };
      const size = statSync(p).size;
      return { ready: true, info: `${size} bytes` };
    },
  },
  {
    id: 'atlas',
    label: 'Atlas',
    desc: 'Build static HTML atlas viewer',
    prereqs: ['import'],
    check: (dir) => {
      const p = join(dir, 'atlas/index.html');
      if (!existsSync(p)) return { ready: false, reason: 'atlas/index.html not found (needs import → atlas)' };
      const size = statSync(p).size;
      return { ready: true, info: `${size} bytes` };
    },
  },
  {
    id: 'fingerprint',
    label: 'Fingerprint',
    desc: 'Aggregate taste features into versioned fingerprint',
    prereqs: ['measure', 'tag', 'cluster'],
    check: (dir) => {
      const fpDir = join(dir, 'fingerprints');
      if (!existsSync(fpDir)) return { ready: false, reason: 'fingerprints/ not found (needs cluster → fingerprint)' };
      try {
        const versions = [];
        for (const f of ['v001.json', 'v002.json', 'v003.json', 'v004.json', 'v005.json']) {
          const p = join(fpDir, f);
          if (existsSync(p)) versions.push(f.replace('.json', ''));
        }
        if (versions.length === 0) return { ready: false, reason: 'no version files in fingerprints/' };
        return { ready: true, info: versions.join(', ') };
      } catch {
        return { ready: false, reason: 'could not read fingerprints/' };
      }
    },
  },
];

const GENERATE_STAGES = [
  {
    id: 'generate',
    label: 'Generate',
    desc: 'Generate artifacts from a direction',
    prereqs: ['directions'],
    check: (dir) => {
      const genDir = join(dir, 'generated');
      if (!existsSync(genDir)) return { ready: false, reason: 'generated/ not found (need directions first)' };
      try {
        const entries = readdirSync(genDir, { withFileTypes: true });
        const subdirs = entries.filter((e) => e.isDirectory());
        if (subdirs.length === 0) return { ready: false, reason: 'generated/ is empty' };
        return { ready: true, info: `${subdirs.length} direction subdirectories` };
      } catch {
        return { ready: false, reason: 'could not read generated/' };
      }
    },
  },
  {
    id: 'poster',
    label: 'Poster Gen',
    desc: 'Generate poster images via Gemini Flash Image',
    prereqs: ['directions'],
    check: (dir) => {
      const gpDir = join(dir, 'generated-posters');
      if (!existsSync(gpDir)) return { ready: false, reason: 'generated-posters/ not found' };
      try {
        const jpgs = [];
        for (const f of readdirSync(gpDir)) {
          if (f.endsWith('.jpg') || f.endsWith('.png')) jpgs.push(f);
        }
        if (jpgs.length === 0) return { ready: false, reason: 'no poster images in generated-posters/' };
        return { ready: true, info: `${jpgs.length} posters` };
      } catch {
        return { ready: false, reason: 'could not read generated-posters/' };
      }
    },
  },
];

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

function fmtStatus(s) {
  if (s.ready) {
    if (s.partial) return `\x1b[33m⚠ PARTIAL\x1b[0m  ${s.info ?? ''}`;
    return `\x1b[32m✓ READY\x1b[0m    ${s.info ?? ''}`;
  }
  return `\x1b[31m✗ BLOCKED\x1b[0m  ${s.reason ?? ''}`;
}

function run() {
  const args = parseArgs(process.argv.slice(2));
  const board = getBoard(args.board);

  console.log(`\n\x1b[1mTaste Engine — Pipeline Status\x1b[0m`);
  console.log(`  Board:     \x1b[36m${board.name}\x1b[0m (${board.kind})`);
  console.log(`  Directory: ${board.absDir}`);
  console.log(`  ${'─'.repeat(50)}`);

  // Board images — check manifest first, then filesystem
  let imageCount = 0;
  let hasImages = false;
  const manifestPath = join(board.absDir, 'manifest.json');
  if (existsSync(manifestPath)) {
    try {
      const m = JSON.parse(readFileSync(manifestPath, 'utf8'));
      imageCount = m.items?.length ?? 0;
      hasImages = imageCount > 0;
    } catch { /* fall through to filesystem check */ }
  }
  if (!hasImages) {
    hasImages = existsSync(board.absDir)
      ? readdirSync(board.absDir).some((f) => /\.(jpg|jpeg|png|webp|gif|heic)$/i.test(f))
      : false;
    if (hasImages) imageCount = readdirSync(board.absDir).filter((f) => /\.(jpg|jpeg|png|webp|gif|heic)$/i.test(f)).length;
  }
  console.log(`\n  \x1b[1mBoard images\x1b[0m  ${hasImages ? `\x1b[32m${imageCount} registered\x1b[0m` : '\x1b[33mnone\x1b[0m (drop images in board dir)'}`);

  // Derive stages
  console.log(`\n  \x1b[1mDerive pipeline\x1b[0m`);
  const stageMap = {};
  for (const s of STAGES) stageMap[s.id] = s;

  for (const stage of STAGES) {
    const s = stage.check(board.absDir);

    // Check if prereqs block us
    const blockedPrereqs = stage.prereqs.filter((p) => {
      const ps = stageMap[p]?.check(board.absDir);
      return ps && !ps.ready;
    });

    if (blockedPrereqs.length > 0) {
      console.log(`    ${stage.id.padEnd(14)} \x1b[90m— blocked by:\x1b[0m ${blockedPrereqs.join(', ')}`);
    } else {
      console.log(`    ${stage.id.padEnd(14)} ${fmtStatus(s)}`);
    }
  }

  // Generate stages
  console.log(`\n  \x1b[1mGenerate pipeline\x1b[0m`);
  for (const stage of [...GENERATE_STAGES]) {
    // Skip poster check for non-poster boards
    if (stage.id === 'poster' && board.kind !== 'poster') {
      console.log(`    ${stage.id.padEnd(14)} \x1b[90m— n/a (kind: ${board.kind})\x1b[0m`);
      continue;
    }

    const s = stage.check(board.absDir);

    const blockedPrereqs = stage.prereqs.filter((p) => {
      const ps = stageMap[p]?.check(board.absDir);
      return ps && !ps.ready;
    });

    if (blockedPrereqs.length > 0) {
      console.log(`    ${stage.id.padEnd(14)} \x1b[90m— blocked by:\x1b[0m ${blockedPrereqs.join(', ')}`);
    } else {
      console.log(`    ${stage.id.padEnd(14)} ${fmtStatus(s)}`);
    }
  }

  // Next action
  console.log(`\n  \x1b[1mSuggested next\x1b[0m`);
  const next = suggestNext(board.absDir, stageMap);
  console.log(`    ${next}`);

  console.log(`\n  \x1b[1mRun commands\x1b[0m`);
  console.log(`    npm run status -- --board ${board.name}`);
  console.log(`    npm run pipeline -- --board ${board.name}`);
  console.log(`    node src/generate.mjs --board ${board.name} --direction <id>`);
  console.log(`    node src/generate-poster.mjs --board ${board.name}`);
  console.log();
}

function suggestNext(dir, stageMap) {
  // Walk stages in order; find the first that's not ready
  for (const stage of STAGES) {
    const s = stage.check(dir);
    if (!s.ready) {
      const blockedBy = stage.prereqs.filter((p) => {
        const ps = stageMap[p]?.check(dir);
        return ps && !ps.ready;
      });
      if (blockedBy.length > 0) {
        // Pre-req not ready — tell them to run the first blocked pre-req
        const firstBlocked = STAGES.find((st) => st.id === blockedBy[0]);
        if (firstBlocked) {
          return `Run \`npm run ${firstBlocked.id}\` first (${stage.id} needs ${firstBlocked.id})`;
        }
      }
      return `Run \`npm run ${stage.id}\` (${stage.label.toLowerCase()})`;
    }
    if (s.partial) {
      return `Re-run \`npm run ${stage.id} -- --force\` to complete (${s.info})`;
    }
  }

  // All derive stages done. Check generate pipeline.
  for (const stage of GENERATE_STAGES) {
    const s = stage.check(dir);
    if (!s.ready) {
      const stageFile = stage.id === 'poster' ? 'generate-poster.mjs' : `${stage.id}.mjs`;
      return `All derive stages complete. Run \`node src/${stageFile}\` (${stage.desc.toLowerCase()})`;
    }
  }

  return `All stages complete! Open atlas/index.html or review generated artifacts.`;
}

run();