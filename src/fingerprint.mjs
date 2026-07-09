#!/usr/bin/env node
// fingerprint.mjs — aggregate the board's already-extracted features into a
// versioned Taste Fingerprint: per-reference raw values (the provenance) plus
// per-axis center/spread/confidence/salience on a normalized scale.
//
// Local-only (no API). Versioned by content: fingerprints/v001.json, v002.json,
// ... A new version is written only when the canonical content (refs + axes)
// hash differs from the latest; old versions are never mutated or deleted, so
// taste drift stays a visible git diff and pipeline re-runs mint no churn.
//
// --exclude writes to fingerprints/experiments/<name>.json instead of minting a
// version (held-out controls; the version sequence stays reserved for real
// taste states).
//
// Usage:
//   node fingerprint.mjs
//   node fingerprint.mjs --board demo --exclude w004

import { existsSync, mkdirSync, readdirSync } from 'fs';
import { createHash } from 'crypto';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { getBoard } from './config.mjs';
import { readManifest, writeManifest } from './manifest.mjs';
import { buildFingerprint, fingerprintCanonical } from './features.mjs';

function parseArgs(argv) {
  const args = { board: 'demo', exclude: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--board') args.board = argv[++i];
    else if (argv[i] === '--exclude') args.exclude = argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
  }
  return args;
}

export function contentHash(fp) {
  return 'sha256:' + createHash('sha256').update(fingerprintCanonical(fp)).digest('hex');
}

// Pure: pick the latest vNNN from a directory listing. Returns { version, file }
// or null when none exist.
export function latestVersion(files) {
  let best = null;
  for (const f of files) {
    const m = /^v(\d{3})\.json$/.exec(f);
    if (m) {
      const version = Number(m[1]);
      if (!best || version > best.version) best = { version, file: f };
    }
  }
  return best;
}

export function versionFileName(version) {
  return `v${String(version).padStart(3, '0')}.json`;
}

// Pure: the versioning contract. Returns the next version number to write, or
// null when the latest version already carries this content hash (no churn).
export function nextVersion(latest, prevHash, newHash) {
  if (latest && prevHash === newHash) return null;
  return (latest?.version || 0) + 1;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const board = getBoard(args.board);
  const manifest = readManifest(join(board.absDir, 'manifest.json'));
  if (!manifest) throw new Error(`No manifest at ${board.dir} — run the pipeline first`);
  if (!manifest.items.some((it) => it.tags?.length)) {
    console.warn('[fingerprint] warning: no tagged items yet; the tags axis will be empty (run tag first)');
  }

  const fp = buildFingerprint(manifest, { exclude: args.exclude });
  const hash = contentHash(fp);
  const stamp = new Date().toISOString();
  const source = {
    manifestStamp: manifest.generated || null,
    channelsStamp: readManifest(join(board.absDir, 'channels.json'))?.generated || null,
    items: Object.keys(fp.refs).length,
  };

  const fpRoot = join(board.absDir, 'fingerprints');

  if (args.exclude.length) {
    const name = `exclude-${args.exclude.join('-')}`;
    const dir = join(fpRoot, 'experiments');
    mkdirSync(dir, { recursive: true });
    const outPath = join(dir, `${name}.json`);
    writeManifest(outPath, { ...fp, experiment: name, excluded: args.exclude, generated: stamp, source, hash });
    console.log(`[fingerprint] experiment ${name} (${source.items} refs, not versioned) -> ${outPath}`);
    return;
  }

  mkdirSync(fpRoot, { recursive: true });
  const latest = latestVersion(existsSync(fpRoot) ? readdirSync(fpRoot) : []);
  const prevHash = latest ? readManifest(join(fpRoot, latest.file))?.hash : null;
  const version = nextVersion(latest, prevHash, hash);
  if (version == null) {
    console.log(`[fingerprint] unchanged, still ${latest.file} (${hash.slice(0, 17)}...)`);
    return;
  }
  const outPath = join(fpRoot, versionFileName(version));
  writeManifest(outPath, { ...fp, version, generated: stamp, source, hash });
  console.log(`[fingerprint] v${version} (${source.items} refs, ${Object.keys(fp.axes).length} axes) -> ${outPath}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
