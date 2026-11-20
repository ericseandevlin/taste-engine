import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderResult, groupGenerations } from './result.mjs';

const brief = {
  palette: [{ hex: '#000000', share: 60 }],
  modes: [{ id: 'm', name: 'Strict <b>', summary: 'A grid.', lanes: ['grid'], palette: [] }],
  rules: [
    { id: 'a', lane: 'grid', kind: 'do', rule: 'One family', status: 'extracted' },
    { id: 'b', lane: 'grid', kind: 'dont', rule: 'Shadows', status: 'extracted' },
    { id: 'c', lane: 'grid', kind: 'dont', rule: 'Gone', status: 'rejected' },
  ],
};
const manifest = { items: [{ file: 'a.png', title: 'A' }] };
const poster = { slug: 'm-001', modeName: 'Strict', copy: ['T'], best: 'round-2.png', rounds: [
  { round: 1, file: 'round-1.png', passed: 0, total: 1, checked: true, results: [{ rule: 'Shadows', pass: false, reason: 'shadow' }] },
  { round: 2, file: 'round-2.png', passed: 1, total: 1, checked: true, results: [{ rule: 'Shadows', pass: true, reason: 'flat' }] },
] };

test('renderResult shows the board, live rules and escapes text', () => {
  const html = renderResult({ board: 'b', manifest, brief, posters: [] });
  assert.match(html, /<img src="a.png"/);
  assert.match(html, /Strict &lt;b&gt;/);
  assert.match(html, /<li>Shadows<\/li>/);
  assert.ok(!html.includes('Gone'));
  assert.match(html, /2 rules out/);
  assert.match(html, /No posters yet/);
});

test('renderResult shows every round at full size, the kept one first, and no rule checks', () => {
  const html = renderResult({ board: 'b', manifest, brief, posters: [poster] });
  assert.ok(html.indexOf('posters/m-001/round-2.png') < html.indexOf('posters/m-001/round-1.png'));
  assert.match(html, /Round 2, kept/);
  assert.ok(!/PASS|FAIL|1\/1/.test(html));
  assert.ok(!html.includes('shadow<'));
});

test('renderResult folds each mode of the rule sheet into a closed accordion', () => {
  const html = renderResult({ board: 'b', manifest, brief, posters: [] });
  assert.match(html, /<details class="mode"><summary>/);
  assert.ok(!html.includes('<details class="mode" open'));
});

const mk = (slug, made) => ({ slug, made, modeName: slug, copy: ['A'], best: 'round-1.png', rounds: [{ round: 1, file: 'round-1.png', passed: 1, total: 1, checked: true, results: [] }] });

test('groupGenerations assigns posters to the generation that started before them, newest first', () => {
  const posters = [mk('a', '2026-11-17T00:28:00Z'), mk('b', '2026-11-17T01:35:00Z'), mk('c', '2026-11-18T03:21:00Z')];
  const gens = [
    { id: 'g1', label: 'One', from: '2026-11-17T00:00:00Z' },
    { id: 'g2', label: 'Two', from: '2026-11-17T01:30:00Z' },
    { id: 'g3', label: 'Three', from: '2026-11-18T03:00:00Z' },
    { id: 'g4', label: 'Next', from: '2026-11-19T00:00:00Z' },
  ];
  const out = groupGenerations(posters, gens);
  assert.deepEqual(out.map((g) => [g.id, g.posters.map((p) => p.slug)]), [['g4', []], ['g3', ['c']], ['g2', ['b']], ['g1', ['a']]]);
});

test('groupGenerations without a list splits on gaps over 45 minutes', () => {
  const posters = [mk('a', '2026-11-17T00:28:00Z'), mk('b', '2026-11-17T00:44:00Z'), mk('c', '2026-11-17T04:42:00Z')];
  const out = groupGenerations(posters);
  assert.deepEqual(out.map((g) => g.posters.map((p) => p.slug)), [['c'], ['a', 'b']]);
});

test('renderResult shows generation tabs with feedback notes', () => {
  const html = renderResult({
    board: 'b', manifest: { items: [] }, brief: { palette: [], modes: [], rules: [] },
    posters: [mk('a', '2026-11-17T00:28:00Z')],
    generations: [{ id: 'g1', label: 'First run', from: '2026-11-17T00:00:00Z', feedback: 'No faces <here>', changed: 'Sent references' }],
  });
  assert.match(html, /First run \(1\)/);
  assert.match(html, /Your feedback/);
  assert.match(html, /No faces &lt;here&gt;/);
  assert.match(html, /What changed in response/);
});
