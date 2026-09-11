// models.test.mjs — provider router tests. Run: bun test src/models.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveTextCaller, resolveVisionCaller, resolveMultiImageCaller } from './models.mjs';

test('resolveTextCaller routes claude models to anthropic and validates key', () => {
  const r = resolveTextCaller('claude-opus-4-8', { ANTHROPIC_API_KEY: 'k' });
  assert.equal(r.provider, 'anthropic');
  assert.throws(() => resolveTextCaller('claude-opus-4-8', {}), /ANTHROPIC_API_KEY/);
});

test('resolveTextCaller routes gemini models to gemini and validates key', () => {
  const r = resolveTextCaller('gemini-3.5-flash', { GEMINI_API_KEY: 'k' });
  assert.equal(r.provider, 'gemini');
  assert.throws(() => resolveTextCaller('gemini-3.5-flash', {}), /GEMINI_API_KEY/);
});

test('resolveTextCaller routes vendor/model names to openrouter', () => {
  const r = resolveTextCaller('deepseek/deepseek-chat', { OPENROUTER_API_KEY: 'k' });
  assert.equal(r.provider, 'openrouter');
  assert.throws(() => resolveTextCaller('deepseek/deepseek-chat', {}), /OPENROUTER_API_KEY/);
});

test('resolveTextCaller rejects unknown model names with a clear message', () => {
  assert.throws(() => resolveTextCaller('gpt-4o', { OPENROUTER_API_KEY: 'k' }), /Unknown model/);
});

// ---- Vision caller tests ----

test('resolveVisionCaller routes claude vision to anthropic and validates key', () => {
  const r = resolveVisionCaller('claude-haiku-4-5-20251001', { ANTHROPIC_API_KEY: 'k' });
  assert.equal(r.provider, 'anthropic');
  assert.throws(() => resolveVisionCaller('claude-haiku-4-5-20251001', {}), /ANTHROPIC_API_KEY/);
});

test('resolveVisionCaller routes gemini vision to gemini and validates key', () => {
  const r = resolveVisionCaller('gemini-3.1-flash-image', { GEMINI_API_KEY: 'k' });
  assert.equal(r.provider, 'gemini');
  assert.throws(() => resolveVisionCaller('gemini-3.1-flash-image', {}), /GEMINI_API_KEY/);
});

test('resolveVisionCaller rejects unknown model names', () => {
  assert.throws(() => resolveVisionCaller('gpt-4o', {}), /not supported/);
});

test('resolveMultiImageCaller routes claude to anthropic, gemini to gemini', () => {
  const r1 = resolveMultiImageCaller('claude-sonnet-4-6', { ANTHROPIC_API_KEY: 'k' });
  assert.equal(r1.provider, 'anthropic');
  const r2 = resolveMultiImageCaller('gemini-3.1-flash-image', { GEMINI_API_KEY: 'k' });
  assert.equal(r2.provider, 'gemini');
  assert.throws(() => resolveMultiImageCaller('gemini-3.1-flash-image', {}), /GEMINI_API_KEY/);
});
