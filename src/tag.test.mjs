// tag.test.mjs — run: node --test  (from scripts/taste/)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTagResponse, buildTagPrompt } from './tag.mjs';

const VOCAB = ['dark-field', 'swiss-index', 'monolith-wordmark', 'mono-meta'];
const SEEDS = ['dark-editorial', 'swiss-index', 'warm-editorial'];

test('valid response merges tags/channels/notes correctly', () => {
  const raw = JSON.stringify({
    tags: ['dark-field', 'mono-meta'],
    channels: ['dark-editorial'],
    notes: { why: 'restraint', avoid: 'gradients', keep: 'the wordmark' },
  });
  const r = parseTagResponse(raw, VOCAB, SEEDS);
  assert.deepEqual(r.tags, ['dark-field', 'mono-meta']);
  assert.deepEqual(r.channels, ['dark-editorial']);
  assert.equal(r.notes.why, 'restraint');
});

test('tags outside the vocabulary are dropped, never persisted', () => {
  const raw = JSON.stringify({
    tags: ['dark-field', 'beautiful', 'futuristic'],
    channels: ['dark-editorial', 'made-up-channel'],
    notes: { why: 'x' },
  });
  const r = parseTagResponse(raw, VOCAB, SEEDS);
  assert.deepEqual(r.tags, ['dark-field']);
  assert.deepEqual(r.channels, ['dark-editorial']);
});

test('extracts JSON embedded in surrounding prose', () => {
  const raw = 'Sure! Here is the analysis:\n{"tags":["swiss-index"],"channels":[],"notes":{"why":"grid"}}\nHope that helps.';
  const r = parseTagResponse(raw, VOCAB, SEEDS);
  assert.deepEqual(r.tags, ['swiss-index']);
  assert.equal(r.notes.why, 'grid');
});

test('deduplicates repeated tags', () => {
  const raw = JSON.stringify({ tags: ['dark-field', 'dark-field'], channels: [], notes: { why: 'x' } });
  const r = parseTagResponse(raw, VOCAB, SEEDS);
  assert.deepEqual(r.tags, ['dark-field']);
});

test('malformed JSON throws (so caller can retry)', () => {
  assert.throws(() => parseTagResponse('not json at all', VOCAB, SEEDS), /no JSON object/);
  assert.throws(() => parseTagResponse('{ tags: [bad', VOCAB, SEEDS), /malformed JSON|no JSON object/);
});

test('response with no valid content throws', () => {
  const raw = JSON.stringify({ tags: ['nonsense'], channels: ['nope'], notes: {} });
  assert.throws(() => parseTagResponse(raw, VOCAB, SEEDS), /no valid tags/);
});

test('buildTagPrompt embeds the controlled vocabulary and seeds', () => {
  const p = buildTagPrompt(VOCAB, SEEDS);
  assert.ok(p.includes('dark-field'));
  assert.ok(p.includes('dark-editorial'));
  assert.ok(p.includes('JSON only'));
});
