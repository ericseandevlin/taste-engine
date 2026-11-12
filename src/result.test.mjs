import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderResult } from './result.mjs';

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

test('renderResult shows the best round first with its verdicts and the trail', () => {
  const html = renderResult({ board: 'b', manifest, brief, posters: [poster] });
  assert.match(html, /<a href="posters\/m-001\/round-2.png"><img src="posters\/m-001\/round-2.png"/);
  assert.match(html, /round 1: 0\/1 &rarr; round 2: 1\/1/);
  assert.match(html, /class="v pass">PASS/);
  assert.ok(!html.includes('shadow<'));
});
