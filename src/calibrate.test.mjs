// calibrate.test.mjs: run with node --test
// Pure flip counting and prune-list derivation from synthetic vote lists,
// plus majority-of-N calibration passes with an injected fake caller.
// No network; the API loop lives in calibrate.mjs main() only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calibrationPasses,
  flipIds,
  flipTable,
  presenceCounts,
  pruneList,
  PRUNE_RULE,
  OPERATIONALIZATION_NOTE,
  PASSES,
} from './calibrate.mjs';

// Fake tagImage-shaped caller: returns the scripted tag lists in call order.
function fakeTagger(script) {
  let calls = 0;
  const tagOnce = async () => ({ tags: script[calls++] });
  return { tagOnce, count: () => calls };
}

test('presenceCounts: counts per-pass presence once, duplicates within a pass collapse', () => {
  const counts = presenceCounts([['a', 'a', 'b'], ['a'], []]);
  assert.equal(counts.get('a'), 2);
  assert.equal(counts.get('b'), 1);
});

test('flipIds: minority presence (1 or 2 of 3) flips; 0/3 and 3/3 are stable', () => {
  // a: 3/3 stable; b: 2/3 flip; c: 1/3 flip; d: 1/3 flip
  const passes = [['a', 'b', 'c'], ['a', 'b'], ['a', 'd']];
  assert.deepEqual(flipIds(passes), ['b', 'c', 'd']);
  assert.deepEqual(flipIds([[], [], []]), []);
  assert.deepEqual(flipIds([['x'], ['x'], ['x']]), []);
});

test('flipTable: one flip event per (id, exemplar), counted over distinct exemplars', () => {
  const votes = [
    { exemplar: 'its/w001', passes: [['x', 'w'], [], []] }, // x flips, w flips
    { exemplar: 'its/w002', passes: [['x', 'y'], ['x'], ['x']] }, // x 3/3 stable, y flips
    { exemplar: 'bauhaus/w001', passes: [['x'], [], ['y']] }, // x flips, y flips
  ];
  const table = flipTable(votes, ['x', 'y', 'w', 'z']);
  assert.equal(table.x.flips, 2);
  assert.deepEqual(table.x.exemplars, ['its/w001', 'bauhaus/w001']);
  assert.equal(table.y.flips, 2);
  assert.equal(table.w.flips, 1);
  assert.equal(table.z.flips, 0); // seeded from the vocabulary, zero flips reported
});

test('pruneList: registered rule prunes ids flipping on MORE THAN ONE distinct exemplar', () => {
  const votes = [
    { exemplar: 'its/w001', passes: [['x', 'w'], [], []] },
    { exemplar: 'its/w002', passes: [['x', 'y'], ['x'], ['x']] },
    { exemplar: 'bauhaus/w001', passes: [['x'], [], ['y']] },
  ];
  const table = flipTable(votes, ['x', 'y', 'w', 'z']);
  // x and y flip on 2 exemplars each -> pruned; w flips on exactly 1 -> kept.
  assert.deepEqual(pruneList(table), ['x', 'y']);
});

test('calibrationPasses: votes=1 passes each single call straight through (3 calls, pre-amendment behavior)', async () => {
  const { tagOnce, count } = fakeTagger([['x'], ['x', 'y'], []]);
  const { passes, raw } = await calibrationPasses(tagOnce, 1);
  assert.equal(count(), 3);
  assert.deepEqual(passes, [['x'], ['x', 'y'], []]);
  assert.deepEqual(raw, [[['x']], [['x', 'y']], [[]]]);
  assert.deepEqual(flipIds(passes), ['x', 'y']);
});

test('calibrationPasses: votes=3 makes each pass a majority-of-3 result; 1-of-3 raw noise is filtered, majority flips remain', async () => {
  const { tagOnce, count } = fakeTagger([
    ['a', 'b'], ['a'], ['a', 'b'], // pass 0: a 3/3, b 2/3 -> ['a','b']
    ['a', 'b', 'c'], ['a', 'b'], ['a'], // pass 1: c is 1/3 raw noise, filtered -> ['a','b']
    ['a'], ['a', 'c'], ['a'], // pass 2: -> ['a']
  ]);
  const { passes, raw } = await calibrationPasses(tagOnce, 3);
  assert.equal(count(), 9); // 3 passes x 3 votes: the procedure under measurement
  assert.deepEqual(passes, [['a', 'b'], ['a', 'b'], ['a']]);
  assert.equal(raw.length, PASSES);
  assert.deepEqual(raw[1], [['a', 'b', 'c'], ['a', 'b'], ['a']]);
  // c never reaches a majority in any pass: stable at the procedure level.
  // b is present in majority passes 1 and 2 but not 3: a majority-level flip.
  assert.deepEqual(flipIds(passes), ['b']);
});

test('majority-level pass results feed flip counting and the prune derivation exactly like single-pass results', async () => {
  // Exemplar 1: b flips at the majority level (majorities ['a','b'], ['a','b'], ['a']).
  const e1 = await calibrationPasses(
    fakeTagger([
      ['a', 'b'], ['a', 'b'], ['a'],
      ['a', 'b'], ['a'], ['a', 'b'],
      ['a'], ['a'], ['b'],
    ]).tagOnce,
    3,
  );
  assert.deepEqual(e1.passes, [['a', 'b'], ['a', 'b'], ['a']]);
  // Exemplar 2: b flips again, a second distinct exemplar (majorities ['a'], ['a','b'], ['a']).
  const e2 = await calibrationPasses(
    fakeTagger([
      ['a'], ['a'], ['a'],
      ['a', 'b'], ['b', 'a'], ['a'],
      ['a'], ['a'], ['a'],
    ]).tagOnce,
    3,
  );
  assert.deepEqual(e2.passes, [['a'], ['a', 'b'], ['a']]);
  const table = flipTable(
    [
      { exemplar: 'its/w001', passes: e1.passes },
      { exemplar: 'bauhaus/w001', passes: e2.passes },
    ],
    ['a', 'b'],
  );
  assert.equal(table.a.flips, 0); // a is stable in every majority pass
  assert.equal(table.b.flips, 2);
  assert.deepEqual(table.b.exemplars, ['its/w001', 'bauhaus/w001']);
  assert.deepEqual(pruneList(table), ['b']); // registered rule, unchanged, on majority-level results
});

test('the prune rule and its cross-exemplar operationalization are registered in the report text', () => {
  assert.equal(PASSES, 3);
  assert.match(PRUNE_RULE, /MORE THAN ONE distinct exemplar/);
  assert.match(PRUNE_RULE, /1 or 2 of the 3 passes/);
  assert.match(OPERATIONALIZATION_NOTE, /cannot bind per-exemplar/);
  assert.match(OPERATIONALIZATION_NOTE, /ACROSS exemplars/);
});
