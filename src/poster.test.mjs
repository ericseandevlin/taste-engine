import { test } from 'node:test';
import assert from 'node:assert/strict';
import { asClaim, parseCopy, buildPosterPrompt, buildCheckPrompt, parseVerdicts, bestRound, DEFAULT_COPY } from './poster.mjs';
import { imageOfGemini, imageOfOpenRouter } from './image-agent.mjs';
import { routeModel, resolveVisionCaller, NO_KEY_MESSAGE } from './models.mjs';

const mode = { id: 'm', name: 'Strict', summary: 'A grid.', palette: ['#000', '#fff'], lanes: ['grid'] };
const base = { mode, dos: [{ rule: 'One grotesk family' }], donts: [{ rule: 'Drop shadows' }], palette: [{ hex: '#111111' }], copy: ['A', 'B'] };

test('parseCopy splits on pipes and falls back to the default copy', () => {
  assert.deepEqual(parseCopy(' Title |  12 Nov | '), ['Title', '12 Nov']);
  assert.deepEqual(parseCopy(''), DEFAULT_COPY);
});

test('buildPosterPrompt carries the copy, the mode palette and both rule lists', () => {
  const p = buildPosterPrompt(base);
  assert.match(p, /  A\n  B/);
  assert.match(p, /#000, #fff/);
  assert.match(p, /DO:\n- One grotesk family/);
  assert.match(p, /- Drop shadows/);
  assert.ok(!/LAST ATTEMPT/.test(p));
});

test('buildPosterPrompt uses the measured palette when the mode has none', () => {
  assert.match(buildPosterPrompt({ ...base, mode: { ...mode, palette: [] } }), /#111111/);
});

test('a repair round names each broken rule and what was seen', () => {
  const p = buildPosterPrompt({ ...base, broken: [{ rule: 'Drop shadows', reason: 'title has a shadow' }] });
  assert.match(p, /LAST ATTEMPT BROKE THESE RULES/);
  assert.match(p, /- Drop shadows \(seen: title has a shadow\)/);
});

test('parseVerdicts reads PASS and FAIL and refuses a wrong count', () => {
  const raw = 'ok {"verdicts":[{"verdict":"PASS","reason":"a"},{"verdict":"FAIL","reason":"b"}]}';
  assert.deepEqual(parseVerdicts(raw, 2), [{ pass: true, reason: 'a' }, { pass: false, reason: 'b' }]);
  assert.throws(() => parseVerdicts(raw, 3), /expected 3/);
  assert.throws(() => parseVerdicts('nothing', 1), /no JSON/);
  assert.match(buildCheckPrompt(['r1', 'r2'], ['A']), /exactly 2 entries/);
});

test('bestRound takes the most passes and the later round on a tie', () => {
  assert.equal(bestRound([{ round: 1, passed: 3 }, { round: 2, passed: 5 }, { round: 3, passed: 4 }]).round, 2);
  assert.equal(bestRound([{ round: 1, passed: 3 }, { round: 2, passed: 3 }]).round, 2);
});

test('the image agent reads an image from both provider response shapes', () => {
  const g = { candidates: [{ content: { parts: [{ text: 'note' }, { inlineData: { data: 'QUJD', mimeType: 'image/png' } }] } }] };
  assert.deepEqual(imageOfGemini(g), { data: 'QUJD', mimeType: 'image/png', note: 'note' });
  assert.equal(imageOfGemini({ candidates: [{ content: { parts: [{ text: 'no image' }] } }] }), null);
  const o = { choices: [{ message: { content: 'hi', images: [{ image_url: { url: 'data:image/jpeg;base64,QUJD' } }] } }] };
  assert.deepEqual(imageOfOpenRouter(o), { data: 'QUJD', mimeType: 'image/jpeg', note: 'hi' });
  assert.equal(imageOfOpenRouter({ choices: [{ message: { content: 'x' } }] }), null);
});

test('routeModel sends a gemini name to whichever key exists', () => {
  assert.equal(routeModel('gemini-3.5-flash', { GEMINI_API_KEY: 'k', OPENROUTER_API_KEY: 'k' }), 'gemini-3.5-flash');
  assert.equal(routeModel('gemini-3.5-flash', { OPENROUTER_API_KEY: 'k' }), 'google/gemini-3.5-flash');
  assert.equal(routeModel('claude-cli:sonnet', {}), 'claude-cli:sonnet');
  assert.throws(() => routeModel('gemini-3.5-flash', {}), new RegExp(NO_KEY_MESSAGE.slice(0, 18)));
  assert.equal(resolveVisionCaller('gemini-3.5-flash', { OPENROUTER_API_KEY: 'k' }).provider, 'openrouter');
});

test('asClaim turns a forbidden move into a statement that is true when obeyed', () => {
  assert.equal(asClaim('Gradient backgrounds'), 'The poster does not use this: Gradient backgrounds.');
  assert.equal(asClaim('Drop shadows.'), 'The poster does not use this: Drop shadows.');
});

test('the prompt forbids printed color codes and a framed sheet', () => {
  const p = buildPosterPrompt(base);
  assert.match(p, /Never print a color code/);
  assert.match(p, /runs to all four edges/);
  assert.match(p, /only text on the poster/);
});
