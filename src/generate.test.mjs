// generate.test.mjs — run: node --test  (from scripts/taste/)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveDirection, buildGeneratePrompt, extractHtml } from './generate.mjs';

const channelsDoc = {
  channels: [
    { id: 'swiss-index', name: 'Swiss Index', recipe: { ground: 'white' }, forbidden: ['warm backgrounds'] },
    { id: 'dark-editorial', name: 'Dark Editorial', recipe: { ground: 'near-black' }, forbidden: ['gradients', 'warm backgrounds'] },
  ],
};
const directionsDoc = {
  directions: {
    house: {
      name: 'Stark Swiss Brutalist',
      channels: ['swiss-index', 'dark-editorial'],
      palette: 'stark black and white',
      brief: 'portfolio homepage',
      notes: ['no big blank gaps from capture artifacts'],
    },
  },
};

test('resolveDirection blends recipes and unions forbidden + notes', () => {
  const r = resolveDirection(directionsDoc, channelsDoc, 'house');
  assert.equal(r.name, 'Stark Swiss Brutalist');
  assert.equal(r.recipes.length, 2);
  // 'warm backgrounds' appears in both channels but is deduped
  assert.equal(r.forbidden.filter((f) => f === 'warm backgrounds').length, 1);
  assert.ok(r.forbidden.includes('gradients'));
  assert.ok(r.forbidden.some((f) => /capture artifacts/.test(f)));
});

test('resolveDirection throws on unknown direction', () => {
  assert.throws(() => resolveDirection(directionsDoc, channelsDoc, 'nope'), /Unknown direction/);
});

test('resolveDirection throws on unknown channel reference', () => {
  const bad = { directions: { x: { name: 'X', channels: ['ghost'], notes: [] } } };
  assert.throws(() => resolveDirection(bad, channelsDoc, 'x'), /unknown channel/);
});

test('buildGeneratePrompt includes brief, forbidden, and the capture-artifact guard', () => {
  const r = resolveDirection(directionsDoc, channelsDoc, 'house');
  const p = buildGeneratePrompt(r);
  assert.ok(p.includes('portfolio homepage'));
  assert.ok(p.includes('FORBIDDEN'));
  assert.ok(p.includes('capture artifacts'));
  assert.ok(p.includes('<!doctype html>'));
});

test('buildGeneratePrompt injects critique rules when provided (closed loop)', () => {
  const r = resolveDirection(directionsDoc, channelsDoc, 'house');
  const p = buildGeneratePrompt(r, ['mobile type below 14px is too small']);
  assert.ok(p.includes('CRITIQUE RULES FROM PRIOR ROUNDS'));
  assert.ok(p.includes('mobile type below 14px is too small'));
});

test('buildGeneratePrompt uses real profile content and forbids invention', () => {
  const r = resolveDirection(directionsDoc, channelsDoc, 'house');
  const profile = { _note: 'sample', name: 'Avery Quinn', role: 'Design Technologist', projects: [{ title: 'Lattice' }] };
  const p = buildGeneratePrompt(r, [], profile);
  assert.ok(p.includes('Avery Quinn'));
  assert.ok(p.includes('Lattice'));
  assert.ok(/do NOT invent/i.test(p));
  assert.ok(!p.includes('_note')); // the note field is stripped before the model sees it
});

test('buildGeneratePrompt falls back to labeled placeholder content with no profile', () => {
  const r = resolveDirection(directionsDoc, channelsDoc, 'house');
  const p = buildGeneratePrompt(r);
  assert.ok(p.includes('[Your Name]'));
  assert.ok(/placeholder/i.test(p));
  assert.ok(!/realistic content for a design technologist/i.test(p)); // old fabrication line is gone
});

test('extractHtml strips markdown fences', () => {
  const raw = 'Here you go:\n```html\n<!doctype html><html><body>hi</body></html>\n```\nDone';
  const html = extractHtml(raw);
  assert.ok(html.startsWith('<!doctype html>'));
  assert.ok(!html.includes('```'));
  assert.ok(!html.includes('Here you go'));
});

test('extractHtml handles bare document and trims preamble', () => {
  const raw = 'Sure.\n<!DOCTYPE html>\n<html><head></head><body>x</body></html>';
  const html = extractHtml(raw);
  assert.ok(/^<!DOCTYPE html>/i.test(html));
});

test('extractHtml throws when there is no document', () => {
  assert.throws(() => extractHtml('I cannot do that'), /no HTML document/);
});
