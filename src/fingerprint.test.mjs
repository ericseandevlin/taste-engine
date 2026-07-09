// fingerprint.test.mjs — run: node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contentHash, latestVersion, nextVersion, versionFileName } from './fingerprint.mjs';
import { buildFingerprint } from './features.mjs';

const manifest = {
  board: 'x',
  kind: 'visual-ui',
  generated: '2026-01-01T00:00:00.000Z',
  items: [
    {
      id: 'w001',
      file: 'a.png',
      title: 'A',
      source: { local: 'boards/x/a.png' },
      measured: {
        w: 1440, h: 1200, aspect: 1.2,
        palette: [{ hex: '#ffffff', pct: 90 }, { hex: '#ff3300', pct: 10 }],
        contrast: 0.2, density: 0.03,
      },
      tags: ['swiss-index'],
      channels: ['swiss-index'],
      notes: {},
    },
    {
      id: 'w002',
      file: 'b.png',
      title: 'B',
      source: { local: 'boards/x/b.png' },
      measured: {
        w: 1440, h: 1200, aspect: 1.2,
        palette: [{ hex: '#000000', pct: 95 }, { hex: '#ffffff', pct: 5 }],
        contrast: 0.4, density: 0.05,
      },
      tags: ['dark-field'],
      channels: ['dark-editorial'],
      notes: {},
    },
  ],
};

test('latestVersion picks the highest vNNN and ignores other files', () => {
  assert.deepEqual(latestVersion(['v001.json', 'v002.json', 'experiments', 'notes.txt']), {
    version: 2,
    file: 'v002.json',
  });
  assert.equal(latestVersion([]), null);
  assert.equal(latestVersion(['v12.json'])?.version, undefined); // must be zero-padded vNNN
});

test('versionFileName zero-pads', () => {
  assert.equal(versionFileName(1), 'v001.json');
  assert.equal(versionFileName(42), 'v042.json');
});

test('nextVersion: unchanged hash mints nothing, changed hash increments, empty dir starts at 1', () => {
  const latest = { version: 3, file: 'v003.json' };
  assert.equal(nextVersion(latest, 'sha256:same', 'sha256:same'), null);
  assert.equal(nextVersion(latest, 'sha256:old', 'sha256:new'), 4);
  assert.equal(nextVersion(null, null, 'sha256:new'), 1);
});

test('contentHash is stable across metadata changes and key order', () => {
  const fp = buildFingerprint(manifest);
  const h1 = contentHash({ ...fp, version: 1, generated: 'now', source: { manifestStamp: 'a' } });
  const h2 = contentHash({ ...fp, version: 2, generated: 'later', source: { manifestStamp: 'b' } });
  assert.equal(h1, h2);
  assert.ok(h1.startsWith('sha256:'));
});

test('contentHash changes when the taste content changes', () => {
  const fp1 = buildFingerprint(manifest);
  const altered = structuredClone(manifest);
  altered.items[0].tags = ['dark-field'];
  const fp2 = buildFingerprint(altered);
  assert.notEqual(contentHash(fp1), contentHash(fp2));
});

test('exclude produces a different fingerprint with the ref absent', () => {
  const loo = buildFingerprint(manifest, { exclude: ['w002'] });
  assert.equal(loo.refs.w002, undefined);
  assert.notEqual(contentHash(loo), contentHash(buildFingerprint(manifest)));
});
