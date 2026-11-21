// config.test.mjs — run: npm test
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'path';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { getBoard, vocabIds, BOARDS, KINDS, REPO_ROOT } from './config.mjs';

// Unregistered boards are found by folder name under boards/, so these tests
// make throwaway folders there and remove them afterwards.
const tmpBoards = [];
function makeBoard(meta) {
  const name = `__config-test-${process.pid}-${tmpBoards.length}`;
  const dir = join(REPO_ROOT, 'boards', name);
  mkdirSync(dir, { recursive: true });
  tmpBoards.push(dir);
  if (meta !== undefined) writeFileSync(join(dir, 'board.json'), meta);
  return name;
}
after(() => {
  for (const dir of tmpBoards) rmSync(dir, { recursive: true, force: true });
});

test('getBoard returns a registered board merged with its kind', () => {
  const b = getBoard('demo');
  assert.equal(b.name, 'demo');
  assert.equal(b.kind, 'visual-ui');
  assert.equal(b.dir, BOARDS.demo.dir);
  assert.equal(b.absDir, join(REPO_ROOT, BOARDS.demo.dir));
  assert.equal(b.measure, KINDS['visual-ui'].measure);
  assert.equal(b.tagVocabulary, KINDS['visual-ui'].tagVocabulary);
});

test('getBoard treats an unregistered folder under boards/ as visual-ui', () => {
  const name = makeBoard();
  const b = getBoard(name);
  assert.equal(b.kind, 'visual-ui');
  assert.equal(b.dir, join('boards', name));
  assert.equal(b.absDir, join(REPO_ROOT, 'boards', name));
});

test('getBoard reads the kind from an unregistered board.json', () => {
  const b = getBoard(makeBoard(JSON.stringify({ kind: 'poster' })));
  assert.equal(b.kind, 'poster');
  assert.equal(b.tagVocabulary, KINDS.poster.tagVocabulary);
});

test('getBoard falls back to visual-ui when board.json has no kind', () => {
  assert.equal(getBoard(makeBoard('{}')).kind, 'visual-ui');
});

test('getBoard throws on a board.json with an unknown kind', () => {
  const name = makeBoard(JSON.stringify({ kind: 'not-a-kind' }));
  assert.throws(() => getBoard(name), /has unknown kind "not-a-kind"/);
});

test('getBoard throws on an unknown board and lists the known ones', () => {
  assert.throws(
    () => getBoard('__no-such-board__'),
    (err) =>
      /Unknown board "__no-such-board__"/.test(err.message) &&
      err.message.includes('demo') &&
      err.message.includes('boards/__no-such-board__/'),
  );
});

test('vocabIds reads ids from v2 entries and legacy strings', () => {
  assert.deepEqual(vocabIds([{ id: 'a', definition: 'x' }, 'b']), ['a', 'b']);
  assert.deepEqual(vocabIds(undefined), []);
});

test('every registered kind has unique vocabulary ids', () => {
  for (const [kind, cfg] of Object.entries(KINDS)) {
    const ids = vocabIds(cfg.tagVocabulary);
    assert.equal(new Set(ids).size, ids.length, `duplicate tag id in kind "${kind}"`);
  }
});
