// calibrate.test.mjs: run with node --test
// Pure flip counting and prune-list derivation from synthetic vote lists.
// No network; the API loop lives in calibrate.mjs main() only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flipIds, flipTable, presenceCounts, pruneList, PRUNE_RULE, OPERATIONALIZATION_NOTE, PASSES } from './calibrate.mjs';

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

test('the prune rule and its cross-exemplar operationalization are registered in the report text', () => {
  assert.equal(PASSES, 3);
  assert.match(PRUNE_RULE, /MORE THAN ONE distinct exemplar/);
  assert.match(PRUNE_RULE, /1 or 2 of the 3 passes/);
  assert.match(OPERATIONALIZATION_NOTE, /cannot bind per-exemplar/);
  assert.match(OPERATIONALIZATION_NOTE, /ACROSS exemplars/);
});
